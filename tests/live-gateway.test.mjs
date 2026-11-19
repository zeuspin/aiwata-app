import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { allowedGatewayCall, GatewayConnection } from '../scripts/live-aiwata-gateway.mjs'
import { createWorkspace } from '../src/workspace.mjs'

test('video editing accepts an owned session and forwards only HTTPS source and prompt', async () => {
  const { createVideoBridge } = await import('../scripts/live-aiwata-video.mjs')
  const own = { home: '/work/lin/runtime', workspace: '/work/lin/projects' }
  const requests = []
  const video = Buffer.from('00000018667479706d703432', 'hex').toString('base64')
  const bridge = createVideoBridge((_home, id) => id === 'mine' ? own.workspace : null,
    async (_client, request) => { requests.push(request); return { available: true, video } })
  const edit = { action: 'edit', session_id: 'mine', source: 'https://example.com/edit.mp4?token=sample', prompt: ' 更明亮 ' }
  await assert.rejects(() => bridge(own, { ...edit, source: 'http://example.com/edit.mp4' }, () => true))
  await assert.rejects(() => bridge(own, { ...edit, source: 'https://account@example.com/edit.mp4' }, () => true))
  await assert.rejects(() => bridge(own, { ...edit, session_id: 'foreign' }, () => true))
  assert.deepEqual(await bridge(own, edit, () => true), { video })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].source, edit.source)
  assert.equal(requests[0].prompt, '更明亮')
})

test('image requests use the owning session and only return bounded raster bytes', async () => {
  const { createImageBridge } = await import('../scripts/live-aiwata-images.mjs')
  const image_data = 'data:image/png;base64,iVBORw0KGgo='
  const own = { home: '/work/lin/runtime', workspace: '/work/lin/projects' }
  const calls = []
  const bridge = createImageBridge((home, id) => home === own.home && id === 'mine' ? own.workspace : null)
  const gateway = { call: async (...args) => { calls.push(args); return { available: true, success: true, image: '/private/path', image_data } } }
  const input = { action: 'generate', session_id: 'mine', prompt: ' 海报 ', aspect_ratio: 'square' }
  await assert.rejects(() => bridge(own, gateway, { ...input, session_id: 'another' }, () => true))
  await assert.rejects(() => bridge(own, gateway, { ...input, image_url: 'https://example.com' }, () => true))
  assert.deepEqual(await bridge(own, gateway, input, () => true), { imageData: image_data, mime: 'image/png' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'image.generate')
  assert.equal(calls[0][1].prompt, '海报')
  await assert.rejects(() => bridge(own, { call: async () => ({ available: true, success: true, image_data: 'data:image/svg+xml;base64,PHN2Zz4=' }) }, input, () => true))
  const edits = []
  const editor = createImageBridge((home, id) => home === own.home && id === 'mine' ? own.workspace : null,
    async (_client, request) => { edits.push(request); return { available: true, editable: true, success: true, image_data } })
  const edit = { ...input, action: 'edit', source: image_data }
  assert.deepEqual(await editor(own, gateway, edit, () => true), { imageData: image_data, mime: 'image/png' })
  assert.equal(edits[0].source, image_data)
  await assert.rejects(() => editor(own, gateway, { ...edit, source: '/private/a.png' }, () => true))
  await assert.rejects(() => editor(own, gateway, { ...edit, source: 'https://example.com/a.png' }, () => true))
  assert.equal(edits.length, 1)
})

test('native gateway accepts only a live owned account process', async () => {
  const { ownedGateway } = await import('../scripts/live-aiwata-host.mjs')
  const own = '/workspaces/lin/runtime'
  const other = '/workspaces/qiao/runtime'
  const receipt = { ownerHome: own, ownerPid: 41 }
  const child = { pid: 41, exitCode: null, signalCode: null }
  assert.equal(ownedGateway(own, child, receipt), true)
  assert.equal(ownedGateway(other, child, receipt), false)
  assert.equal(ownedGateway(own, { ...child, pid: 43 }, receipt), false)
  assert.equal(ownedGateway(own, { ...child, exitCode: 0 }, receipt), false)
  assert.equal(ownedGateway(own, { ...child, signalCode: 'SIGTERM' }, receipt), false)
})

test('isolated and ordinary live previews cannot claim the same data root', async t => {
  const { claimRuntimeMode } = await import('../scripts/live-aiwata-host.mjs')
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-runtime-mode-')))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const results = await Promise.allSettled([claimRuntimeMode(directory, true), claimRuntimeMode(directory, false)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const isolated = results[0].status === 'fulfilled'
  await claimRuntimeMode(directory, isolated)
  await assert.rejects(() => claimRuntimeMode(directory, !isolated), /不同的数据目录/)
})

test('live terminal requests cannot supply a host path or shell, and input requires a viewer ID', async () => {
  const { terminalRequest } = await import('../scripts/live-aiwata-terminal.mjs')
  const open = { action: 'open', session_id: '20261111_010101_abc', cols: 80, rows: 24 }
  const write = { action: 'write', session_id: open.session_id,
    viewer_id: 'fbeb69a7-a049-4a6c-a628-6ea70d53a560', data: '\x03' }
  assert.deepEqual(terminalRequest(open), open)
  assert.deepEqual(terminalRequest(write), write)
  for (const request of [
    { ...open, cwd: '/tmp' }, { ...open, command: '/bin/sh' }, { ...open, profile: 'other' },
    { ...open, session_id: '../other' }, { ...open, cols: 0 }, { ...open, rows: 257 },
    { ...write, viewer_id: undefined }, { ...write, viewer_id: 'other' }, { ...write, data: '界'.repeat(22000) },
    { ...write, action: 'close' },
  ]) assert.throws(() => terminalRequest(request), /无法识别终端请求/)
})

test('live voice accepts bounded audio only and resolves the Profile from the account', async t => {
  const { audioRequest, createAudioBridge } = await import('../scripts/live-aiwata-audio.mjs')
  const home = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-audio-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, 'profiles', 'owned'), { recursive: true })
  await symlink(home, join(home, 'profiles', 'linked'))
  const input = { action: 'transcribe', profile: 'owned', mimeType: 'audio/webm;codecs=opus', dataBase64: 'AQIDBA==' }
  assert.equal(audioRequest(input).mimeType, 'audio/webm')
  for (const bad of [
    { ...input, profileHome: '/tmp' }, { ...input, profile: '../other' }, { ...input, mimeType: 'text/html' },
    { ...input, dataBase64: 'AQID BA==' }, { ...input, dataBase64: '' }, { ...input, action: 'status' },
  ]) assert.throws(() => audioRequest(bad), /语音/)
  const calls = []
  const native = async (client, request) => { calls.push(request); return { available: true } }
  const audio = createAudioBridge('', null, native)
  const client = { home, workspace: home }
  const signal = new AbortController().signal
  await audio(client, { action: 'status', profile: 'default' }, () => true, signal)
  await audio(client, input, () => true, signal)
  await assert.rejects(() => audio(client, { ...input, profile: 'linked' }, () => true, signal), /当前账号/)
  await assert.rejects(() => audio(client, { ...input, profile: 'missing' }, () => true, signal), /当前账号/)
  assert.deepEqual(calls.map(row => row.profileHome), [home, join(home, 'profiles', 'owned')])
  await assert.rejects(() => stat(calls[1].temporary), { code: 'ENOENT' })
  let cancelled
  const interrupted = createAudioBridge('', null, async (_client, request) => {
    cancelled = request.temporary
    assert.equal((await stat(cancelled)).isDirectory(), true)
    throw new Error('cancelled')
  })
  await assert.rejects(() => interrupted(client, input, () => true, signal), /cancelled/)
  await assert.rejects(() => stat(cancelled), { code: 'ENOENT' })
})

test('desktop preview supports native local development pages without an extra private-network sandbox', async () => {
  const { previewLocalOrigins, previewRequestAllowed } = await import('../scripts/desktop-preview-policy.mjs')
  const scope = previewLocalOrigins({ lin: ['http://127.0.0.1:4183'], qiao: ['http://127.0.0.1:4184'] },
    'lin', 'http://127.0.0.1:4181')
  const resolve = async host => host === 'mixed.test' ? ['93.184.216.34', '192.168.1.5'] : ['93.184.216.34']
  assert.equal(await previewRequestAllowed('http://127.0.0.1:4183/docs', scope, resolve), true)
  assert.equal(await previewRequestAllowed('https://example.com/', scope, resolve), true)
  for (const url of ['http://127.0.0.1:4184/', 'http://127.0.0.1:4181/', 'http://192.168.1.5/', 'http://mixed.test/']) {
    assert.equal(await previewRequestAllowed(url, scope, resolve), true, url)
  }
  for (const url of ['https://alice:password@example.com/', 'file:///tmp/record']) {
    assert.equal(await previewRequestAllowed(url, scope, resolve), false, url)
  }
  assert.throws(() => previewLocalOrigins({ lin: ['http://localhost:4181'] }, 'lin', 'http://127.0.0.1:4181'))
})

