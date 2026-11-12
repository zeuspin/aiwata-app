import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationStatus } from '../src/conversation-meta.mjs'
import { closeTabs } from '../src/tabs.mjs'
import { browserAnnotationPrompt, editBrowserAnnotation, moveBrowser, navigateBrowser, saveBrowserAnnotation, terminalOutput } from '../src/tool-surfaces.mjs'
import { createWorkspace, fitPanels, resizePanels, viewAtWidth } from '../src/workspace.mjs'

test('dragging a separator leaves the other separator in place', () => {
  const start = { side: 322, tools: 494 }
  const right = resizePanels(start, 1278, 'right', 145, true)
  assert.deepEqual(right, { side: 322, tools: 349 })
  assert.deepEqual(resizePanels(right, 1278, 'left', -86, true), { side: 236, tools: 349 })
  assert.deepEqual(start, { side: 322, tools: 494 })
})

test('fit constrains panes without replacing saved widths', () => {
  const saved = { side: 322, tools: 494 }
  const compact = fitPanels(saved, 885, true, true)
  assert.ok(885 - 50 - compact.side - compact.tools >= 290)
  assert.deepEqual(fitPanels(saved, 1278, true, true), saved)
  assert.equal(viewAtWidth('split', 1278, true), 'split')
})

test('opening the sidebar in a very narrow window leaves room for the conversation', () => {
  const saved = { side: 322, tools: 494 }
  const fitted = fitPanels(saved, 390, true, false)
  assert.ok(fitted.side > 0 && 390 - 50 - fitted.side >= fitted.side)
  assert.equal(resizePanels(fitted, 390, 'left', 100, true, false).side, fitted.side)
})

test('narrow tools replace the conversation only while the sidebar is open', () => {
  assert.equal(viewAtWidth('split', 526, true), 'replace')
  assert.equal(viewAtWidth('split', 526, false), 'split')
  assert.equal(viewAtWidth('full', 526, true), 'full')
  const fitted = fitPanels({ side: 322, tools: 494 }, 390, false, true)
  assert.ok(fitted.tools > 0 && 390 - 50 - fitted.tools >= fitted.tools)
  assert.equal(resizePanels(fitted, 390, 'right', -100, false, true).tools, fitted.tools)
})

test('switching accounts cannot expose projects or drafts from the previous account', () => {
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('plan', '只属于林的草稿')
  api.logout()
  assert.equal(api.current(), null)
  api.login('qiao')
  assert.equal(api.current().chats.plan, undefined)
  api.logout()
  api.login('lin')
  assert.equal(api.current().chats.plan.draft, '只属于林的草稿')
})

test('local attachment bytes survive queue admission and are released when the last reference is removed', async () => {
  const metadata = new Map()
  const files = new Map()
  const storage = { getItem: key => metadata.get(key), setItem: (key, value) => metadata.set(key, value) }
  const fileKey = (account, chat, id) => JSON.stringify([account, chat, id])
  const attachments = {
    async save(account, chat, items) {
      for (const { id, file } of items) files.set(fileKey(account, chat, id), file)
    },
    async read(account, chat, id) { return files.get(fileKey(account, chat, id)) },
    async remove(account, chat, ids) {
      for (const id of ids) files.delete(fileKey(account, chat, id))
    },
  }
  const original = createWorkspace(storage, attachments)
  original.login('lin')
  const file = new File(['附件正文'], '原文件.txt', { type: 'text/plain' })
  assert.equal((await original.addLocalAttachments('plan', [file])).ok, true)
  assert.equal(original.queuePrompt('plan', 'queued-attachment'), true)
  original.logout()

  const reopened = createWorkspace(storage, attachments)
  reopened.login('lin')
  const { blobId } = reopened.current().chats.plan.queue[0].attachmentDetails[file.name]
  assert.equal(await reopened.readLocalAttachment('review', blobId), null)
  assert.equal(await (await reopened.readLocalAttachment('plan', blobId)).text(), '附件正文')
  assert.equal(reopened.startQueuedPrompt('plan').ok, true)
  assert.equal(reopened.current().chats.plan.messages.at(-1).attachmentDetails[file.name].blobId, blobId)
  assert.equal(await (await reopened.readLocalAttachment('plan', blobId)).text(), '附件正文')
  assert.equal(reopened.deleteChat('plan'), true)
  assert.equal(files.size, 0)
})

