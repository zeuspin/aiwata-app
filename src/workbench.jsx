import { requestDesktopTip } from './desktop-tip-request.mjs'
import { DesktopTip } from './desktop-tip.jsx'
import { createAppTour, tourAction } from './desktop-tour.mjs'
import { appearanceChange, appearanceStyle } from './desktop-appearance.mjs'
import { browserState, closeToolInstances, terminalInstanceId, toolChat, toolEditsFor, toolType } from './tool-tabs.mjs'
import { browserTabInfo } from './browser-tab.mjs'
import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Composer } from './chat.jsx'
import { AgentQueue, AgentRequest, Transcript } from './agent-transcript.jsx'
import { BotConversationHeader, DiscussionPause } from './bot-conversation.jsx'
import { NativeArtifactPreview } from './native-artifacts.jsx'
import { AttachmentPreview } from './attachment-preview.jsx'
import { hasPromptContent } from './local-attachments.mjs'
import { useLiveWorkbench } from './live-workbench.jsx'
import { createNativeRemoteFolderPicker } from './native-remote-folder-picker.mjs'
import { NativeRemoteFolderDialog } from './native-remote-folder-dialog.jsx'
import { NativeDeepLinkDialog } from './native-deep-link-dialog.jsx'
import { NativeUpdateDialog } from './native-update-dialog.jsx'
import { createNativePrimaryWorkbench, observeSystemTheme, resumeNativeConnectionDone, openNativeTaskSession } from './native-primary-workbench.mjs'
import { useLiveRooms } from './live-rooms.jsx'
import { LiveBrowser, liveBrowserTool } from './live-browser.jsx'
import { NativeFileDialog } from './native-file-actions.jsx'
import { LiveFiles, liveFileTool, useLiveFiles } from './live-files.jsx'
import { LiveGit, liveGitTool, useLiveGit } from './live-git.jsx'
import { LiveImage, liveImageEditTool, liveImageTool } from './live-image.jsx'
import { LiveVideo, liveVideoTool } from './live-video.jsx'
import { tools } from './fixtures.mjs'
import { Icon, IconButton, toolIcons } from './icons.jsx'
import { Management } from './management.jsx'
import { BotSettingsDrawer } from './bot-settings-drawer.jsx'
import { groupMember, managedSections, resolveGroupMembers } from './management.mjs'
import { routeRoomMessage } from './room.mjs'
import { ArchiveList, ContextList, Rail, contextItems } from './navigation.jsx'
import { Directory, emptyToolData, ProjectDialog, ToolPanel } from './surfaces.jsx'
import { ContextMenu, menuPosition, TabDialog, TabIcon, TabStrip } from './tab-controls.jsx'
import { conversationSection } from './tabs.mjs'
import { navigateBrowser, toolEditDefaults } from './tool-surfaces.mjs'
import { previewCommand, previewFailure } from './web-preview.mjs'
import { LiveAgentInspector } from './live-agent-inspector.jsx'
import { DesktopRequestCard } from './desktop-request-cards.jsx'
import AgentTerminal from './agent-terminal.jsx'
import { LiveConnectionRequest } from './live-connection-request.jsx'
import { mergeConnectionRequest } from './connection-request.mjs'
import { chatMoveTargets, contextBreakpoint, fitPanels, initialPanels, minSidebarWidth, minToolWidth, moveChatToProject, railWidth, resizePanels, setChatArchived, viewAtWidth } from './workspace.mjs'
import { botSidebarCompactWidth, botSidebarCompactThreshold, botSidebarExpandedMinimum, botSidebarKeyWidth, botSidebarWidthPatch, expandedBotSidebarWidth, savedBotSidebarWidth } from './bot-sidebar.mjs'

const chatSections = ['projects', 'bots']
const nextMode = { hidden: 'split', split: 'full', full: 'hidden' }
const liveTools = [liveFileTool, liveGitTool]
const liveTerminalTool = '终端'
const nativeTools = [...liveTools, liveTerminalTool, liveImageTool, liveImageEditTool, liveVideoTool]
const LiveMcpManager = lazy(() => import('./live-mcp-manager.jsx'))
const LiveProviderManager = lazy(() => import('./live-provider-manager.jsx'))
const LiveTerminal = lazy(() => import('./live-terminal.jsx'))
const noTools = []

function lastChatInSection(record, section) {
  if (!chatSections.includes(section)) return null
  const saved = record.navigation?.modules?.[section]?.chatId
  if (saved && record.openChats.includes(saved) && conversationSection(record, saved) === section) return saved
  const active = record.activeChat
  if (active && conversationSection(record, active) === section) return active
  return record.openChats.findLast(id => conversationSection(record, id) === section) ?? null
}