test('native preview requests are bounded and their replies belong to the original session', async () => {
  const { previewCommand, previewReply } = await import('../src/web-preview.mjs')
  assert.deepEqual(previewCommand('preview.read', { start: 50, count: 90000 }), { action: 'read', start: 50, count: 24000 })
  assert.deepEqual(previewCommand('preview.act', { action: 'elements', max: 4 }), { action: 'elements', max: 4 })
  assert.deepEqual(previewCommand('preview.act', { action: 'scroll', amount: -4000 }), { action: 'scroll', amount: -4000 })
  assert.deepEqual(previewCommand('preview.act', { action: 'scroll', selector: 'main' }), { action: 'scroll', selector: 'main' })
  assert.equal(previewCommand('preview.act', { action: 'target', x: 0.5, y: 0.5 }), null)
  assert.equal(previewCommand('preview.act', { action: 'type', text: 'example' }), null)
  const ref = '@e0123456789abcdef-1'
  assert.deepEqual(previewCommand('preview.act', { action: 'click', ref }), { action: 'click', ref })
  assert.deepEqual(previewCommand('preview.act', { action: 'type', ref, text: '中文内容', submit: false }),
    { action: 'type', ref, text: '中文内容' })
  assert.deepEqual(previewCommand('preview.act', { action: 'hover', ref }), { action: 'hover', ref })
  assert.deepEqual(previewCommand('preview.act', { action: 'press', ref, key: 'Enter' }), { action: 'press', ref, key: 'Enter' })
  assert.deepEqual(previewCommand('preview.act', { action: 'type', ref, text: '提交', submit: true }),
    { action: 'type', ref, text: '提交', submit: true })
  assert.deepEqual(previewCommand('preview.act', { action: 'click', selector: 'button' }), { action: 'click', selector: 'button' })
  assert.equal(previewCommand('preview.act', { action: 'press', ref, key: 'Meta+Q' }), null)
  assert.deepEqual(previewCommand('preview.act', { action: 'press', ref, key: 'a', allow_shortcut: true }), { action: 'press', ref, key: 'a', allowShortcut: true })
  assert.equal(previewCommand('preview.act', { action: 'hover', ref, x: 10 }), null)
  assert.equal(previewCommand('preview.act', { action: 'type', ref, text: 'x'.repeat(4001) }), null)
  assert.equal(previewCommand('preview.read', { start: '50' }), null)
  const frame = { id: 'srq-aa112233bb44', session_id: 'current-runtime',
    result: { kind: 'url', url: 'https://example.com/', text: 'Visible text' } }
  const request = { sessionId: 'current-runtime', expires: 200 }
  assert.deepEqual(previewReply(frame, request, 100), { value: JSON.stringify(frame.result) })
  assert.equal(previewReply({ ...frame, session_id: 'other-runtime' }, request, 100), null)
  assert.equal(previewReply(frame, request, 200), null)
  assert.equal(previewReply({ ...frame, result: { text: 'x'.repeat(200000) } }, request, 100), null)
})

test('live Git admits only account-scoped status and literal file diff requests', async () => {
  const { gitRequest } = await import('../scripts/live-aiwata-git.mjs')
  const session_id = '20261111_010101_abc'
  const root = 'a'.repeat(32)
  const diff = { action: 'diff', session_id, root, path: 'src/稿件 v2.md', scope: 'staged' }
  assert.deepEqual(gitRequest({ action: 'status', session_id }), { action: 'status', session_id })
  assert.deepEqual(gitRequest(diff), diff)
  assert.deepEqual(gitRequest({ ...diff, path: 'src/-changes[1].md', scope: 'worktree' }).path, 'src/-changes[1].md')
  for (const request of [
    { ...diff, action: 'commit' }, { ...diff, scope: 'origin/main' }, { ...diff, root: '/tmp' },
    { ...diff, path: '../report' }, { ...diff, path: '/tmp/report' }, { ...diff, path: 'src//report' },
    { ...diff, path: 'src\\report' }, { ...diff, path: '.' }, { ...diff, profile: 'other' },
    { ...diff, base: 'HEAD' }, { ...diff, root: undefined }, { action: 'status', session_id: '../qiao' },
  ]) assert.throws(() => gitRequest(request))
})

test('live files derive roots from the exact session and its native project', async t => {
  const { artifactLocation, fileRequest, projectFileRoots } = await import('../scripts/live-aiwata-files.mjs')
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-files-')))
  t.after(() => rm(workspace, { recursive: true, force: true }))
  const primary = join(workspace, 'project')
  const extra = join(workspace, 'assets')
  const nested = join(primary, 'nested')
  await mkdir(nested, { recursive: true })
  await mkdir(extra)
  const projects = [
    { id: 'parent', primary_path: primary, folders: [{ path: primary }] },
    { id: 'nested', primary_path: nested, folders: [{ path: nested }, { path: extra }, { path: '/other' }] },
  ]
  const roots = projectFileRoots(workspace, nested, projects)
  assert.deepEqual(roots.map(root => root.path), [nested, extra, '/other'])
  assert.deepEqual(projectFileRoots(workspace, workspace, projects).map(root => root.path), [workspace])
  assert.deepEqual(projectFileRoots(workspace, '/other', projects).map(root => root.path), [nested, extra, '/other'])
  assert.throws(() => projectFileRoots(workspace, 'relative/path', projects), /绝对目录/)
  const valid = { action: 'preview', session_id: '20261111_010101_abc', root: roots[0].id, parts: ['输出', '稿件.md'] }
  assert.deepEqual(fileRequest(valid), valid)
  assert.deepEqual(fileRequest({ action: 'locate', session_id: valid.session_id, target: './稿件.md' }),
    { action: 'locate', session_id: valid.session_id, target: './稿件.md' })
  assert.deepEqual(artifactLocation(nested, roots, './输出/稿件.md'), { root: roots[0].id, parts: ['输出', '稿件.md'] })
  assert.deepEqual(artifactLocation(nested, roots, new URL('file://' + extra + '/draft%20one.md').href),
    { root: roots[1].id, parts: ['draft one.md'] })
  for (const target of ['https://example.com/稿件.md', 'file://other/tmp/report.md', '../../../other/report.md', extra]) {
    assert.throws(() => artifactLocation(nested, roots, target))
  }
  for (const request of [
    { ...valid, parts: ['..', '稿件.md'] }, { ...valid, parts: ['/tmp'] }, { ...valid, parts: ['a\\b'] },
    { ...valid, cwd: workspace }, { ...valid, profile: 'default' }, { ...valid, root: extra },
    { ...valid, parts: [] }, { ...valid, session_id: '' }, { ...valid, action: 'delete' },
  ]) assert.throws(() => fileRequest(request))
})