test('a saved live image stays in its own conversation and shares its bytes with the draft', async () => {
  const files = new Map()
  const key = (account, chat, id) => JSON.stringify([account, chat, id])
  const attachments = {
    async save(account, chat, items) {
      for (const { id, file } of items) files.set(key(account, chat, id), file)
    },
    async read(account, chat, id) { return files.get(key(account, chat, id)) },
    async remove(account, chat, ids) {
      for (const id of ids) files.delete(key(account, chat, id))
    },
  }
  const api = createWorkspace(null, attachments, { live: true })
  api.login('lin')
  const chat = api.openChatDraft()
  api.hydrateGatewayChat(chat.id, { session_id: 'image-session', messages: [] })
  api.acceptGatewayPrompt(chat.id, { runId: 'turn', text: '开始' }, { admission_id: 'admitted' })
  const save = name => api.saveLocalToolMedia(chat.id, new File(['raster'], name, { type: 'image/png' }), 'liveImage')
  assert.equal(await save('初稿.png'), true)
  assert.equal(api.attachLocalToolMedia(chat.id, 'liveImage'), true)
  assert.equal(api.attachLocalToolMedia(chat.id, 'liveImage'), false)
  assert.equal(chat.attachmentDetails['初稿.png'].blobId, chat.toolEdits.liveImage.blobId)
  assert.equal(await save('替换稿.png'), true)
  assert.equal(await save('最新稿.png'), true)
  assert.equal(files.size, 2)
  const image = chat.toolEdits.liveImage
  api.login('qiao')
  assert.equal(await api.readLocalAttachment(chat.id, image.blobId), null)
  api.login('lin')
  assert.equal(await (await api.readLocalAttachment(chat.id, image.blobId)).text(), 'raster')
  assert.equal(api.deleteChat(chat.id), true)
  assert.equal(files.size, 0)
})

test('browser history, annotations, and replay survive reload without crossing accounts or chats', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  api.setDraft('plan', '演示浏览器')
  api.send('plan', 'browser-run')
  const docs = 'https://preview.aiwata.local/docs'
  const release = 'https://preview.aiwata.local/release'
  api.applyAgentEvent('plan', 'browser-run', { type: 'preview.open', data: { url: docs, label: '使用指南' } }, false)
  api.applyAgentEvent('plan', 'browser-run', { type: 'preview.open', data: { url: release, label: '发布清单' } }, false)
  api.updateBrowser('plan', state => moveBrowser(state, -1))
  const annotations = [{ url: docs, target: '标题', text: '林晓的会话批注' }]
  api.updateBrowser('plan', state => editBrowserAnnotation(state, release, { open: true, text: '另一页草稿' }))
  api.updateBrowser('plan', state => editBrowserAnnotation(state, docs, { open: true, target: '标题', text: ' 林晓的会话批注 ' }))
  api.updateBrowser('plan', state => ({ ...saveBrowserAnnotation(state, docs), playbackOpen: true, replayIndex: 1 }))
  assert.equal(api.current().chats.review.browser, undefined)

  api.login('qiao')
  assert.equal(api.updateBrowser('plan', state => navigateBrowser(state, release)), false)
  api.updateBrowser('atlas-chat', state => navigateBrowser(state, 'https://example.com/atlas'))
  api.logout()

  const reopened = createWorkspace(storage)
  reopened.login('lin')
  const browser = reopened.current().chats.plan.browser
  assert.deepEqual(browser.history, ['', docs, release])
  assert.equal(browser.visited, docs)
  assert.equal(browser.historyIndex, 1)
  assert.deepEqual(browser.annotations, annotations)
  assert.equal(browser.annotationDrafts[docs], undefined)
  assert.equal(browser.annotationDrafts[release].text, '另一页草稿')
  assert.equal(browserAnnotationPrompt(docs, browser.annotations), '请查看以下网页批注\n' + docs + '\n1. 标题 · 林晓的会话批注')
  assert.deepEqual(browser.agentActions.map(action => action.url), [docs, release])
  assert.equal(browser.playbackOpen, true)
  assert.equal(browser.replayIndex, 1)
  reopened.updateBrowser('plan', state => moveBrowser(state, 1))
  assert.equal(reopened.current().chats.plan.browser.visited, release)
  assert.equal(reopened.current().chats.plan.browser.replayIndex, null)

  reopened.login('qiao')
  const other = reopened.current().chats['atlas-chat'].browser
  assert.equal(other.visited, 'https://example.com/atlas')
  assert.deepEqual(other.annotations, [])
  assert.deepEqual(other.annotationDrafts, {})
  assert.deepEqual(other.agentActions, [])
})

