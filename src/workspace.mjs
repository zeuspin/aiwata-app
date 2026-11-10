import { markerColors, markerDetails } from './conversation-meta.mjs'
import { getBotAppearance } from './bot-appearance.mjs'
import { accounts, createChat, seedAccount, tools } from './fixtures.mjs'
import { closeTabs, conversationSection, insertTab } from './tabs.mjs'
import { createMockAgent, projectAgentEvent } from './agent-session.mjs'
import { resolveGroupMembers } from './management.mjs'
import { emptyBrowserState, recordBrowserAction, toolEditDefaults } from './tool-surfaces.mjs'
import { attachmentIds, hasPromptContent, isLocalAttachment } from './local-attachments.mjs'
import { attachmentSizeLimit, models } from './composer.mjs'

export const railWidth = 50
export const contextBreakpoint = 880
export const initialPanels = { side: 322, tools: 494 }

const chatMinimum = 290
const sideMinimum = 200
const toolMinimum = 260
const storageKey = 'aiwata-ui-prototype:v1:accounts'

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

export function minSidebarWidth(width, split) {
  const available = width - railWidth - (split ? toolMinimum : 0)
  return Math.min(sideMinimum, Math.floor(available * .45))
}

export function minToolWidth(width) {
  return Math.min(toolMinimum, Math.floor((width - railWidth) / 2))
}

export function fitPanels(saved, width, sidebar, split) {
  const maxPanels = width - railWidth - chatMinimum
  const side = sidebar ? clamp(saved.side, minSidebarWidth(width, split), maxPanels - (split ? toolMinimum : 0)) : 0
  const toolsWidth = split ? clamp(saved.tools, minToolWidth(width), maxPanels - side) : 0
  return { side, tools: toolsWidth }
}

export function resizePanels(start, width, edge, delta, sidebar, split = true) {
  const maxPanels = width - railWidth - chatMinimum
  if (edge === 'left') {
    return { ...start, side: clamp(start.side + delta, minSidebarWidth(width, split), Math.min(520, maxPanels - (split ? start.tools : 0))) }
  }
  return { ...start, tools: clamp(start.tools - delta, minToolWidth(width), maxPanels - (sidebar ? start.side : 0)) }
}

export function viewAtWidth(view, width, sidebar) {
  return view === 'split' && sidebar && width < contextBreakpoint ? 'replace' : view
}