function restoreRoute(record, section) {
  // Individual Bot settings now live in guarded drawers rather than saved page routes.
  const savedItem = section === 'bot-settings' ? null : record.navigation?.modules?.[section]?.item
  const fresh = section === 'projects' && Boolean(record.newChatDraft && record.navigation?.modules?.projects?.draftOpen)
  return {
    section, fresh, chatId: fresh ? null : lastChatInSection(record, section),
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

export function Workbench({ account, api, refresh, onOffline, live, onLogout, onManageConnections }) {
  const record = api.current()
  const [viewport, setViewport] = useState(window.innerWidth)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const nativePrimary = useRef(null)
  const nativeRemotePicker = useRef(null)
  const nativePrimaryState = useRef(null)
  const nativePrimaryGaps = useRef([])
  const [, refreshNativeSurfaces] = useState(0)
  useEffect(() => observeSystemTheme(window, setSystemDark), [])
  const [{ section, chatId, item, fresh }, setRoute] = useState(() => {
    const section = record.navigation?.section ?? conversationSection(record, record.activeChat)
    return restoreRoute(record, section)
  })
  const isChat = chatSections.includes(section)
  const isManaged = managedSections.has(section)
  const pageState = record.navigation?.modules?.[section]
  const chat = isChat ? record.chats[chatId] : null
  const draftChat = fresh ? record.newChatDraft : null
  const composerChat = chat ?? draftChat
  const bot = chat && record.bots.find(entry => entry.id === chat.id)
  const group = chat && record.groups.find(entry => entry.id === chat.id)
  const toolLive = useMemo(() => live?.forProfile && chat?.gatewayProfile ? live.forProfile(chat.gatewayProfile) : live,
    [live, chat?.gatewayProfile])
  const members = resolveGroupMembers(group, record.bots).map(id => {
    const member = groupMember(group, record.bots, id)
    return group?.gatewayRoom ? { ...member, roomHandle: group.memberHandles?.[id] } : member
  })
  const project = record.projects.find(entry => entry.id === composerChat?.projectId)
  const canChooseProject = section === 'projects' && composerChat && (!live || !composerChat.gatewayId) &&
    !composerChat.messages.length && !composerChat.pending && !composerChat.queue?.length
  const [panels, setPanels] = useState(() => ({ ...initialPanels, ...record.preferredPanelWidths }))
  const [botSidebarWidth, setBotSidebarWidth] = useState(() => savedBotSidebarWidth(record.navigation?.modules?.bots, panels.side))
  const [chatFocus, setChatFocus] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [capabilityPanel, setCapabilityPanel] = useState(null)
  const [menu, setMenu] = useState('')
  const [railPanel, setRailPanel] = useState(null)
  const [contextAction, setContextAction] = useState(null)
  const [tabDialog, setTabDialog] = useState(null)
  const [transcriptVersion, setTranscriptVersion] = useState(0)
  const [creating, setCreating] = useState(false)
  const [botCreateRequest, setBotCreateRequest] = useState(null)
  const [botSettingsId, setBotSettingsId] = useState(null)
  const botSettingsTrigger = useRef(null)
  const [botSettingsDirty, setBotSettingsDirty] = useState(false)
  const [botSettingsBusy, setBotSettingsBusy] = useState(false)
  const settingsBot = record.bots.find(bot => bot.id === botSettingsId)
  const settingsGroup = record.groups.find(group => group.id === botSettingsId)
  const [toast, setToast] = useState(null)
  const [desktopTip, setDesktopTip] = useState(null)
  useEffect(() => { setDesktopTip(null) }, [account.id, composerChat?.id])
  const [toolsByChat, setToolsByChat] = useState({})
  const [previewPartition, setPreviewPartition] = useState(null)
  const terminalReadingPositions = useRef(new Map())
  const terminalReaders = useRef(new Map())
  const [preview, setPreview] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState(null)
  const [artifactPreview,setArtifactPreview]=useState(null)
  const preparingPrompts = useRef(new Set())
  const toastTimer = useRef(null)
  const previewTimer = useRef(null)
  const artifactRequest = useRef(null)
  const currentToolLive=useRef(toolLive)
  currentToolLive.current=toolLive
  const previewPage = useRef(null)
  const appTour = useRef(null)
  const railPanelTimer = useRef(null)
  const railPanelTrigger = useRef(null)
  const railPanelElement = useRef(null)
  const { agent } = api
  const viewedChat = useRef(composerChat?.id)
  const gateway = useLiveWorkbench({ live, api, accountId: account.id, chatId, refresh, report,
    onAccepted: id => { if (viewedChat.current === id) select(id) },
    onPreviewRequest: inspectWebPreview,
    onDesktopRequest: handleDesktopRequest,
    onDesktopEvent: handleDesktopEvent,
    onNativeEvent: frame => nativePrimary.current?.observe(frame),
  })
  const rooms = useLiveRooms({ live, api, accountId: account.id, roomId: group?.id,
    connected: gateway.status === 'connected', refresh, report })
  nativePrimaryState.current = { composerChat, gateway, record, systemDark }
  useEffect(() => {
    if (!live?.native || !window.hermesDesktop) return
    const previousPicker = live.pickRemoteFolders
    const picker = createNativeRemoteFolderPicker({ live,
      isCurrent: () => api.current() === record && api.accountId === account.id,
      onChange: () => refreshNativeSurfaces(value => value + 1) })
    const pickRemote = options => picker.pick(options)
    live.pickRemoteFolders = pickRemote
    nativeRemotePicker.current = picker
    const controller = createNativePrimaryWorkbench({ host: window.hermesDesktop, live, api, accountId: account.id,
      primary: window.aiwataNativeRuntime?.primary !== false && new URLSearchParams(window.location.search).get('peer') !== '1',
      storage: window.localStorage, storageNamespace: live.storageNamespace || 'aiwata-app-native:v2:' + JSON.stringify([live.route.connectionId, live.route.profile,live.scopeIdentity]),
      loadOriginal: window.aiwataNativeRuntime?.loadPrimary, onSurfaceChange: () => refreshNativeSurfaces(value => value + 1),
      getCurrentChat: () => nativePrimaryState.current.composerChat,
      getStatus: () => nativePrimaryState.current.gateway.status,
      getAppearance: () => nativePrimaryState.current.record.navigation?.appearance,
      getSystemDark: () => nativePrimaryState.current.systemDark,
      getTitleBarTheme: () => {
        const element = document.querySelector('.window')
        if (!element) return {}
        const style = window.getComputedStyle(element)
        return { background: style.getPropertyValue('--app-surface').trim(), foreground: style.getPropertyValue('--text').trim() }
      },
      send: (...args) => nativePrimaryState.current.gateway.send(...args),
      navigateNative: path => {
        const target = new URL(path, 'https://native.invalid')
        if (target.pathname === '/capabilities') {
          const tab = target.searchParams.get('tab')
          if (['skills', 'connectors', 'memory'].includes(tab)) { manage(tab); return true }
        }
        if (target.pathname === '/new' || target.pathname === '/') { newChat(); return true }
        const identity = target.pathname.match(/^\/chat\/([^/]+)$/)?.[1]
        if (identity) {
          const matches = Object.values(api.current().chats).filter(chat => chat.gatewayStoredId === identity || chat.gatewayId === identity)
          if (matches.length === 1) { select(matches[0].id); return true }
        }
        return false
      },
      connectionDone: action => resumeNativeConnectionDone({ api, record, live, action, select, refresh }),
      insertBlueprint: action => {
        const current = nativePrimaryState.current.composerChat
        if (!current || current.pending || current.draft.trim() || current.attachments.length) return false
        const slots = Object.entries(action.params ?? {}).map(([key,value]) => key + '=' + (/\s/.test(value) ? JSON.stringify(value) : value)).join(' ')
        api.changeChat(current.id, { draft: '/blueprint ' + action.name + (slots ? ' ' + slots : '') }); refresh(); return true
      },
      openChat: id => select(id), openDraft: projectId => newChat(projectId), refresh,
      onGap: gap => {
        nativePrimaryGaps.current = [...nativePrimaryGaps.current.filter(row => row.feature !== gap.feature), gap]
        if (gap.feature === 'focusSession') report('通知中的原生会话身份尚未映射到当前工作区。', true)
        else if (gap.feature === 'openFolder') report('未能打开原生项目目录，请从项目入口重试。', true)
        else if (gap.feature === 'openUpdates') report('原生客户端更新面板尚未接入。', true)
      },
    })
    nativePrimary.current = controller
    return () => {
      controller.dispose(); picker.dispose()
      if (live.pickRemoteFolders === pickRemote) live.pickRemoteFolders = previousPicker
      if (nativePrimary.current === controller) nativePrimary.current = null
      if (nativeRemotePicker.current === picker) nativeRemotePicker.current = null
    }
  }, [live, api, account.id, refresh])
  useEffect(() => { nativePrimary.current?.publish() })
  const connectedLabel = '已连接本机 AIWATA'
  const drag = useRef(null)
  const projectTrigger = useRef(null)

  useEffect(() => () => artifactRequest.current?.abort(), [toolLive, chatId])

  useEffect(() => {
    const host = window.aiwataPreview
    if (!live || !host) return
    let disposed = false
    let partition
    void host.start(account.id).then(value => {
      if (disposed) return host.stop(value)
      partition = value
      setPreviewPartition(value)
    }, () => {
      if (!disposed) report('无法启动当前账号的网页预览。', true)
    })
    return () => {
      disposed = true
      if (partition) void host.stop(partition)
    }
  }, [live, account.id])

  const narrow = viewport < contextBreakpoint
  const baseLiveTools = nativeTools
  const supportedLiveTools = [...baseLiveTools, liveBrowserTool]
  const availableTools = !live ? tools : bot && chat?.gatewayStoredId ? [...liveTools, liveTerminalTool, liveBrowserTool]
    : !group && chat?.gatewayStoredId ? supportedLiveTools
    : chat && (bot || group) ? [liveBrowserTool] : noTools
  const activeTool = availableTools.includes(toolType(chat, chat?.tool)) ? chat.tool : null
  const toolTabs = (chat?.tabs ?? []).filter(id => availableTools.includes(toolType(chat, id)))
  const toolView = activeTool ? chat.view : 'hidden'
  const sidebar = !chatFocus && (record.navigation?.sidebarOpen ?? !narrow)
  const view = chatFocus ? 'hidden' : viewAtWidth(toolView, viewport, sidebar)
  const full = view === 'full'
  const split = view === 'split'
  const replacesChat = view === 'replace'
  const contextVisible = !full && sidebar
  const floatingSection = !full && (!contextVisible || railPanel?.section === 'archive') ? railPanel?.section : null
  const botSidebar = section === 'bots'
  // An expanded sidebar can be narrower than 160px when the window itself is narrow.
  const botCompactThreshold = Math.max(botSidebarCompactWidth + 1, Math.min(botSidebarCompactThreshold, minSidebarWidth(viewport, split)))
  const botCompact = botSidebarWidth < botCompactThreshold
  const sidebarMinimum = botSidebar && (botCompact || drag.current?.botResize) ? botSidebarCompactWidth : undefined
  const fitted = fitPanels(botSidebar ? { ...panels, side: botSidebarWidth } : panels, viewport, contextVisible, split, sidebarMinimum)
  const toolsWidth = replacesChat ? viewport - railWidth - fitted.side : fitted.tools
  const visibleTools = view !== 'hidden'
  const observesTool = tool => Boolean(live && visibleTools && (toolType(chat, activeTool) === tool || (preview?.chatId === chatId && toolType(chat, preview?.tool) === tool)))
  const liveFiles = useLiveFiles({ live: toolLive, chat, project, visible: observesTool(liveFileTool), api, refresh, report })
  const liveGit = useLiveGit({ live: toolLive, chat, project, visible: observesTool(liveGitTool), api, refresh })
  function toolDataFor(id) {
    const runtimeKey = chat?.toolInstances?.[id] ? chatId + ':' + id : chatId
    return { ...emptyToolData, ...toolsByChat[runtimeKey], ...toolEditDefaults, ...toolEditsFor(chat, id),
      artifacts: chat?.artifacts ?? emptyToolData.artifacts }
  }
  const toolData = toolDataFor(activeTool)
  const updateToolData = useCallback((update, id = activeTool) => {
    const runtimeKey = chat?.toolInstances?.[id] ? chatId + ':' + id : chatId
    setToolsByChat(previous => ({
      ...previous,
      [runtimeKey]: update({ ...emptyToolData, ...previous[runtimeKey] }),
    }))
  }, [chatId, activeTool, chat])

  function renderLiveTool(id, thumbnail = false) {
    const tool = toolType(chat, id)
    const instanceChat = toolChat(chat, id)
    if (tool === liveVideoTool) return <LiveVideo key={chat.id} live={live} chat={chat} api={api} refresh={refresh} report={report} thumbnail={thumbnail} />
    if (tool === liveImageTool || tool === liveImageEditTool) return <LiveImage key={chat.id + ':' + tool} live={live} chat={chat}
      api={api} refresh={refresh} report={report} thumbnail={thumbnail} editing={tool === liveImageEditTool} />
    if (tool === liveBrowserTool) return <LiveBrowser key={chat.id + id} chat={instanceChat} api={api} refresh={refresh} partition={live.native && previewPartition ? live.previewPartitionForProfile(chat.gatewayProfile) : previewPartition}
      visible={visibleTools && !thumbnail} thumbnail={thumbnail} report={report} previewPage={previewPage}
      openTool={openTool} availableTools={availableTools} voiceService={live} />
    if (tool === liveTerminalTool) {
      const agentProcess = chat.toolInstances?.[id]?.agentProcess
      const onReader = reader => {
        const key = chat.id + ':' + id
        if (reader) terminalReaders.current.set(key, reader)
        else terminalReaders.current.delete(key)
      }
      if (agentProcess) return <AgentTerminal key={chat.id + id} process={agentProcess} onReader={onReader} />
      if (thumbnail) return <pre className="terminal-demo terminal-output">{toolDataFor(id).terminalThumbnail || '终端尚未打开'}</pre>
      return <Suspense fallback={<p className="live-connection" role="status">正在载入终端…</p>}>
        <LiveTerminal key={chat.id + id} live={toolLive} sessionId={chat.gatewayStoredId} instanceId={terminalInstanceId(id)} visible={visibleTools}
          onReader={onReader}
          onOpenLink={url => {
            if (api.current() !== record || api.getChat(chat.id) !== chat || viewedChat.current !== chat.id) return
            openPreview(chat.id, { url })
          }}
          readingPositions={terminalReadingPositions.current}
          onPreview={terminalThumbnail => updateToolData(previous => ({ ...previous, terminalThumbnail }), id)} />
      </Suspense>
    }
    const props = { chat, api, thumbnail, visible: visibleTools && !thumbnail }
    return tool === liveGitTool ? <LiveGit key={chat.id} state={liveGit} {...props} />
      : <LiveFiles key={chat.id} state={liveFiles} {...props} />
  }
  function toolTabData(id) {
    const type = toolType(chat, id)
    return { id, icon: toolIcons[type], ...(type === liveBrowserTool
      ? browserTabInfo(browserState(chat, id), chat.toolTitles?.[id]) : { title: chat.toolTitles?.[id] ?? type }) }
  }
  const style = {
    '--rail-size': (full ? 0 : railWidth) + 'px',
    '--context-size': fitted.side + 'px',
    '--tool-size': toolsWidth + 'px',
    ...appearanceStyle(record.navigation?.appearance, systemDark),
    '--sidebar-content': (contextVisible ? fitted.side : panels.side) + 'px',
    '--flyout-width': panels.side + 'px',
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
      clearTimeout(railPanelTimer.current)
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

  function closeRailPanel(restoreFocus = false) {
    clearTimeout(railPanelTimer.current)
    setRailPanel(null)
    if (restoreFocus) railPanelTrigger.current?.focus({ preventScroll: true })
  }

  function openRailPanel(event, target, pinned) {
    if (!pinned && event.pointerType !== 'mouse') return
    clearTimeout(railPanelTimer.current)
    if (!pinned && railPanel?.pinned) return
    if (pinned && railPanel?.pinned && railPanel.section === target) {
      closeRailPanel()
      return
    }
    railPanelTrigger.current = target === 'archive' ? document.querySelector('[aria-label="账号菜单"]') : event.currentTarget
    setMenu('')
    setRailPanel({ section: target, pinned })
    if (pinned && event.detail === 0) requestAnimationFrame(() => railPanelElement.current?.focus({ preventScroll: true }))
  }

  function leaveRailPanel() {
    clearTimeout(railPanelTimer.current)
    if (!railPanel || railPanel.pinned) return
    railPanelTimer.current = setTimeout(() => {
      const focused = document.activeElement
      if (!railPanelElement.current?.contains(focused) && !focused?.closest('dialog, .tab-context-menu')) closeRailPanel()
    }, 180)
  }

  function go(route) {
    const isChatRoute = chatSections.includes(route.section)
    if (!route.chatId) setChatFocus(false)
    viewedChat.current = route.fresh ? record.newChatDraft?.id : isChatRoute ? route.chatId : null
    const patch = isChatRoute ? { chatId: route.chatId } : { item: route.item }
    if (route.section === 'projects') patch.draftOpen = Boolean(route.fresh)
    api.updateNavigationModule(route.section, route.fresh ? { draftOpen: true } : patch, true)
    setRoute(route)
    setMenu('')
    closeRailPanel()
    setContextAction(null)
    setAttachmentPreview(null)
    setArtifactPreview(null)
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
    if (live && target === 'bots') void Promise.all([live.bots(), live.rooms()]).then(([inventory, hostedRooms]) => {
      if (api.current() !== record) return
      api.syncGatewayBots(inventory.bots)
      api.syncGatewayRooms(hostedRooms)
      refresh()
    }).catch(error => { if (api.current() === record) report(error.message, true) })
    const route = restoreRoute(record, target)
    if (route.fresh) return go(route)
    if (target === section && chat) return select(chat.id, target)
    select(route.chatId, target)
  }

  function newChat(projectId) {
    if (api.openChatDraft(projectId)) go({ section: 'projects', chatId: null, item: null, fresh: true })
  }

  function chooseComposerProject(projectId) {
    if (!canChooseProject || !api.changeChat(composerChat.id, { projectId })) return
    if (chat) api.openChat(chat.id)
    refresh()
  }

  function openTool(tool, after) {
    if (!chat || !availableTools.includes(toolType(chat, tool))) return
    api.openTool(chat.id, tool, after, { newInstance: tool === '终端' })
    setMenu('')
    clearPreview()
    refresh()
  }

  function selectTool(id) {
    if (!chat || !availableTools.includes(toolType(chat, id))) return
    api.selectTool(chat.id, id)
    setMenu('')
    clearPreview()
    refresh()
  }

  async function closeToolTabs(id, strategy) {
    clearPreview()
    const { closed, failed } = await closeToolInstances(api, chat.id, id, strategy, live ? terminal =>
      toolLive.terminalControl({ action: 'close', session_id: chat.gatewayStoredId,
        ...(terminalInstanceId(terminal) ? { instance_id: terminalInstanceId(terminal) } : {}) }) : null)
    for (const terminal of closed) {
      terminalReadingPositions.current.delete(JSON.stringify([chat.gatewayStoredId, terminalInstanceId(terminal)]))
    }
    if (failed.length) report(failed[0].error.message || '终端未能关闭，请重试。', true)
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

  function openToolHome(after = null) {
    if (!chat) return
    api.openTool(chat.id, '浏览器', after, { newInstance: true })
    setMenu('')
    clearPreview()
    refresh()
  }

  function menuGroups() {
    const { kind, id, anchor } = contextAction
    const tool = kind === 'tool'
    const sidebar = kind === 'sidebar'
    const session = tool ? null : record.chats[id]
    const title = tool ? toolTabData(id).title : session.title
    const ordinary = session && conversationSection(record, id) === 'projects'
    const currentTabs = tool ? toolTabs : record.openChats
    const runClose = tool ? closeToolTabs : closeChatTabs
    const closeActions = sidebar ? [] : [
      { label: '关闭', strategy: 'one' },
      { label: '关闭其他标签页', strategy: 'others', disabled: currentTabs.length <= 1 },
      { label: '关闭右侧标签页', strategy: 'right', disabled: currentTabs.at(-1) === id },
      { label: '关闭所有标签页', strategy: 'all' },
    ].map(item => ({ ...item, icon: 'close', run: () => runClose(id, item.strategy) }))

    if (tool) return [
      [{
        label: '在右侧打开新标签页', icon: 'add',
        run: () => openToolHome(id),
      }, {
        label: '重命名', icon: 'edit',
        run: () => setTabDialog({ kind: 'rename-tool', id, title, anchor }),
      }],
      closeActions,
    ]

    const managedChat = ordinary && (!live || session.gatewayStoredId)
    const targets = managedChat ? chatMoveTargets(record, session) : []
    const busy = Boolean(session.pending || gateway.sending === id)
    return [
      sidebar && !record.openChats.includes(id)
        ? [{ label: '在新标签页中打开', icon: 'add', run: () => select(id) }] : [],
      [
        ...(managedChat ? [{
          label: '重命名', icon: 'edit',
          run: () => setTabDialog({ kind: 'rename-chat', id, title, anchor }),
        }] : []),
        {
          label: session.unread ? '标记为已读' : '标记为未读', icon: 'mail',
          run: () => { api.changeChat(id, { unread: !session.unread }); refresh() },
        },
      ],
      [
        { label: '导出', icon: 'download', run: () => exportConversation(session) },
        ...(managedChat ? [{
          label: '移动到项目…', icon: 'folder', disabled: !targets.length || busy,
          run: () => setTabDialog({ kind: 'move', id, title, anchor, targets }),
        }] : []),
      ],
      sidebar ? [] : [{
        label: '重新加载', icon: 'refresh',
        run: () => {
          select(id)
          if (live) void gateway.open(id).catch(error => report(error.message, true))
          setTranscriptVersion(version => version + 1)
        },
      }, ...closeActions],
      managedChat ? [{
        label: session.archived ? '取消归档' : '归档', icon: 'archive', disabled: Boolean(live && busy),
        run: async () => {
          const archived = !session.archived
          if (live) {
            try {
              if (!await gateway.mutate(session, 'archive', { archived }) || api.current() !== record) return
            } catch (error) { report(error.message, true); return }
          }
          if (!setChatArchived(api, id, archived)) return
          reconcileChatRoute()
          report(archived ? '会话已归档' : '会话已恢复')
        },
      }, {
        label: '删除会话', icon: 'trash', danger: true, disabled: Boolean(live && busy),
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

  async function applyTabDialog(value) {
    const { kind, id } = tabDialog
    const session = record.chats[id]
    if (kind !== 'rename-tool' && !session) throw new Error('找不到已保存的会话。')
    if (kind === 'move') {
      const destination = chatMoveTargets(record, session).find(project => project.id === value)
      if (!destination || session.pending) throw new Error('暂时无法移动，请等会话运行结束后重试。')
      if (live) {
        if (!await gateway.mutate(session, 'workspace', { cwd: destination.folder }) || api.current() !== record) return
        api.changeChat(id, { projectId: value })
      } else if (!moveChatToProject(api, id, value)) throw new Error('暂时无法移动，请重新选择项目。')
      closeTabDialog()
      refresh()
      report('已移动到 ' + destination.name)
      return
    }
    if (kind === 'delete') {
      if (live && (!await gateway.mutate(session, 'delete', {}) || api.current() !== record)) return
      closeTabDialog()
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
    if (kind === 'rename-tool') {
      api.renameTool(chat.id, id, value)
    } else if (live) {
      const result = await gateway.mutate(session, 'rename', { title: value.trim() })
      if (!result || api.current() !== record) return
      api.renameChat(id, result.title ?? value)
    } else api.renameChat(id, value)
    closeTabDialog()
    refresh()
  }

  function setView(mode) {
    if (!chat || !availableTools.length) return
    setChatFocus(false)
    if (mode === 'full') closeRailPanel()
    if (mode !== 'hidden' && !activeTool) api.openTool(chat.id, live ? availableTools[0] : '浏览器', undefined, { reveal: false })
    api.changeChat(chat.id, { view: mode })
    clearPreview()
    refresh()
  }

  function toggleSidebar() {
    setChatFocus(false)
    closeRailPanel()
    if (full) setView('split')
    api.updateNavigation({ sidebarOpen: !contextVisible })
    refresh()
  }

  function toggleChatFocus(id) {
    if (id !== chatId) select(id)
    setChatFocus(value => !value)
    closeRailPanel()
    clearPreview()
  }

  function toggleProject(projectId) {
    const collapsed = record.navigation?.collapsedProjects ?? []
    const collapsedProjects = collapsed.includes(projectId)
      ? collapsed.filter(id => id !== projectId)
      : [...collapsed, projectId]
    api.updateNavigation({ collapsedProjects })
    refresh()
  }

  function startProject(chatId = null) {
    projectTrigger.current = document.activeElement
    setCreating({ chatId })
  }

  function openBotSettings(id) {
    botSettingsTrigger.current = document.activeElement
    setMenu('')
    setContextAction(null)
    closeRailPanel()
    setBotSettingsDirty(false)
    setBotSettingsBusy(false)
    setBotSettingsId(id)
  }

  function closeBotSettings() {
    if (botSettingsBusy) return false
    if (botSettingsDirty && !window.confirm('有未保存的修改，确定放弃吗？')) return false
    setBotSettingsId(null)
    setBotSettingsDirty(false)
    return true
  }

  function leaveBotSettings(action) {
    if (closeBotSettings()) action()
  }

  function manage(section, item = null) {
    go({ section, chatId: null, item })
  }

  function openProfileSection(target, profile) {
    if (target === 'tasks') api.updateNavigationModule(target, { taskProfile: profile, item: 'all' })
    else api.updateNavigationModule(target, { profile })
    go(restoreRoute(record, target))
  }

  function closeProject() {
    setCreating(false)
    requestAnimationFrame(() => {
      if (projectTrigger.current?.isConnected) projectTrigger.current.focus()
      else document.querySelector('.composer-project-trigger')?.focus()
    })
  }

  function revealBrowser(id) {
    if (viewedChat.current !== id) return
    api.openTool(id, '浏览器')
  }

  function openPreview(id, data) {
    if (live && !previewPartition) {
      report('网页可在 AIWATA 工作台的桌面预览中打开。', true)
      return
    }
    setChatFocus(false)
    api.updateBrowser(id, previous => navigateBrowser(previous, data.url))
    revealBrowser(id)
    refresh()
  }

  async function inspectWebPreview(session, method, params, signal) {
    if (!previewCommand(method, params)) return previewFailure('网页预览支持读取文字、查看可见元素、滚动，以及按元素引用点击、悬停、输入和按键。')
    const page = previewPage.current
    if (!session || session.id !== viewedChat.current || page?.chatId !== session.id || document.hidden) {
      return previewFailure('请先在当前会话打开桌面网页预览。')
    }
    const result = await page.inspect(method, params, signal)
    return page === previewPage.current && viewedChat.current === session.id && !document.hidden
      ? result : previewFailure('网页预览已切换，请重新发起请求。')
  }

  useEffect(() => () => {
    appTour.current?.stop()
    appTour.current = null
    const page = previewPage.current
    void Promise.resolve().then(() => page?.tour?.({ kind: 'stop' })).catch(() => {})
  }, [account.id, composerChat?.id])

  async function runDesktopTour(params, signal) {
    if (params.surface === 'preview') {
      if (signal?.aborted || previewPage.current?.chatId !== viewedChat.current || !previewPage.current?.tour) return { success: false, error: '请先打开当前会话的网页。' }
      return previewPage.current.tour(tourAction(params), signal)
    }
    appTour.current ??= createAppTour(document, {
      revealPane: pane => {
        if (pane === 'sessions') { setChatFocus(false); api.updateNavigation({ sidebarOpen: true }); refresh() }
      },
    })
    return appTour.current.run(params)
  }

  function applyDesktopAppearance(values, commit = true) {
    const result = appearanceChange(record.navigation?.appearance, values)
    if (!result.success) return result
    if (commit) {
      api.updateNavigation({ appearance: result.preferences })
      if (values.layout) { setChatFocus(false); api.updateNavigation({ sidebarOpen: true }) }
      refresh()
    }
    return { success: true, applied: result.applied }
  }

  async function respondDesktopChoice(request, value) {
    if (!['theme.pick', 'setup_beat'].includes(request.method)) return gateway.respondDesktop(request, value)
    const owner = api.current()
    if (request.chatId !== viewedChat.current || owner !== record) return false
    const appearance = request.method === 'theme.pick' ? value.picked
      : request.params?.beat === 'theme' || request.params?.beat === 'layout' ? value.answer : null
    let checked
    if (appearance) {
      checked = applyDesktopAppearance(appearance, false)
      if (!checked.success) throw new Error(checked.error)
      value = request.method === 'theme.pick' ? { ...value, picked: checked.applied } : { ...value, answer: checked.applied }
    }
    return gateway.respondDesktop(request, value, appearance ? () => {
      if (api.current() !== owner || request.chatId !== viewedChat.current) throw new Error('会话已切换。')
      applyDesktopAppearance(appearance)
    } : undefined)
  }

  async function handleDesktopRequest(session, method, params, signal) {
    if (!session || session.id !== viewedChat.current || document.hidden || signal?.aborted) throw new Error('请先打开此会话。')
    if (method === 'preview.read' || method === 'preview.act') return inspectWebPreview(session, method, params, signal)
    if (method === 'theme.apply') return applyDesktopAppearance(params)
    if (method === 'tour') return runDesktopTour(params, signal)
    if (method === 'tip.show') return requestDesktopTip({ doc: document, payload: params, signal, present: tip => {
      const owned = { ...tip, chatId: session.id, accountId: account.id }
      setDesktopTip(owned)
      return () => setDesktopTip(current => current === owned ? null : current)
    } })
    if (method === 'window.read') {
      if (!window.aiwataPreview?.readWindowBelow) return { error: '当前宿主不支持原生窗口元数据读取。' }
      return window.aiwataPreview.readWindowBelow()
    }
    if (method === 'terminal.read') {
      const reader = terminalReaders.current.get(session.id + ':' + activeTool)
      if (!reader || !visibleTools || toolType(session, activeTool) !== liveTerminalTool) return { success: false, error: '当前会话没有打开可读取的终端。' }
      return reader(params)
    }
    throw new Error('当前工作台暂未实现原生桌面请求：' + method)
  }

  function handleDesktopEvent(session, type, payload) {
    if (!session || viewedChat.current !== session.id || document.hidden) return
    if (type === 'pane.reveal') {
      if (payload.pane === 'sessions') { api.updateNavigation({ sidebarOpen: true }); refresh() }
      else if (payload.pane === 'chat') document.querySelector('.chat-pane textarea')?.focus()
      else {
        const tool = { files: liveFileTool, terminal: liveTerminalTool, review: liveGitTool }[payload.pane]
        if (tool && availableTools.includes(tool)) { setChatFocus(false); api.openTool(session.id, tool); refresh() }
      }
    } else if (type === 'tip.show') {
      setDesktopTip({ ...payload, text: payload.text.slice(0, 500), chatId: session.id, accountId: account.id })
    }
  }

  async function openFilePreview(id, file) {
    const session = api.getChat(id)
    const storedId = session?.gatewayStoredId
    if (!live || !storedId || !availableTools.includes(liveFileTool) || viewedChat.current !== id) return
    artifactRequest.current?.abort()
    const controller = new AbortController()
    artifactRequest.current = controller
    try {
      const location = await toolLive.locateFile(storedId, file.target, controller.signal)
      if (controller.signal.aborted || currentToolLive.current!==toolLive || viewedChat.current !== id || api.getChat(id) !== session || session.gatewayStoredId !== storedId) return
      if(location.artifact){setArtifactPreview({live:toolLive,session,storedId,target:location.artifact.target});return}
      const {root,parts}=location
      api.updateToolEdits(id, () => ({ liveFiles: { root, parts: parts.slice(0, -1), selected: parts.at(-1), exact: true } }))
      setChatFocus(false)
      openTool(liveFileTool)
    } catch (error) {
      if (!controller.signal.aborted) report(error.message, true)
    } finally {
      if (artifactRequest.current === controller) artifactRequest.current = null
    }
  }

  function runPrompt(id, runId, attachments, retry = false) {
    const current = api.current()
    const session = current.chats[id]
    const group = current.groups.find(item => item.id === id)
    const input = session.lastInput
    const text = input.text
    const roster = resolveGroupMembers(group, current.bots).map(member => groupMember(group, current.bots, member))
    const previousParticipants = retry ? Object.keys(session.roomOutcome?.statuses ?? {}) : []
    const participants = !group ? [] : previousParticipants.length
      ? roster.filter(bot => previousParticipants.includes(bot.id)) : routeRoomMessage(roster, group, text, input.reply?.memberId)
    const params = group
      ? { room_id: id, event_id: input.discussionId, payload: { thread_id: input.threadId, text, attachments } }
      : { session_id: id, text, attachments, queued: input.queued }
    agent.request(group ? (retry ? 'groups.retry' : 'groups.send') : 'prompt.submit', params, {
      turnId: runId, members: participants.map(({ id, name }) => ({ id, name })), approvalMode: current.approvalMode ?? 'smart',
      retryDemo: input.retryDemo,
      onEvent: frame => {
        if (api.accountId !== account.id) return
        if (!api.applyAgentEvent(id, runId, frame, viewedChat.current === id)) return
        if (frame.type === 'preview.open') revealBrowser(id)
        if (frame.type === 'message.complete' && frame.data.status === 'complete') startQueue(id)
        refresh()
      },
    })
  }

  async function readPromptFiles(id, names, details) {
    const entries = names.filter(name => Object.hasOwn(details ?? {}, name)).map(name => details[name])
    return Promise.all(entries.filter(entry => entry?.blobId).map(async entry => {
      const blob = await api.readLocalAttachment(id, entry.blobId)
      if (!blob) throw new Error('Attachment unavailable')
      return { name: entry.name, blob }
    }))
  }

  async function startPrompt(id, queued) {
    const session = api.getChat(id)
    const freshSend = session && record.newChatDraft === session
    const input = queued ? session?.queue?.[0] : session
    const preparing = preparingPrompts.current
    if (!input || session.pending || (queued && session.activity?.queuePaused) || preparing.has(id)) return
    preparing.add(id)
    const { draft, source, projectId, groupReply, attachments: names, attachmentDetails: details } = input
    const active = () => preparing.has(id) && api.current() === record && api.getChat(id) === session
    const isCurrent = () => active() && (queued
      ? session.queue?.[0] === input && !session.activity?.queuePaused
      : session.draft === draft && session.source === source && session.projectId === projectId && session.groupReply === groupReply &&
        session.attachments === names && session.attachmentDetails === details)
    let files
    try {
      files = await readPromptFiles(id, names, details)
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
    if (result.ok) {
      if (freshSend && viewedChat.current === id) {
        const collapsed = record.navigation?.collapsedProjects ?? []
        if (collapsed.includes(session.projectId)) api.updateNavigation({ collapsedProjects: collapsed.filter(id => id !== session.projectId) })
        select(id, 'projects')
      }
      runPrompt(id, runId, files)
    }
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
    if (live) {
      if (group) void rooms.send(chat, members)
      else void gateway.send(composerChat, project?.folder)
      return
    }
    if (group && members.length < 2) { report('群聊成员不可用，无法发送。', true); return }
    if (composerChat.pending || composerChat.queue?.length) {
      if (api.queuePrompt(composerChat.id, crypto.randomUUID())) refresh()
      if (!composerChat.pending && !composerChat.activity?.queuePaused) startQueue(composerChat.id)
      return
    }
    void startPrompt(composerChat.id, false)
  }

  function stop() {
    if (live) {
      if (group) void rooms.control(chat.id, 'groups.stop', { cancel_id: crypto.randomUUID() })
      else void gateway.stop(chat)
      return
    }
    const stopped = group ? agent.request('groups.stop', { room_id: chat.id }).cancelled > 0
      : agent.request('session.interrupt', { session_id: chat.id }).status === 'interrupted'
    if (stopped) report(group ? '已停止讨论' : '已停止生成')
    else if (api.recoverOrphanedAgentRuns()) {
      refresh()
      report('已结束中断的模拟运行')
    }
  }

  function continueDiscussion() {
    const discussion = chat.agentRun?.room?.paused
    if (!discussion) return
    if (live) { void rooms.control(chat.id, 'groups.continue', { discussion_event_id: discussion }); return }
    const result = agent.request('groups.continue', { room_id: chat.id, discussion_event_id: discussion })
    if (!result.continued) report('这轮讨论已无法继续。', true)
  }

  function respondAgent(request, value) {
    if (live) {
      if (group) {
        const { member_id, task_id, execution_generation } = request.params
        void rooms.control(chat.id, 'groups.approve', { request_id: request.id, choice: value, member_id, task_id, execution_generation })
      } else void gateway.respond(chat, request, value)
      return
    }
    const resolved = request.method === 'approval'
      ? group ? agent.request('groups.approve', { room_id: chat.id, request_id: request.id, choice: value,
        member_id: request.params.member_id, task_id: request.params.task_id,
        execution_generation: request.params.execution_generation }).approved
        : agent.request('approval.respond', { session_id: chat.id, request_id: request.id, choice: value }).resolved
      : agent.respond(chat.id, request.id, value)
    if (resolved) {
      api.resolveAgentRequest(chat.id, request.id)
      refresh()
    } else if (api.recoverOrphanedAgentRuns()) refresh()
  }

  function fillScenario(prompt) {
    if (api.fillDemoPrompt(composerChat.id, prompt)) refresh()
    else if (composerChat.draft.length) report('已保留草稿 · 清空输入后可填入演示示例')
  }

  function updateQueue(runId, text) {
    if (api.updateQueuedPrompt(chat.id, runId, text)) refresh()
  }

  function resumeQueue() {
    api.pausePromptQueue(chat.id, false)
    startQueue(chat.id)
  }

  async function retryTurn() {
    const input = chat.lastInput
    if (group) {
      if (!input || chat.pending || preparingPrompts.current.has(chat.id)) return
      preparingPrompts.current.add(chat.id)
      const isCurrent = () => api.current() === record && api.getChat(chat.id)?.lastInput === input
      try {
        const files = await readPromptFiles(chat.id, input.attachments ?? [], input.attachmentDetails)
        const runId = crypto.randomUUID()
        if (isCurrent() && api.retryGroupPrompt(chat.id, input.runId, runId)) {
          runPrompt(chat.id, runId, files, true)
          refresh()
        }
      } catch {
        if (isCurrent()) report('无法读取本地附件，本轮暂不能重试。', true)
      } finally { preparingPrompts.current.delete(chat.id) }
      return
    }
    if (!input || chat.pending || hasPromptContent({ text: chat.draft, attachments: chat.attachments })) return
    api.changeChat(chat.id, {
      draft: input.text, retryDemo: input.text,
      attachments: input.attachments ?? [], attachmentDetails: input.attachmentDetails ?? {},
    })
    refresh()
  }

  function onCommand(name, arg = '') {
    if (name === 'new') newChat()
    else if (name === 'title' && chat && arg.trim()) { api.renameChat(chat.id, arg); refresh() }
    else if (name === 'journey') navigate('memory')
    else if (name === 'skills') navigate('skills')
    else if (name === 'cron') navigate('tasks')
    else if (name === 'tools' && chat && availableTools.length) {
      setView('split')
      openToolHome()
    }
    else if (name === 'status') report(composerChat.pending ? '会话正在执行' : '会话空闲')
    else if (name === 'compact') report('已模拟请求压缩上下文')
    else if (name === 'resume' && record.chats[arg.trim()]) select(arg.trim())
    else return false
    return true
  }

  function logout() {
    api.logout()
    onLogout?.()
    refresh()
  }

  useEffect(() => {
    function shortcuts(event) {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault()
        event.stopPropagation()
        finishPanelDrag(false)
        return
      }
      if (event.defaultPrevented || event.target.closest('dialog, :popover-open')) return
      if (event.key === 'Escape') {
        if (floatingSection && !contextAction) {
          closeRailPanel(true)
          return
        }
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
        newChat()
      }
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  })

  function commitPanelWidth(field, width, botResize) {
    if (api.current() !== record) return
    if (botResize) {
      const patch = botSidebarWidthPatch(width >= botCompactThreshold ? Math.max(botSidebarExpandedMinimum, width) : width)
      setBotSidebarWidth(patch.sidebarWidth)
      api.updateNavigationModule('bots', patch)
    } else {
      setPanels(current => ({ ...current, [field]: width }))
      api.savePanelWidth(field, width)
    }
  }

  function expandBots() {
    commitPanelWidth('side', expandedBotSidebarWidth(record.navigation?.modules?.bots, panels.side), true)
  }

  function finishPanelDrag(commit, event) {
    const current = drag.current
    if (!current || (event && current.pointerId !== event.pointerId)) return
    drag.current = null
    setDragging(false)
    if (commit && current.width != null && current.width !== current.start[current.field]) {
      commitPanelWidth(current.field, current.width, current.botResize)
    } else {
      setPanels(current.saved)
      setBotSidebarWidth(current.savedBotWidth)
    }
    const target = event?.currentTarget ?? current.target
    if (target?.hasPointerCapture(current.pointerId)) target.releasePointerCapture(current.pointerId)
  }

  useEffect(() => {
    if (drag.current && (drag.current.section !== section || !contextVisible)) finishPanelDrag(false)
  }, [section, contextVisible])

  function separator(edge) {
    const field = edge === 'left' ? 'side' : 'tools'
    const dimension = fitted[field]
    const botResize = botSidebar && edge === 'left'
    const minimum = botResize ? botSidebarCompactWidth : minSidebarWidth(viewport, split)
    return <div className={'separator ' + edge} role="separator" tabIndex={0} aria-orientation="vertical"
      aria-label={edge === 'left' ? botResize ? '调整 Bot 列表宽度' : '调整项目栏宽度' : '调整工具栏宽度'}
      aria-valuenow={Math.round(dimension)} aria-valuemin={edge === 'left' ? minimum : minToolWidth(viewport)}
      aria-valuetext={botResize && botCompact ? '头像栏' : undefined}
      onDoubleClick={botResize ? expandBots : undefined}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, pointerId: event.pointerId, target: event.currentTarget, field, section, botResize,
          start: fitted, saved: panels, savedBotWidth: botSidebarWidth }
        setDragging(true)
      }}
      onPointerMove={event => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return
        const { x, start, saved } = drag.current
        const resized = resizePanels(start, viewport, edge, event.clientX - x, contextVisible, split, botResize ? botSidebarCompactWidth : undefined)
        drag.current.width = resized[field]
        if (botResize) setBotSidebarWidth(resized.side)
        else setPanels({ ...saved, [field]: resized[field] })
      }}
      onPointerUp={event => finishPanelDrag(true, event)}
      onPointerCancel={event => finishPanelDrag(false, event)}
      onLostPointerCapture={event => finishPanelDrag(false, event)}
      onKeyDown={event => {
        if (!(botResize ? ['ArrowLeft', 'ArrowRight', 'Home', 'End'] : ['ArrowLeft', 'ArrowRight']).includes(event.key)) return
        event.preventDefault()
        if (botResize) {
          const maximum = resizePanels(fitted, viewport, edge, 10000, contextVisible, split, botSidebarCompactWidth).side
          const width = botSidebarKeyWidth(botSidebarWidth, event.key, expandedBotSidebarWidth(record.navigation?.modules?.bots, panels.side), maximum)
          commitPanelWidth(field, Math.min(width, Math.max(botSidebarExpandedMinimum, maximum)), true)
        } else {
          const resized = resizePanels(fitted, viewport, edge, event.key === 'ArrowRight' ? 16 : -16, contextVisible, split)
          commitPanelWidth(field, resized[field], false)
        }
      }} />
  }

  function renderContext(target, visible, floating = false) {
    return <ContextList key={target} section={target} record={record} account={account} select={select} newChat={newChat}
      compact={target === 'bots' && !floating && botCompact} onExpandBots={expandBots}
      chat={target === section ? chat : record.chats[lastChatInSection(record, target)]}
      selectedItem={target === section ? item : record.navigation?.modules?.[target]?.item}
      visible={visible} onOpenSection={floating ? () => navigate(target) : undefined}
      onSearchChange={patch => { if (api.updateNavigationModule(target, patch)) refresh() }}
      onListScroll={scrollTop => api.updateNavigationModule(target, { scrollTop })}
      createProject={() => startProject()} onToggleProject={toggleProject} onManageProject={id => manage('project-settings', id)}
      onProjectMarkerChange={(id, marker) => {
        if (live) {
          void mutateProject('projects.update', { id, color: marker.value, icon: '' })
            .catch(error => report(error.message, true))
          return true
        }
        if (!api.setProjectMarker(id, marker)) return false
        refresh()
        return true
      }}
      onCreateBot={kind => { setBotCreateRequest({ kind, id: crypto.randomUUID() }); manage('bot-settings') }}
      onMarkUnread={id => { api.changeChat(id, { unread: !record.chats[id]?.unread }); refresh() }}
      onManageBots={id => id ? openBotSettings(id) : manage('bot-settings')} onChatMenu={(event, id) => openContext(event, 'sidebar', id)}
      selectItem={selected => target === 'bot-settings' && selected ? openBotSettings(selected) : manage(target, selected)} />
  }

  function openNativeSurface(surface) {
    if (!live?.native || api.current() !== record) return
    void live.openNativeSurface(surface).catch(error => { if (api.current() === record) report(error.message, true) })
  }

  async function mutateProject(method, params) {
    const result = await live.rpc(method, params)
    const inventory = await live.rpc('projects.list')
    if (api.accountId === account.id) { api.syncGatewayInventory(inventory.projects); refresh() }
    return result
  }

  const NativePet = nativePrimary.current?.PetSurface
  return <div className={'window ' + (full ? 'full-view ' : '') + (dragging ? 'dragging' : '')}
    style={style} data-view={view} onPointerDown={event => {
      if (menu && !event.target.closest('.rail, .title-tool-region')) setMenu('')
      if (floatingSection && !event.target.closest('#rail-panel, .rail-panel-trigger, .tab-context-menu, dialog')) closeRailPanel()
    }}>
    <header className="titlebar">
      {contextVisible && <span className="title-divider sidebar-divider" aria-hidden="true" />}
      {split && <span className="title-divider tool-divider" aria-hidden="true" />}
      {!full && <IconButton icon="sidebar" label={contextVisible ? '收起侧栏' : '展开侧栏'}
        aria-expanded={contextVisible} onClick={toggleSidebar} />}
      {window.aiwataNativeRuntime && <span className="native-titlebar-drag" aria-hidden="true" />}
      {!full && <div className="title-spacer" />}
      {!full && !replacesChat && isChat && record.openChats.length > 0 && <TabStrip label="会话标签" className="session-tabs"
        tabs={record.openChats.map(id => {
          const item = record.chats[id]
          const marker = record.projects.find(project => project.id === item.projectId)?.marker
          const hasTool = live ? (item.gatewayStoredId && !item.gatewayRoom
            ? supportedLiveTools.includes(toolType(item, item.tool)) : toolType(item, item.tool) === liveBrowserTool) : item.tool
          const targetView = viewAtWidth(hasTool ? item.view : 'hidden', viewport, sidebar)
          return { id, title: item.title, chat: item, marker, deferSelect: !chatFocus && targetView !== view }
        })}
        active={chatId} layout={chatFocus} onSelect={select} onDoubleClick={toggleChatFocus}
        onClose={closeChatTabs} onMenu={(event, id) => openContext(event, 'chat', id)} />}
      {chat && availableTools.length > 0 && <div className={'title-tool-region ' + (visibleTools ? 'with-tabs' : '')}>
        {visibleTools && <TabStrip label="工具标签" className="tool-tabs"
          tabs={toolTabs.map(toolTabData)}
          active={activeTool} layout={full} onSelect={selectTool} onClose={closeToolTabs}
          onDoubleClick={id => {
            if (id !== chat.tool) selectTool(id)
            setView(full ? 'split' : 'full')
          }}
          onMenu={(event, id) => openContext(event, 'tool', id)} onPreview={previewTab} onPreviewEnd={clearPreview} />}
        <div className="title-tools">
        {visibleTools && <IconButton icon="add" label="添加工具标签" onClick={() => openToolHome()} />}
        {visibleTools && <IconButton icon={full ? 'split' : 'full'}
          label={full ? '恢复分栏' : '进入完整视图'}
          onClick={() => setView(full ? 'split' : 'full')} />}
        <IconButton icon="tools" label={visibleTools ? '隐藏工具' : '打开工具'} aria-expanded={visibleTools}
          onClick={() => setView(visibleTools ? 'hidden' : 'split')} />
        </div>
      </div>}
    </header>
    {visibleTools && preview?.chatId === chatId && <div className="tab-preview" style={{ left: preview.left }} aria-hidden="true" inert>
      <div className="tab-preview-image">
        <div className="tab-preview-surface">
          {live ? renderLiveTool(preview.tool, true)
            : <ToolPanel active={toolType(chat, preview.tool)} data={toolDataFor(preview.tool)} chat={toolChat(chat, preview.tool)} project={project} api={api} preview />}
        </div>
      </div>
      <div className="tab-preview-title"><TabIcon {...toolTabData(preview.tool)} size={14} />{toolTabData(preview.tool).title}</div>
    </div>}
    <div className="workspace-body">
      <div data-tour="sessions" className="rail-track" inert={full}>
        <Rail onManageConnections={onManageConnections} onOpenNativeSurface={live?.native ? openNativeSurface : undefined} active={section} navigate={navigate} account={account} balance={record.credits} menu={menu} setMenu={setMenu} live={Boolean(live)}
          onManageCapabilities={kind => { setMenu(''); setCapabilityPanel(kind) }} logout={logout} onOffline={onOffline} openAccount={navigate} collapsed={!contextVisible}
          panel={floatingSection} onOpenPanel={openRailPanel} onLeavePanel={leaveRailPanel} />
      </div>
      <div className="context-track" inert={!contextVisible}>
        <aside className="context" aria-label="上下文侧栏">{renderContext(section, contextVisible)}</aside>
        {contextVisible && separator('left')}
      </div>
      {composerChat ? <main data-tour="composer" className="chat-pane" aria-label={group ? '群聊' : bot ? 'Bot 私聊' : draftChat ? '新建会话' : undefined} inert={replacesChat}>
        {live && <p className="live-connection" role="status">{gateway.status === 'connected' ? connectedLabel
          : gateway.status === 'expired' ? '连接已过期，请重新登录' : '正在连接 AIWATA…'}</p>}
        {live && !group && <LiveAgentInspector live={live} chat={composerChat} connected={gateway.status === 'connected'} />}
        {live && gateway.desktopRequests?.map(request => <DesktopRequestCard key={(request.profile ?? '') + ':' + request.id} request={request}
          onRespond={respondDesktopChoice} disabled={gateway.desktopRequestBusy === request.id} error={gateway.desktopRequestError} />)}
        {live && !group && composerChat.connectionRequest && <LiveConnectionRequest key={composerChat.id + ':' + composerChat.connectionRequest.op_id}
          live={live} chat={composerChat} request={composerChat.connectionRequest} report={report} onUpdate={snapshot => {
            if (api.current() !== record || api.getChat(composerChat.id) !== composerChat) return
            const next = mergeConnectionRequest(composerChat.connectionRequest, snapshot)
            if (next !== composerChat.connectionRequest) { api.changeChat(composerChat.id, { connectionRequest: next }); refresh() }
          }} />}
        {live && draftChat && !draftChat.gatewayModelPick && gateway.model?.error && <p className="live-connection management-error" role="alert">
          模型暂不可用。{gateway.model.error} <button type="button" className="secondary" onClick={gateway.checkModel}>重新检查</button>
        </p>}
        {(bot || group) && !full && <BotConversationHeader bot={bot} group={group} chat={chat} members={members} account={account}
          onManage={() => openBotSettings(bot?.id || chat.id)} />}
        <div className="transcript-region" inert={full}><Transcript key={composerChat.id + ':' + transcriptVersion} chat={composerChat} project={project} bot={bot} group={group} members={members} account={account}
          visible={!full && !replacesChat} onPositionChange={transcriptPosition => {
            if (chat && api.current()?.chats[chat.id] === chat) api.changeChat(chat.id, { transcriptPosition })
          }}
          onRetry={live && group ? undefined : retryTurn} onPreview={data => openPreview(composerChat.id, data)} onScenario={live ? undefined : fillScenario}
          onFilePreview={live && availableTools.includes(liveFileTool) ? file => openFilePreview(chat.id, file) : undefined}
          onReply={group ? messageId => { if (api.setGroupReply(chat.id, messageId)) refresh() } : undefined}
          onAttachmentPreview={setAttachmentPreview} /></div>
        {group && chat.agentRun?.room?.paused && <DiscussionPause onContinue={continueDiscussion} onStop={stop}
          disabled={Boolean(live && (rooms.busy || gateway.status !== 'connected'))} />}
        {live && group && (rooms.error || chat.roomError || !chat.roomReady) && <p className="live-connection" role="status">
          {rooms.error || chat.roomError || (chat.roomReady === false ? 'AIWATA 群聊驱动暂不可用。' : '正在读取群聊驱动状态…')}
        </p>}
        {live && group && chat.roomApprovals?.map(request => <AgentRequest key={request.params.task_id + ':' + request.id}
          request={request} onRespond={respondAgent} disabled={Boolean(rooms.busy || gateway.status !== 'connected')} />)}
        {live && group && chat.roomAttempts?.map(attempt => <section className="agent-request" key={attempt.kind + ':' + attempt.task_id}>
          <h3>{attempt.memberName}的任务待处理</h3>
          <button type="button" className="secondary" disabled={Boolean(rooms.busy || gateway.status !== 'connected')} onClick={() => {
            const { member_id, task_id, execution_generation, kind } = attempt
            void rooms.control(chat.id, kind === 'retry' ? 'groups.retry' : 'groups.discard', { member_id, task_id, execution_generation })
          }}>{attempt.kind === 'retry' ? '重试该成员' : '结束该成员的中断任务'}</button>
        </section>)}
        {live && chat?.gatewayUnknown && <section className="agent-request" aria-label="恢复中断的请求">
          <h3>上次请求因网关重启或异常中断</h3>
          <p>已保存的消息会保留。结束这次请求后，可以继续发送。</p>
          <button className="secondary" type="button" disabled={gateway.status !== 'connected' || gateway.resolving === chat.id}
            onClick={() => void gateway.resolveInterrupted(chat)}>结束中断的请求</button>
        </section>}
        {chat?.agentRun?.request && (full
          ? <button type="button" className="secondary agent-return" onClick={() => setView('hidden')}>查看待处理请求</button>
          : <AgentRequest key={chat.agentRun.request.id} request={chat.agentRun.request} onRespond={respondAgent} />)}
        {chat && <AgentQueue key={'queue:' + chat.id} chat={chat} onEdit={updateQueue} onResume={resumeQueue} />}
        <Composer key={'composer:' + composerChat.id} chat={composerChat} project={project} bot={bot} group={group} members={members} compact={full} api={api} refresh={refresh}
          autoFocus={Boolean(draftChat)} live={Boolean(live)} liveModel={gateway.model?.model} voiceService={live}
          modelService={live} onSelectModel={(selection, confirmation) => gateway.selectModel(composerChat, selection, confirmation)}
          completionService={group ? undefined : live} completionCwd={project?.folder}
          approvalService={live} approvalConnected={gateway.status === 'connected'}
          modelDisabled={Boolean(gateway.status !== 'connected' || gateway.sending || gateway.changingModel || composerChat.pending ||
            composerChat.gatewaySubmission || (composerChat.gatewayProfile && !composerChat.gatewayStoredId))}
          sendDisabled={Boolean(live && (gateway.status !== 'connected' || (group ? rooms.busy || rooms.error || !chat.roomReady
            : gateway.sending || gateway.changingModel || composerChat.pending || (draftChat && !draftChat.gatewayModelPick && gateway.model?.ok === false))))}
          stopDisabled={Boolean(live && group && (rooms.busy || gateway.status !== 'connected'))}
          onClearReply={() => { api.setGroupReply(chat.id, null); refresh() }}
          projectPicker={canChooseProject ? { projects: record.projects, select: chooseComposerProject, create: () => startProject(composerChat.id) } : undefined}
          send={send} stop={stop} report={report} assets={record.assets} onCommand={onCommand}
          onAttachmentPreview={setAttachmentPreview} />
      </main> : isChat ? <main data-tour="composer" className="chat-pane">
        <div className="welcome workspace-empty">
          <img className="welcome-banner" src="./aiwata-banner.svg" alt="AIWATA" />
          <h2>{section === 'bots' ? '选择一个 Bot 或群聊' : '打开一条会话开始工作'}</h2>
          {live && <small role="status">{gateway.status === 'connected' ? connectedLabel : gateway.status === 'expired' ? '连接已过期，请重新登录' : '正在连接 AIWATA…'}</small>}
          {section === 'projects' && <button className="secondary" onClick={() => newChat()}><Icon name="add" />新聊天</button>}
          {section === 'bots' && <button className="secondary" onClick={() => manage('bot-settings')}>管理全部 Bot</button>}
        </div>
      </main> : <ModulePage key={section} managed={isManaged} scrollTop={pageState?.mainScrollTop}
        onScrollChange={mainScrollTop => updateMainPage({ mainScrollTop }, false)}>
        {isManaged ? <Management section={section} selected={item} record={record} api={api} live={live} mutateProject={mutateProject}
          createRequest={botCreateRequest} onConsumeCreate={() => setBotCreateRequest(null)} onManageBot={openBotSettings}
          refresh={refresh} report={report} account={account} onOpenChat={select} onNavigate={navigate} onOpenProfileSection={openProfileSection}
          onOpenTaskSession={live?.native ? descriptor => {
            if (api.current() !== record) return
            void openNativeTaskSession({ host: window.hermesDesktop, route: live.route, descriptor }).catch(error => {
              if (api.current() === record) report(error.message, true)
            })
          } : undefined}
          pageState={pageState} onPageChange={updateMainPage} onGroupOpenChange={setGroupOpen}
          onSelectItem={selected => section === 'bot-settings' && selected ? openBotSettings(selected) : manage(section, selected)} />
          : <Directory section={section} selected={item} record={record} report={report} account={account} live={Boolean(live)} onOpenNativeSurface={live?.native ? openNativeSurface : undefined}
            search={pageState?.mainSearch} onSearchChange={mainSearch => updateMainPage({ mainSearch })} />}
      </ModulePage>}
      {activeTool && <section className="tool-pane" aria-label="工具面板" inert={!visibleTools}>
        {split && separator('right')}
        <div className="tool-scroll">
          {live ? renderLiveTool(activeTool)
            : <ToolPanel key={chat.id + activeTool} active={toolType(chat, activeTool)} openTool={openTool} chat={toolChat(chat, activeTool)}
              project={project} api={api} refresh={refresh} report={report} data={toolData} update={updateToolData}
              visible={visibleTools} onAttachmentPreview={setAttachmentPreview} />}
        </div>
      </section>}
      {floatingSection && <aside id="rail-panel" className="context context-flyout" ref={railPanelElement}
        aria-label={floatingSection === 'archive' ? '归档记录' : '浮动侧栏'} tabIndex={-1}
        onPointerEnter={() => clearTimeout(railPanelTimer.current)} onPointerLeave={leaveRailPanel}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) leaveRailPanel() }}>
        {floatingSection === 'archive'
          ? <ArchiveList live={live} record={record} chat={chat} select={select} onClose={() => closeRailPanel(true)}
            onChatMenu={(event, id) => openContext(event, 'sidebar', id)} />
          : renderContext(floatingSection, true, true)}
      </aside>}
    </div>
    {NativePet && nativePrimary.current?.pet && <NativePet controller={nativePrimary.current.pet} snapshot={nativePrimary.current.pet.snapshot()} />}
    {botSettingsId && <BotSettingsDrawer key={botSettingsId} name={settingsBot?.name ?? settingsGroup?.name ?? '已移除'}
      group={Boolean(settingsGroup)} busy={botSettingsBusy} onClose={closeBotSettings} returnFocus={botSettingsTrigger.current}>
      <Management section="bot-settings" embedded selected={botSettingsId} record={record} api={api} live={live}
        account={account} refresh={refresh} report={report} onDirtyChange={setBotSettingsDirty} onBusyChange={setBotSettingsBusy}
        onOpenChat={id => leaveBotSettings(() => select(id))}
        onNavigate={target => leaveBotSettings(() => navigate(target))}
        onOpenProfileSection={(target, profile) => leaveBotSettings(() => openProfileSection(target, profile))}
        onOpenNativeSettings={(surface, bot) => leaveBotSettings(() => {
          void live.openNativeSurface(surface, bot.profile).catch(error => {
            if (api.current() === record) report(error.message, true)
          })
        })} />
    </BotSettingsDrawer>}
    <NativeFileDialog controller={liveFiles.fileActions} />
    <NativeRemoteFolderDialog controller={nativeRemotePicker.current} />
    <NativeUpdateDialog controller={nativePrimary.current?.updates} />
    <NativeDeepLinkDialog controller={nativePrimary.current?.deepLinks} onOpenNativeSurface={live?.native ? openNativeSurface : undefined} />
    {contextAction && <ContextMenu position={contextAction} groups={menuGroups()} dismiss={dismissContext} />}
    {artifactPreview && artifactPreview.live===toolLive && api.getChat(artifactPreview.session.id)===artifactPreview.session && viewedChat.current===artifactPreview.session.id && <NativeArtifactPreview live={artifactPreview.live} sessionId={artifactPreview.storedId} target={artifactPreview.target} onClose={()=>setArtifactPreview(null)} />}
    {composerChat && attachmentPreview && <AttachmentPreview api={api} live={toolLive} sessionId={composerChat.gatewayStoredId} chatId={composerChat.id} entry={attachmentPreview}
      onClose={() => setAttachmentPreview(null)} />}
    {tabDialog && <TabDialog action={tabDialog} onClose={closeTabDialog} onSubmit={applyTabDialog} />}
    {creating && <ProjectDialog onClose={closeProject} pickFolders={live?.pickFolders} loadFolders={live?.folders} createFolder={live?.createFolder}
      onCreate={async (name, folders, marker) => {
      if (live) {
        const result = await mutateProject('projects.create', { name, folders,
          color: marker.value })
        if (api.accountId !== account.id || !result.project) return false
        if (canChooseProject && creating.chatId === composerChat.id) chooseComposerProject(result.project.id)
        closeProject()
        refresh()
        report('项目已创建')
        return true
      }
      const created = api.addProject(name, folders, { marker })
      if (!created) return false
      if (canChooseProject && creating.chatId === composerChat.id) chooseComposerProject(created.id)
      closeProject()
      refresh()
      report('项目已创建')
      return true
    }} />}
    {live && capabilityPanel === 'mcp' && <Suspense fallback={null}><LiveMcpManager live={live} bots={record.bots}
      initialProfile={composerChat?.gatewayProfile} onClose={() => setCapabilityPanel(null)} /></Suspense>}
    {live && capabilityPanel === 'models' && <Suspense fallback={null}><LiveProviderManager live={live} bots={record.bots}
      initialProfile={composerChat?.gatewayProfile} onClose={() => setCapabilityPanel(null)} onChanged={() => gateway.checkModel()} /></Suspense>}
    {desktopTip?.chatId === chat?.id && desktopTip?.accountId === account.id && <DesktopTip tip={desktopTip} onClose={() => setDesktopTip(null)} />}
    {toast && <div className={'toast ' + (toast.error ? 'toast-error' : '')} role={toast.error ? 'alert' : 'status'}>
      <Icon name={toast.error ? 'coins' : 'check'} />{toast.message}
    </div>}
  </div>
}