test('canvas, retouch, and timeline edits survive reload and stay scoped to a single conversation', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  api.updateToolEdits('plan', () => ({ notes: ['发布便签', '素材便签'] }))
  api.updateToolEdits('plan', () => ({ setting: 68, imageProvider: 'openai', imageEditPrompt: '低饱和暖色' }))
  api.updateToolEdits('plan', () => ({ clipBounds: [3, 12], elapsed: 8 }))
  api.updateToolEdits('review', () => ({ notes: ['校对便签'] }))

  api.login('qiao')
  assert.equal(api.updateToolEdits('plan', () => ({ setting: 12 })), false)
  api.updateToolEdits('atlas-chat', () => ({ setting: 32, clipBounds: [1, 6] }))
  api.logout()

  const reopened = createWorkspace(storage)
  reopened.login('lin')
  assert.deepEqual(reopened.current().chats.plan.toolEdits, {
    notes: ['发布便签', '素材便签'], setting: 68, imageProvider: 'openai',
    imageEditPrompt: '低饱和暖色', clipBounds: [3, 12], elapsed: 8,
  })
  reopened.updateToolEdits('plan', previous => ({ elapsed: previous.elapsed + 1 }))
  assert.equal(reopened.current().chats.plan.toolEdits.elapsed, 9)
  assert.deepEqual(reopened.current().chats.review.toolEdits, { notes: ['校对便签'] })
  reopened.login('qiao')
  assert.deepEqual(reopened.current().chats['atlas-chat'].toolEdits, { setting: 32, clipBounds: [1, 6] })
})

test('generation drafts, terminal output and Git worktrees restore together for their conversation', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  const project = api.current().projects.find(item => item.id === api.current().chats.plan.projectId)
  const path = project.folder + '/.worktrees/restore-demo'
  api.updateToolEdits('plan', previous => ({
    prompt: '一张用于发布的封面', aspect: 'landscape', activeWorktreePath: path,
    worktrees: [...previous.worktrees, { path, branch: 'restore-demo', projectId: project.id }],
    gitStaged: { ...previous.gitStaged, [path]: ['README.md'] },
  }))
  api.updateToolEdits('plan', previous => ({
    terminalLog: [...previous.terminalLog, {
      command: 'git status',
      output: terminalOutput('git status', path, 'restore-demo', previous.gitStaged[path], []),
    }],
  }))
  api.logout()

  const reopened = createWorkspace(storage)
  reopened.login('qiao')
  assert.equal(reopened.current().chats.plan, undefined)
  assert.equal(reopened.current().chats['atlas-chat'].toolEdits, undefined)
  reopened.login('lin')
  assert.equal(reopened.current().chats.review.toolEdits, undefined)
  const restored = reopened.current().chats.plan.toolEdits
  assert.equal(restored.prompt, '一张用于发布的封面')
  assert.equal(restored.aspect, 'landscape')
  assert.equal(restored.activeWorktreePath, path)
  assert.deepEqual(restored.worktrees, [{ path, branch: 'restore-demo', projectId: project.id }])
  assert.deepEqual(restored.gitStaged, { [path]: ['README.md'] })
  assert.deepEqual(restored.terminalLog.map(entry => entry.command), ['git status'])
  assert.match(restored.terminalLog[0].output, /On branch restore-demo\n.*\bstaged:\s+README\.md/s)
  reopened.updateToolEdits('plan', () => ({ terminalLog: [], prompt: '继续编辑的封面' }))
  const edited = reopened.current().chats.plan.toolEdits
  assert.deepEqual(edited.terminalLog, [])
  assert.equal(edited.prompt, '继续编辑的封面')
  assert.deepEqual(edited.gitStaged[path], ['README.md'])
})

test('the file filter and selected preview persist independently for each conversation', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  api.updateToolEdits('plan', previous => {
    assert.equal(previous.fileFilter, '全部')
    assert.equal(previous.selectedFile, null)
    return { fileFilter: '项目文件', selectedFile: 'src/workspace.js' }
  })
  api.updateToolEdits('review', () => ({ fileFilter: '会话附件' }))
  api.logout()

  const reopened = createWorkspace(storage)
  reopened.login('qiao')
  assert.equal(reopened.current().chats['atlas-chat'].toolEdits, undefined)
  reopened.login('lin')
  assert.deepEqual(reopened.current().chats.plan.toolEdits, { fileFilter: '项目文件', selectedFile: 'src/workspace.js' })
  assert.deepEqual(reopened.current().chats.review.toolEdits, { fileFilter: '会话附件' })
})

test('dragged panel widths are restored independently for each account', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  api.savePanelWidth('side', 280)
  api.savePanelWidth('tools', 420)
  api.login('qiao')
  api.savePanelWidth('side', 240)
  api.logout()

  const reopened = createWorkspace(storage)
  reopened.login('lin')
  assert.deepEqual(reopened.current().preferredPanelWidths, { side: 280, tools: 420 })
  reopened.login('qiao')
  assert.deepEqual(reopened.current().preferredPanelWidths, { side: 240 })
})

test('losing connectivity locks the account and returning online requires login', () => {
  const api = createWorkspace()
  assert.equal(api.login('lin'), true)
  assert.ok(api.current())
  api.setOnline(false)
  assert.equal(api.current(), null)
  assert.equal(api.login('lin'), false)
  api.setOnline(true)
  assert.equal(api.current(), null)
})

