import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeFiles } from '../src/native-desktop-files.mjs'
import { gatewayTranscript } from '../src/live-aiwata.mjs'
import { extractNativeAttachments, readPreviewAttachment } from '../src/native-artifacts.mjs'

const image = 'data:image/png;base64,aW1hZ2U='
function fixture(connectionId = 'local', options = {}) {
  const calls = []
  let closed = false
  const files = nativeFiles({ route: { connectionId, profile: 'writer' },
    check() { if (closed) throw new Error('closed owner') },
    rpc: async (method, params) => { calls.push(['rpc', method, params]); return method === 'session.resume' ? { info: { cwd: options.cwd ?? '/project' } } : { projects: [] } },
    api: async path => { calls.push(['api', path]); return options.remote ? options.remote(path) : { dataUrl: image } },
    host: { getConnectionFor: async route => options.descriptor ? options.descriptor(route) : { mode: connectionId === 'local' ? 'local' : 'remote' },
      readFileDataUrl: async path => { calls.push(['host', path]); return options.local ? options.local(path) : image } },
  })
  return { files, calls, close: () => { closed = true } }
}
test('a Profile media file outside cwd becomes a read-only artifact, never a project root', async () => {
  const f = fixture()
  assert.deepEqual(await f.files.locateFile('owned', '/profile/images/output.png'), { artifact: { target: '/profile/images/output.png', name: 'output.png' } })
  await assert.rejects(f.files.manageFile('write', 'owned', '/profile/images', ['output.png'], { content: 'bad' }), /工作目录/)
  assert.equal(f.calls.some(([type]) => ['api', 'host'].includes(type)), false)
})
test('project links keep their established tree route and normalize relative dot segments', async () => {
  const f = fixture()
  assert.deepEqual(await f.files.locateFile('owned', './out/../report.md'), { root: '/project', parts: ['report.md'] })
  assert.deepEqual(await f.files.locateFile('owned', 'file:///project/a%20b%23c.png'), { root: '/project', parts: ['a b#c.png'] })
})
test('local artifact reads use original host reader only after explicit click and owned session validation', async () => {
  const f = fixture()
  await assert.rejects(f.files.readArtifact('owned', '/profile/images/a.png'), /点击/)
  assert.equal(f.calls.length, 0)
  const blob = await f.files.readArtifact('owned', '/profile/images/a.png', undefined, { foregroundUserClick: true })
  assert.equal(blob.type, 'image/png')
  assert.equal(await blob.text(), 'image')
  assert.deepEqual(f.calls.map(row => row[0]), ['rpc', 'host'])
  assert.equal(f.calls[0][2].session_id, 'owned')
})
test('the existing native target normalizer owns home expansion and file classification', async () => {
  const calls = []
  const files = nativeFiles({ route: { connectionId: 'local', profile: 'writer' },
    rpc: async () => ({ info: { cwd: '/project' } }),
    host: { getConnectionFor: async () => ({ mode: 'local' }),
      normalizePreviewTarget: async (...args) => { calls.push(args); return { kind: 'file', previewKind: 'image', path: '/native-home/images/a.png' } },
      readFileDataUrl: async path => { calls.push(path); return image } },
    api: async () => { throw new Error('local reader must not use remote') },
  })
  await files.readArtifact('owned', '~/images/a.png', undefined, { foregroundUserClick: true })
  assert.deepEqual(calls, [['~/images/a.png', '/project'], '/native-home/images/a.png'])
})
test('remote media stays on its original Profile API/session and never reads the local namesake', async () => {
  const f = fixture('ssh-one')
  await f.files.readArtifact('remote-session', '~/images/a #?.png', undefined, { foregroundUserClick: true })
  const query = new URL(f.calls.find(([kind]) => kind === 'api')[1], 'http://fixture').searchParams
  assert.equal(query.get('path'), '~/images/a #?.png')
  assert.equal(query.get('session_id'), 'remote-session')
  assert.equal(f.calls.some(([kind]) => kind === 'host'), false)
  const failed = fixture('ssh-one', { remote: () => { throw new Error('remote missing') } })
  await assert.rejects(failed.files.readArtifact('owned', '/same.png', undefined, { foregroundUserClick: true }), /remote missing/)
  assert.equal(failed.calls.some(([kind]) => kind === 'host'), false)
})
test('a local registry ID with a remote-only Profile reads only its live remote descriptor owner', async () => {
  const owners = []
  const f = fixture('local', { descriptor: route => { owners.push(route); return { mode: 'remote', remoteKind: 'ssh' } },
    remote: () => ({ dataUrl: 'data:text/plain;base64,cmVtb3Rl' }), local: () => 'data:text/plain;base64,bG9jYWw=' })
  const blob = await f.files.readArtifact('owned', '/same-name/file.txt', undefined, { foregroundUserClick: true })
  assert.equal(await blob.text(), 'remote')
  assert.deepEqual(owners, [{ connectionId: 'local', profile: 'writer' }])
  assert.equal(f.calls.some(([kind]) => kind === 'host'), false)
  const failed = fixture('local', { descriptor: () => ({ mode: 'remote' }), remote: () => { throw new Error('remote unavailable') } })
  await assert.rejects(failed.files.readArtifact('owned', '/same-name/file.txt', undefined, { foregroundUserClick: true }), /remote unavailable/)
  assert.equal(failed.calls.some(([kind]) => kind === 'host'), false)
})
test('closing or cancelling during native descriptor lookup prevents every later file read', { timeout: 2000 }, async () => {
  for (const reason of ['owner', 'signal']) {
    let finish, started
    const admitted = new Promise(resolve => { started = resolve })
    const f = fixture('local', { descriptor: () => { started(); return new Promise(resolve => { finish = resolve }) } })
    const controller = new AbortController()
    const pending = f.files.readArtifact('owned', '/same-name/file.txt', controller.signal, { foregroundUserClick: true })
    await admitted
    if (reason === 'owner') f.close(); else controller.abort()
    finish({ mode: 'local' })
    await assert.rejects(pending, reason === 'owner' ? /closed owner/ : { name: 'AbortError' })
    assert.equal(f.calls.some(([kind]) => kind === 'api' || kind === 'host'), false)
  }
})
test('closing owner or aborting a pending media read discards late bytes', async () => {
  for (const cancel of ['owner', 'signal']) {
    let finish, started
    const admitted = new Promise(resolve => { started = resolve })
    const f = fixture('local', { local: () => { started(); return new Promise(resolve => { finish = resolve }) } })
    const abort = new AbortController()
    const pending = f.files.readArtifact('owned', '/a.png', abort.signal, { foregroundUserClick: true })
    await admitted
    if (cancel === 'owner') f.close(); else abort.abort()
    finish(image)
    await assert.rejects(pending, cancel === 'owner' ? /closed owner/ : { name: 'AbortError' })
  }
})
test('native structured read errors remain visible and scripts cannot become artifact readers', async () => {
  const f = fixture('local', { local: () => ({ error: 'too_large', message: 'native file too large' }) })
  await assert.rejects(f.files.readArtifact('owned', '/a.png', undefined, { foregroundUserClick: true }), /native file too large/)
  for (const target of ['javascript:alert(1)', 'https://site.invalid/a.png', 'file://foreign/a.png', 'a\u0000.png']) {
    const invalid = fixture()
    await assert.rejects(invalid.files.readArtifact('owned', target, undefined, { foregroundUserClick: true }), /路径|文件/)
    assert.equal(invalid.calls.some(([kind]) => kind === 'host' || kind === 'api'), false)
  }
})
test('historical user image/file directives retain native paths without a new blob store', () => {
  const { messages } = gatewayTranscript({ messages: [{ role: 'user', row_id: 3, content: '@file:`/profile/uploads/report one.pdf`\n@image:"/profile/images/a.png"\nLook\n[screenshot]' }] })
  assert.equal(messages[0].text, 'Look')
  assert.deepEqual(messages[0].attachments, ['report one.pdf', 'a.png'])
  assert.deepEqual(messages[0].attachmentDetails['a.png'], { kind: 'image', nativePath: '/profile/images/a.png', name: 'a.png' })
  assert.equal(messages[0].attachmentDetails['report one.pdf'].nativePath, '/profile/uploads/report one.pdf')
  assert.equal(messages[0].id, '3')
})
test('an attachment-only native turn is retained; mid-prose file references and plain screenshot text stay prose', () => {
  const only = gatewayTranscript({ messages: [{ role: 'user', content: '@image:/profile/images/a.png\n[screenshot]' }] }).messages[0]
  assert.equal(only.text, '')
  assert.equal(only.attachments.length, 1)
  const prose = 'Please inspect @file:example.txt\n[screenshot]'
  assert.equal(gatewayTranscript({ messages: [{ role: 'user', content: prose }] }).messages[0].text, prose)
})
test('native ingress suffix attachments and duplicate basenames retain distinct paths', () => {
  const suffix = extractNativeAttachments('Caption\n\n[Image attached at: /profile/images/a.png]\n[screenshot]\n')
  assert.equal(suffix.text, 'Caption')
  assert.equal(suffix.attachmentDetails['a.png'].nativePath, '/profile/images/a.png')
  const collision = extractNativeAttachments('@image:/one/a.png\n@image:/two/a.png\n@image:/one/a.png\n')
  assert.deepEqual(collision.attachments, ['a.png', 'a.png (2)'])
  assert.equal(collision.attachmentDetails['a.png (2)'].nativePath, '/two/a.png')
})
test('attachment preview keeps local blobs/groups intact and reads legacy native paths only through the scoped reader', async () => {
  const calls = []
  const blob = new Blob(['fixture'], { type: 'text/plain' })
  const api = { readLocalAttachment: async (...args) => { calls.push(['blob', ...args]); return blob } }
  const live = { readArtifact: async (...args) => { calls.push(['native', ...args]); return blob }, downloadRoom: async (...args) => { calls.push(['group', ...args]); return blob } }
  const common = { api, live, chatId: 'ui-id', sessionId: 'stored-owner' }
  for (const entry of [{ blobId: 'blob' }, { roomAttachment: 'group' }, { nativePath: '/profile/file.txt' }]) assert.equal(await readPreviewAttachment({ ...common, entry }), blob)
  assert.deepEqual(calls[0], ['blob', 'ui-id', 'blob'])
  assert.equal(calls[1][0], 'group')
  assert.deepEqual(calls[2], ['native', 'stored-owner', '/profile/file.txt', undefined, { foregroundUserClick: true }])
})
test('closing an attachment while its blob reader settles discards the old result', async () => {
  let finish
  const controller = new AbortController()
  const pending = readPreviewAttachment({ api: { readLocalAttachment: () => new Promise(resolve => { finish = resolve }) }, chatId: 'ui', entry: { blobId: 'old' }, signal: controller.signal })
  controller.abort(); finish(new Blob(['late']))
  await assert.rejects(pending, { name: 'AbortError' })
})
