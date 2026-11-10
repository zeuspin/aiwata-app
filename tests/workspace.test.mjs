import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationStatus } from '../src/conversation-meta.mjs'
import { closeTabs } from '../src/tabs.mjs'
import { moveBrowser, navigateBrowser, terminalOutput } from '../src/tool-surfaces.mjs'
import { createWorkspace, fitPanels, resizePanels, setProjectChatMarker, viewAtWidth } from '../src/workspace.mjs'

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
  api.updateBrowser('plan', state => ({ ...state, annotations, playbackOpen: true, replayIndex: 1 }))
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

test('project chat markers accept a color or emoji, persist and can be cleared', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  assert.equal(setProjectChatMarker(api, 'plan', { kind: 'color', value: 'purple' }), true)
  assert.deepEqual(api.current().chats.plan.marker, { kind: 'color', value: 'purple' })
  assert.equal(setProjectChatMarker(api, 'plan', { kind: 'emoji', value: '🎨' }), true)
  assert.equal(setProjectChatMarker(api, 'plan', { kind: 'color', value: 'invalid' }), false)
  assert.equal(setProjectChatMarker(api, 'editor', { kind: 'emoji', value: '🎨' }), false)
  const reopened = createWorkspace(storage)
  reopened.login('lin')
  assert.deepEqual(reopened.current().chats.plan.marker, { kind: 'emoji', value: '🎨' })
  assert.equal(setProjectChatMarker(reopened, 'plan', null), true)
  assert.equal(reopened.current().chats.plan.marker, null)
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