test('logout pauses background admission and keeps tasks and connectors available after login', () => {
  const api = createWorkspace()
  api.login('lin')
  assert.equal(api.trigger('task', 'digest', 'trigger-1').ok, true)
  api.logout()
  assert.deepEqual(api.trigger('task', 'digest', 'trigger-2'), { ok: false, reason: 'locked' })
  assert.deepEqual(api.trigger('connector', 'wechat', 'trigger-3'), { ok: false, reason: 'locked' })
  api.login('lin')
  assert.equal(api.current().tasks[0].runs, 1)
  assert.equal(api.current().connectors[0].runs, 0)
})

test('managed usage charges once, including retry and insufficient balance paths', () => {
  const api = createWorkspace()
  api.login('lin')
  const before = api.current().credits
  const operation = { id: 'turn-1', kind: '会话', amount: 12, source: 'managed' }
  assert.equal(api.charge(operation).ok, true)
  assert.equal(api.charge(operation).ok, true)
  assert.equal(api.charge({ ...operation, id: 'local-1', source: 'local' }).ok, true)
  assert.equal(api.charge({ ...operation, id: 'byok-1', source: 'byok' }).ok, true)
  assert.deepEqual(api.charge({ ...operation, id: 'image-1', amount: before + 1 }), { ok: false, reason: 'insufficient' })
  assert.equal(api.current().credits, before - 12)
  assert.deepEqual(api.current().usage.map(row => row.id), ['turn-1'])
})

test('closing conversation tabs preserves the conversation, while confirmed deletion persists', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  api.openChat('review')
  api.openChat('cover', 'plan')
  assert.deepEqual(api.current().openChats, ['plan', 'cover', 'review'])
  api.setDraft('cover', '待保留的草稿')
  api.closeChats('cover', 'one')
  assert.deepEqual(api.current().openChats, ['plan', 'review'])
  assert.equal(api.current().activeChat, 'review')
  assert.equal(api.current().chats.cover.draft, '待保留的草稿')
  assert.equal(api.deleteChat('review'), true)
  assert.equal(api.deleteChat('editor'), false)
  const reopened = createWorkspace(storage)
  reopened.login('lin')
  assert.equal(reopened.current().chats.review, undefined)
  assert.equal(reopened.current().chats.cover.draft, '待保留的草稿')
  assert.equal(reopened.current().activeChat, 'plan')
})

test('close strategies preserve order and pick the next surviving tab when the active tab closes', () => {
  const ids = ['a', 'b', 'c', 'd']
  assert.deepEqual(closeTabs(ids, 'b', 'b', 'one'), { remaining: ['a', 'c', 'd'], active: 'c' })
  assert.deepEqual(closeTabs(ids, 'd', 'b', 'right'), { remaining: ['a', 'b'], active: 'b' })
  assert.deepEqual(closeTabs(ids, 'd', 'b', 'others'), { remaining: ['b'], active: 'b' })
  assert.deepEqual(closeTabs(ids, 'c', 'a', 'one'), { remaining: ['b', 'c', 'd'], active: 'c' })
  assert.deepEqual(closeTabs(ids, 'c', 'b', 'all'), { remaining: [], active: null })
})

test('bulk tool closes are scoped to one conversation and hide the empty tool pane', () => {
  const api = createWorkspace()
  api.login('lin')
  api.openTool('plan', '浏览器')
  api.openTool('plan', '剪辑工具')
  api.openTool('plan', '无限画布', '浏览器')
  api.openTool('review', '修图工具')
  assert.deepEqual(api.current().chats.plan.tabs, ['浏览器', '无限画布', '剪辑工具'])
  api.closeTools('plan', '无限画布', 'right')
  assert.deepEqual(api.current().chats.plan.tabs, ['浏览器', '无限画布'])
  api.closeTools('plan', '无限画布', 'all')
  assert.equal(api.current().chats.plan.view, 'hidden')
  assert.deepEqual(api.current().chats.review.tabs, ['修图工具'])
})

test('saved projects get distinct default markers and keep edits after signing in again', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  const [key, json] = entries.entries().next().value
  const saved = JSON.parse(json)
  for (const project of saved.lin.projects) delete project.marker
  saved.lin.chats.plan.marker = { kind: 'emoji', value: '💡' }
  entries.set(key, JSON.stringify(saved))

  const reopened = createWorkspace(storage)
  reopened.login('lin')
  const projects = reopened.current().projects
  assert.ok(projects.every(project => project.marker?.kind === 'color'))
  assert.equal(new Set(projects.map(project => project.marker.value)).size, projects.length)
  const customColor = { kind: 'color', value: '#123abc' }
  assert.equal(reopened.setProjectMarker('studio', customColor), true)
  assert.equal(reopened.setProjectMarker('studio', { kind: 'color', value: 'invalid' }), false)
  assert.equal(reopened.setProjectMarker('missing', customColor), false)
  const created = reopened.addProject('新项目', '~/Projects/new')
  assert.equal(created.marker.kind, 'color')
  const custom = reopened.addProject('自定义标记项目', '~/Projects/custom', { marker: customColor })
  assert.deepEqual(custom.marker, customColor)
  const reloaded = createWorkspace(storage)
  reloaded.login('lin')
  assert.deepEqual(reloaded.current().projects.find(project => project.id === 'studio').marker, customColor)
  assert.deepEqual(reloaded.current().projects.find(project => project.id === created.id).marker, created.marker)
  assert.deepEqual(reloaded.current().projects.find(project => project.id === custom.id).marker, customColor)
})

