import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Composer } from './chat.jsx'
import { AgentQueue, AgentRequest, Transcript } from './agent-transcript.jsx'
import { AttachmentPreview } from './attachment-preview.jsx'
import { hasPromptContent } from './local-attachments.mjs'
import { MarkerDialog } from './conversation-meta.jsx'
import { tools } from './fixtures.mjs'
import { Icon, IconButton, toolIcons } from './icons.jsx'
import { Management } from './management.jsx'
import { managedSections, resolveGroupMembers } from './management.mjs'
import { ContextList, Rail, contextItems } from './navigation.jsx'
import { Directory, emptyToolData, ProjectDialog, ToolPanel } from './surfaces.jsx'
import { ContextMenu, menuPosition, TabDialog, TabStrip } from './tab-controls.jsx'
import { conversationSection } from './tabs.mjs'
import { navigateBrowser, toolEditDefaults } from './tool-surfaces.mjs'
import { chatMoveTargets, contextBreakpoint, fitPanels, initialPanels, minSidebarWidth, minToolWidth, moveChatToProject, railWidth, resizePanels, setChatArchived, setProjectChatMarker, viewAtWidth } from './workspace.mjs'

const chatSections = ['projects', 'bots']
const nextMode = { hidden: 'split', split: 'full', full: 'hidden' }

function lastChatInSection(record, section) {
  if (!chatSections.includes(section)) return null
  const saved = record.navigation?.modules?.[section]?.chatId
  if (saved && record.openChats.includes(saved) && conversationSection(record, saved) === section) return saved
  const active = record.activeChat
  if (active && conversationSection(record, active) === section) return active
  return record.openChats.findLast(id => conversationSection(record, id) === section) ?? null
}

function restoreRoute(record, section) {
  const savedItem = record.navigation?.modules?.[section]?.item
  return {
    section, chatId: lastChatInSection(record, section),
    item: savedItem && contextItems(record, section).some(([id]) => id === savedItem) ? savedItem : null,
  }
}

function ModulePage({ managed, scrollTop = 0, onScrollChange, children }) {
  const page = useRef(null)
  const restoredTop = useRef(null)

  useLayoutEffect(() => {
    page.current.scrollTop = scrollTop
    restoredTop.current = page.current.scrollTop
  }, [scrollTop])

  return <main className={managed ? 'directory management' : 'directory'} ref={page} onScroll={event => {
    const top = event.currentTarget.scrollTop
    if (top === restoredTop.current) return
    restoredTop.current = null
    onScrollChange(top)
  }}>{children}</main>
}

