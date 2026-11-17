import { sameBotOwner } from './bot-owner-identity.mjs'
import { browserPatch, browserState, browserTabId, restoreBrowserActions, toolEditsFor, toolType } from './tool-tabs.mjs'
import { desktopEventPatch } from './desktop-events.mjs'
import { mergeConnectionRequest } from './connection-request.mjs'
import { randomProjectMarker, markerDetails } from './conversation-meta.mjs'
import { getBotAppearance } from './bot-appearance.mjs'
import { accounts as demoAccounts, createChat, ensureDemoPrimaryBot, seedAccount, tools } from './fixtures.mjs'
import { closeTabs, conversationSection, insertTab } from './tabs.mjs'
import { createMockAgent, projectAgentEvent } from './agent-session.mjs'
import { resolveGroupMembers } from './management.mjs'
import { editBrowserAnnotation, recordBrowserAction, toolEditDefaults } from './tool-surfaces.mjs'
import { attachmentIds, hasPromptContent, isLocalAttachment, liveMediaSlots } from './local-attachments.mjs'
import { attachmentSizeLimit, models } from './composer.mjs'
import { gatewayDraftFingerprint, gatewayEvent, gatewayProject, gatewayRequest, gatewayTranscript } from './live-aiwata.mjs'
import { addFilePreview, artifactReference } from './file-previews.mjs'
import { addWebPreview, gatewayBrowserActions, webPreviewReference } from './web-preview.mjs'
import { gatewayGroup } from './live-room-state.mjs'
import { consumeBrowserAnnotations, annotationBatchKey, annotationLegacyBatchKey, annotationDestination, annotationDraftPrompt, annotationImageFile, nextBrowserAnnotationNumber } from './browser-annotation-state.mjs'

export const railWidth = 50
export const contextBreakpoint = 880
export const initialPanels = { side: 322, tools: 494 }

const chatMinimum = 290
const sideMinimum = 200
const toolMinimum = 260
const storageKey = 'aiwata-ui-prototype:v1:accounts'

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

export function minSidebarWidth(width, split, minimum = sideMinimum) {
  const available = width - railWidth - (split ? toolMinimum : 0)
  return Math.min(minimum, Math.floor(available * .45))
}

export function minToolWidth(width) {
  return Math.min(toolMinimum, Math.floor((width - railWidth) / 2))
}

export function fitPanels(saved, width, sidebar, split, sidebarMinimum) {
  const maxPanels = width - railWidth - chatMinimum
  // A smaller Bot minimum must not remove the ordinary narrow-window expansion room.
  const maximumSide = Math.max(minSidebarWidth(width, split), maxPanels - (split ? toolMinimum : 0))
  const side = sidebar ? clamp(saved.side, minSidebarWidth(width, split, sidebarMinimum), maximumSide) : 0
  const toolsWidth = split ? clamp(saved.tools, minToolWidth(width), maxPanels - side) : 0
  return { side, tools: toolsWidth }
}

export function resizePanels(start, width, edge, delta, sidebar, split = true, sidebarMinimum) {
  const maxPanels = width - railWidth - chatMinimum
  if (edge === 'left') {
    return { ...start, side: clamp(start.side + delta, minSidebarWidth(width, split, sidebarMinimum), Math.min(520, Math.max(minSidebarWidth(width, split), maxPanels - (split ? start.tools : 0)))) }
  }
  return { ...start, tools: clamp(start.tools - delta, minToolWidth(width), maxPanels - (sidebar ? start.side : 0)) }
}

export function viewAtWidth(view, width, sidebar) {
  return view === 'split' && sidebar && width < contextBreakpoint ? 'replace' : view
}



export function setChatArchived(workspace, id, archived) {
  const record = workspace.current()
  if (!record?.chats[id] || conversationSection(record, id) !== 'projects') return false
  if (!workspace.changeChat(id, archived ? { archived, unread: false } : { archived })) return false
  return !archived || workspace.closeChats(id, 'one')
}

export function chatMoveTargets(record, chat) {
  return record.projects.filter(project => project.id !== chat.projectId && project.folder?.trim())
}

function projectForDirectory(projects, cwd) {
  let match = null
  let matchedLength = 0
  let primary = false
  for (const project of projects) {
    for (const folder of new Set([project.folder, ...(project.folders ?? [])])) {
      if (!folder || (cwd !== folder && !cwd?.startsWith(folder + '/'))) continue
      if (folder.length < matchedLength || (folder.length === matchedLength && (primary || folder !== project.folder))) continue
      match = project.id
      matchedLength = folder.length
      primary = folder === project.folder
    }
  }
  return match
}

export function moveChatToProject(workspace, id, projectId) {
  const record = workspace.current()
  const chat = record?.chats[id]
  if (!chat || chat.pending || conversationSection(record, id) !== 'projects') return false
  if (!chatMoveTargets(record, chat).some(project => project.id === projectId)) return false
  return workspace.changeChat(id, { projectId })
}