test('creating a project saves its primary and additional folders together', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  const existingFolders = ['~/Projects/brand-studio/assets']
  api.updateManagement({ projectFolders: { studio: existingFolders } })

  const created = api.addProject('多目录项目', [' ~/Projects/main ', '~/Projects/design', '~/Projects/main', '~/Projects/docs'])
  const reloaded = createWorkspace(storage)
  reloaded.login('lin')
  const record = reloaded.current()
  assert.equal(record.projects.find(project => project.id === created.id).folder, '~/Projects/main')
  assert.deepEqual(record.management.projectFolders, {
    studio: existingFolders,
    [created.id]: ['~/Projects/design', '~/Projects/docs'],
  })
})

test('new chat stays outside the session list until the first prompt is admitted', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('qiao')
  const draft = api.openChatDraft()
  assert.equal(draft.projectId, 'atlas')
  assert.equal(api.current().chats[draft.id], undefined)
  assert.equal(api.current().openChats.includes(draft.id), false)
  api.setDraft(draft.id, '整理设计资料')
  api.changeChat(draft.id, { projectId: 'week' })
  assert.equal(api.send(draft.id, 'first-send').reason, 'insufficient')
  assert.equal(api.current().chats[draft.id], undefined)
  const reopened = createWorkspace(storage)
  reopened.login('qiao')
  const restored = reopened.openChatDraft()
  assert.equal(restored.id, draft.id)
  assert.equal(restored.draft, '整理设计资料')
  assert.equal(restored.projectId, 'week')
  reopened.changeChat(restored.id, { source: 'local' })
  assert.equal(reopened.send(restored.id, 'first-send').ok, true)
  assert.equal(reopened.current().newChatDraft, undefined)
  assert.equal(reopened.current().chats[restored.id].projectId, 'week')
  assert.equal(reopened.current().chats[restored.id].messages[0].text, '整理设计资料')
})

test('a draft runs, settles to idle, and remains a draft if admission fails', () => {
  const api = createWorkspace()
  api.login('lin')
  assert.equal(conversationStatus(api.current().chats.plan), 'idle')
  const chat = api.newChat('studio')
  api.openChat(chat.id)
  assert.equal(conversationStatus(chat), 'draft')
  api.setDraft(chat.id, '生成发布清单')
  assert.equal(api.send(chat.id, 'one').ok, true)
  assert.equal(conversationStatus(chat), 'working')
  assert.equal(api.finish(chat.id, 'one', '发布清单已完成'), true)
  assert.equal(conversationStatus(chat), 'idle')
  api.setDraft(chat.id, '继续整理')
  api.send(chat.id, 'two')
  api.changeChat(chat.id, { pending: null })
  assert.equal(conversationStatus(chat), 'idle')
  api.login('qiao')
  const emptyBalance = api.newChat('atlas')
  api.setDraft(emptyBalance.id, '下一步')
  assert.equal(api.send(emptyBalance.id, 'three').ok, false)
  assert.equal(conversationStatus(emptyBalance), 'draft')
  assert.equal(emptyBalance.draft, '下一步')
})

test('a reply finished outside the open conversation stays unread until opened', () => {
  const api = createWorkspace()
  api.login('lin')
  const chat = api.current().chats.plan
  api.setDraft(chat.id, '继续整理')
  assert.equal(api.send(chat.id, 'unwatched').ok, true)
  api.openChat('review')
  assert.equal(api.finish(chat.id, 'unwatched', '已整理'), true)
  assert.equal(conversationStatus(chat), 'unread')
  api.openChat(chat.id)
  assert.equal(conversationStatus(chat), 'idle')
})

test('a blocking request wins over live activity, and a stale stall cannot invent a turn', () => {
  const chat = { messages: [], unread: true, pending: 'live' }
  assert.equal(conversationStatus({ ...chat, activity: { needsInput: true, stalled: true } }), 'needs-input')
  assert.equal(conversationStatus({ ...chat, activity: { stalled: true, queuePaused: true } }), 'stalled')
  assert.equal(conversationStatus({ ...chat, pending: null, activity: { stalled: true, background: true } }), 'background')
  assert.equal(conversationStatus({ ...chat, pending: null, activity: { queuePaused: true, background: true } }), 'needs-input')
  assert.equal(conversationStatus({ ...chat, pending: null, activity: { stalled: true } }), 'unread')
})