test('reopening native history restores tool inputs and outputs on their own turns', async () => {
  const { gatewayTranscript } = await import('../src/live-aiwata.mjs')
  const raw = [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call-one', function: { name: 'terminal', arguments: '{"command":"printf first"}' } }] },
    { role: 'tool', tool_call_id: 'call-one', tool_name: 'terminal', content: '{"output":"first","exit_code":0}' },
    { role: 'assistant', content: 'first answer' },
    { role: 'user', content: 'second' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call-one', function: { name: 'read_file', arguments: '{"path":"note.txt"}' } }] },
    { role: 'tool', tool_call_id: 'call-one', tool_name: 'read_file', content: 'plain file content' },
    { role: 'assistant', content: 'second answer' },
  ]
  const display = raw.filter(row => row.role !== 'assistant' || row.content).map(row => row.role === 'tool'
    ? { role: 'tool', name: row.tool_name, tool_call_id: row.tool_call_id } : row)
  for (const display_messages of [undefined, display]) {
    const snapshot = { session_id: 'native', messages: raw, ...(display_messages ? { display_messages } : {}) }
    const api = createWorkspace(null, null, { live: true })
    api.login('lin')
    const chat = api.openChatDraft()
    api.hydrateGatewayChat(chat.id, snapshot)
    const replies = api.getChat(chat.id).messages.filter(row => row.role === 'agent')
    assert.deepEqual(replies.map(row => Object.values(row.tools ?? {})), [
      [{ tool_id: 'call-one', name: 'terminal', args: { command: 'printf first' }, result: { output: 'first', exit_code: 0 }, complete: true }],
      [{ tool_id: 'call-one', name: 'read_file', args: { path: 'note.txt' }, result: 'plain file content', complete: true }],
    ])
    assert.deepEqual(replies.map(row => row.text), ['first answer', 'second answer'])
    assert.equal(gatewayTranscript(snapshot).messages.flatMap(row => Object.keys(row.tools ?? {})).length, 2)
  }
})

test('unfinished native turns keep completed tool details in the active turn until they settle', () => {
  const api = createWorkspace(null, null, { live: true })
  api.login('lin')
  const chat = api.openChatDraft()
  const snapshot = { session_id: 'native', running: true, messages: [
    { role: 'user', content: 'inspect' },
    { role: 'assistant', tool_calls: [{ id: 'finished', function: { name: 'terminal', arguments: '{"command":"pwd"}' } },
      { id: 'unfinished', function: { name: 'terminal', arguments: '{"command":"sleep 5"}' } }] },
    { role: 'tool', tool_call_id: 'internal', tool_name: 'terminal', display_kind: 'hidden', content: 'internal background result' },
    { role: 'tool', tool_call_id: 'finished', tool_name: 'terminal', content: '{"output":"/workspace"}' },
  ] }
  api.hydrateGatewayChat(chat.id, snapshot)
  assert.deepEqual(Object.values(api.getChat(chat.id).agentRun.tools), [
    { tool_id: 'finished', name: 'terminal', args: { command: 'pwd' }, result: { output: '/workspace' }, complete: true },
  ])
  assert.equal(api.getChat(chat.id).messages.flatMap(row => Object.keys(row.tools ?? {})).length, 0)
  api.hydrateGatewayChat(chat.id, { ...snapshot, running: false })
  const settled = api.getChat(chat.id)
  assert.equal(settled.agentRun, null)
  assert.deepEqual(settled.messages.at(-1).tools.finished.result, { output: '/workspace' })
  assert.equal(Object.hasOwn(settled.messages.at(-1).tools, 'unfinished'), false)
})

test('Agent file and webpage previews follow the turn and restore from successful native tool rows', async () => {
  const { gatewayTranscript } = await import('../src/live-aiwata.mjs')
  const preview = { url: './outputs/report.md', label: '交付稿' }
  const user = { role: 'user', text: '打开交付稿' }
  const reply = { role: 'assistant', text: '已打开', row_id: 9 }
  const nativeTool = { role: 'tool', tool_name: 'desktop_preview', tool_call_id: 'preview-1',
    content: JSON.stringify({ success: true, ...preview }) }
  const webTool = { ...nativeTool, tool_call_id: 'preview-2',
    content: JSON.stringify({ success: true, url: 'https://example.com' }) }
  const badTool = { ...nativeTool, tool_call_id: 'preview-3',
    content: JSON.stringify({ success: false, url: './failed.md' }) }
  const display = [user, ...[nativeTool, webTool, badTool].map(row =>
    ({ role: 'tool', name: 'tool_call', tool_call_id: row.tool_call_id })), reply]
  const snapshot = { session_id: 'runtime', stored_session_id: 'stored', replay_epoch: 'epoch', execution_generation: 1 }
  const expected = [{ target: preview.url, label: preview.label }]
  const expectedPages = [{ url: 'https://example.com/', label: 'example.com' }]
  const restored = gatewayTranscript({ ...snapshot, messages: [user, nativeTool, webTool, badTool, reply],
    display_messages: display }).messages.at(-1)
  assert.deepEqual(restored.filePreviews, expected)
  assert.deepEqual(restored.webPreviews, expectedPages)
  assert.deepEqual(gatewayTranscript({ ...snapshot, running: true,
    messages: [user, nativeTool], display_messages: display.slice(0, 2) }).pendingFiles, expected)

  const workspace = createWorkspace(null, null, { live: true })
  workspace.login('lin')
  const draft = workspace.openChatDraft()
  workspace.hydrateGatewayChat(draft.id, { ...snapshot, messages: [] })
  workspace.acceptGatewayPrompt(draft.id, { runId: 'turn', text: '打开交付稿' }, { admission_id: 'current', execution_generation: 2 })
  const frame = (type, seq, payload, execution_generation = 2) => ({
    method: 'event', params: { type, seq, replay_epoch: 'epoch', payload, execution_generation, admission_id: 'current' },
  })
  assert.equal(workspace.applyGatewayFrame(draft.id, frame('preview.open', 1, preview, 1), true), false)
  assert.equal(workspace.applyGatewayFrame(draft.id, frame('preview.open', 2, preview), false), true)
  assert.equal(workspace.applyGatewayFrame(draft.id, frame('preview.open', 2, preview), false), false)
  assert.equal(workspace.applyGatewayFrame(draft.id, frame('preview.open', 3, { url: 'https://example.com' }), true), true)
  assert.equal(workspace.getChat(draft.id).browser.visited, 'https://example.com/')
  assert.ok(workspace.getChat(draft.id).tabs.includes('浏览器'))
  assert.equal(workspace.getChat(draft.id).tool, '浏览器')
  assert.equal(workspace.getChat(draft.id).view, 'split')
  workspace.applyGatewayFrame(draft.id, frame('message.complete', 4, { text: '已打开' }), true)
  assert.deepEqual(workspace.getChat(draft.id).messages.at(-1).filePreviews, expected)
  assert.deepEqual(workspace.getChat(draft.id).messages.at(-1).webPreviews, expectedPages)
  workspace.login('qiao')
  assert.equal(workspace.getChat(draft.id), undefined)
})

test('native browser opens reuse the current instance without stealing background focus', async () => {
  const { browserState } = await import('../src/tool-tabs.mjs')
  const api = createWorkspace(null, null, { live: true })
  api.login('lin')
  const draft = api.openChatDraft()
  api.hydrateGatewayChat(draft.id, { session_id: 'runtime', stored_session_id: 'stored', messages: [], execution_generation: 1 })
  api.acceptGatewayPrompt(draft.id, { runId: 'turn', text: '打开网页' }, { admission_id: 'current', execution_generation: 2 })
  api.openTool(draft.id, '浏览器', undefined, { newInstance: true })
  const first = api.getChat(draft.id).tool
  api.updateBrowser(draft.id, b => ({ ...b, visited: 'https://example.com/' }), first)
  api.openTool(draft.id, '浏览器', undefined, { newInstance: true })
  const active = api.getChat(draft.id).tool
  const frame = (seq, url, admission_id = 'current') => ({ method: 'event', params: {
    type: 'preview.open', seq, replay_epoch: 'epoch', execution_generation: 2, admission_id, payload: { url },
  } })
  assert.equal(api.applyGatewayFrame(draft.id, frame(1, 'https://www.baidu.com/', 'wrong'), true), false)
  assert.equal(api.applyGatewayFrame(draft.id, frame(2, 'https://www.baidu.com/'), true), true)
  assert.equal(api.getChat(draft.id).tool, active)
  assert.equal(api.getChat(draft.id).tabs.length, 2)
  assert.equal(browserState(api.getChat(draft.id), active).visited, 'https://www.baidu.com/')
  assert.equal(browserState(api.getChat(draft.id), first).visited, 'https://example.com/')
  api.selectTool(draft.id, first)
  const selectedChat = api.current().activeChat
  assert.equal(api.applyGatewayFrame(draft.id, frame(3, 'https://example.org/'), false), true)
  assert.equal(api.getChat(draft.id).tool, first)
  assert.equal(api.current().activeChat, selectedChat)
  const before = browserState(api.getChat(draft.id), first)
  assert.equal(api.applyGatewayFrame(draft.id, frame(3, 'https://evil.example/'), true), false)
  assert.equal(browserState(api.getChat(draft.id), first), before)
})

test('browser replay restores native actions in order and excludes typed and page text', async () => {
  const { gatewayBrowserActions } = await import('../src/web-preview.mjs')
  const url = 'https://example.com/'
  const call = (id, name, action) => ({ id, type: 'function', function: { name, arguments: JSON.stringify({ action, text: 'typed value' }) } })
  const routedCall = (id, name, action) => ({ id, type: 'function', function: {
    name: 'tool_call', arguments: JSON.stringify({ calls: [{ name, arguments: { action, text: 'typed value' } }] }),
  } })
  const result = (id, tool_name, content) => ({ role: 'tool', tool_call_id: id, tool_name, content: JSON.stringify({ url, ...content }) })
  const rows = [
    { role: 'assistant', tool_calls: [
      call('open', 'desktop_preview', 'open'), call('read', 'desktop_preview', 'read'), routedCall('input', 'drive_preview', 'type'),
      call('bad', 'drive_preview', 'click'), call('click', 'drive_preview', 'click'),
    ] },
    result('open', 'desktop_preview', { success: true, label: '预览' }),
    result('read', 'desktop_preview', { kind: 'url', text: 'private page text' }),
    result('input', 'drive_preview', { success: true, hit: { ref: 'opaque', label: '备注', value: 'typed value' } }),
    result('bad', 'drive_preview', { success: false, error: 'stale ref' }),
    result('click', 'drive_preview', { success: true, hit: { label: '查看下一页' } }),
  ]
  const actions = gatewayBrowserActions(rows)
  assert.deepEqual(actions.map(({ id, action, target }) => [id, action, target]), [
    ['open', 'open', '预览'], ['read', 'read', undefined], ['input', 'type', '备注'], ['click', 'click', '查看下一页'],
  ])
  assert.ok(!/opaque|typed value|private page text/.test(JSON.stringify(actions)))
  assert.deepEqual(gatewayBrowserActions([...rows, rows.at(-1)]), actions)

  const workspace = createWorkspace(null, null, { live: true })
  workspace.login('lin')
  const chat = workspace.openChatDraft()
  workspace.hydrateGatewayChat(chat.id, { session_id: 'native', messages: [] })
  workspace.acceptGatewayPrompt(chat.id, { runId: 'turn', text: '查看网页' }, { admission_id: 'current' })
  workspace.hydrateGatewayChat(chat.id, { session_id: 'native', messages: rows })
  workspace.updateBrowser(chat.id, browser => ({ ...browser, playbackOpen: true, replayIndex: 2, visited: url + 'current' }))
  workspace.hydrateGatewayChat(chat.id, { session_id: 'native', messages: rows.slice(0, 1).concat(rows.slice(2)) })
  const browser = workspace.getChat(chat.id).browser
  assert.equal(browser.agentActions[browser.replayIndex].id, 'input')
  assert.equal(browser.visited, url + 'current')
  assert.equal(browser.playbackOpen, true)
  workspace.login('qiao')
  assert.equal(workspace.getChat(chat.id), undefined)
})

test('system folder selection canonicalizes and deduplicates only current workspace directories', async () => {
  const { selectedWorkspaceFolders } = await import('../scripts/live-aiwata-folders.mjs')
  const workspace = '/users/lin/projects'
  const resolveDirectory = async (root, path) => {
    assert.equal(root, workspace)
    if (!path.startsWith(root + '/')) throw new Error('当前用户工作区')
    return path.replace(/\/$/, '')
  }
  assert.deepEqual(await selectedWorkspaceFolders(workspace, [workspace + '/稿件/', workspace + '/稿件', workspace + '/素材'], resolveDirectory),
    [workspace + '/稿件', workspace + '/素材'])
  assert.deepEqual(await selectedWorkspaceFolders(workspace, [], resolveDirectory), [])
  await assert.rejects(() => selectedWorkspaceFolders(workspace, [workspace + '/稿件', '/users/qiao/projects/稿件'], resolveDirectory), /当前用户/)
  await assert.rejects(() => selectedWorkspaceFolders(workspace, [null], resolveDirectory), /目录选择/)
})

test('Bot deletion checks the exact profile incarnation and all hosted room pages', async t => {
  const { botDeletionTarget } = await import('../scripts/live-aiwata-bots.mjs')
  const account = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-bot-delete-')))
  t.after(() => rm(account, { recursive: true, force: true }))
  await mkdir(join(account, 'profiles', 'writer'), { recursive: true })
  const none = { call: async () => ({ rooms: [] }) }
  const target = await botDeletionTarget(none, account, { profile: 'writer' })
  assert.match(target.identity, /^[a-f0-9]{64}$/)
  assert.equal(target.path, join(account, 'profiles', 'writer'))
  await assert.rejects(() => botDeletionTarget(none, account, { profile: 'writer', identity: '0'.repeat(64) }), /已变化/)
  const paged = { call: async (_method, { offset }) => offset === 0
    ? { rooms: [{ name: '其他群', members: [{ profile: 'designer' }] }], next_offset: 1 }
    : { rooms: [{ name: '协作群', members: [{ profile: 'writer' }] }] } }
  assert.deepEqual((await botDeletionTarget(paged, account, { profile: 'writer', identity: target.identity })).rooms, ['协作群'])
  await assert.rejects(() => botDeletionTarget(none, account, { profile: 'default' }))
})

test('connector operations cannot submit arbitrary platform, paths or ambiguous credential updates', async () => {
  const { connectorRequest, withoutAmbientChannelCredentials } = await import('../scripts/live-aiwata-connectors.mjs')
  const save = { action: 'save', profile: 'writer', platform: 'telegram', enabled: false, env: { TELEGRAM_ALLOWED_USERS: '42' }, clear: [] }
  assert.deepEqual(connectorRequest(save), save)
  for (const input of [
    { ...save, platform: 'api_server' },
    { ...save, profile: '../qiao' },
    { ...save, env: { TELEGRAM_BOT_TOKEN: 'first\nSECOND=value' } },
    { ...save, clear: ['TELEGRAM_ALLOWED_USERS'] },
    { ...save, env: { TELEGRAM_BOT_TOKEN: '«redacted:***»' } },
    { ...save, profileHome: '/other' },
    { action: 'apply', profile: 'writer', managedApplyComplete: true },
    { action: 'approve', profile: 'writer', platform: 'telegram', id: 'all' },
  ]) assert.throws(() => connectorRequest(input))
  assert.deepEqual(withoutAmbientChannelCredentials({
    TELEGRAM_BOT_TOKEN: 'ambient', GATEWAY_ALLOW_ALL_USERS: 'true', HERMES_HOME: '/account', ZAI_API_KEY: 'model',
  }), { HERMES_HOME: '/account', ZAI_API_KEY: 'model' })
})

test('managed connector apply clears pending settings only after the owned gateway accepts the reload', async t => {
  const { createConnectorBridge } = await import('../scripts/live-aiwata-connectors.mjs')
  const { profileWriteQueue } = await import('../scripts/live-aiwata-runtime.mjs')
  const home = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-connector-reload-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  const profileHome = join(home, 'profiles', 'writer')
  await mkdir(profileHome, { recursive: true })
  const client = { home }
  const active = () => true
  const calls = []
  let busy = true
  const connector = createConnectorBridge('', profileWriteQueue(), {
    reload: async (owner, selected, signedIn) => {
      assert.equal(owner, client)
      assert.equal(selected, profileHome)
      assert.equal(signedIn, active)
      calls.push('reload')
      if (busy) throw new Error('gateway busy')
    },
    native: async (owner, request, signedIn) => {
      assert.equal(owner, client)
      assert.equal(signedIn, active)
      assert.deepEqual(request, { action: 'apply', profile: 'writer', profileHome, accountHome: home, managedApplyComplete: true })
      calls.push('mark applied')
      return { ok: true }
    },
  })
  const request = { action: 'apply', profile: 'writer' }
  await assert.rejects(connector(client, request, active), /gateway busy/)
  assert.deepEqual(calls, ['reload'])
  busy = false
  assert.deepEqual(await connector(client, request, active), { ok: true })
  assert.deepEqual(calls, ['reload', 'reload', 'mark applied'])
})

test('Telegram setup keeps native secrets and unfinished pairing bound to the original login and Profile', async t => {
  const { createConnectorBridge } = await import('../scripts/live-aiwata-connectors.mjs')
  const { profileWriteQueue } = await import('../scripts/live-aiwata-runtime.mjs')
  const root = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-telegram-onboarding-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const client = { home: join(root, 'lin') }
  const other = { home: join(root, 'qiao') }
  for (const owner of [client, other]) await mkdir(join(owner.home, 'profiles', 'writer'), { recursive: true })
  const expiresAt = new Date(Date.now() + 300_000).toISOString()
  const nativePairing = { id: 'native-pairing', poll_token: 'private-poll', expires_at: expiresAt }
  const calls = []
  const connector = createConnectorBridge('', profileWriteQueue(), { native: async (_owner, request) => {
    calls.push(request)
    if (request.action === 'telegramStart') return {
      pairing: nativePairing, deepLink: 'https://t.me/newbot/setup/demo_bot', expiresAt,
    }
    assert.equal(request.pairing.poll_token, nativePairing.poll_token)
    if (request.action === 'telegramStatus') return {
      status: 'ready', username: 'demo_bot', ownerId: '123456', pairing: { ...nativePairing, bot_token: 'private-bot' },
    }
    assert.equal(request.pairing.bot_token, 'private-bot')
    assert.deepEqual(request.allowedUserIds, ['123456'])
    return { hot_served: false }
  } })
  const active = () => true
  const start = { action: 'telegramStart', profile: 'writer' }
  const { id, ...setup } = await connector(client, start, active)
  assert.deepEqual(setup, { deepLink: 'https://t.me/newbot/setup/demo_bot', expiresAt })
  assert.notEqual(id, nativePairing.id)
  const status = { action: 'telegramStatus', profile: 'writer', id }
  const apply = { ...status, action: 'telegramApply', allowedUserIds: ['123456'] }
  await assert.rejects(() => connector(other, status, active))
  await assert.rejects(() => connector({ ...client }, status, active))
  await assert.rejects(() => connector(client, { ...status, profile: 'default' }, active))
  await assert.rejects(() => connector(client, apply, active))
  await assert.rejects(() => connector(client, { ...apply, allowedUserIds: ['*'] }, active))
  assert.equal(calls.length, 1)
  assert.deepEqual(await connector(client, status, active), { status: 'ready', username: 'demo_bot', ownerId: '123456' })
  assert.deepEqual(await connector(client, apply, active), { hot_served: false })
  await assert.rejects(() => connector(client, apply, active))
  const next = await connector(client, start, active)
  connector.close(client)
  await assert.rejects(() => connector(client, { ...status, id: next.id }, active))
})

test('Team Gateway link status accepts only a handle minted for this login and platform', async t => {
  const { createConnectorBridge } = await import('../scripts/live-aiwata-connectors.mjs')
  const { profileWriteQueue } = await import('../scripts/live-aiwata-runtime.mjs')
  const home = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-team-gateway-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  const client = { home }
  const calls = []
  const active = () => true
  const expiresAt = new Date(Date.now() + 300_000).toISOString()
  const connector = createConnectorBridge('', profileWriteQueue(), { native: async (_owner, request) => {
    calls.push(request)
    if (request.action === 'relayStart') return { code: 'ONE123', command: '/link ONE123', expiresAt, botUrl: 'https://t.me/shared_bot' }
    assert.equal(request.code, 'ONE123')
    return { state: 'inactive' }
  } })
  const start = { action: 'relayStart', profile: 'default', platform: 'telegram' }
  const { id, ...link } = await connector(client, start, active)
  assert.deepEqual(link, { command: '/link ONE123', expiresAt, botUrl: 'https://t.me/shared_bot' })
  const status = { ...start, action: 'relayStatus', id }
  await assert.rejects(() => connector({ ...client }, status, active))
  await assert.rejects(() => connector(client, { ...status, platform: 'discord' }, active))
  await assert.rejects(() => connector(client, { ...status, code: 'ONE123' }, active))
  await assert.rejects(() => connector(client, { ...start, profile: 'writer' }, active))
  assert.equal(calls.length, 1)
  assert.deepEqual(await connector(client, status, active), { state: 'inactive' })
  await assert.rejects(() => connector(client, status, active))
  const pending = await connector(client, start, active)
  connector.close(client)
  await assert.rejects(() => connector(client, { ...status, id: pending.id }, active))
})

test('memory bridge fences stale card identifiers, write approvals and config scope', async () => {
  const { memoryRequest } = await import('../scripts/live-aiwata-memory.mjs')
  const valid = { action: 'edit', profile: 'writer', id: 'memory:profile:2:0123456789ab', content: '更新内容', revision: 'a'.repeat(64) }
  assert.deepEqual(memoryRequest(valid), valid)
  for (const input of [
    { ...valid, id: 'memory:profile:2' },
    { ...valid, id: '../MEMORY.md' },
    { ...valid, content: '第一条\n§\n第二条' },
    { ...valid, profile: '../qiao' },
    { action: 'approve', profile: 'writer', id: 'all', revision: 'a'.repeat(64) },
    { action: 'setting', profile: 'writer', key: 'provider', value: true },
    { action: 'read', profile: 'writer', profileHome: '/other' },
  ]) assert.throws(() => memoryRequest(input))
})

test('skill routes admit official catalog entries and profile-local skill actions only', async () => {
  const { skillRequest } = await import('../scripts/live-aiwata-skills.mjs')
  assert.deepEqual(skillRequest({ action: 'install', profile: 'writer', id: 'official/creative/concept-diagrams' }),
    { action: 'install', profile: 'writer', id: 'official/creative/concept-diagrams' })
  assert.equal(skillRequest({ action: 'toggle', profile: 'default', id: 'creative/concept-diagrams', value: false }).value, false)
  for (const request of [
    { action: 'install', id: 'https://example.com/skill' },
    { action: 'install', id: 'official/../concept-diagrams' },
    { action: 'content', id: '/Users/other/SKILL.md' },
    { action: 'toggle', id: 'skill', value: 'false' },
    { action: 'create', id: 'creative/child', content: 'skill' },
    { action: 'edit', id: 'skill', content: '' },
    { action: 'list', profile: '../qiao' },
    { action: 'list', profile: 'writer', home: '/other' },
  ]) assert.throws(() => skillRequest({ profile: 'writer', ...request }))
})

test('scheduled tasks preserve native owner, schedule and execution identity', async () => {
  const { gatewayTask } = await import('../src/live-tasks.mjs')
  const native = { id: 'd41c332548be', name: '报告', schedule: { kind: 'once', run_at: '2030-02-01T10:00:00+08:00' },
    schedule_display: 'once in 15m', timezone: 'Asia/Shanghai', repeat: { times: 3 },
    live_execution: { id: 'exec-1' }, enabled: true, last_delivery_error: 'room unavailable',
    latest_execution: { delivery_outcome: 'delivered' }, delivery_unverified: true }
  const task = gatewayTask({ ...native, profile: 'writer' })
  assert.equal(task.id, 'writer:d41c332548be')
  assert.equal(task.profile, 'bot:writer')
  assert.equal(task.schedule, '2030-02-01T10:00:00+08:00')
  assert.equal(task.repeat, 3)
  assert.equal(task.running, 'exec-1')
  assert.equal(task.lastDeliveryError, 'room unavailable')
  assert.equal(task.deliveryOutcome, 'unverified')
  assert.notEqual(gatewayTask({ ...native, profile: 'default' }).id, task.id)
})

test('scheduled task bridge accepts exact jobs and one account-owned delivery target', async () => {
  const { taskRequest } = await import('../scripts/live-aiwata-tasks.mjs')
  const data = { name: '报告', prompt: '生成摘要', schedule: 'every 1h', timezone: '', repeat: '2', workdir: '', deliver: 'local' }
  const save = { action: 'save', profile: 'writer', requestId: 'bf8f6dee-17fd-494a-9f1e-b354c8167cce', data }
  assert.equal(taskRequest(save).data.repeat, 2)
  assert.equal(taskRequest({ ...save, data: { ...data, deliver: 'room:team-1@default' } }).data.deliver, 'room:team-1@default')
  assert.equal(taskRequest({ ...save, data: { ...data, deliver: 'telegram' } }).data.deliver, 'telegram')
  assert.deepEqual(taskRequest({ action: 'targets', profile: 'writer' }), { action: 'targets', profile: 'writer' })
  assert.throws(() => taskRequest({ action: 'targets', profile: 'writer', extra: true }))
  for (const deliver of ['origin', 'telegram:1234', 'telegram,slack', 'bot-chat:writer']) {
    assert.throws(() => taskRequest({ ...save, data: { ...data, deliver } }))
  }
  for (const deliver of ['room:team-1', 'room:team-1@writer', 'room:team-1@default,all', 'room:../team-1@default']) {
    assert.throws(() => taskRequest({ ...save, data: { ...data, deliver } }))
  }
  assert.throws(() => taskRequest({ ...save, requestId: null }))
  assert.throws(() => taskRequest({ ...save, data: { ...data, repeat: '0' } }))
  assert.throws(() => taskRequest({ ...save, data: { ...data, no_agent: true } }))
  assert.throws(() => taskRequest({ ...save, data: { ...data, deliver: 'all' } }))
  assert.throws(() => taskRequest({ action: 'run', profile: 'writer', id: 'job by name' }))
  assert.throws(() => taskRequest({ action: 'run', profile: 'all', id: 'd41c332548be' }))
  assert.throws(() => taskRequest({ action: 'python', profile: 'default' }))
})

test('live room history keeps real threads and fences pending member approvals', async () => {
  const { mergeRoomEvents, projectRoom } = await import('../src/live-room-state.mjs')
  const events = mergeRoomEvents([{ seq: 1, event_id: 'original', kind: 'message.user', actor: { kind: 'user' }, payload: { text: 'hello', thread_id: 'thread' } }], [
    { seq: 1, event_id: 'original' },
    { seq: 2, event_id: 'response', kind: 'message.member', actor: { kind: 'member', id: 'writer' }, payload: { text: 'reply', thread_id: 'thread' } },
  ])
  const state = projectRoom({ room: { room_id: 'room', name: 'Test', members: [{ member_id: 'writer', profile: 'writer', display_name: 'Writer' }] },
    driver_status: { working: true, member_activity: [{ member_id: 'writer', status: 'running' }], pending_actions: [
      { kind: 'approval', request_id: 'ask', member_id: 'writer', task_id: 'task', execution_generation: 3, choices: ['deny'] },
    ] } }, events)
  assert.deepEqual(state.messages.map(message => [message.id, message.threadId]), [['original', 'thread'], ['response', 'thread']])
  assert.equal(state.messages[1].memberId, 'bot:writer')
  assert.equal(state.approvals[0].params.execution_generation, 3)
  assert.equal(state.approvals[0].params.member_id, 'writer')
})

test('a room stop fences a late bounded outcome for the same discussion', async () => {
  const { projectRoom } = await import('../src/live-room-state.mjs')
  const state = { room: { room_id: 'room', members: [] }, driver_status: { working: false } }
  const source = { seq: 1, event_id: 'discussion', kind: 'message.user', payload: { thread_id: 'thread' } }
  const bounded = { seq: 3, kind: 'room.activity', payload: { status: 'bounded', thread_id: 'thread', discussion_event_id: 'discussion' } }
  assert.equal(projectRoom(state, [source, bounded]).paused, 'discussion')
  assert.equal(projectRoom(state, [source, { seq: 2, kind: 'room.stop_requested' }, bounded]).paused, null)
  assert.equal(projectRoom(state, [source, bounded,
    { seq: 4, kind: 'room.continued', payload: { discussion_event_id: 'discussion' } }]).paused, null)
})

test('a failed real room member keeps its error in replayed history when the driver has no last error', async () => {
  const { projectRoom, mergeRoomEvents } = await import('../src/live-room-state.mjs')
  const events = [
    { seq: 1, event_id: 'discussion', kind: 'message.user', payload: { text: 'hello', thread_id: 'thread' } },
    { seq: 2, event_id: 'failure', kind: 'turn.failed', payload: {
      member_id: 'writer', thread_id: 'thread', discussion_event_id: 'discussion', error: '此 Profile 缺少模型凭据。',
    } },
  ]
  const snapshot = { room: { members: [{ member_id: 'writer', profile: 'writer', display_name: '文案助手' }] },
    driver_status: { working: false, last_error: null } }
  const state = projectRoom(snapshot, mergeRoomEvents(events, events))
  assert.equal(state.messages.length, 2)
  assert.deepEqual(state.messages[1], { id: 'failure', role: 'agent', author: '文案助手', memberId: 'bot:writer',
    threadId: 'thread', status: 'error', error: '此 Profile 缺少模型凭据。' })
  assert.equal(state.statuses['bot:writer'], 'failed')
  const unavailable = { ...events[1], payload: { ...events[1].payload, error: 'runtime_draining' } }
  assert.equal(projectRoom(snapshot, [events[0], unavailable]).messages[1].error, '此成员的网关暂不可用。')
})

test('Bot routes only resolve physical profiles inside the active account', async t => {
  const { ownedBotHome } = await import('../scripts/live-aiwata-bots.mjs')
  const root = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-bot-scope-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const lin = join(root, 'lin')
  const qiao = join(root, 'qiao', 'profiles', 'designer')
  const writer = join(lin, 'profiles', 'writer')
  await Promise.all([mkdir(writer, { recursive: true }), mkdir(qiao, { recursive: true })])
  await symlink(qiao, join(lin, 'profiles', 'designer'), 'dir')
  assert.equal(await ownedBotHome(lin, 'writer'), writer)
  await assert.rejects(() => ownedBotHome(lin, 'designer'))
  await assert.rejects(() => ownedBotHome(lin, '../qiao'))
  await assert.rejects(() => ownedBotHome(lin, 'default'))
})

test('legacy avatar saves omit unchanged profile text while preserving edited text', async t => {
  const { saveGatewayBot } = await import('../scripts/live-aiwata-bots.mjs')
  const scratch = await mkdtemp(join(tmpdir(), 'aiwata-bot-look-'))
  t.after(() => rm(scratch, { recursive: true, force: true }))
  const home = await realpath(scratch)
  const path = join(home, 'profiles', 'writer')
  await mkdir(path, { recursive: true })
  const updates = []
  const connection = { async call(method, body) {
    if (method === 'profiles.list') return { profiles: [{ name: 'writer', path }] }
    assert.equal(method, 'profiles.configure')
    updates.push(body)
    return { ok: true }
  } }
  const settings = { profile: 'writer', name: 'Writer', revision: 0, desktopRevision: 0,
    description: 'Original description', originalDescription: 'Original description',
    soul: 'Original instructions', originalSoul: 'Original instructions', appearance: { shape: 'circle' } }
  await saveGatewayBot(connection, home, settings, new Map())
  assert.equal(Object.hasOwn(updates[0], 'description'), false)
  assert.equal(Object.hasOwn(updates[0], 'soul'), false)
  await saveGatewayBot(connection, home, { ...settings, description: '', soul: 'New instructions' }, new Map())
  assert.equal(updates[1].description, '')
  assert.equal(updates[1].soul, 'New instructions')
})

test('a replacement Bot with the same profile name cannot inherit deleted chat drafts or tasks', () => {
  const workspace = createWorkspace(null, null, { live: true })
  workspace.login('lin')
  workspace.syncGatewayBots([{ profile: 'writer', name: '旧 Bot', identity: 'old', canonicalId: 'stored-old' }])
  workspace.openChat('bot:writer')
  workspace.setDraft('bot:writer', 'old draft')
  workspace.updateManagement({ tasks: [
    { id: 'old-task', profile: 'bot:writer' }, { id: 'default-task', profile: 'default' },
  ] })
  workspace.syncGatewayBots([{ profile: 'writer', name: '新 Bot', identity: 'new' }])
  assert.equal(workspace.getChat('bot:writer').draft, '')
  assert.equal(workspace.getChat('bot:writer').gatewayStoredId, undefined)
  assert.deepEqual(workspace.current().openChats, [])
  assert.deepEqual(workspace.current().management.tasks.map(task => task.id), ['default-task'])
})

test('Bot roster keeps the app tab and draft when the canonical chat changes and never creates a project conversation', () => {
  const workspace = createWorkspace(null, null, { live: true })
  workspace.login('lin')
  workspace.syncGatewayBots([{ profile: 'writer', name: '文案', canonicalId: 'stored-one' }])
  assert.equal(workspace.openChat('bot:writer'), true)
  workspace.setDraft('bot:writer', 'local draft')
  workspace.syncGatewayBots([{ profile: 'writer', name: '编辑', canonicalId: 'stored-two' }])
  const chat = workspace.getChat('bot:writer')
  assert.equal(chat.title, '编辑')
  assert.equal(chat.gatewayProfile, 'writer')
  assert.equal(chat.gatewayStoredId, 'stored-two')
  assert.equal(chat.draft, 'local draft')
  assert.deepEqual(workspace.current().openChats, ['bot:writer'])
  workspace.syncGatewayInventory([], [], { complete: true })
  assert.equal(workspace.getChat('bot:writer'), chat)
  workspace.login('qiao')
  assert.equal(workspace.getChat('bot:writer'), undefined)
})

test('the local bridge only accepts explicit application operations and rejects a caller-chosen profile', () => {
  assert.equal(allowedGatewayCall('projects.list', {}), true)
  assert.equal(allowedGatewayCall('session.resume', { session_id: 'existing' }), true)
  assert.equal(allowedGatewayCall('session.resume', { session_id: 'existing', profile: 'another' }), false)
  assert.equal(allowedGatewayCall('session.create', { cwd: '/work', client_env: { HERMES_HOME: '/other' } }), false)
  assert.equal(allowedGatewayCall('config.set', { key: 'terminal.backend', value: 'docker' }), false)
})

test('session controls admit only their application-specific payloads', () => {
  const base = { session_id: 'local-session', request_id: 'attempt', expected_revision: 1 }
  assert.equal(allowedGatewayCall('session.mutate', { ...base, operation: 'archive', payload: { archived: true } }), true)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, operation: 'archive', payload: { archived: 'true' } }), false)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, operation: 'sidebar', payload: { hidden: true } }), false)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, operation: 'workspace', payload: { cwd: '/work' } }), false)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, expected_generation: 2, operation: 'workspace', payload: { cwd: '/work' } }), true)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, expected_generation: 2, operation: 'delete', payload: {}, profile: 'other' }), false)
})