function exportConversation(session) {
  const content = JSON.stringify({
    exported_at: new Date().toISOString(),
    session_id: session.id,
    title: session.title,
    message_count: session.messages.length,
    messages: session.messages,
  }, null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  const safeTitle = session.title.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  link.download = (safeTitle || 'session') + '-' + session.id.slice(0, 8) + '.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function Workbench({ account, api, refresh, onOffline }) {
  const record = api.current()
  const [viewport, setViewport] = useState(window.innerWidth)
  const [{ section, chatId, item }, setRoute] = useState(() => {
    const section = record.navigation?.section ?? conversationSection(record, record.activeChat)
    return restoreRoute(record, section)
  })
  const isChat = chatSections.includes(section)
  const isManaged = managedSections.has(section)
  const pageState = record.navigation?.modules?.[section]
  const chat = isChat ? record.chats[chatId] : null
  const project = record.projects.find(entry => entry.id === chat?.projectId)
  const [panels, setPanels] = useState(() => ({ ...initialPanels, ...record.preferredPanelWidths }))
  const [dragging, setDragging] = useState(false)
  const [menu, setMenu] = useState('')
  const [contextAction, setContextAction] = useState(null)
  const [tabDialog, setTabDialog] = useState(null)
  const [transcriptVersion, setTranscriptVersion] = useState(0)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState(null)
  const [toolsByChat, setToolsByChat] = useState({})
  const [preview, setPreview] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState(null)
  const preparingPrompts = useRef(new Set())
  const toastTimer = useRef(null)
  const previewTimer = useRef(null)
  const toolInsertAfter = useRef(null)
  const { agent } = api
  const viewedChat = useRef(chat?.id)
  const drag = useRef(null)
  const projectTrigger = useRef(null)

  const narrow = viewport < contextBreakpoint
  const toolView = chat?.tool ? chat.view : 'hidden'
  const sidebar = record.navigation?.sidebarOpen ?? !narrow
  const view = viewAtWidth(toolView, viewport, sidebar)
  const full = view === 'full'
  const split = view === 'split'
  const replacesChat = view === 'replace'
  const contextVisible = !full && sidebar
  const fitted = fitPanels(panels, viewport, contextVisible, split)
  const toolsWidth = replacesChat ? viewport - railWidth - fitted.side : fitted.tools
  const visibleTools = view !== 'hidden'
  const toolData = {
    ...emptyToolData, ...toolsByChat[chatId], ...toolEditDefaults, ...chat?.toolEdits,
    artifacts: chat?.artifacts ?? emptyToolData.artifacts,
  }
  const updateToolData = useCallback(update => {
    setToolsByChat(previous => ({
      ...previous,
      [chatId]: update({ ...emptyToolData, ...previous[chatId] }),
    }))
  }, [chatId])
  const style = {
    '--rail-size': (full ? 0 : railWidth) + 'px',
    '--context-size': fitted.side + 'px',
    '--tool-size': toolsWidth + 'px',
    '--sidebar-content': (contextVisible ? fitted.side : panels.side) + 'px',
  }

  useEffect(() => {
    function resize() {
      setViewport(window.innerWidth)
    }
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      clearTimeout(toastTimer.current)
      clearTimeout(previewTimer.current)
      preparingPrompts.current.clear()
    }
  }, [])

  useEffect(() => {
    if (api.recoverOrphanedAgentRuns()) refresh()
  }, [api, refresh])

  function clearPreview() {
    clearTimeout(previewTimer.current)
    setPreview(null)
  }

  function previewTab(event, tool) {
    const tab = event.currentTarget.getBoundingClientRect()
    const leftBound = full ? 8 : viewport - toolsWidth + 6
    const left = Math.max(leftBound, Math.min(tab.left, viewport - 226))
    clearPreview()
    previewTimer.current = setTimeout(() => setPreview({ tool, left, chatId }), 350)
  }

  function report(message, error = false) {
    clearTimeout(toastTimer.current)
    setToast({ message, error })
    toastTimer.current = setTimeout(() => setToast(null), 3100)
  }

  function go(route) {
    const isChatRoute = chatSections.includes(route.section)
    viewedChat.current = isChatRoute ? route.chatId : null
    api.updateNavigationModule(route.section, isChatRoute ? { chatId: route.chatId } : { item: route.item }, true)
    setRoute(route)
    setMenu('')
    setContextAction(null)
    setAttachmentPreview(null)
    clearPreview()
  }

  function updateMainPage(patch, render = true) {
    if (api.current() === record && api.updateNavigationModule(section, patch) && render) refresh()
  }

  function setGroupOpen(group, open) {
    const openGroups = record.navigation?.modules?.[section]?.openGroups
    updateMainPage({ openGroups: { ...openGroups, [group]: open } })
  }

  function select(id, targetSection = conversationSection(record, id)) {
    if (id) api.openChat(id)
    go({ section: targetSection, chatId: id, item: null })
  }

  function navigate(target) {
    if (!chatSections.includes(target)) return go(restoreRoute(record, target))
    if (target === section && chat) return select(chat.id, target)
    select(lastChatInSection(record, target), target)
  }

  function newChat(projectId) {
    const created = api.newChat(projectId ?? null)
    if (created) select(created.id, 'projects')
  }

  function openTool(tool, after) {
    if (!chat) return
    api.openTool(chat.id, tool, after)
    toolInsertAfter.current = null
    setMenu('')
    clearPreview()
    refresh()
  }

  function closeToolTabs(id, strategy) {
    api.closeTools(chat.id, id, strategy)
    clearPreview()
    refresh()
  }

  function reconcileChatRoute() {
    if (chatId && !record.openChats.includes(chatId)) {
      const next = record.activeChat
      select(next, next ? conversationSection(record, next) : section)
    }
    refresh()
  }

  function closeChatTabs(id, strategy) {
    api.closeChats(id, strategy)
    reconcileChatRoute()
  }

  function openContext(event, kind, id) {
    const position = menuPosition(event)
    const label = kind === 'tool' ? '工具标签操作' : kind === 'chat' ? '会话标签操作' : '会话操作'
    clearPreview()
    setMenu('')
    setContextAction({ ...position, kind, id, label })
  }

  function dismissContext(restore) {
    if (restore) contextAction?.anchor.focus()
    setContextAction(null)
  }

  function openToolPicker(after = null) {
    clearPreview()
    toolInsertAfter.current = after
    setMenu(menu === 'tools' ? '' : 'tools')
  }

  function menuGroups() {
    const { kind, id, anchor } = contextAction
    const tool = kind === 'tool'
    const sidebar = kind === 'sidebar'
    const session = tool ? null : record.chats[id]
    const title = tool ? chat.toolTitles?.[id] ?? id : session.title
    const ordinary = session && conversationSection(record, id) === 'projects'
    const currentTabs = tool ? chat.tabs : record.openChats
    const runClose = tool ? closeToolTabs : closeChatTabs
    const closeActions = sidebar ? [] : [
      { label: '关闭', strategy: 'one' },
      { label: '关闭其他标签页', strategy: 'others', disabled: currentTabs.length <= 1 },
      { label: '关闭右侧标签页', strategy: 'right', disabled: currentTabs.at(-1) === id },
      { label: '关闭所有标签页', strategy: 'all' },
    ].map(item => ({ ...item, icon: 'close', run: () => runClose(id, item.strategy) }))

    if (tool) return [
      [{
        label: '在右侧打开新标签页', icon: 'add', disabled: chat.tabs.length === tools.length,
        run: () => openToolPicker(id),
      }, {
        label: '重命名', icon: 'edit',
        run: () => setTabDialog({ kind: 'rename-tool', id, title, anchor }),
      }],
      closeActions,
    ]

    const targets = ordinary ? chatMoveTargets(record, session) : []
    return [
      sidebar && !record.openChats.includes(id)
        ? [{ label: '在新标签页中打开', icon: 'add', run: () => select(id) }] : [],
      [
        ...(ordinary ? [{
          label: '重命名', icon: 'edit',
          run: () => setTabDialog({ kind: 'rename-chat', id, title, anchor }),
        }] : []),
        {
          label: session.unread ? '标记为已读' : '标记为未读', icon: 'mail',
          run: () => { api.changeChat(id, { unread: !session.unread }); refresh() },
        },
        ...(session.projectId ? [{
          label: '外观…', icon: 'tag',
          run: () => setTabDialog({ kind: 'marker', id, title, anchor }),
        }] : []),
      ],
      [
        { label: '导出', icon: 'download', run: () => exportConversation(session) },
        ...(ordinary ? [{
          label: '移动到项目…', icon: 'folder', disabled: !targets.length || Boolean(session.pending),
          run: () => setTabDialog({ kind: 'move', id, title, anchor, targets }),
        }] : []),
      ],
      sidebar ? [] : [{
        label: '重新加载', icon: 'refresh',
        run: () => { select(id); setTranscriptVersion(version => version + 1) },
      }, ...closeActions],
      ordinary ? [{
        label: session.archived ? '取消归档' : '归档', icon: 'archive',
        run: () => {
          const archived = !session.archived
          if (!setChatArchived(api, id, archived)) return
          reconcileChatRoute()
          report(archived ? '会话已归档' : '会话已恢复')
        },
      }, {
        label: '删除会话', icon: 'trash', danger: true,
        run: () => setTabDialog({ kind: 'delete', id, title, anchor }),
      }] : [],
    ]
  }

  function closeTabDialog() {
    const anchor = tabDialog.anchor
    setTabDialog(null)
    requestAnimationFrame(() => {
      if (anchor.isConnected) anchor.focus()
      else document.querySelector('.session-tabs [aria-selected="true"], .new-chat')?.focus()
    })
  }

  function applyTabDialog(value) {
    const { kind, id } = tabDialog
    if (kind === 'move') {
      if (!moveChatToProject(api, id, value)) return false
      closeTabDialog()
      refresh()
      report('已移动到 ' + record.projects.find(project => project.id === value).name)
      return true
    }
    if (kind === 'marker') {
      if (!setProjectChatMarker(api, id, value)) return false
      closeTabDialog()
      refresh()
      report(value ? '标记已保存' : '标记已清除')
      return true
    }
    closeTabDialog()
    if (kind === 'delete') {
      if (!api.deleteChat(id)) return
      agent.discard(id)
      setToolsByChat(previous => {
        const { [id]: removed, ...rest } = previous
        return rest
      })
      reconcileChatRoute()
      report('会话已删除')
      return
    }
    if (kind === 'rename-tool') api.renameTool(chat.id, id, value)
    else api.renameChat(id, value)
    refresh()
  }

  function setView(mode) {
    if (!chat) return
    if (mode !== 'hidden' && !chat.tool) api.openTool(chat.id, '浏览器', undefined, { reveal: false })
    api.changeChat(chat.id, { view: mode })
    clearPreview()
    refresh()
  }

  function toggleSidebar() {
    if (full) setView('split')
    api.updateNavigation({ sidebarOpen: !contextVisible })
    refresh()
  }

  function toggleProject(projectId) {
    const collapsed = record.navigation?.collapsedProjects ?? []
    const collapsedProjects = collapsed.includes(projectId)
      ? collapsed.filter(id => id !== projectId)
      : [...collapsed, projectId]
    api.updateNavigation({ collapsedProjects })
    refresh()
  }

  function startProject() {
    projectTrigger.current = document.activeElement
    setCreating(true)
  }

  function manage(section, item = null) {
    go({ section, chatId: null, item })
  }

  function closeProject() {
    setCreating(false)
    requestAnimationFrame(() => projectTrigger.current?.focus())
  }

  function revealBrowser(id) {
    if (viewedChat.current !== id) return
    api.openTool(id, '浏览器')
  }

  function openPreview(id, data) {
    api.updateBrowser(id, previous => navigateBrowser(previous, data.url))
    revealBrowser(id)
    refresh()
  }

  function runPrompt(id, runId, attachments) {
    const current = api.current()
    const session = current.chats[id]
    const group = current.groups.find(item => item.id === id)
    const text = session.lastInput.text
    const roster = resolveGroupMembers(group, current.bots).map(member => current.bots.find(bot => bot.id === member))
    const mentioned = roster.filter(bot => text.includes('@' + bot.name) || (bot.profile && text.includes('@' + bot.profile)))
    const lead = roster.find(bot => bot.id === group?.lead)
    const routing = group?.routing ?? 'everyone'
    const participants = mentioned.length ? mentioned : routing === 'lead' && lead ? [lead]
      : routing === 'everyone' ? roster : roster.slice(0, 1)
    const params = group
      ? { room_id: id, event_id: runId, payload: { thread_id: runId, text, attachments } }
      : { session_id: id, text, attachments, queued: session.lastInput.queued }
    agent.request(group ? 'groups.send' : 'prompt.submit', params, {
      turnId: runId, members: participants.map(bot => bot.name), approvalMode: current.approvalMode ?? 'smart',
      retryDemo: session.lastInput.retryDemo,
      onEvent: frame => {
        if (api.accountId !== account.id) return
        if (!api.applyAgentEvent(id, runId, frame, viewedChat.current === id)) return
        if (frame.type === 'preview.open') revealBrowser(id)
        if (frame.type === 'message.complete' && frame.data.status === 'complete') startQueue(id)
        refresh()
      },
    })
  }

  async function startPrompt(id, queued) {
    const session = record.chats[id]
    const input = queued ? session?.queue?.[0] : session
    const preparing = preparingPrompts.current
    if (!input || session.pending || (queued && session.activity?.queuePaused) || preparing.has(id)) return
    preparing.add(id)
    const { draft, source, attachments: names, attachmentDetails: details } = input
    const active = () => preparing.has(id) && api.current() === record && record.chats[id] === session
    const isCurrent = () => active() && (queued
      ? session.queue?.[0] === input && !session.activity?.queuePaused
      : session.draft === draft && session.source === source && session.attachments === names && session.attachmentDetails === details)
    let files
    try {
      const entries = names.filter(name => Object.hasOwn(details ?? {}, name)).map(name => details[name])
      files = await Promise.all(entries.filter(entry => entry?.blobId).map(async entry => {
        const blob = await api.readLocalAttachment(id, entry.blobId)
        if (!blob) throw new Error('Attachment unavailable')
        return { name: entry.name, blob }
      }))
    } catch {
      if (isCurrent()) {
        if (queued) api.pausePromptQueue(id, true)
        report(queued ? '无法读取本地附件 · 队列已暂停' : '无法读取本地附件，草稿已保留', true)
      }
    }
    const ready = files && isCurrent()
    const queueChanged = queued && active() && session.queue?.[0] !== input
    preparing.delete(id)
    if (queueChanged) startQueue(id)
    if (!ready) return
    const runId = queued ? input.runId : crypto.randomUUID()
    const result = queued ? api.startQueuedPrompt(id) : api.send(id, runId)
    if (result.ok) runPrompt(id, runId, files)
    else if (result.reason === 'insufficient') {
      if (queued) api.pausePromptQueue(id, true)
      report(queued ? '积分不足 · 队列已暂停' : '积分不足 · 托管会话需要 12 积分', true)
    }
    refresh()
  }

  function startQueue(id) {
    void startPrompt(id, true)
  }

  function send() {
    if (chat.pending || chat.queue?.length) {
      if (api.queuePrompt(chat.id, crypto.randomUUID())) refresh()
      if (!chat.pending && !chat.activity?.queuePaused) startQueue(chat.id)
      return
    }
    void startPrompt(chat.id, false)
  }

  function stop() {
    if (agent.request('session.interrupt', { session_id: chat.id }).status === 'interrupted') report('已停止生成')
    else if (api.recoverOrphanedAgentRuns()) {
      refresh()
      report('已结束中断的模拟运行')
    }
  }

  function respondAgent(request, value) {
    const resolved = request.method === 'approval'
      ? agent.request('approval.respond', { session_id: chat.id, request_id: request.id, choice: value }).resolved
      : agent.respond(chat.id, request.id, value)
    if (resolved) {
      api.resolveAgentRequest(chat.id, request.id)
      refresh()
    } else if (api.recoverOrphanedAgentRuns()) refresh()
  }

  function fillScenario(prompt) {
    if (api.fillDemoPrompt(chat.id, prompt)) refresh()
    else if (chat.draft.length) report('已保留草稿 · 清空输入后可填入演示示例')
  }

  function updateQueue(runId, text) {
    if (api.updateQueuedPrompt(chat.id, runId, text)) refresh()
  }

  function resumeQueue() {
    api.pausePromptQueue(chat.id, false)
    startQueue(chat.id)
  }

  function retryTurn() {
    const input = chat.lastInput
    if (!input || chat.pending || hasPromptContent({ text: chat.draft, attachments: chat.attachments })) return
    api.changeChat(chat.id, {
      draft: input.text, retryDemo: input.text,
      attachments: input.attachments ?? [], attachmentDetails: input.attachmentDetails ?? {},
    })
    refresh()
  }

  function onCommand(name, arg = '') {
    if (name === 'new') newChat(chat?.projectId)
    else if (name === 'title' && arg.trim()) { api.renameChat(chat.id, arg); refresh() }
    else if (name === 'journey') navigate('memory')
    else if (name === 'skills') navigate('skills')
    else if (name === 'cron') navigate('tasks')
    else if (name === 'tools') { setView('split'); openToolPicker() }
    else if (name === 'status') report(chat.pending ? '会话正在执行' : '会话空闲')
    else if (name === 'compact') report('已模拟请求压缩上下文')
    else if (name === 'resume' && record.chats[arg.trim()]) select(arg.trim())
    else return false
    return true
  }

  function logout() {
    api.logout()
    refresh()
  }

  useEffect(() => {
    function shortcuts(event) {
      if (event.defaultPrevented || event.target.closest('dialog')) return
      if (event.key === 'Escape') {
        setMenu('')
        if (!menu && full) setView('split')
      }
      if (!event.metaKey && !event.ctrlKey) return
      const key = event.key.toLowerCase()
      if (key === 'b') {
        if (event.shiftKey && !chat) return
        event.preventDefault()
        if (event.shiftKey) setView(nextMode[toolView])
        else toggleSidebar()
      }
      if (chat && event.shiftKey && key === 'f') {
        event.preventDefault()
        setView(full ? 'split' : 'full')
      }
      if (event.shiftKey && key === 'o') {
        event.preventDefault()
        newChat(chat?.projectId)
      }
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  })

  function separator(edge) {
    const field = edge === 'left' ? 'side' : 'tools'
    const dimension = fitted[field]
    return <div className={'separator ' + edge} role="separator" tabIndex={0} aria-orientation="vertical"
      aria-label={edge === 'left' ? '调整项目栏宽度' : '调整工具栏宽度'}
      aria-valuenow={Math.round(dimension)} aria-valuemin={edge === 'left' ? minSidebarWidth(viewport, split) : minToolWidth(viewport)}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, start: fitted, saved: panels }
        setDragging(true)
      }}
      onPointerMove={event => {
        if (!drag.current) return
        const { x, start, saved } = drag.current
        const resized = resizePanels(start, viewport, edge, event.clientX - x, contextVisible, split)
        drag.current.width = resized[field]
        setPanels({ ...saved, [field]: resized[field] })
      }}
      onPointerUp={event => {
        if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
        const { width, start } = drag.current
        if (width != null && width !== start[field]) api.savePanelWidth(field, width)
      }}
      onLostPointerCapture={() => {
        drag.current = null
        setDragging(false)
      }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault()
        const resized = resizePanels(fitted, viewport, edge, event.key === 'ArrowRight' ? 16 : -16, contextVisible, split)
        setPanels({ ...panels, [field]: resized[field] })
      }} />
  }

  return <div className={'window ' + (full ? 'full-view ' : '') + (dragging ? 'dragging' : '')}
    style={style} data-view={view} onPointerDown={event => {
      if (menu && !event.target.closest('.rail, .title-tool-region')) setMenu('')
    }}>
    <header className="titlebar">
      {!full && <>
        <IconButton icon="sidebar" label={contextVisible ? '收起侧栏' : '展开侧栏'}
          aria-expanded={contextVisible} onClick={toggleSidebar} />
        <div className="title-spacer" />
      </>}
      {!full && !replacesChat && isChat && record.openChats.length > 0 && <TabStrip label="会话标签" className="session-tabs"
        tabs={record.openChats.map(id => {
          const item = record.chats[id]
          return { id, title: item.title, chat: item }
        })}
        active={chatId} onSelect={select} onClose={closeChatTabs} onMenu={(event, id) => openContext(event, 'chat', id)} />}
      {chat && <div className={'title-tool-region ' + (visibleTools ? 'with-tabs' : '')}>
        {visibleTools && <TabStrip label="工具标签" className="tool-tabs"
          tabs={chat.tabs.map(id => ({ id, title: chat.toolTitles?.[id] ?? id, icon: toolIcons[id] }))}
          active={chat.tool} onSelect={openTool} onClose={closeToolTabs}
          onMenu={(event, id) => openContext(event, 'tool', id)} onPreview={previewTab} onPreviewEnd={clearPreview} />}
        <div className="title-tools">
        {visibleTools && <IconButton icon="add" label="添加工具标签" aria-expanded={menu === 'tools'} onClick={() => openToolPicker()} />}
        {visibleTools && <IconButton icon={full ? 'split' : 'full'}
          label={full ? '恢复分栏' : '进入完整视图'}
          onClick={() => setView(full ? 'split' : 'full')} />}
        <IconButton icon="tools" label={visibleTools ? '隐藏工具' : '打开工具'} aria-expanded={visibleTools}
          onClick={() => setView(visibleTools ? 'hidden' : 'split')} />
        {menu === 'tools' && <div className="popover tool-picker" aria-label="添加工具">
          <div className="popover-caption">添加工具</div>
          {tools.filter(tool => !toolInsertAfter.current || !chat.tabs.includes(tool)).map(tool =>
            <button key={tool} className="menu-row" onClick={() => openTool(tool, toolInsertAfter.current)}><Icon name={toolIcons[tool]} />{tool}</button>)}
        </div>}
        </div>
      </div>}
    </header>
    {visibleTools && preview?.chatId === chatId && <div className="tab-preview" style={{ left: preview.left }} aria-hidden="true" inert>
      <div className="tab-preview-image">
        <div className="tab-preview-surface">
          <ToolPanel active={preview.tool} data={toolData} chat={chat} project={project} api={api} preview />
        </div>
      </div>
      <div className="tab-preview-title"><Icon name={toolIcons[preview.tool]} size={14} />{chat.toolTitles?.[preview.tool] ?? preview.tool}</div>
    </div>}
    <div className="workspace-body">
      <div className="rail-track" inert={full}>
        <Rail active={section} navigate={navigate} account={account} balance={record.credits} menu={menu} setMenu={setMenu}
          logout={logout} onOffline={onOffline} openAccount={navigate} />
      </div>
      <div className="context-track" inert={!contextVisible}>
        <aside className="context" aria-label="上下文列表">
          <ContextList key={section} section={section} record={record} chat={chat} select={select} newChat={newChat}
            visible={contextVisible}
            onSearchChange={patch => { if (api.updateNavigationModule(section, patch)) refresh() }}
            onListScroll={scrollTop => api.updateNavigationModule(section, { scrollTop })}
            onGroupOpenChange={setGroupOpen}
            createProject={startProject} onToggleProject={toggleProject} onManageProject={id => manage('project-settings', id)}
            onManageBots={id => manage('bot-settings', id)} onChatMenu={(event, id) => openContext(event, 'sidebar', id)}
            selectItem={selected => manage(section, selected)} selectedItem={item} />
        </aside>
        {contextVisible && separator('left')}
      </div>
      {chat ? <main className="chat-pane" inert={replacesChat}>
        <div className="transcript-region" inert={full}><Transcript key={chat.id + ':' + transcriptVersion} chat={chat} project={project}
          visible={!full && !replacesChat} onPositionChange={transcriptPosition => {
            if (api.current()?.chats[chat.id] === chat) api.changeChat(chat.id, { transcriptPosition })
          }}
          onRetry={retryTurn} onPreview={data => openPreview(chat.id, data)} onScenario={fillScenario}
          onAttachmentPreview={setAttachmentPreview} /></div>
        {chat.agentRun?.request && (full
          ? <button type="button" className="secondary agent-return" onClick={() => setView('hidden')}>查看待处理请求</button>
          : <AgentRequest key={chat.agentRun.request.id} request={chat.agentRun.request} onRespond={respondAgent} />)}
        <AgentQueue key={'queue:' + chat.id} chat={chat} onEdit={updateQueue} onResume={resumeQueue} />
        <Composer key={'composer:' + chat.id} chat={chat} project={project} compact={full} api={api} refresh={refresh}
          send={send} stop={stop} report={report} assets={record.assets} onCommand={onCommand}
          onAttachmentPreview={setAttachmentPreview} />
      </main> : isChat ? <main className="chat-pane">
        <div className="welcome workspace-empty">
          <img className="welcome-banner" src="/aiwata-banner.svg" alt="AIWATA" />
          <h2>{section === 'bots' ? '选择一个 Bot 或群聊' : '打开一条会话开始工作'}</h2>
          {section === 'projects' && <button className="secondary" onClick={() => newChat(null)}><Icon name="add" />新聊天</button>}
          {section === 'bots' && <button className="secondary" onClick={() => manage('bot-settings')}>管理 Bot 与群聊</button>}
        </div>
      </main> : <ModulePage key={section} managed={isManaged} scrollTop={pageState?.mainScrollTop}
        onScrollChange={mainScrollTop => updateMainPage({ mainScrollTop }, false)}>
        {isManaged ? <Management section={section} selected={item} record={record} api={api}
          refresh={refresh} report={report} account={account} onOpenChat={select} onNavigate={navigate} onCreateProject={startProject}
          pageState={pageState} onPageChange={updateMainPage} onGroupOpenChange={setGroupOpen}
          onSelectItem={selected => manage(section, selected)} />
          : <Directory section={section} selected={item} record={record} report={report} account={account}
            search={pageState?.mainSearch} onSearchChange={mainSearch => updateMainPage({ mainSearch })} />}
      </ModulePage>}
      {chat?.tool && <section className="tool-pane" aria-label="工具面板" inert={!visibleTools}>
        {split && separator('right')}
        <div className="tool-scroll"><ToolPanel key={chat.id} active={chat.tool} openTool={openTool} chat={chat}
          project={project} api={api} refresh={refresh} report={report} data={toolData} update={updateToolData}
          visible={visibleTools} onAttachmentPreview={setAttachmentPreview} /></div>
      </section>}
    </div>
    {contextAction && <ContextMenu position={contextAction} groups={menuGroups()} dismiss={dismissContext} />}
    {chat && attachmentPreview && <AttachmentPreview api={api} chatId={chat.id} entry={attachmentPreview}
      onClose={() => setAttachmentPreview(null)} />}
    {tabDialog && (tabDialog.kind === 'marker'
      ? <MarkerDialog title={tabDialog.title} marker={record.chats[tabDialog.id].marker}
        onClose={closeTabDialog} onSave={applyTabDialog} />
      : <TabDialog action={tabDialog} onClose={closeTabDialog} onSubmit={applyTabDialog} />)}
    {creating && <ProjectDialog onClose={closeProject} onCreate={(name, folder, trusted) => {
      const created = api.addProject(name, folder, trusted)
      closeProject()
      if (created) newChat(created.id)
    }} />}
    {toast && <div className={'toast ' + (toast.error ? 'toast-error' : '')} role={toast.error ? 'alert' : 'status'}>
      <Icon name={toast.error ? 'coins' : 'check'} />{toast.message}
    </div>}
  </div>
}