test('archiving closes the tab while preserving the draft for restoration', async () => {
  const { setChatArchived } = await import('../src/workspace.mjs')
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('plan', '归档保留的草稿')
  assert.equal(setChatArchived(api, 'plan', true), true)
  assert.equal(api.current().chats.plan.archived, true)
  assert.equal(api.current().openChats.includes('plan'), false)
  assert.equal(setChatArchived(api, 'plan', false), true)
  assert.equal(api.current().chats.plan.archived, false)
  assert.equal(api.current().chats.plan.draft, '归档保留的草稿')
  assert.equal(setChatArchived(api, 'editor', true), false)
})

test('moving a conversation requires a different project with a folder and a settled turn', async () => {
  const { moveChatToProject } = await import('../src/workspace.mjs')
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('plan', '移动保留的草稿')
  api.changeChat('plan', { pending: 'live' })
  assert.equal(moveChatToProject(api, 'plan', 'aiwata'), false)
  api.changeChat('plan', { pending: null })
  assert.equal(moveChatToProject(api, 'plan', 'missing'), false)
  assert.equal(moveChatToProject(api, 'plan', 'aiwata'), true)
  assert.equal(api.current().chats.plan.projectId, 'aiwata')
  assert.equal(api.current().chats.plan.draft, '移动保留的草稿')
  assert.equal(api.current().activeChat, 'plan')
})

test('opening a conversation clears its unread marker', () => {
  const api = createWorkspace()
  api.login('lin')
  api.changeChat('review', { unread: true })
  api.openChat('review')
  assert.equal(api.current().chats.review.unread, false)
})

test('the hosted room keeps its existing roster while allowing settings changes', () => {
  const api = createWorkspace()
  api.login('lin')
  const room = api.current().groups[0]
  assert.equal(api.saveBotEntity('group', { ...room, name: '更新后的群名', members: ['editor', 'designer'], routing: 'auto' }), true)
  assert.equal(api.saveBotEntity('group', { ...room, members: ['editor'] }), false)
  assert.deepEqual(api.current().groups[0].members, ['editor', 'designer'])
  assert.equal(api.current().groups[0].name, '更新后的群名')
})

test('Bot prompts respect the profile model source and copied skill settings stay independent', () => {
  const api = createWorkspace()
  api.login('lin')
  const { credits } = api.current()
  const bot = { id: 'copy-local', profile: 'copy-local', name: '独立助手', model: 'qwen3:8b', provider: 'custom' }
  const skills = { 'session-summary': { installed: true, enabled: false } }
  assert.equal(api.saveBotEntity('bot', bot, { skills }), true)
  skills['session-summary'].enabled = true
  assert.equal(api.current().management.skills[bot.id]['session-summary'].enabled, false)
  api.setDraft(bot.id, '试用本地模型')
  assert.equal(api.send(bot.id, 'local-model-run').ok, true)
  assert.equal(api.getChat(bot.id).lastInput.source, 'local')
  assert.equal(api.current().credits, credits)
})

test('scheduled room results can be posted once without starting a discussion', () => {
  const api = createWorkspace()
  api.login('lin')
  assert.equal(api.postGroupTaskResult('missing', { id: 'run-1', name: '周报', text: '模拟结果' }), false)
  assert.equal(api.postGroupTaskResult('release', { id: 'run-1', name: '周报', text: '模拟结果' }), true)
  assert.equal(api.postGroupTaskResult('release', { id: 'run-1', name: '周报', text: '模拟结果' }), true)
  const chat = api.getChat('release')
  assert.equal(chat.messages.filter(message => message.id === 'cron:run-1').length, 1)
  assert.equal(chat.messages.at(-1).author, '周报')
  assert.equal(chat.pending, null)
})

test('adding a Bot with an existing member name does not change a room roster', () => {
  const api = createWorkspace()
  api.login('lin')
  api.saveBotEntity('bot', { id: 'duplicate-designer', name: '设计助手' })
  assert.deepEqual(api.current().groups[0].members, ['editor', 'designer'])
})

test('a scheduled result after a failed discussion does not prevent retry', () => {
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('release', '演示失败')
  api.send('release', 'failed')
  api.applyAgentEvent('release', 'failed', { type: 'message.complete', data: { status: 'error', recoverable: true } }, true)
  api.postGroupTaskResult('release', { id: 'task', name: '周报', text: '模拟结果' })
  assert.equal(api.retryGroupPrompt('release', 'failed', 'retry'), true)
})