test('live model choices allow session model changes without accepting credentials or endpoints', () => {
  const base = { session_id: 'owned-session', request_id: 'selection', expected_revision: 1, expected_generation: 0, operation: 'model' }
  assert.equal(allowedGatewayCall('model.options', { session_id: 'owned-session', explicit_only: true, refresh: false }), true)
  assert.equal(allowedGatewayCall('session.create', { request_id: 'draft', model: 'glm-5.3', provider: 'zai' }), true)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, payload: { model: 'glm-5.3', provider: 'zai' } }), true)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, payload: { model: 'local-model', provider: 'custom:本机模型' } }), true)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, payload: { model: 'reset' } }), true)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, payload: { model: 'glm-5.3', confirm: 'a'.repeat(64) } }), true)
  for (const payload of [
    { model: '' }, { model: 'other', api_key: 'secret' }, { model: 'other', base_url: 'https://other' },
    { model: 'other', confirm: true }, { model: 'other', provider: '\n' }, { model: 'other\nextra' },
  ]) assert.equal(allowedGatewayCall('session.mutate', { ...base, payload }), false)
  assert.equal(allowedGatewayCall('model.options', { profile: 'other' }), false)
  assert.equal(allowedGatewayCall('model.options', { refresh: 'true' }), false)
  assert.equal(allowedGatewayCall('session.create', { model: 'other', base_url: 'https://other' }), false)
  assert.equal(allowedGatewayCall('session.mutate', { ...base, expected_generation: undefined, payload: { model: 'glm-5.3' } }), false)
})