function defaultProjectMarker(projects) {
  const usedColors = new Set(projects.filter(project => project.marker?.kind === 'color').map(project => project.marker.value))
  const [value] = markerColors.find(([color]) => !usedColors.has(color)) ?? markerColors[projects.length % markerColors.length]
  return { kind: 'color', value }
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

export function moveChatToProject(workspace, id, projectId) {
  const record = workspace.current()
  const chat = record?.chats[id]
  if (!chat || chat.pending || conversationSection(record, id) !== 'projects') return false
  if (!chatMoveTargets(record, chat).some(project => project.id === projectId)) return false
  return workspace.changeChat(id, { projectId })
}

export function createWorkspace(storage, attachmentStore) {
  const agent = createMockAgent()
  let records = {}
  try {
    records = JSON.parse(storage?.getItem(storageKey) || '{}') || {}
  } catch {
    records = {}
  }
  let active = null
  let online = true
  let loginVersion = 0

  function persist() {
    try {
      storage?.setItem(storageKey, JSON.stringify(records))
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
    return record?.chats[id] ?? (draft?.id === id ? draft : undefined)
  }

  function changeChat(id, patch) {
    const chat = getChat(id)
    if (!chat) return false
    const prior = attachmentStore && ['attachmentDetails', 'queue', 'messages', 'lastInput'].some(key => Object.hasOwn(patch, key))
      ? attachmentIds(chat) : null
    Object.assign(chat, patch)
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

  async function readLocalAttachment(id, blobId) {
    const account = active
    const version = loginVersion
    if (!getChat(id) || !blobId || !attachmentStore) return null
    const file = await attachmentStore.read(account, id, blobId)
    return version === loginVersion && getChat(id) ? file ?? null : null
  }

  function logout() {
    const record = current()
    if (record) {
      agent.dispose()
      for (const chat of Object.values(record.chats)) resetRun(chat)
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
    const record = records[id] ??= seedAccount(id)
    for (const project of record.projects) {
      if (!markerDetails(project.marker)) project.marker = defaultProjectMarker(record.projects)
    }
    for (const group of record.groups) {
      if (!Array.isArray(group.members)) group.members = resolveGroupMembers(group, record.bots)
    }
    const chats = Object.values(record.chats)
    for (const chat of chats) resetRun(chat)
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

  function admitPrompt(id, input, patch) {
    const record = current()
    const chat = getChat(id)
    if (!chat || !input || !hasPromptContent(input) || chat.pending) return { ok: false, reason: 'unavailable' }
    const result = charge({ id: input.runId, kind: 'Agent 会话', source: input.source, amount: 12 }, false)
    if (!result.ok) return result
    if (record.newChatDraft === chat) {
      record.chats[id] = chat
      delete record.newChatDraft
    }
    changeChat(id, {
      ...patch, pending: input.runId, agentRun: null, lastInput: input,
      activity: { ...chat.activity, needsInput: false },
      title: chat.title === '新聊天' ? (input.text || input.attachments[0]).slice(0, 24) : chat.title,
      messages: [...chat.messages, { role: 'user', text: input.text, attachments: input.attachments, attachmentDetails: input.attachmentDetails,
        ...(input.threadId ? { id: input.runId, threadId: input.threadId, reply: input.reply } : {}) }],
    })
    return result
  }

  return {
    login, logout, current, getChat, charge, changeChat, agent, addLocalAttachments, readLocalAttachment,
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
      if (key === 'bots' && record.groups.some(group => resolveGroupMembers(group, record.bots).includes(id))) return false
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
    updateBrowser(id, update) {
      const chat = current()?.chats[id]
      if (!chat) return false
      const previous = chat.browser ?? emptyBrowserState
      const browser = update(previous)
      return browser !== previous && changeChat(id, { browser })
    },
    updateToolEdits(id, update) {
      const chat = current()?.chats[id]
      if (!chat) return false
      const patch = update({ ...toolEditDefaults, ...chat.toolEdits })
      return changeChat(id, { toolEdits: { ...chat.toolEdits, ...patch } })
    },
    addProject(name, folders, { trusted = false, marker } = {}) {
      const record = current()
      const paths = Array.isArray(folders) ? folders : [folders]
      const [folder, ...additional] = [...new Set(paths.map(path => path?.trim()).filter(Boolean))]
      if (!record || !name.trim() || !folder || (marker != null && !markerDetails(marker))) return null
      const project = { id: crypto.randomUUID(), name: name.trim(), folder, trusted,
        marker: marker ?? defaultProjectMarker(record.projects) }
      record.projects.push(project)
      if (additional.length) {
        const management = record.management ?? {}
        record.management = { ...management, projectFolders: { ...management.projectFolders, [project.id]: additional } }
      }
      persist()
      return project
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
    closeChats(id, strategy) {
      const record = current()
      if (!record) return false
      const { remaining, active } = closeTabs(record.openChats, record.activeChat, id, strategy)
      record.openChats = remaining
      record.activeChat = active
      persist()
      return true
    },
    deleteChat(id) {
      const record = current()
      if (!record || !Object.hasOwn(record.chats, id) || conversationSection(record, id) !== 'projects') return false
      const { remaining, active: activeChat } = closeTabs(record.openChats, record.activeChat, id)
      const chat = record.chats[id]
      delete record.chats[id]
      record.openChats = remaining
      record.activeChat = activeChat
      if (persist() && attachmentStore) removeLocal(active, id, [...attachmentIds(chat)])
      return true
    },
    renameChat(id, title) {
      return !!title.trim() && changeChat(id, { title: title.trim() })
    },
    openTool(id, tool, after, { reveal = true } = {}) {
      const chat = current()?.chats[id]
      if (!chat || !tools.includes(tool)) return false
      const tabs = insertTab(chat.tabs, tool, after)
      return changeChat(id, { tabs, tool, view: reveal && chat.view === 'hidden' ? 'split' : chat.view })
    },
    closeTools(id, target, strategy) {
      const chat = current()?.chats[id]
      if (!chat) return false
      const { remaining, active } = closeTabs(chat.tabs, chat.tool, target, strategy)
      const toolTitles = Object.fromEntries(Object.entries(chat.toolTitles ?? {}).filter(([tool]) => remaining.includes(tool)))
      return changeChat(id, { tabs: remaining, tool: active, view: remaining.length ? chat.view : 'hidden', toolTitles })
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
        patch.browser = recordBrowserAction(chat.browser ?? emptyBrowserState, frame.data)
      }
      return patch ? changeChat(id, patch) : false
    },
    recoverOrphanedAgentRuns() {
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