test('a Bot keeps its chosen silhouette, body and eye colors across reloads and renames', async () => {
  const { getBotAppearance } = await import('../src/bot-appearance.mjs')
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  const editor = api.current().bots.find(bot => bot.id === 'editor')
  const choice = { mode: 'character', shape: 'sun', bodyColor: '#5080ff', eyeColor: '#ffd889', eyeStyle: 'round' }
  assert.equal(api.saveBotEntity('bot', { ...editor, name: '发布编辑', appearance: choice }), true)
  const restored = createWorkspace(storage)
  restored.login('lin')
  assert.deepEqual(getBotAppearance(restored.current().bots.find(bot => bot.id === 'editor')), choice)
  assert.notEqual(getBotAppearance(restored.current().bots.find(bot => bot.id === 'designer')).shape, choice.shape)
})

test('changing from a legacy portrait to a character leaves the uploaded photo available', async () => {
  const { getBotAppearance } = await import('../src/bot-appearance.mjs')
  const api = createWorkspace()
  api.login('lin')
  const bot = { id: 'portrait-bot', name: '样例 Bot', avatar: 'data:image/png;base64,example' }
  assert.equal(getBotAppearance(bot).mode, 'photo')
  const choice = { ...getBotAppearance(bot), mode: 'character', shape: 'hexagon' }
  api.saveBotEntity('bot', { ...bot, appearance: choice })
  const saved = api.current().bots.find(item => item.id === bot.id)
  assert.equal(getBotAppearance(saved).mode, 'character')
  assert.equal(saved.avatar, bot.avatar)
})

test('a custom human avatar survives a reload without losing the bot’s other avatar choices', async () => {
  const { getBotAppearance } = await import('../src/bot-appearance.mjs')
  const { getPortraitDesign, resolveBotPortrait } = await import('../src/bot-portraits.mjs')
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  const avatar = 'data:image/png;base64,example'
  const design = getPortraitDesign('curls', { hair: 'bob', hairColor: 'copper', background: 'mint', eyeColor: 'navy', accessory: 'glasses' })
  const bot = { id: 'human-preset', name: '人物预设', avatar,
    appearance: { mode: 'portrait', portrait: 'curls', shape: 'sun', portraitDesign: design } }
  assert.equal(api.saveBotEntity('bot', bot), true)

  const restored = createWorkspace(storage)
  restored.login('lin')
  const saved = restored.current().bots.find(item => item.id === bot.id)
  const appearance = getBotAppearance(saved)
  assert.equal(appearance.mode, 'portrait')
  assert.equal(appearance.portrait, 'curls')
  assert.deepEqual(appearance.portraitDesign, design)
  assert.equal(resolveBotPortrait(appearance.portrait, appearance.portraitDesign).background, '#c6dcd1')
  assert.equal(getBotAppearance({ ...saved, appearance: { ...appearance, mode: 'character' } }).shape, 'sun')
  assert.equal(saved.avatar, avatar)
})

test('random portrait batches offer ten different silhouettes with clear hair contrast on light and dark backgrounds', async () => {
  const { randomPortraitBatch, resolveBotPortrait } = await import('../src/bot-portraits.mjs')
  const luminance = color => color.slice(1).match(/../g).reduce((sum, hex, i) => {
    const n = parseInt(hex, 16) / 255
    return sum + (n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]
  }, 0)
  const batch = randomPortraitBatch()
  assert.equal(batch.length, 10)
  assert.equal(new Set(batch.map(design => design.hair)).size, 10)
  assert.equal(new Set(batch.map(design => design.background)).size, 8)
  for (const design of batch) {
    const { hair, background } = resolveBotPortrait(design.hair, design)
    const bg = luminance(background)
    for (const tone of hair) {
      const fg = luminance(tone)
      assert.ok((Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) >= 3, `${tone} on ${background}`)
    }
  }
})

test('explicit new browser tabs preserve independent pages and annotations through reload and close', () => {
  const saved = new Map()
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  api.openTool('plan', '浏览器')
  const first = api.getChat('plan').tool
  api.updateBrowser('plan', state => navigateBrowser(state, 'https://example.com/first'), first)
  api.openTool('plan', '浏览器', undefined, { newInstance: true })
  const second = api.getChat('plan').tool
  assert.notEqual(first, second)
  assert.equal(api.getChat('plan').tabs.length, 2)
  api.updateBrowser('plan', state => editBrowserAnnotation(navigateBrowser(state, 'https://example.com/second'),
    'https://example.com/second', { text: '第二个标签的草稿' }), second)
  api.renameTool('plan', second, '参考页')
  api.selectTool('plan', first)
  assert.equal(api.getChat('plan').tool, first)
  const restored = createWorkspace(storage)
  restored.login('lin')
  assert.equal(restored.getChat('plan').browser.visited, 'https://example.com/first')
  assert.equal(restored.getChat('plan').toolInstances[second].browser.visited, 'https://example.com/second')
  assert.equal(restored.getChat('plan').toolInstances[second].browser.annotationDrafts['https://example.com/second'].text, '第二个标签的草稿')
  assert.equal(restored.getChat('plan').toolTitles[second], '参考页')
  restored.closeTools('plan', second)
  assert.deepEqual(restored.getChat('plan').tabs, [first])
  assert.equal(restored.getChat('plan').browser.visited, 'https://example.com/first')
  assert.equal(restored.getChat('plan').toolInstances[second], undefined)
  assert.equal(restored.updateBrowser('plan', state => navigateBrowser(state, 'https://example.com/stale'), second), false)
  restored.login('qiao')
  assert.equal(restored.getChat('atlas-chat').toolInstances, undefined)
})