test('approval configuration only accepts the native Profile approval-mode setting', () => {
  assert.equal(allowedGatewayCall('config.get', { key: 'approvals.mode' }), true)
  for (const value of ['manual', 'smart', 'off']) {
    assert.equal(allowedGatewayCall('config.set', { key: 'approvals.mode', value }), true)
  }
  for (const [method, params] of [
    ['config.get', { key: 'full' }], ['config.get', { key: 'approvals.mode', profile: 'other' }],
    ['config.set', { key: 'terminal.backend', value: 'docker' }],
    ['config.set', { key: 'approvals.mode', value: 'off', session_id: 'arbitrary' }],
    ['config.set', { key: 'approvals.mode', value: true }],
    ['config.set', { key: 'approvals.mode', value: 'manual\nterminal.backend=docker' }],
  ]) assert.equal(allowedGatewayCall(method, params), false)
})

test('isolated history restores archived chats and associates compressed conversations with the latest workspace', async t => {
  const { gatewaySessionDirectory, readGatewaySessionInventory } = await import('../scripts/live-aiwata-gateway.mjs')
  const home = await mkdtemp(join(tmpdir(), 'aiwata-session-history-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const file = join(home, 'state.db')
  const db = new DatabaseSync(file)
  try {
    db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, chat_id TEXT, source TEXT, title TEXT,
      cwd TEXT, model TEXT, hidden INT, archived INT, started_at REAL, last_active REAL, message_count INT)`)
    const put = db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    put.run('root', 'root', 'local', '存档会话', '/projects/old', 'model', 0, 1, 1, 1, 3)
    put.run('tip', 'root', 'local', null, '/projects/next/sub', 'model', 0, 0, 2, 2, 4)
    put.run('draft', 'draft', 'gui', '空草稿', '/projects/old', null, 0, 0, 3, 3, 0)
    put.run('hidden', 'hidden', 'local', 'Bot Chat', '/projects/old', null, 1, 0, 4, 4, 2)
    put.run('automation', 'automation', 'cron', '定时任务', '/projects/old', null, 0, 0, 5, 5, 3)
  } finally { db.close() }
  assert.equal(await gatewaySessionDirectory(home, 'draft'), '/projects/old')
  for (const id of ['root', 'tip', 'hidden', 'automation', 'missing']) {
    assert.equal(await gatewaySessionDirectory(home, id), undefined)
  }
  const sessions = await readGatewaySessionInventory(home)
  assert.deepEqual(sessions.map(({ id, cwd, archived }) => ({ id, cwd, archived })), [
    { id: 'root', cwd: '/projects/next/sub', archived: true },
  ])
  const workspace = createWorkspace(null, null, { live: true })
  workspace.login('lin')
  workspace.syncGatewayInventory([{ id: 'old', name: '旧项目', primary_path: '/projects/old' },
    { id: 'next', name: '新项目', primary_path: '/projects/primary', folders: [{ path: '/projects/next' }] }], sessions)
  assert.equal(workspace.getChat('root').title, '存档会话')
  assert.equal(workspace.getChat('root').projectId, 'next')
  assert.equal(workspace.getChat('root').archived, true)
  assert.equal(workspace.openChat('root'), true)
  workspace.syncGatewayInventory(workspace.current().projects.map(project => ({ id: project.id, name: project.name })), [], { complete: true })
  assert.equal(workspace.getChat('root'), undefined)
  assert.deepEqual(workspace.current().openChats, [])
})

class TestSocket extends EventTarget {
  readyState = 1
  sent = []
  send(raw) { this.sent.push(JSON.parse(raw)) }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')) }
  receive(frame) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) })) }
}

test('gateway events and request receipts travel independently, and a dropped socket rejects pending RPC', async () => {
  const socket = new TestSocket()
  const events = []
  const connection = new GatewayConnection(socket, frame => events.push(frame))
  const ready = { method: 'event', params: { type: 'gateway.ready', payload: { session_authority: true } } }
  socket.receive(ready)
  await connection.ready
  const promise = connection.call('projects.list', {})
  const sent = socket.sent[0]
  const event = { method: 'event', params: { type: 'message.delta', session_id: 's', payload: { text: 'hi' } } }
  socket.receive(event)
  socket.receive({ id: sent.id, result: { projects: [] } })
  assert.deepEqual(await promise, { projects: [] })
  assert.deepEqual(events, [ready, event])
  const pending = connection.call('session.resume', { session_id: 's' })
  connection.close()
  await assert.rejects(pending, /断开/)
})

test('native desktop capability handshake follows ready and preserves native error envelopes', async () => {
  const socket = new TestSocket()
  const connection = new GatewayConnection(socket, () => {})
  const handshake = connection.advertiseCapabilities()
  assert.deepEqual(socket.sent, [])
  socket.receive({ method: 'event', params: { type: 'gateway.ready', payload: { session_authority: true } } })
  await Promise.resolve()
  const request = socket.sent[0]
  assert.equal(request.method, 'client.capabilities')
  assert.deepEqual(request.params, { server_requests: true })
  socket.receive({ id: request.id, result: { server_requests: ['sudo'], declines_not_shown: true } })
  assert.deepEqual(await handshake, connection.capabilities)
  assert.equal(connection.nativeCapabilities.declines_not_shown, true)
  assert.equal(connection.capabilities.declines_not_shown, false)
  connection.reply('srq-000000000001', undefined, { code: 4404, message: 'Not shown' })
  assert.deepEqual(socket.sent.at(-1), { jsonrpc: '2.0', id: 'srq-000000000001', error: { code: 4404, message: 'Not shown' } })
  connection.close()
})

test('real drafts become sessions only after admission and recovery keeps a generation-bound approval', () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
  const workspace = createWorkspace(storage, null, { live: true })
  workspace.login('lin')
  assert.deepEqual(workspace.current().projects, [])
  const draft = workspace.openChatDraft()
  workspace.setDraft(draft.id, 'hello')
  const snapshot = { session_id: 'runtime', stored_session_id: 'stored', replay_epoch: 'epoch', last_sequence: 0,
    execution_generation: 1, messages: [], info: { model: 'glm-5.3' } }
  workspace.hydrateGatewayChat(draft.id, snapshot)
  assert.equal(workspace.acceptGatewayPrompt(draft.id, { runId: 'turn', text: 'hello' }, {}), false)
  assert.equal(workspace.getChat(draft.id).draft, 'hello')
  assert.equal(Object.keys(workspace.current().chats).length, 0)
  assert.equal(workspace.acceptGatewayPrompt(draft.id, { runId: 'turn', text: 'hello' }, { admission_id: 'admitted', execution_generation: 2 }), true)
  assert.equal(workspace.current().usage.length, 0)
  assert.equal(workspace.current().newChatDraft, undefined)
  const event = (type, seq, payload, execution_generation = 2) => ({ method: 'event', params: { type, seq, payload, execution_generation, replay_epoch: 'epoch' } })
  assert.equal(workspace.applyGatewayFrame(draft.id, event('message.complete', 1, { text: 'old' }, 1), true), false)
  workspace.applyGatewayFrame(draft.id, event('approval.request', 2, { prompt_id: 'approval', choices: ['once', 'deny'] }), true)
  assert.equal(workspace.getChat(draft.id).agentRun.request.id, 'approval')
  const reopened = createWorkspace(storage, null, { live: true })
  reopened.login('qiao')
  assert.equal(reopened.getChat(draft.id), undefined)
  reopened.login('lin')
  assert.equal(reopened.getChat(draft.id).pending, 'turn')
  reopened.hydrateGatewayChat(draft.id, { ...snapshot, execution_generation: 2, running: true, last_sequence: 3,
    prompts: [{ kind: 'approval', prompt_id: 'approval', execution_generation: 2, choices: ['once', 'deny'] }] })
  assert.equal(reopened.getChat(draft.id).gatewaySeq, 2)
  assert.equal(reopened.getChat(draft.id).agentRun.request.id, 'approval')
  reopened.applyGatewayFrame(draft.id, event('approval.settled', 3, { prompt_id: 'approval' }), true)
  assert.equal(reopened.getChat(draft.id).agentRun.request, null)
})

test('a lost acknowledgement restores the canonical turn once and preserves edits made after sending', () => {
  const workspace = createWorkspace(null, null, { live: true })
  workspace.login('lin')
  const draft = workspace.openChatDraft()
  workspace.setDraft(draft.id, 'original')
  workspace.hydrateGatewayChat(draft.id, { session_id: 'stored', messages: [] })
  const attempt = { id: 'submission', input: { text: 'original', attachments: [], attachmentDetails: {} } }
  workspace.changeChat(draft.id, { gatewaySubmission: attempt })
  workspace.setDraft(draft.id, 'edited while disconnected')
  const receipt = { admission_id: 'native-admission', status: 'terminal', execution_generation: 1 }
  const snapshot = { session_id: 'stored', execution_generation: 1, messages: [
    { role: 'user', content: 'original' }, { role: 'assistant', content: 'saved answer' },
  ] }
  assert.equal(workspace.recoverGatewayPrompt(draft.id, attempt, receipt, snapshot), true)
  assert.equal(workspace.recoverGatewayPrompt(draft.id, attempt, receipt, snapshot), false)
  assert.equal(workspace.current().newChatDraft, undefined)
  assert.equal(workspace.getChat(draft.id).pending, null)
  assert.equal(workspace.getChat(draft.id).draft, 'edited while disconnected')
  assert.deepEqual(workspace.getChat(draft.id).messages.map(message => message.text), ['original', 'saved answer'])
})

test('a turn lost on owner restart keeps its generation and waits for acknowledgement', () => {
  const workspace = createWorkspace(null, null, { live: true })
  workspace.login('lin')
  const chat = workspace.openChatDraft()
  const snapshot = { session_id: 'restarted-session', messages: [], execution_generation: 5 }
  workspace.hydrateGatewayChat(chat.id, { ...snapshot, pending: [
    { status: 'unknown', admission_id: 'lost-admission', execution_generation: 4 },
  ] })
  assert.deepEqual(chat.gatewayUnknown, { admissionId: 'lost-admission', generation: 4 })
  assert.equal(chat.activity.needsInput, true)
  workspace.hydrateGatewayChat(chat.id, { ...snapshot, pending: [] })
  assert.equal(chat.gatewayUnknown, null)
  assert.equal(chat.pending, null)
})

test('capability bridge fences credentials to its resolved login and Profile', async t => {
  let capabilities
  try { capabilities = await import('../scripts/live-aiwata-capabilities.mjs') } catch {}
  assert.equal(typeof capabilities?.createCapabilityBridge, 'function', 'capability bridge is available')
  const root = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-capability-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const own = { home: root, workspace: root }
  await mkdir(join(root, 'bot'))
  const seen = []
  let signedIn = true
  const bridge = capabilities.createCapabilityBridge({
    connect: async (_client, profile) => ({ home: profile ? join(root, 'bot') : root,
      connection: { call: async (method, params) => {
        seen.push({ method, params, profile })
        if (method === 'model.save_key') return { provider: { slug: 'openai', name: 'OpenAI', authenticated: true, api_key: params.api_key } }
        return { providers: [] }
      } } }),
    writeProfile: async (_home, operation) => operation(),
  })
  const request = { method: 'model.save_key', profile: 'writer', params: { slug: 'openai', api_key: 'private-test-key' } }
  assert.deepEqual(await bridge(own, request, () => signedIn), { provider: { slug: 'openai', name: 'OpenAI', authenticated: true } })
  assert.equal(seen[0].profile, 'writer')
  for (const bad of [{ ...request, home: '/other' }, { ...request, profile: '../other' },
    { ...request, params: { ...request.params, profile: 'other' } },
    { ...request, params: { ...request.params, api_key: 'line\nbreak' } },
    { method: 'config.set', params: { key: 'model.api_key', value: 'secret' } },
  ]) await assert.rejects(() => bridge(own, bad, () => signedIn))
  const before = seen.length
  signedIn = false
  await assert.rejects(() => bridge(own, request, () => signedIn))
  assert.equal(seen.length, before)
})

test('MCP authorization handles belong to one login, Profile and server incarnation', async t => {
  const { createCapabilityBridge } = await import('../scripts/live-aiwata-capabilities.mjs')
  const home = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-mcp-capability-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  let server = { name: 'docs', url: 'https://example.com/mcp', transport: 'http', source: 'config' }
  const calls = []
  const bridge = createCapabilityBridge({ connect: async () => ({ home, connection: { call: async (method, params) => {
    calls.push([method, params])
    if (method === 'mcp.servers.list') return { servers: [server] }
    if (method === 'mcp.servers.oauth.start') return { ok: true, session_id: 'native-private-flow', auth_url: 'https://example.com/authorize', flow: 'pkce' }
    if (method === 'mcp.servers.oauth.poll') return { ok: true, status: 'pending', session_id: params.session_id }
    return { ok: true }
  } } }), writeProfile: async (_home, operation) => operation() })
  const own = { home }, other = { home }
  const start = { method: 'mcp.servers.oauth.start', params: { name: 'docs' } }
  const flow = await bridge(own, start, () => true)
  assert.match(flow.handle, /^[a-f\d-]{36}$/)
  assert.ok(!JSON.stringify(flow).includes('native-private-flow'))
  const poll = { method: 'mcp.servers.oauth.poll', params: { name: 'docs', handle: flow.handle } }
  assert.equal((await bridge(own, poll, () => true)).status, 'pending')
  server = { ...server, oauth_tokens_present: true, auth: 'oauth' }
  assert.equal((await bridge(own, poll, () => true)).status, 'pending', 'native token persistence does not invalidate its own authorization')
  await assert.rejects(() => bridge(other, poll, () => true))
  await assert.rejects(() => bridge(own, { ...poll, profile: 'writer' }, () => true))
  await assert.rejects(() => bridge(own, { ...poll, params: { ...poll.params, name: 'else' } }, () => true))
  server = { ...server, url: 'https://different.example.com/mcp' }
  await assert.rejects(() => bridge(own, poll, () => true))
  bridge.close(own)
  await assert.rejects(() => bridge(own, poll, () => true))
})

test('MCP bridge rejects config escape hatches and unscoped credential variable writes', async () => {
  const { capabilityRequest } = await import('../scripts/live-aiwata-capabilities.mjs')
  const input = { method: 'mcp.servers.add', params: { name: 'docs', config: { url: 'https://example.com/mcp', auth: 'oauth' } } }
  assert.equal(capabilityRequest(input).params.name, 'docs')
  for (const params of [
    { ...input.params, config: { ...input.params.config, headers: { Authorization: 'secret' } } },
    { ...input.params, config: { url: 'http://127.0.0.1:4181/' } },
    { ...input.params, config: { url: 'https://user:password@example.com' } },
    { ...input.params, config: { command: 'node', env: { HERMES_HOME: '/foreign' } } },
  ]) assert.throws(() => capabilityRequest({ ...input, params }))
  assert.throws(() => capabilityRequest({ method: 'mcp.servers.set_api_key', params: { name: 'docs', value: 'secret', env_var: 'HERMES_HOME' } }))
})

test('native completions resolve session ownership and constrain draft directories before querying', async t => {
  const { createCapabilityBridge } = await import('../scripts/live-aiwata-capabilities.mjs')
  const home = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-complete-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  const queries = []
  const bridge = createCapabilityBridge({
    connect: async () => ({ home, connection: { call: async (method, params) => {
      if (method === 'session.resume') { if (params.session_id !== 'mine') throw new Error('not found'); return { session_id:'mine', info:{cwd:home} } }
      queries.push([method, params]); return {items:[{text:'@file:readme.md', display:'readme.md',meta:'file'}]}
    } } }),
    writeProfile: async (_home, operation) => operation(),
    directoryFor: async (_root, directory) => { if (!directory.startsWith(home)) throw new Error('outside'); return directory },
  })
  const client = { home, workspace: home }
  const input = { method:'complete.path', params:{session_id:'mine',word:'@read'} }
  assert.equal((await bridge(client,input,()=>true)).items[0].text,'@file:readme.md')
  await assert.rejects(() => bridge(client,{...input,params:{...input.params,session_id:'foreign'}},()=>true))
  await assert.rejects(() => bridge(client,{...input,params:{word:'@file:../../foreign/'}},()=>true))
  await assert.rejects(() => bridge(client,{...input,params:{word:'@read',cwd:'/foreign'}},()=>true))
  assert.equal(queries.length,1)
})

test('native suggestion insertion quotes filenames and preserves directory continuation', async () => {
  let module
  try { module = await import('../src/live-completions.mjs') } catch {}
  assert.equal(typeof module?.nativeCompletionItems,'function','completion adapter is available')
  const trigger = {kind:'@',start:0,end:3}
  const items = module.nativeCompletionItems({items:[{text:'@file:folder name/a.txt',display:'a.txt'}, {text:'@folder:assets/',display:'assets/'}]},trigger)
  assert.equal(items[0].insert,'@file:`folder name/a.txt`')
  assert.equal(items[0].complete,true)
  assert.equal(items[1].complete,false)
  const slash=module.nativeCompletionItems({replace_from:1,items:[{text:'help ',kind:'command'}, {text:'write ',kind:'skill'}]}, {kind:'/',start:0,end:3})
  assert.equal(slash[0].insert,'/help')
  assert.equal(slash[1].insert,'/write')
})

test('quoted directory completions keep the caret inside the quote for further typing', async () => {
  const module = await import('../src/live-completions.mjs')
  assert.equal(typeof module.liveCompletionTrigger,'function','quoted trigger adapter is available')
  const value = '请查看 @folder:`folder name/`'
  const trigger = module.liveCompletionTrigger(value,value.length-1)
  assert.equal(trigger.query,'folder:folder name/')
  assert.equal(trigger.end,value.length)
  const [item]=module.nativeCompletionItems({items:[{text:'@folder:folder name/'}]},trigger)
  assert.equal(item.caretBack,1)
})

test('skill expansion refuses built-in commands and returns native skill text only after scope checks', async t => {
  const { createCapabilityBridge } = await import('../scripts/live-aiwata-capabilities.mjs')
  const home = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-skill-expand-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  let name = 'writer'
  let dispatched = false
  const bridge = createCapabilityBridge({
    directoryFor: async (_root,path) => path,
    connect: async () => ({home,connection:{call:async (method,params)=>{
      if (method==='session.resume') return {session_id:'mine',info:{cwd:home}}
      if (method==='complete.slash') return {items:[{text:name+' ',kind:'skill'}]}
      if (method==='command.resolve') {if(name==='reset')return {canonical:'reset'};throw new Error('unknown')}
      if (method==='command.dispatch') {dispatched=true;return {type:'skill',message:'scoped skill content',display:'/writer'}}
    }}}),writeProfile:async (_home,operation)=>operation(),
  })
  const input={method:'skill.expand',params:{session_id:'mine',name:'writer',arg:'检查'}}
  assert.equal((await bridge({home,workspace:home},input,()=>true)).message,'scoped skill content')
  dispatched=false;name='reset'
  await assert.rejects(()=>bridge({home,workspace:home},{...input,params:{...input.params,name}},()=>true))
  assert.equal(dispatched,false)
})

test('a same-account MCP removal cancels another login flow before mutating the server', async t => {
  const { createCapabilityBridge } = await import('../scripts/live-aiwata-capabilities.mjs')
  const home = await realpath(await mkdtemp(join(tmpdir(),'aiwata-mcp-remove-flow-')))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const calls=[]
  const bridge=createCapabilityBridge({connect:async()=>({home,connection:{call:async(method,params)=>{
    calls.push(method)
    if(method==='mcp.servers.list')return {servers:[{name:'docs',url:'https://example.com/mcp'}]}
    if(method==='mcp.servers.oauth.start')return {ok:true,session_id:'native-flow',auth_url:'https://example.com/auth'}
    return {ok:true,removed:true}
  }}}),writeProfile:async(_home,op)=>op()})
  const first={home},second={home}
  const flow=await bridge(first,{method:'mcp.servers.oauth.start',params:{name:'docs'}},()=>true)
  await bridge(second,{method:'mcp.servers.remove',params:{name:'docs'}},()=>true)
  const cancel=calls.indexOf('mcp.servers.oauth.cancel')
  assert.ok(cancel>=0 && cancel<calls.indexOf('mcp.servers.remove'),'native cancellation precedes mutation across logins')
  await assert.rejects(()=>bridge(first,{method:'mcp.servers.oauth.poll',params:{name:'docs',handle:flow.handle}},()=>true))
})

test('new draft slash discovery receives its selected project without creating a session', async t => {
  const { createCapabilityBridge }=await import('../scripts/live-aiwata-capabilities.mjs')
  const home=await realpath(await mkdtemp(join(tmpdir(),'aiwata-draft-scope-')))
  t.after(()=>rm(home,{recursive:true,force:true}))
  let received
  const bridge=createCapabilityBridge({connect:async()=>({home,connection:{call:async()=>({items:[]})}}),
    directoryFor:async(_root,path)=>path,writeProfile:async(_home,op)=>op(),
    draftCompletion:async(_client,request)=>{received=request;return {items:[{text:'project-skill ',kind:'skill'}]}}})
  const result=await bridge({home,workspace:home},{method:'complete.slash',params:{text:'/project',cwd:home+'/selected'}},()=>true)
  assert.equal(received?.cwd,home+'/selected')
  assert.equal(received?.method,'complete.slash')
  assert.equal(result.items[0].kind,'skill')
})

test('completion results are absent without a service and never cross a connection or input revision', async () => {
  const module=await import('../src/live-completions.mjs')
  assert.equal(typeof module.currentCompletion,'function','completion scope selector is available')
  assert.deepEqual(module.currentCompletion(null,undefined,'query',false),{items:[]})
  const own={},other={}
  const response={live:own,key:'query',items:[{insert:'@file:mine'}]}
  assert.deepEqual(module.currentCompletion(response,other,'query',true),{items:[]})
  assert.deepEqual(module.currentCompletion(response,own,'newer',true),{items:[]})
  assert.deepEqual(module.currentCompletion(response,own,'query',false),{items:[]})
  assert.equal(module.currentCompletion(response,own,'query',true),response)
})

test('terminal instance IDs are validated without accepting a host path or another scope', async () => {
  const { terminalRequest } = await import('../scripts/live-aiwata-terminal.mjs')
  const open = { action: 'open', session_id: 'owned', instance_id: '13aca9b3-edec-44d8-bcf7-265a41381171', cols: 80, rows: 24 }
  assert.deepEqual(terminalRequest(open), open)
  for (const instance_id of ['../other', '', 'anything', null, '13aca9b3-edec-44d8-bcf7-265a41381171/path']) {
    assert.throws(() => terminalRequest({ ...open, instance_id }), /无法识别终端请求/)
  }
})

test('two native terminals in one session keep distinct streams and closing one retains the other', async t => {
  const { createTerminalBridge } = await import('../scripts/live-aiwata-terminal.mjs')
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  const children = []
  const bridge = createTerminalBridge(async () => {
    const child = new EventEmitter()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.kill = () => child.emit('exit')
    child.stdin.on('finish', () => child.emit('exit'))
    children.push(child)
    return child
  }, async (_home, id) => id === 'owned' ? '/work/project' : null, async (_workspace, cwd) => cwd)
  const client = { home: '/work/account', workspace: '/work', terminals: new Map() }
  const other = { ...client, terminals: new Map() }
  t.after(() => { bridge.close(client); bridge.close(other) })
  function output() {
    const stream = new PassThrough()
    stream.writeHead = () => {}
    let body = ''
    stream.on('data', chunk => { body += chunk.toString() })
    return { stream, frames: () => body.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }
  }
  const firstId = '13aca9b3-edec-44d8-bcf7-265a41381171'
  const secondId = 'c5d06ca6-99db-4203-9404-04a88c628979'
  const request = instance_id => ({ action: 'open', session_id: 'owned', instance_id, cols: 80, rows: 24 })
  const first = output(), second = output()
  await bridge.open(client, request(firstId), first.stream, () => true)
  await bridge.open(client, request(secondId), second.stream, () => true)
  assert.equal(client.terminals.size, 2)
  assert.notEqual(first.frames()[0].terminal_id, second.frames()[0].terminal_id)
  children[0].stdout.write(JSON.stringify({ type: 'output', data: 'Zmlyc3Q=' }) + '\n')
  assert.equal(first.frames().at(-1).data, 'Zmlyc3Q=')
  assert.equal(second.frames().some(frame => frame.type === 'output'), false)
  const foreign = output()
  await assert.rejects(() => bridge.open(client, { ...request(firstId), session_id: 'foreign' }, foreign.stream, () => true))
  assert.equal(client.terminals.size, 2)
  await bridge.control(other, { action: 'close', session_id: 'owned', instance_id: firstId })
  assert.equal(client.terminals.size, 2)
  await bridge.control(client, { action: 'close', session_id: 'owned', instance_id: firstId })
  assert.equal(client.terminals.size, 1)
  assert.equal(first.stream.writableEnded, true)
  assert.equal(second.stream.writableEnded, false)
  children[1].stdout.write(JSON.stringify({ type: 'output', data: 'c2Vjb25k' }) + '\n')
  assert.equal(second.frames().at(-1).data, 'c2Vjb25k')
})

test('restoring the same native snapshot never copies an older browsers replay into a new tab', () => {
  const api = createWorkspace(null, null, { live: true })
  api.login('lin')
  const chat = api.openChatDraft()
  api.hydrateGatewayChat(chat.id, { session_id: 'native', messages: [] })
  api.acceptGatewayPrompt(chat.id, { runId: 'turn', text: '查看网页' }, { admission_id: 'current' })
  const row = id => ({ role: 'tool', tool_call_id: id, tool_name: 'desktop_preview',
    content: JSON.stringify({ url: 'https://example.com/' + id, success: true }) })
  api.openTool(chat.id, '浏览器', undefined, { newInstance: true })
  const first = chat.tool
  api.hydrateGatewayChat(chat.id, { session_id: 'native', messages: [row('old')] })
  assert.equal(chat.toolInstances[first].browser.agentActions[0].id, 'old')
  api.openTool(chat.id, '浏览器', undefined, { newInstance: true })
  const second = chat.tool
  api.hydrateGatewayChat(chat.id, { session_id: 'native', messages: [row('old')] })
  assert.deepEqual(chat.toolInstances[second].browser?.agentActions ?? [], [])
  api.hydrateGatewayChat(chat.id, { session_id: 'native', messages: [row('old'), row('new')] })
  assert.deepEqual(chat.toolInstances[first].browser.agentActions.map(action => action.id), ['old'])
  assert.deepEqual(chat.toolInstances[second].browser.agentActions.map(action => action.id), ['new'])
  api.closeTools(chat.id, second)
  api.openTool(chat.id, '浏览器', undefined, { newInstance: true })
  const third = chat.tool
  api.hydrateGatewayChat(chat.id, { session_id: 'native', messages: [row('old'), row('new')] })
  assert.deepEqual(chat.toolInstances[third].browser?.agentActions ?? [], [])
})