export function createWorkspace(storage, attachmentStore, { live = false, accounts = demoAccounts, storageNamespace } = {}) {
  const agent = createMockAgent()
  const key = storageNamespace ?? (live ? 'aiwata-ui-live:v1:accounts' : storageKey)
  let records = {}
  try {
    records = JSON.parse(storage?.getItem(key) || '{}') || {}
  } catch {
    records = {}
  }
  let active = null
  let online = true
  let loginVersion = 0
  const chatVersions = new WeakMap()
  const inventoryRevisions = new WeakMap()

  function persist() {
    try {
      const saveChat = ({ connectionRequest, desktopEffect, gatewayReactions, gatewayCwd, ...chat }) => chat
      const saved = live ? Object.fromEntries(Object.entries(records).map(([id, record]) => [id, {
        ...record, bots: record.bots.map(({ avatar, ...bot }) => bot),
        chats: Object.fromEntries(Object.entries(record.chats).map(([id, chat]) => [id, saveChat(chat)])),
        ...(record.newChatDraft ? { newChatDraft: saveChat(record.newChatDraft) } : {}),
      }])) : records
      storage?.setItem(key, JSON.stringify(saved))
      return true
    } catch {
      // The current browser session still works when local storage is unavailable.
      return false
    }
  }

  function current() {
    return active ? records[active] : null
  }

  function getChat(id) {
    const record = current()
    const draft = record?.newChatDraft
    return record?.chats[id] ?? (draft?.id === id ? draft : undefined) ?? Object.values(record?.gatewayCaptureDrafts ?? {}).find(chat => chat.id === id)
  }

  function closeChats(id, strategy) {
    const record = current()
    if (!record) return false
    const { remaining, active: activeChat } = closeTabs(record.openChats, record.activeChat, id, strategy)
    record.openChats = remaining
    record.activeChat = activeChat
    persist()
    return true
  }

  function deleteChat(id) {
    const record = current()
    if (!record || !Object.hasOwn(record.chats, id) || conversationSection(record, id) !== 'projects') return false
    const { remaining, active: activeChat } = closeTabs(record.openChats, record.activeChat, id)
    const chat = record.chats[id]
    delete record.chats[id]
    record.openChats = remaining
    record.activeChat = activeChat
    if (persist() && attachmentStore) removeLocal(active, id, [...attachmentIds(chat)])
    return true
  }

  function changeChat(id, patch) {
    const chat = getChat(id)
    if (!chat) return false
    const prior = attachmentStore && ['attachmentDetails', 'queue', 'messages', 'lastInput', 'gatewaySubmission', 'browser', 'toolInstances'].some(key => Object.hasOwn(patch, key))
      ? attachmentIds(chat) : null
    Object.assign(chat, patch)
    // Reply deltas do not change annotation ownership or the pending draft.
    if (['browser', 'toolInstances', 'tabs', 'title', 'projectId', 'gatewayStoredId', 'gatewayProfile',
      'draft', 'attachments', 'attachmentDetails', 'archived'].some(key => Object.hasOwn(patch, key))) {
      chatVersions.set(chat, (chatVersions.get(chat) ?? 0) + 1)
    }
    if (persist() && prior?.size) {
      const kept = attachmentIds(chat)
      removeLocal(active, id, [...prior].filter(blobId => !kept.has(blobId)))
    }
    return true
  }

  function removeLocal(account, chat, ids) {
    if (attachmentStore && ids.length) void attachmentStore.remove(account, chat, ids).catch(() => {})
  }

  async function addLocalAttachments(id, files) {
    const account = active
    const version = loginVersion
    const chat = getChat(id)
    if (!chat || !attachmentStore) return { ok: false }
    const staged = []
    let tooLarge = false
    let duplicate = false
    function canAdd(name) {
      const entry = Object.hasOwn(chat.attachmentDetails ?? {}, name) && chat.attachmentDetails[name]
      return !chat.attachments.includes(name) || (isLocalAttachment(entry) && !entry.blobId)
    }
    for (const file of files) {
      if (file.size > attachmentSizeLimit) tooLarge = true
      else if (!canAdd(file.name) || staged.some(item => item.file.name === file.name)) duplicate = true
      else staged.push({ id: crypto.randomUUID(), file })
    }
    if (!staged.length) return { ok: true, tooLarge, duplicate }
    try {
      await attachmentStore.save(account, id, staged)
    } catch {
      return { ok: false }
    }
    if (version !== loginVersion || getChat(id) !== chat) {
      removeLocal(account, id, staged.map(item => item.id))
      return { ok: false, cancelled: true }
    }
    const before = { attachments: chat.attachments, attachmentDetails: chat.attachmentDetails }
    const names = [...chat.attachments]
    const details = Object.assign(Object.create(null), chat.attachmentDetails)
    const unused = []
    for (const { id: blobId, file } of staged) {
      if (!canAdd(file.name)) {
        duplicate = true
        unused.push(blobId)
        continue
      }
      if (!names.includes(file.name)) names.push(file.name)
      details[file.name] = { name: file.name, kind: file.type.startsWith('image/') ? 'image' : 'file',
        type: file.type, size: file.size, blobId }
    }
    Object.assign(chat, { attachments: names, attachmentDetails: details })
    if (!persist()) {
      Object.assign(chat, before)
      removeLocal(account, id, staged.map(item => item.id))
      return { ok: false }
    }
    removeLocal(account, id, unused)
    return { ok: true, tooLarge, duplicate }
  }

  function atomicChatPatch(chat, patch) {
    const before = Object.fromEntries(Object.keys(patch).map(key => [key, { present: Object.hasOwn(chat, key), value: chat[key] }]))
    Object.assign(chat, patch)
    if (persist()) {
      chatVersions.set(chat, (chatVersions.get(chat) ?? 0) + 1)
      return true
    }
    for (const [key, entry] of Object.entries(before)) {
      if (entry.present) chat[key] = entry.value
      else delete chat[key]
    }
    return false
  }

  function annotationScope(id, tabId, url) {
    const record = current()
    const chat = record?.chats[id]
    const destination = annotationDestination(record, id)
    if (!online || !chat || !destination || !tabId || !chat.tabs.includes(tabId) || toolType(chat, tabId) !== '浏览器') return null
    const browser = browserState(chat, tabId)
    if (!url || browser.visited !== url) return null
    const account = active, version = loginVersion, revision = chatVersions.get(chat)
    const snapshot = JSON.stringify(browser)
    const identity = JSON.stringify([destination, chat.gatewayStoredId, chat.gatewayProfile,
      record.bots?.find(item => item.id === id)?.identity, record.bots?.find(item => item.id === id)?.profile])
    return { account, chat, browser, destination, valid() {
      return active === account && version === loginVersion && current() === record && getChat(id) === chat &&
        chatVersions.get(chat) === revision && chat.tabs.includes(tabId) && toolType(chat, tabId) === '浏览器' &&
        JSON.stringify(browserState(chat, tabId)) === snapshot &&
        JSON.stringify([annotationDestination(record, id), chat.gatewayStoredId, chat.gatewayProfile,
          record.bots?.find(item => item.id === id)?.identity, record.bots?.find(item => item.id === id)?.profile]) === identity
    } }
  }

  async function saveBrowserAnnotationCapture(id, tabId, url, capture, { signal } = {}) {
    if (signal?.aborted) return { ok: false, error: '截图操作已取消，原批注已保留。' }
    const scope = annotationScope(id, tabId, url)
    if (!scope || !attachmentStore || (capture?.pageUrl && capture.pageUrl !== url)) return { ok: false, error: '批注页面或目标会话已变化，请重新选择。' }
    const { account, chat, browser } = scope
    const existing = browser.annotations.find(pin => pin.id === browser.annotationDrafts?.[url]?.id)
    const number = capture?.number ?? existing?.number ?? nextBrowserAnnotationNumber(browser, url)
    if (!Number.isSafeInteger(number) || number <= 0 || (existing ? number !== existing.number : number !== nextBrowserAnnotationNumber(browser, url))) {
      return { ok: false, error: '批注编号已变化，请重新截图。' }
    }
    const file = annotationImageFile(capture, number)
    if (!file?.size || file.size > attachmentSizeLimit) return { ok: false, error: '截图无效或超过附件大小限制。' }
    const blobId = crypto.randomUUID()
    try { await attachmentStore.save(account, id, [{ id: blobId, file }]) }
    catch { return { ok: false, error: '截图保存失败，原批注已保留。' } }
    if (signal?.aborted || !scope.valid()) {
      removeLocal(account, id, [blobId])
      return { ok: false, error: signal?.aborted ? '截图操作已取消，原批注已保留。' : '批注页面或目标会话已变化，请重新选择。' }
    }
    const { imageDataUrl, image: ignoredImage, ...metadata } = capture
    const image = { blobId, name: file.name, kind: 'image', type: file.type, size: file.size }
    const savedCapture = { ...metadata, number, image }
    const updated = editBrowserAnnotation(browser, url, { open: true, capture: savedCapture,
      target: capture.identity?.selector || (capture.kind === 'area' ? '框选区域' : '所选元素') })
    const prior = attachmentIds(chat)
    if (!atomicChatPatch(chat, browserPatch(chat, updated, tabId))) {
      removeLocal(account, id, [blobId])
      return { ok: false, error: '批注保存失败，原批注已保留。' }
    }
    const kept = attachmentIds(chat)
    removeLocal(account, id, [...prior].filter(blobId => !kept.has(blobId)))
    return { ok: true, capture: savedCapture }
  }

  async function addBrowserAnnotationsToDraft({ accountId, chatId: id, tabId, url, pinIds, destinationLabel, consume = false } = {}) {
    const scope = annotationScope(id, tabId, url)
    if (!scope || accountId !== active || destinationLabel !== scope.destination.label) return { ok: false, error: '目标会话已变化，请重新确认。' }
    const { account, chat, browser } = scope
    const applyDraftPatch = patch => {
      const prior = attachmentIds(chat)
      if (!atomicChatPatch(chat, patch)) return false
      const retained = attachmentIds(chat)
      removeLocal(account, id, [...prior].filter(blobId => !retained.has(blobId)))
      return true
    }
    const pagePins = browser.annotations.filter(pin => pin.url === url)
    if (pinIds !== undefined && (!Array.isArray(pinIds) || new Set(pinIds).size !== pinIds.length)) return { ok: false, error: '批注选择无效。' }
    const pins = pinIds === undefined ? pagePins : pinIds.map(id => pagePins.find(pin => pin.id === id))
    if (!pins.length || pins.some(pin => !pin || typeof pin.text !== 'string' || (!pin.capture && !pin.text.trim()))) return { ok: false, error: '批注已变化，请重新选择。' }
    const receipt = annotationBatchKey(tabId, url, pins)
    const previousReceipt = chat.browserAnnotationDeliveries?.[receipt] ??
      chat.browserAnnotationDeliveries?.[annotationLegacyBatchKey(tabId, url, pins)]
    const currentImages = new Set((chat.attachments ?? []).map(name => chat.attachmentDetails?.[name]?.blobId).filter(Boolean))
    if (previousReceipt) {
      const imageIds = previousReceipt === true ? pins.map(pin => pin.capture?.image?.blobId).filter(Boolean) : previousReceipt.imageIds ?? []
      const prompt = previousReceipt === true
        ? annotationDraftPrompt(url, pins, new Map(pins.filter(pin => pin.capture?.image).map(pin => [pin.id, pin.capture.image.name])))
        : previousReceipt.prompt
      const withoutImageNames = text => text.replace(/^附件: .*$/gm, '').trim()
      const promptPresent = prompt && (chat.draft.includes(prompt) || (previousReceipt === true &&
        withoutImageNames(chat.draft).includes(withoutImageNames(prompt))))
      if (promptPresent || imageIds.some(id => currentImages.has(id))) {
        if (consume && !applyDraftPatch(browserPatch(chat, consumeBrowserAnnotations(browser, url, pins), tabId))) return { ok: false, error: '批注状态保存失败，请重试。' }
        return { ok: true, duplicate: true }
      }
    }
    const draftSnapshot = JSON.stringify([chat.draft, chat.attachments, chat.attachmentDetails])
    try {
      const images = await Promise.all(pins.filter(pin => pin.capture).map(async pin => {
        const image = pin.capture.image
        if (!image?.blobId || !attachmentStore) throw Error('missing image')
        const file = await attachmentStore.read(account, id, image.blobId)
        if (!file?.size || !file.type?.startsWith('image/') || file.size !== image.size) throw Error('missing image')
        return { pin, image }
      }))
      if (!scope.valid() || JSON.stringify([chat.draft, chat.attachments, chat.attachmentDetails]) !== draftSnapshot) {
        return { ok: false, error: '页面、批注或目标草稿已变化，请重新确认。' }
      }
      const attachments = [...chat.attachments]
      const attachmentDetails = { ...chat.attachmentDetails }
      const filenames = new Map()
      for (const { pin, image } of images) {
        const extension = image.type === 'image/jpeg' ? 'jpg' : image.type === 'image/webp' ? 'webp' : 'png'
        const base = `网页批注-${pin.number}`
        let name = `${base}.${extension}`, suffix = 2
        while (attachments.includes(name) || Object.hasOwn(attachmentDetails, name)) name = `${base}-${suffix++}.${extension}`
        attachments.push(name)
        attachmentDetails[name] = { ...image, name }
        filenames.set(pin.id, name)
      }
      const prompt = annotationDraftPrompt(url, pins, filenames)
      const patch = { ...(consume ? browserPatch(chat, consumeBrowserAnnotations(browser, url, pins), tabId) : {}),
        draft: chat.draft ? chat.draft + '\n\n' + prompt : prompt, attachments, attachmentDetails,
        browserAnnotationDeliveries: { ...chat.browserAnnotationDeliveries, [receipt]: { prompt, imageIds: images.map(({ image }) => image.blobId) } }, retryDemo: null }
      if (!applyDraftPatch(patch)) return { ok: false, error: '草稿保存失败，批注和原草稿已保留。' }
      return { ok: true }
    } catch {
      return { ok: false, error: '截图读取失败，批注和原草稿已保留，请重新截图后重试。' }
    }
  }

  async function readLocalAttachment(id, blobId) {
    const account = active
    const version = loginVersion
    if (!getChat(id) || !blobId || !attachmentStore) return null
    const file = await attachmentStore.read(account, id, blobId)
    return version === loginVersion && getChat(id) ? file ?? null : null
  }

  async function saveLocalToolMedia(id, file, slot) {
    const account = active
    const version = loginVersion
    const chat = getChat(id)
    if (!live || !chat || !attachmentStore || !liveMediaSlots.includes(slot) || !file.size || file.size > attachmentSizeLimit) return false
    const blobId = crypto.randomUUID()
    await attachmentStore.save(account, id, [{ id: blobId, file }])
    if (version !== loginVersion || getChat(id) !== chat || chat.archived) {
      removeLocal(account, id, [blobId])
      return false
    }
    const previous = chat.toolEdits
    const entry = { name: file.name, kind: file.type.startsWith('image/') ? 'image' : 'file', type: file.type, size: file.size, blobId }
    chat.toolEdits = { ...previous, [slot]: entry, ...(slot === 'liveImageSource' ? { imageEditSource: slot } : {}) }
    if (!persist()) {
      chat.toolEdits = previous
      removeLocal(account, id, [blobId])
      return false
    }
    const old = previous?.[slot]?.blobId
    if (old && !attachmentIds(chat).has(old)) removeLocal(account, id, [old])
    return true
  }

  function attachLocalToolMedia(id, slot) {
    const chat = getChat(id)
    const entry = chat?.toolEdits?.[slot]
    if (!entry || chat.archived || chat.attachments.includes(entry.name)) return false
    const before = { attachments: chat.attachments, attachmentDetails: chat.attachmentDetails }
    Object.assign(chat, { attachments: [...chat.attachments, entry.name],
      attachmentDetails: { ...chat.attachmentDetails, [entry.name]: entry } })
    if (persist()) return true
    Object.assign(chat, before)
    return false
  }

  function logout() {
    const record = current()
    if (record) {
      agent.dispose()
      if (!live) for (const chat of Object.values(record.chats)) resetRun(chat)
      active = null
      loginVersion += 1
      persist()
    }
  }

  function resetRun(chat) {
    if (chat.pending) {
      const completion = { type: 'message.complete', data: { status: 'interrupted', partial: true } }
      Object.assign(chat, projectAgentEvent(chat, completion, !chat.unread))
    } else if (chat.agentRun) {
      chat.agentRun = null
      chat.activity = { ...chat.activity, needsInput: false }
    }
  }

  function login(id) {
    if (!online || !accounts.some(account => account.id === id)) return false
    if (active === id) return true
    logout()
    const record = records[id] ??= live ? {
      projects: [], bots: [], groups: [], assets: [], chats: {}, openChats: [], credits: 0, usage: [],
    } : seedAccount(id)
    if (live) {
      record.tasks ??= []
      record.connectors ??= []
    }
    for (const project of record.projects) {
      if (!markerDetails(project.marker)) project.marker = randomProjectMarker(record.projects)
    }
    for (const group of record.groups) {
      if (!Array.isArray(group.members)) group.members = resolveGroupMembers(group, record.bots)
    }
    if (!live) ensureDemoPrimaryBot(record)
    const chats = Object.values(record.chats)
    if (!live) for (const chat of chats) resetRun(chat)
    if (!Array.isArray(record.openChats)) {
      const initial = chats.find(chat => chat.messages.length && conversationSection(record, chat.id) === 'projects')
      record.openChats = initial ? [initial.id] : []
    }
    record.openChats = record.openChats.filter(chatId => Object.hasOwn(record.chats, chatId))
    if (!record.openChats.includes(record.activeChat)) record.activeChat = record.openChats.at(-1) ?? null
    active = id
    persist()
    return true
  }

  function charge({ id, kind, source, amount }, save = true) {
    const record = current()
    if (!record) return { ok: false, reason: 'locked' }
    if (source !== 'managed') return { ok: true, charged: 0 }
    if (!id || !Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid' }
    if (record.usage.some(row => row.id === id)) return { ok: true, charged: 0 }
    if (record.credits < amount) return { ok: false, reason: 'insufficient' }

    record.credits -= amount
    record.usage.unshift({ id, kind, amount, timestamp: Date.now() })
    if (save) persist()
    return { ok: true, charged: amount }
  }

  function draftInput(chat, runId, queued = false) {
    const record = current()
    const group = record?.groups.some(item => item.id === chat.id)
    const bot = record?.bots.find(item => item.id === chat.id)
    const model = bot && models.find(item => item.id === bot.model && item.provider === bot.provider)
    const reply = group ? chat.groupReply : null
    return { runId, text: chat.draft.trim(), source: bot ? (model?.source ?? 'managed') : chat.source, attachments: chat.attachments,
      attachmentDetails: chat.attachmentDetails, queued, retryDemo: chat.retryDemo === chat.draft.trim(),
      ...(group ? { threadId: reply?.threadId ?? runId, discussionId: runId, reply } : {}) }
  }

  function admitPrompt(id, input, patch, receipt) {
    const record = current()
    const chat = getChat(id)
    if (!chat || !input || !hasPromptContent(input) || chat.pending) return { ok: false, reason: 'unavailable' }
    const result = receipt ? { ok: true, charged: 0 } : charge({ id: input.runId, kind: 'Agent 会话', source: input.source, amount: 12 }, false)
    if (!result.ok) return result
    if (record.newChatDraft === chat) {
      record.chats[id] = chat
      delete record.newChatDraft
    }
    if (chat.gatewayCaptureKey && record.gatewayCaptureDrafts?.[chat.gatewayCaptureKey] === chat) {
      record.chats[id] = chat
      delete record.gatewayCaptureDrafts[chat.gatewayCaptureKey]
    }
    changeChat(id, {
      ...patch, pending: input.runId, agentRun: null, lastInput: input,
      ...(receipt ? { gatewayAdmission: receipt.admission_id, gatewayGeneration: receipt.execution_generation } : {}),
      activity: { ...chat.activity, needsInput: false },
      title: chat.title === '新聊天' ? (input.text || input.attachments[0]).slice(0, 24) : chat.title,
      messages: [...chat.messages, { role: 'user', text: input.text, attachments: input.attachments, attachmentDetails: input.attachmentDetails,
        ...(input.threadId ? { id: input.runId, threadId: input.threadId, reply: input.reply } : {}) }],
    })
    return result
  }

  function hydrateGatewayChat(id, snapshot, extra = {}) {
    const chat = getChat(id)
    if (!live || !chat) return false
    const info = snapshot.info ?? {}
    const savedRequest = snapshot.open_requests?.find(request => ['approval', 'clarify'].includes(request.method))
    const prompt = snapshot.prompts?.[0]
    const request = savedRequest ? gatewayRequest(savedRequest.method, savedRequest.params, savedRequest.id)
      : prompt && gatewayRequest(prompt.kind, prompt)
    const unknown = snapshot.pending?.find(item => item.status === 'unknown')
    const pending = snapshot.running || Boolean(snapshot.pending?.length || request)
    const transcript = gatewayTranscript(snapshot, { pending, files: !chat.gatewayRoom })
    const sameSessionOwner = !chat.gatewayStoredId || chat.gatewayStoredId === (snapshot.stored_session_id ?? snapshot.session_id)
    if (sameSessionOwner && chat.gatewayReactions) transcript.messages = transcript.messages.map(message =>
      Object.hasOwn(chat.gatewayReactions, message.id) ? { ...message, reactions: chat.gatewayReactions[message.id] } : message)
    const promptDisplays = new Map((chat.gatewayPromptDisplays ?? []).map(item => [item.wireText, item.text]))
    transcript.messages = transcript.messages.map(message => message.role === 'user' && promptDisplays.has(message.text)
      ? { ...message, text: promptDisplays.get(message.text) } : message)
    const run = pending ? { text: '', tools: {}, children: {}, todos: [], segments: {}, ...chat.agentRun, request } : null
    if (run) run.tools = { ...run.tools, ...transcript.pendingTools }
    if (run && transcript.pendingFiles.length) run.filePreviews = transcript.pendingFiles.reduce(addFilePreview, run.filePreviews)
    if (run && transcript.pendingPages.length) run.webPreviews = transcript.pendingPages.reduce(addWebPreview, run.webPreviews)
    const projectId = chat.gatewayProfile ? null : info.cwd === undefined ? chat.projectId : projectForDirectory(current().projects, info.cwd)
    if (!sameSessionOwner || typeof info.cwd === 'string' && info.cwd !== chat.gatewayCwd) {
      inventoryRevisions.set(current(), (inventoryRevisions.get(current()) ?? 0) + 1)
    }
    const agentActions = chat.gatewayRoom ? [] : gatewayBrowserActions(snapshot.messages ?? [])
    return changeChat(id, {
      ...extra, gatewayId: snapshot.session_id, gatewayStoredId: snapshot.stored_session_id ?? snapshot.session_id,
      ...(typeof info.cwd === 'string' ? { gatewayCwd: info.cwd } : !sameSessionOwner ? { gatewayCwd: undefined } : {}),
      ...(Object.hasOwn(snapshot, 'pending_connection') ? { connectionRequest: mergeConnectionRequest(null, snapshot.pending_connection, { replace: true }) } : {}),
      gatewayEpoch: snapshot.replay_epoch, gatewayGeneration: snapshot.execution_generation,
      gatewaySeq: pending && chat.pending && chat.gatewayEpoch === snapshot.replay_epoch
        ? (chat.gatewaySeq ?? 0) : (snapshot.last_sequence ?? 0),
      source: 'own', model: info.model ?? chat.model,
      projectId, title: chat.gatewayProfile ? chat.title : info.title || chat.title,
      ...(!sameSessionOwner ? { gatewayReactions: {} } : {}),
      messages: transcript.messages, pending: pending ? (chat.pending ?? snapshot.pending?.[0]?.admission_id ?? snapshot.session_id) : null,
      gatewayUnknown: unknown ? { admissionId: unknown.admission_id, generation: unknown.execution_generation } : null,
      agentRun: run, activity: { ...chat.activity, needsInput: Boolean(request || unknown) },
      ...(agentActions.length ? restoreBrowserActions(chat, agentActions) : {}),
    })
  }

  return {
    login, logout, current, getChat, charge, changeChat, agent, addLocalAttachments, readLocalAttachment, saveLocalToolMedia, attachLocalToolMedia, hydrateGatewayChat, saveBrowserAnnotationCapture, addBrowserAnnotationsToDraft,
    syncGatewayRooms(rooms) {
      const record = current()
      if (!live || !record) return false
      const previous = new Map(record.groups.map(group => [group.id, group]))
      record.groups = rooms.map(room => gatewayGroup(room, null, null, previous.get(room.room_id)))
      const ids = new Set(record.groups.map(group => group.id))
      for (const [id] of previous) {
        if (ids.has(id)) continue
        const chat = record.chats[id]
        closeChats(id, 'one')
        delete record.chats[id]
        if (chat) removeLocal(active, id, [...attachmentIds(chat)])
      }
      for (const group of record.groups) {
        const chat = record.chats[group.id] ??= createChat(group.id, group.name)
        Object.assign(chat, { title: group.name, gatewayRoom: true, source: 'own' })
      }
      return persist()
    },
    updateGatewayRoomSettings(snapshot) {
      const record = current()
      const index = record?.groups.findIndex(group => group.id === snapshot.room.room_id)
      if (!live || index == null || index < 0) return false
      record.groups[index] = gatewayGroup(snapshot.room, snapshot.context, snapshot.driver_status, record.groups[index])
      return changeChat(snapshot.room.room_id, { title: snapshot.room.name })
    },
    applyGatewayRoom(id, snapshot, state, viewed) {
      const record = current()
      const chat = getChat(id)
      if (!chat?.gatewayRoom || snapshot.room.room_id !== id) return false
      const index = record.groups.findIndex(group => group.id === id)
      if (index < 0) return false
      record.groups[index] = gatewayGroup(snapshot.room, snapshot.context, snapshot.driver_status, record.groups[index])
      const room = { statuses: state.statuses, paused: state.paused }
      const pending = state.working || state.paused || state.approvals.length > 0
      return changeChat(id, { title: snapshot.room.name, messages: state.messages, pending: pending ? id : null,
        agentRun: pending ? { room } : null, roomOutcome: room,
        roomApprovals: state.approvals, roomAttempts: state.attempts, roomReady: state.ready, roomError: state.error,
        activity: { ...chat.activity, needsInput: Boolean(state.approvals.length || state.attempts.length || state.paused) },
        unread: viewed ? false : chat.unread || state.messages.length > chat.messages.length,
      })
    },
    acceptGatewayRoomSend(id, attempt) {
      const chat = getChat(id)
      if (!chat?.gatewayRoom || chat.gatewayRoomSubmission !== attempt) return false
      const sameDraft = gatewayDraftFingerprint(chat.draft, chat.attachments, chat.attachmentDetails) === attempt.fingerprint &&
        chat.groupReply?.messageId === attempt.replyId
      return changeChat(id, { gatewayRoomSubmission: null,
        ...(sameDraft ? { draft: '', attachments: [], attachmentDetails: {}, groupReply: null } : {}),
      })
    },
    syncGatewayBots(bots) {
      const record = current()
      if (!live || !record || !Array.isArray(bots)) return false
      const previous = record.bots
      record.bots = bots.map(bot => ({ ...bot, id: 'bot:' + bot.profile }))
      const currentBots = new Map(record.bots.map(bot => [bot.id, bot]))
      for (const bot of previous) {
        const currentBot = currentBots.get(bot.id)
        if (currentBot && sameBotOwner(bot, currentBot)) continue
        const chat = record.chats[bot.id]
        const { remaining, active: activeChat } = closeTabs(record.openChats, record.activeChat, bot.id)
        record.openChats = remaining
        record.activeChat = activeChat
        delete record.chats[bot.id]
        if (record.management?.tasks) record.management.tasks = record.management.tasks.filter(task => task.profile !== bot.id)
        if (chat) removeLocal(active, bot.id, [...attachmentIds(chat)])
      }
      for (const bot of record.bots) {
        const chat = record.chats[bot.id] ??= createChat(bot.id, bot.name)
        const prior = previous.find(item => item.id === bot.id)
        const sameCanonical = bot.canonicalIds?.includes(chat.gatewayStoredId) ||
          bot.canonicalIds?.some(id => prior?.canonicalIds?.includes(id))
        const changed = bot.canonicalId && chat.gatewayStoredId && bot.canonicalId !== chat.gatewayStoredId && !sameCanonical
        Object.assign(chat, { title: bot.name, gatewayProfile: bot.profile, source: 'own', projectId: null,
          ...(bot.canonicalId && (!sameCanonical || !chat.gatewayStoredId) ? { gatewayStoredId: bot.canonicalId } : {}),
          ...(changed ? { gatewayId: null, gatewaySeq: 0, pending: null, gatewayUnknown: null,
            gatewayAdmission: null, gatewaySubmission: null, agentRun: null, messages: [], gatewayReactions: {} } : {}),
        })
      }
      return persist()
    },
    gatewayInventoryRevision: () => inventoryRevisions.get(current()) ?? 0,
    syncGatewayInventory(projects, sessions = [], { complete = false } = {}) {
      const record = current()
      if (!live || !record) return false
      record.projects = projects.map(gatewayProject).filter(project => !project.archived)
      const projectIds = new Set(record.projects.map(project => project.id))
      for (const chat of Object.values(record.chats)) {
        if (!chat.gatewayProfile && !chat.gatewayRoom && typeof chat.gatewayCwd === 'string') chat.projectId = projectForDirectory(record.projects, chat.gatewayCwd)
        else if (!projectIds.has(chat.projectId)) chat.projectId = null
      }
      const byGatewayId = new Map(Object.values(record.chats).filter(chat => !chat.gatewayProfile && !chat.gatewayRoom).map(chat => [chat.gatewayStoredId, chat]))
      const listed = new Set()
      const captureStoredIds = new Set(Object.values(record.gatewayCaptureDrafts ?? {}).map(chat => chat.gatewayStoredId).filter(Boolean))
      for (const item of sessions) {
        const id = item.id ?? item.session_id
        if (id) listed.add(id)
        if (id && (id === record.newChatDraft?.gatewayStoredId || captureStoredIds.has(id))) continue
        if (!id || item.source === 'bot_room' || (!item.message_count && !item.running && !byGatewayId.has(id))) continue
        const chat = byGatewayId.get(id) ?? (record.chats[id] ??= createChat(id, item.title || '新聊天'))
        Object.assign(chat, { gatewayStoredId: id, title: item.title || chat.title, model: item.model ?? chat.model,
          gatewayUpdatedAt: item.updated_at ?? item.created_at ?? chat.gatewayUpdatedAt,
          ...(item.cwd === undefined ? {} : { gatewayCwd: item.cwd, projectId: projectForDirectory(record.projects, item.cwd) }),
          source: 'own', ...(item.archived === undefined ? {} : { archived: item.archived }) })
        if (chat.archived && record.openChats.includes(chat.id)) closeChats(chat.id, 'one')
      }
      if (complete) {
        for (const [id, chat] of byGatewayId) {
          if (id && !chat.pending && !listed.has(id)) deleteChat(chat.id)
        }
      }
      inventoryRevisions.set(record, (inventoryRevisions.get(record) ?? 0) + 1)
      return persist()
    },
    acceptGatewayPrompt(id, input, receipt) {
      const chat = getChat(id)
      if (!live || !chat || !receipt?.admission_id) return false
      const sameDraft = !input.preserveDraft && chat.draft.trim() === input.text && (!input.attachments || chat.attachments === input.attachments)
      const patch = sameDraft ? { draft: '', gatewaySubmission: null, attachments: [], attachmentDetails: {} }
        : { gatewaySubmission: null }
      return admitPrompt(id, { attachments: [], ...input, source: 'own' }, patch, receipt).ok
    },
    recoverGatewayPrompt(id, attempt, receipt, snapshot) {
      const record = current()
      const chat = getChat(id)
      if (!live || !receipt?.admission_id || !chat || chat.gatewaySubmission !== attempt || !attempt.input) return false
      const { text, attachments, attachmentDetails } = attempt.input
      const sameDraft = !attempt.input.preserveDraft && gatewayDraftFingerprint(chat.draft, chat.attachments, chat.attachmentDetails) ===
        gatewayDraftFingerprint(text, attachments, attachmentDetails)
      if (record.newChatDraft === chat) {
        record.chats[id] = chat
        delete record.newChatDraft
      }
      if (chat.gatewayCaptureKey && record.gatewayCaptureDrafts?.[chat.gatewayCaptureKey] === chat) {
        record.chats[id] = chat
        delete record.gatewayCaptureDrafts[chat.gatewayCaptureKey]
      }
      return hydrateGatewayChat(id, snapshot, {
        gatewaySubmission: null, gatewayAdmission: receipt.admission_id,
        lastInput: { ...attempt.input, runId: attempt.id, source: 'own' },
        ...(sameDraft ? { draft: '', attachments: [], attachmentDetails: {} } : {}),
      })
    },
    applyGatewayFrame(id, frame, viewed) {
      const chat = getChat(id)
      if (!live || !chat) return false
      const event = frame.params ?? {}
      if (event.seq != null && event.replay_epoch === chat.gatewayEpoch && event.seq <= (chat.gatewaySeq ?? 0)) return false
      const cursor = event.seq == null ? {} : { gatewaySeq: event.seq, gatewayEpoch: event.replay_epoch ?? chat.gatewayEpoch }
      const generation = event.execution_generation ?? event.payload?.execution_generation
      if (generation != null && (chat.gatewayGeneration == null || generation >= chat.gatewayGeneration)) cursor.gatewayGeneration = generation
      if (event.type === 'session.title') return changeChat(id, { ...cursor, title: chat.gatewayProfile ? chat.title : event.payload?.title || chat.title })
      if (generation != null && chat.gatewayGeneration != null && generation < chat.gatewayGeneration) return false
      if (event.type === 'session.info' && typeof event.payload?.cwd === 'string') {
        if (chat.gatewayCwd !== event.payload.cwd) inventoryRevisions.set(current(), (inventoryRevisions.get(current()) ?? 0) + 1)
        return changeChat(id, { ...cursor, gatewayCwd: event.payload.cwd,
          ...(!chat.gatewayProfile && !chat.gatewayRoom ? { projectId: projectForDirectory(current().projects, event.payload.cwd) } : {}) })
      }
      const desktopPatch = desktopEventPatch(chat, event.type, event.payload, viewed)
      if (desktopPatch && !chat.gatewayRoom) return changeChat(id, { ...cursor, ...desktopPatch })
      if (!chat.pending) return false
      if (event.type === 'preview.open') {
        if (chat.gatewayRoom || (event.admission_id && chat.gatewayAdmission && event.admission_id !== chat.gatewayAdmission)) return false
        const page = webPreviewReference(event.payload)
        const preview = page ?? artifactReference(event.payload)
        const patch = { ...cursor, ...projectAgentEvent(chat, { type: page ? 'web.preview' : 'file.preview', data: preview }, viewed) }
        if (page) {
          Object.assign(patch, browserPatch(chat, recordBrowserAction(browserState(chat), page)))
          if (viewed) {
            const tabId = browserTabId(chat) ?? '浏览器'
            Object.assign(patch, { tabs: insertTab(chat.tabs, tabId), tool: tabId,
              view: chat.view === 'hidden' ? 'split' : chat.view })
          }
        }
        return changeChat(id, patch)
      }
      const kind = { 'approval.request': 'approval', 'clarify.request': 'clarify' }[event.type]
      const request = kind ? gatewayRequest(kind, event.payload) : gatewayRequest(frame.method, event, frame.id)
      if (['approval.settled', 'clarify.settled'].includes(event.type) && chat.agentRun?.request?.id === event.payload?.prompt_id) {
        return changeChat(id, { ...cursor, agentRun: { ...chat.agentRun, request: null }, activity: { ...chat.activity, needsInput: false } })
      }
      if (event.type === 'message.start') return changeChat(id, cursor)
      const patch = projectAgentEvent(chat, request ?? gatewayEvent(event), viewed)
      return patch ? changeChat(id, { ...cursor, ...patch }) : false
    },
    updateNavigation(patch) {
      const record = current()
      if (!record) return false
      record.navigation = { ...record.navigation, ...patch }
      persist()
      return true
    },
    updateNavigationModule(section, patch, activate = false) {
      const record = current()
      if (!record) return false
      const navigation = record.navigation ?? {}
      const previous = navigation.modules?.[section] ?? {}
      const activeSection = activate ? section : navigation.section
      if (activeSection === navigation.section &&
        Object.entries(patch).every(([field, value]) => previous[field] === value)) return false
      record.navigation = {
        ...navigation, section: activeSection,
        modules: { ...navigation.modules, [section]: { ...previous, ...patch } },
      }
      persist()
      return true
    },
    updateManagement(patch) {
      const record = current()
      if (!record) return false
      record.management = { ...record.management, ...patch }
      persist()
      return true
    },
    setApprovalMode(mode) {
      const record = current()
      if (!record || !['manual', 'smart', 'off'].includes(mode)) return false
      record.approvalMode = mode
      persist()
      return true
    },
    updateProject(id, { name, folder, trusted }) {
      const project = current()?.projects.find(item => item.id === id)
      if (!project || !name.trim() || !folder.trim()) return false
      if (project.folder !== folder.trim()) project.trusted = false
      if (typeof trusted === 'boolean') project.trusted = trusted
      Object.assign(project, { name: name.trim(), folder: folder.trim() })
      persist()
      return true
    },
    setProjectMarker(id, marker) {
      const project = current()?.projects.find(item => item.id === id)
      if (!project || !markerDetails(marker)) return false
      project.marker = marker
      persist()
      return true
    },
    removeProject(id) {
      const record = current()
      if (!record?.projects.some(project => project.id === id)) return false
      if (Object.values(record.chats).some(chat => chat.projectId === id && chat.pending)) return false
      record.projects = record.projects.filter(project => project.id !== id)
      for (const chat of Object.values(record.chats)) if (chat.projectId === id) chat.projectId = null
      if (record.newChatDraft?.projectId === id) record.newChatDraft.projectId = null
      if (record.lastProjectId === id) delete record.lastProjectId
      persist()
      return true
    },
    saveBotEntity(kind, entity, { skills } = {}) {
      const record = current()
      if (!record || !entity?.id || !entity.name?.trim() || !['bot', 'group'].includes(kind)) return false
      const list = kind === 'bot' ? record.bots : record.groups
      const index = list.findIndex(item => item.id === entity.id)
      if (index < 0 && record.chats[entity.id]) return false
      if (kind === 'group' && index >= 0) {
        const roster = resolveGroupMembers(list[index], record.bots)
        if (entity.members && (entity.members.length !== roster.length || roster.some(id => !entity.members.includes(id)))) return false
        entity = { ...entity, members: roster }
      }
      if (kind === 'bot' && list[index]?.isDefault) entity = { ...entity, isDefault: true }
      if (kind === 'bot' && entity.appearance) entity = { ...entity, appearance: getBotAppearance(entity) }
      if (index < 0) list.push(entity)
      else list[index] = entity
      if (kind === 'bot' && skills) {
        const management = record.management ?? {}
        record.management = { ...management, skills: { ...management.skills, [entity.id]: structuredClone(skills) } }
      }
      const chat = record.chats[entity.id] ??= createChat(entity.id, entity.name)
      chat.title = entity.name
      persist()
      return true
    },
    removeBotEntity(kind, id) {
      const record = current()
      const key = kind === 'bot' ? 'bots' : kind === 'group' ? 'groups' : null
      if (!key || !record?.[key].some(item => item.id === id) || record.chats[id]?.pending) return false
      if (key === 'bots' && (record.bots.find(bot => bot.id === id)?.isDefault || record.groups.some(group => resolveGroupMembers(group, record.bots).includes(id)))) return false
      record[key] = record[key].filter(item => item.id !== id)
      const chat = record.chats[id]
      delete record.chats[id]
      const { remaining, active: activeChat } = closeTabs(record.openChats, record.activeChat, id)
      record.openChats = remaining
      record.activeChat = activeChat
      if (persist() && chat && attachmentStore) removeLocal(active, id, [...attachmentIds(chat)])
      return true
    },
    postGroupTaskResult(id, { id: runId, name, text }) {
      const record = current()
      const chat = record?.chats[id]
      if (!chat || !record.groups.some(group => group.id === id) || !runId) return false
      const messageId = 'cron:' + runId
      if (chat.messages.some(message => message.id === messageId)) return true
      return changeChat(id, { unread: true, messages: [...chat.messages,
        { id: messageId, role: 'agent', author: name, text, threadId: messageId, scheduled: true }] })
    },
    savePanelWidth(panel, width) {
      const record = current()
      if (!record || !Object.hasOwn(initialPanels, panel) || !Number.isFinite(width) || width <= 0) return
      record.preferredPanelWidths = { ...record.preferredPanelWidths, [panel]: width }
      persist()
    },
    get accountId() { return active },
    get online() { return online },
    setOnline(value) {
      online = value
      if (!online) logout()
    },
    setDraft(id, draft) {
      return changeChat(id, { draft, retryDemo: null })
    },
    fillDemoPrompt(id, prompt) {
      const chat = getChat(id)
      if (!chat || chat.pending || chat.draft.length) return false
      return changeChat(id, { draft: prompt, retryDemo: null })
    },
    updateBrowser(id, update, tabId) {
      const chat = current()?.chats[id]
      if (!chat || (tabId && (!chat.tabs.includes(tabId) || toolType(chat, tabId) !== '浏览器'))) return false
      const previous = browserState(chat, tabId ?? browserTabId(chat))
      const browser = update(previous)
      return browser !== previous && changeChat(id, browserPatch(chat, browser, tabId ?? browserTabId(chat)))
    },
    updateToolEdits(id, update, tabId) {
      const chat = current()?.chats[id]
      if (!chat || (tabId && !chat.tabs.includes(tabId))) return false
      const previous = toolEditsFor(chat, tabId)
      const patch = update({ ...toolEditDefaults, ...previous })
      if (tabId && chat.toolInstances?.[tabId]) {
        return changeChat(id, { toolInstances: { ...chat.toolInstances,
          [tabId]: { ...chat.toolInstances[tabId], toolEdits: { ...previous, ...patch } } } })
      }
      return changeChat(id, { toolEdits: { ...chat.toolEdits, ...patch } })
    },
    addProject(name, folders, { trusted = false, marker } = {}) {
      const record = current()
      const paths = Array.isArray(folders) ? folders : [folders]
      const [folder, ...additional] = [...new Set(paths.map(path => path?.trim()).filter(Boolean))]
      if (!record || !name.trim() || !folder || (marker != null && !markerDetails(marker))) return null
      const project = { id: crypto.randomUUID(), name: name.trim(), folder, trusted,
        marker: marker ?? randomProjectMarker(record.projects) }
      record.projects.push(project)
      if (additional.length) {
        const management = record.management ?? {}
        record.management = { ...management, projectFolders: { ...management.projectFolders, [project.id]: additional } }
      }
      persist()
      return project
    },
    openGatewayCaptureDraft(key, projectId) {
      const record = current()
      if (!live || !record || typeof key !== 'string' || !key) return null
      const captures = record.gatewayCaptureDrafts ??= Object.create(null)
      if (Object.hasOwn(captures, key)) return captures[key]
      const chat = createChat(crypto.randomUUID(), '新聊天', projectId)
      chat.gatewayCaptureKey = key
      record.gatewayCaptureDrafts = { ...captures, [key]: chat }
      persist()
      return chat
    },
    openChatDraft(projectId) {
      const record = current()
      if (!record) return null
      const previous = record.newChatDraft
      if (previous && projectId === undefined) return previous
      const recent = record.navigation?.modules?.projects?.chatId ?? record.activeChat
      const candidate = projectId === undefined ? record.lastProjectId ?? record.chats[recent]?.projectId : projectId
      const target = record.projects.some(project => project.id === candidate) ? candidate : null
      const draft = previous ?? createChat(crypto.randomUUID(), '新聊天')
      draft.projectId = target
      record.newChatDraft = draft
      persist()
      return draft
    },
    newChat(projectId) {
      const record = current()
      if (!record) return null
      const chat = createChat(crypto.randomUUID(), '新聊天', projectId)
      record.chats[chat.id] = chat
      persist()
      return chat
    },
    openChat(id, after) {
      const record = current()
      if (!record || !Object.hasOwn(record.chats, id)) return false
      record.openChats = insertTab(record.openChats, id, after)
      record.activeChat = id
      record.chats[id].unread = false
      if (record.chats[id].projectId) record.lastProjectId = record.chats[id].projectId
      persist()
      return true
    },
    closeChats, deleteChat,
    renameChat(id, title) {
      return !!title.trim() && changeChat(id, { title: title.trim() })
    },
    openTool(id, tool, after, { reveal = true, newInstance = false } = {}) {
      const chat = current()?.chats[id]
      const type = toolType(chat, tool)
      if (!chat || !type) return false
      const multiple = ['浏览器', '终端'].includes(type)
      let tabId = tool
      let toolInstances = chat.toolInstances
      if (newInstance && multiple) {
        tabId = type + ':' + crypto.randomUUID()
        toolInstances = { ...toolInstances, [tabId]: { type } }
      } else if (tool === '浏览器') {
        tabId = browserTabId(chat) ?? tool
      } else if (tool === '终端') {
        tabId = (toolType(chat, chat.tool) === type ? chat.tool : chat.tabs.findLast(id => toolType(chat, id) === type)) ?? tool
      } else if (!tools.includes(tool) && !chat.tabs.includes(tool)) return false
      const tabs = insertTab(chat.tabs, tabId, after)
      return changeChat(id, { tabs, tool: tabId, ...(toolInstances ? { toolInstances } : {}),
        view: reveal && chat.view === 'hidden' ? 'split' : chat.view })
    },
    selectTool(id, tabId) {
      const chat = current()?.chats[id]
      if (!chat?.tabs.includes(tabId) || !toolType(chat, tabId)) return false
      return changeChat(id, { tool: tabId, view: chat.view === 'hidden' ? 'split' : chat.view })
    },
    closeTools(id, target, strategy) {
      const chat = current()?.chats[id]
      if (!chat) return false
      const { remaining, active } = closeTabs(chat.tabs, chat.tool, target, strategy)
      const toolTitles = Object.fromEntries(Object.entries(chat.toolTitles ?? {}).filter(([tool]) => remaining.includes(tool)))
      const toolInstances = Object.fromEntries(Object.entries(chat.toolInstances ?? {}).filter(([id]) => remaining.includes(id)))
      return changeChat(id, { tabs: remaining, tool: active, view: remaining.length ? chat.view : 'hidden', toolTitles, toolInstances })
    },
    renameTool(id, tool, title) {
      const chat = current()?.chats[id]
      if (!chat?.tabs.includes(tool) || !title.trim()) return false
      return changeChat(id, { toolTitles: { ...chat.toolTitles, [tool]: title.trim() } })
    },
    send(id, runId) {
      const chat = getChat(id)
      return admitPrompt(id, chat && draftInput(chat, runId), { draft: '', retryDemo: null, attachments: [], attachmentDetails: {}, groupReply: null })
    },
    setGroupReply(id, messageId) {
      if (!current()?.groups.some(group => group.id === id)) return false
      if (messageId == null) return changeChat(id, { groupReply: null })
      const message = getChat(id)?.messages.find(item => item.id === messageId)
      if (!message?.threadId || !message.text) return false
      return changeChat(id, { groupReply: { threadId: message.threadId, messageId, memberId: message.memberId,
        author: message.author ?? (message.role === 'user' ? '你' : '协作汇总'),
        text: message.text.trim().slice(0, 160) } })
    },
    retryGroupPrompt(id, failedRunId, runId) {
      const chat = getChat(id)
      const input = chat?.lastInput
      const outcome = chat?.messages.findLast(message => message.id === failedRunId + ':outcome')
      if (!current()?.groups.some(group => group.id === id) || chat?.pending || input?.runId !== failedRunId ||
        outcome?.status !== 'error' || !outcome.recoverable) return false
      return changeChat(id, { pending: runId, agentRun: null, lastInput: { ...input, runId, retryDemo: true },
        activity: { ...chat.activity, needsInput: false } })
    },
    queuePrompt(id, runId) {
      const chat = current()?.chats[id]
      if (!chat || !hasPromptContent({ text: chat.draft, attachments: chat.attachments })) return false
      return changeChat(id, { queue: [...(chat.queue ?? []), draftInput(chat, runId, true)], draft: '', retryDemo: null, attachments: [], attachmentDetails: {}, groupReply: null })
    },
    updateQueuedPrompt(id, runId, text) {
      const chat = current()?.chats[id]
      if (!chat?.queue?.some(item => item.runId === runId)) return false
      const queue = text == null ? chat.queue.filter(item => item.runId !== runId)
        : chat.queue.map(item => item.runId === runId ? { ...item, text: text.trim() || item.text } : item)
      return changeChat(id, { queue, activity: { ...chat.activity, queuePaused: queue.length ? chat.activity?.queuePaused : false } })
    },
    pausePromptQueue(id, queuePaused) {
      const chat = current()?.chats[id]
      return Boolean(chat?.queue?.length) && changeChat(id, { activity: { ...chat.activity, queuePaused } })
    },
    startQueuedPrompt(id) {
      const chat = current()?.chats[id]
      if (!chat?.queue?.length || chat.activity?.queuePaused) return { ok: false, reason: 'unavailable' }
      const [input, ...queue] = chat.queue
      const result = admitPrompt(id, input, { queue })
      return result.ok ? { ...result, runId: input.runId } : result
    },
    applyAgentEvent(id, runId, frame, viewed) {
      const chat = current()?.chats[id]
      if (!chat || chat.pending !== runId) return false
      const patch = projectAgentEvent(chat, frame, viewed)
      if (frame.type === 'preview.open') {
        Object.assign(patch, browserPatch(chat, recordBrowserAction(browserState(chat), frame.data)))
      }
      return patch ? changeChat(id, patch) : false
    },
    recoverOrphanedAgentRuns() {
      if (live) return false
      const record = current()
      if (!record) return false
      const orphans = Object.values(record.chats).filter(chat =>
        chat.pending && !agent.hasRun(chat.id, chat.pending))
      if (!orphans.length) return false
      orphans.forEach(resetRun)
      persist()
      return true
    },
    resolveAgentRequest(id, requestId) {
      const chat = current()?.chats[id]
      if (!chat || chat.agentRun?.request?.id !== requestId) return false
      return changeChat(id, { agentRun: { ...chat.agentRun, request: null }, activity: { ...chat.activity, needsInput: false } })
    },
    finish(id, runId, text, viewed = current()?.activeChat === id) {
      const chat = current()?.chats[id]
      if (!chat || chat.pending !== runId) return false
      return changeChat(id, {
        pending: null, unread: !viewed, messages: [...chat.messages, { role: 'agent', text }],
      })
    },
    toggle(kind, id) {
      const record = current()
      if (!record) return false
      const entry = (kind === 'task' ? record.tasks : record.connectors).find(item => item.id === id)
      if (!entry) return false
      entry.enabled = !entry.enabled
      persist()
      return true
    },
    trigger(kind, id, runId) {
      const record = current()
      if (!record) return { ok: false, reason: 'locked' }
      const entry = (kind === 'task' ? record.tasks : record.connectors).find(item => item.id === id)
      if (!entry?.enabled) return { ok: false, reason: 'paused' }
      const result = charge({ id: runId, kind: entry.name, source: 'managed', amount: 8 })
      if (result.charged) {
        entry.runs += 1
        persist()
      }
      return result
    },
    addAsset(name) {
      const record = current()
      if (!record) return false
      record.assets.unshift(name)
      persist()
      return true
    },
  }
}