test('ordinary browser opens reuse the active or latest browser without resetting pages', () => {
  const api = createWorkspace()
  api.login('lin')
  api.openTool('plan', '浏览器', undefined, { newInstance: true })
  const first = api.getChat('plan').tool
  api.updateBrowser('plan', state => navigateBrowser(state, 'https://example.com/first'), first)
  api.openTool('plan', '浏览器', undefined, { newInstance: true })
  const second = api.getChat('plan').tool
  api.selectTool('plan', first)
  api.openTool('plan', '浏览器')
  assert.equal(api.getChat('plan').tool, first)
  api.openTool('plan', '无限画布')
  api.updateBrowser('plan', state => navigateBrowser(state, 'https://example.com/link'))
  api.openTool('plan', '浏览器')
  assert.equal(api.getChat('plan').tool, second)
  assert.equal(api.getChat('plan').tabs.length, 3)
  assert.equal(api.getChat('plan').toolInstances[first].browser.visited, 'https://example.com/first')
  assert.equal(api.getChat('plan').toolInstances[second].browser.visited, 'https://example.com/link')
  api.openTool('review', '浏览器', undefined, { newInstance: true })
  assert.notEqual(api.getChat('review').tool, second)
})

test('new terminals have independent command histories and can be inserted and closed separately', () => {
  const api = createWorkspace()
  api.login('lin')
  api.openTool('plan', '终端', undefined, { newInstance: true })
  const first = api.getChat('plan').tool
  api.updateToolEdits('plan', () => ({ terminalLog: [{ command: 'pwd', output: '/first' }] }), first)
  api.openTool('plan', '无限画布')
  api.openTool('plan', '终端', first, { newInstance: true })
  const second = api.getChat('plan').tool
  assert.notEqual(first, second)
  assert.deepEqual(api.getChat('plan').tabs, [first, second, '无限画布'])
  api.updateToolEdits('plan', () => ({ terminalLog: [{ command: 'ls', output: 'second' }] }), second)
  assert.equal(api.getChat('plan').toolInstances[first].toolEdits.terminalLog[0].output, '/first')
  assert.equal(api.getChat('plan').toolInstances[second].toolEdits.terminalLog[0].output, 'second')
  api.closeTools('plan', first)
  assert.equal(api.getChat('plan').toolInstances[second].toolEdits.terminalLog[0].output, 'second')
  assert.equal(api.updateToolEdits('plan', () => ({ terminalLog: [] }), first), false)
})

test('a failed native terminal close keeps its tab and data available for retry', async () => {
  const { closeToolInstances } = await import('../src/tool-tabs.mjs')
  const api = createWorkspace()
  api.login('lin')
  api.openTool('plan', '终端', undefined, { newInstance: true })
  const first = api.getChat('plan').tool
  api.updateToolEdits('plan', () => ({ terminalLog: [{ command: 'pwd', output: '/first' }] }), first)
  const failed = await closeToolInstances(api, 'plan', first, 'one', async () => { throw new Error('offline') })
  assert.equal(failed.failed[0].error.message, 'offline')
  assert.deepEqual(api.getChat('plan').tabs, [first])
  assert.equal(api.getChat('plan').toolInstances[first].toolEdits.terminalLog[0].output, '/first')
  await closeToolInstances(api, 'plan', first, 'one', async () => ({ ok: true }))
  assert.deepEqual(api.getChat('plan').tabs, [])
})

test('bulk closing waits for native acknowledgement and leaves newly opened tabs intact', async () => {
  const { closeToolInstances } = await import('../src/tool-tabs.mjs')
  const api = createWorkspace()
  api.login('lin')
  api.openTool('plan', '终端', undefined, { newInstance: true })
  const first = api.getChat('plan').tool
  let confirm
  const pending = closeToolInstances(api, 'plan', first, 'all', () => new Promise(resolve => { confirm = resolve }))
  assert.deepEqual(api.getChat('plan').tabs, [first])
  api.openTool('plan', '浏览器', undefined, { newInstance: true })
  const second = api.getChat('plan').tool
  confirm({ ok: true })
  await pending
  assert.deepEqual(api.getChat('plan').tabs, [second])
})
