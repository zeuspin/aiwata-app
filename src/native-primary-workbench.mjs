import { gatewayEvent } from './live-aiwata.mjs'
import { createNativePetController } from './native-pet-controller.mjs'
import { mergeConnectionRequest } from './connection-request.mjs'
import { createNativeDeepLinkController } from './native-deep-link-controller.mjs'
import { createNativeUpdateController } from './native-update-controller.mjs'
import { installNativePrimaryBridge } from './native-primary-bridge.mjs'

export function observeSystemTheme(environment, onChange) {
  const media = environment.matchMedia('(prefers-color-scheme: dark)')
  const changed = () => onChange(media.matches)
  changed(); media.addEventListener('change', changed)
  return () => media.removeEventListener('change', changed)
}

const rejected = message => ({ ok: false, code: 'submit-unavailable', retryable: true, message })
const plainChats = record => Object.values(record.chats).filter(chat => !chat.gatewayRoom && !chat.gatewayProfile && chat.gatewayStoredId)
const projectPaths = project => [project.primary_path, ...(project.folders ?? []).map(folder => folder.path)].filter(Boolean)
const containsPath = (root, path) => root === path || path.startsWith(root.replace(/\/$/, '') + '/')

/** Bind existing workspace operations to the PRIMARY native bridge. This owns
 * no connection and never interprets installation or authorization deep links.
 * Call publish after each workbench render and dispose before changing client. */
export function createNativePrimaryWorkbench({ host, live, api, accountId, primary = true, getCurrentChat,
  getStatus, getAppearance, getSystemDark, getTitleBarTheme, send, openChat, openDraft, refresh, loadOriginal, navigateNative, insertBlueprint, connectionDone, storage, storageNamespace, onSurfaceChange = () => {}, onGap = () => {} }) {
  if (!live?.native || !live.route) throw new TypeError('A native owner route is required.')
  const owner = Object.freeze({ ...live.route }), record = api.current(), gaps = new Map()
  let notify, updates, deepLinks, pet, PetSurface, petFlashTimer
  let petFlash = {}
  const originalSignalDisposers = []
  const petReadThrough = new Map(Object.values(record.chats).map(chat => [chat.id, chat.messages.length]))
  const gap = (feature, code) => {
    if (gaps.get(feature) === code) return
    gaps.set(feature, code); onGap({ feature, code })
  }
  const current = () => api.accountId === accountId && api.current() === record
  const themeSnapshot = () => {
    const appearance = getAppearance() ?? {}, preference = appearance.mode ?? 'light'
    const rendered = preference === 'dark' || preference === 'system' && getSystemDark() ? 'dark' : 'light'
    return { preference, rendered, ...getTitleBarTheme?.() }
  }
  if (!primary) {
    let disposed = false, lastMode, lastTitle
    const publish = () => {
      if (disposed || !current()) return
      const theme = themeSnapshot(), mode = theme.preference === 'system' ? 'system' : theme.rendered
      if (lastMode !== mode) { host.setNativeTheme?.(mode); lastMode = mode }
      const signature = JSON.stringify([theme.background, theme.foreground])
      if (theme.background && theme.foreground && signature !== lastTitle) {
        host.setTitleBarTheme?.({ background: theme.background, foreground: theme.foreground }); lastTitle = signature
      }
    }
    publish()
    return { publish, observe() {}, dispose() { disposed = true }, gaps: () => [] }
  }
  const actions = {
    async submitQuickEntry(payload, context) {
      if (!current() || !context.isCurrent() || getStatus() !== 'connected') return rejected('AIWATA 正在连接，请稍后重试。')
      let chat
      if (payload.target === 'current') chat = getCurrentChat()
      else if (payload.target !== 'new') chat = plainChats(record).find(row => row.gatewayStoredId === payload.target && !row.archived)
      if (payload.target !== 'new' && payload.target !== 'current' && !chat) return rejected('所选原生会话已不可用。')
      if (chat?.gatewayRoom || chat?.archived) return rejected('当前目标不能接收 Quick Entry 消息。')
      if (!chat) {
        const projectId = record.projects.some(project => project.id === record.lastProjectId) ? record.lastProjectId : null
        chat = api.openGatewayCaptureDraft(payload.correlationId, projectId)
      }
      if (!chat || api.getChat(chat.id) !== chat) return rejected('当前会话归属已变化。')
      const project = record.projects.find(project => project.id === chat.projectId)
      const result = await send(chat, project?.folder, { text: payload.text, runId: payload.correlationId,
        signal: context.signal, ...(payload.target !== 'current' && payload.target !== 'new' ? { expectedStoredId: payload.target } : {}) })
      // The shared submit operation returns only after native admission. It
      // preserves the composer and promotes capture drafts through workspace.
      return result
    },
    focusSession(identity) {
      const matches = Object.values(record.chats).filter(chat => !chat.gatewayRoom &&
        (chat.gatewayStoredId === identity || chat.gatewayId === identity))
      // Runtime identifiers may collide across Bot profiles; an event with no
      // owner route cannot prove which one was intended in that case.
      if (matches.length !== 1) { gap('focusSession', 'identity-unmapped'); return }
      openChat(matches[0].id)
    },
    async openFolder(context) {
      const selected = await live.pickFolders(context.signal)
      if (!context.isCurrent()) return
      const paths = Array.isArray(selected) ? selected : selected?.paths ?? []
      const folders = [...new Set(paths.filter(path => typeof path === 'string' && path.startsWith('/')))]
      if (!folders.length) return
      const inventory = await live.rpc('projects.list')
      if (!context.isCurrent()) return
      let project = (inventory.projects ?? []).filter(row => folders.every(path => projectPaths(row).some(root => containsPath(root, path))))
        .sort((left, right) => Math.max(...projectPaths(right).map(path => path.length)) - Math.max(...projectPaths(left).map(path => path.length)))[0]
      if (!project) {
        const target = folders[0]
        const created = await live.rpc('projects.create', { name: target.replace(/\/$/, '').split('/').at(-1) || target,
          folders, primary_path: target, use: true })
        if (!context.isCurrent()) return
        project = created.project
        if (!project?.id) throw new Error('原生项目未确认创建。')
        const updated = await live.rpc('projects.list')
        if (!context.isCurrent()) return
        api.syncGatewayInventory(updated.projects)
      } else api.syncGatewayInventory(inventory.projects)
      if (!context.isCurrent() || !api.current().projects.some(row => row.id === project.id)) return
      openDraft(project.id); refresh()
    },
  }
  const bridge = installNativePrimaryBridge({ host, owner, actions,
    getState: () => {
      const sessions = plainChats(record).map(chat => ({ id: chat.gatewayStoredId,
        title: chat.title, archived: chat.archived, updatedAt: chat.gatewayUpdatedAt }))
      sessions.sort((left, right) => (Date.parse(right.updatedAt) || Number(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || Number(left.updatedAt) || 0))
      const petSnapshot = pet?.snapshot()
      return { owner: current() ? owner : null,
        ...(petSnapshot ? { petOverlayActive: petSnapshot.active, petOverlay: petSnapshot.payload } : {}),
        quickEntry: { connected: current() && getStatus() === 'connected', sessions },
        theme: themeSnapshot() }
    },
    subscribe: callback => { notify = callback; return () => { notify = null } },
    onGap: value => gap(value.feature, value.code),
  })
  // Preserve the host's queued deep links until the new renderer has the
  // original reviewed install and connection-completion flows. A navigation
  // handler alone would consume installation links it cannot safely handle.
  pet = createNativePetController({ host, live, storage,
    storageNamespace: storageNamespace || 'aiwata-app-native:v1:' + JSON.stringify([owner.connectionId, owner.profile]),
    getContext: () => ({ ...owner, profile: getCurrentChat()?.gatewayProfile || owner.profile,
      sessionId: getCurrentChat()?.gatewayStoredId ?? getCurrentChat()?.gatewayId ?? null }),
    isCurrent: bridge.isCurrent, onChange: () => { notify?.(); onSurfaceChange() },
    onSubmit: async (text, context) => {
      if (!context.isCurrent()) return rejected('Pet 的原生会话归属已变化。')
      const selected = getCurrentChat()
      if (selected?.gatewayStoredId && selected.gatewayStoredId !== context.owner.sessionId) return rejected('Pet 的原生会话归属已变化。')
      return actions.submitQuickEntry({ text, target: 'current', correlationId: crypto.randomUUID() }, context)
    },
    onOpenApp: context => {
      if (!context.isCurrent()) return
      const recent = plainChats(record).filter(chat => chat.unread).sort((left, right) =>
        (Date.parse(right.gatewayUpdatedAt) || Number(right.gatewayUpdatedAt) || 0) - (Date.parse(left.gatewayUpdatedAt) || Number(left.gatewayUpdatedAt) || 0))[0]
        ?? plainChats(record)[0]
      for (const chat of Object.values(record.chats)) petReadThrough.set(chat.id, chat.messages.length)
      if (recent) openChat(recent.id)
    },
  })
  actions.submitPet = text => pet.submit(text)
  actions.popInPet = () => pet.popIn()
  actions.savePetBounds = bounds => pet.saveBounds(bounds)
  actions.setPetScale = scale => pet.setScale(scale)
  actions.openPetApp = () => pet.openApp()
  pet.publish(nativePetSignals(record, getCurrentChat(), petReadThrough, petFlash))
  void pet.start()
  if (typeof loadOriginal === 'function') void loadOriginal().then(library => {
    if (!bridge.isCurrent()) return
    PetSurface = library.NativePetSurface
    for (const [store, field] of [[library.petReaction, 'reaction'], [library.petPluginMessages, 'pluginMessages']]) {
      if (store?.listen) originalSignalDisposers.push(store.listen(() => {
        if (bridge.isCurrent()) pet.publish({ [field]: store.get() })
      }))
    }
    updates = createNativeUpdateController({ host, original: library.updates, copySelection: library.copyTextThroughSelection, isCurrent: bridge.isCurrent, onChange: onSurfaceChange })
    actions.openUpdates = () => updates.open()
    deepLinks = createNativeDeepLinkController({ library, live, host, isCurrent: bridge.isCurrent, onChange: onSurfaceChange,
      navigate: navigateNative, insertBlueprint, connectionDone, onInstalled: () => refresh() })
    actions.deepLink = payload => deepLinks.receive(payload)
    bridge.releaseDeepLinks()
    gaps.delete('deepLink'); gaps.delete('openUpdates'); gaps.delete('nativeSurfaces')
    onSurfaceChange()
  }).catch(() => { if (bridge.isCurrent()) gap('nativeSurfaces', 'original-library-unavailable') })
  return { get pet() { return pet }, get PetSurface() { return PetSurface }, get updates() { return updates }, get deepLinks() { return deepLinks }, publish() { pet?.publish(nativePetSignals(record, getCurrentChat(), petReadThrough, petFlash)); notify?.() }, dispose() { clearTimeout(petFlashTimer); originalSignalDisposers.splice(0).forEach(off => off()); updates?.dispose(); deepLinks?.dispose(); pet?.dispose(); bridge.dispose() },
    observe(frame) {
      if (frame.method !== 'event' || !bridge.isCurrent()) return
      const event = frame.params, profile = frame.profile || owner.profile || 'default'
      if (event?.type === 'pet.changed' && profile === pet?.snapshot().owner?.profile) return pet.refresh()
      if (event?.type !== 'message.complete') return
      const owned = Object.values(record.chats).find(chat => (chat.gatewayId === event.session_id || chat.gatewayStoredId === event.session_id) &&
        (chat.gatewayProfile || owner.profile || 'default') === profile)
      if (!owned || event.seq != null && event.replay_epoch === owned.gatewayEpoch && event.seq <= (owned.gatewaySeq ?? 0) ||
          event.execution_generation != null && owned.gatewayGeneration != null && event.execution_generation < owned.gatewayGeneration) return
      const outcome = gatewayEvent(event).data.status
      petFlash = outcome === 'error' ? { error: true } : outcome === 'complete' ? { justCompleted: true } : {}
      clearTimeout(petFlashTimer)
      pet.publish(nativePetSignals(record, getCurrentChat(), petReadThrough, petFlash))
      petFlashTimer = setTimeout(() => {
        if (!bridge.isCurrent()) return
        petFlash = {}; pet.publish(nativePetSignals(record, getCurrentChat(), petReadThrough, petFlash))
      }, 1600)
    },
    gaps: () => [...gaps].map(([feature, code]) => ({ feature, code })) }
}

/** Match an existing operation before waking it. A return URL never supplies
 * authorization state or invents a new operation/session owner. */
export async function resumeNativeConnectionDone({ api, record, live, action, select, refresh }) {
  if (api.current() !== record) return false
  const matches = Object.values(record.chats).filter(chat => chat.connectionRequest?.op_id === action.op)
  if (matches.length !== 1) return false
  const owned = matches[0]
  if (owned.connectionRequest.settled) return true
  const owner = { type: 'session', session_id: owned.gatewayStoredId }
  if (!owner.session_id) return false
  await live.rpc('connectors.operation.wake', { op_id: action.op, owner }, owned.gatewayProfile)
  if (api.current() !== record || api.getChat(owned.id) !== owned) return false
  const status = await live.rpc('connectors.operation.status', { op_id: action.op, owner }, owned.gatewayProfile)
  if (api.current() !== record || api.getChat(owned.id) !== owned) return false
  api.changeChat(owned.id, { connectionRequest: mergeConnectionRequest(owned.connectionRequest, status) })
  select(owned.id); refresh(); return true
}


/** Signals are projections of the same native admission/event state the chat
 * renders. Historic unread rows do not manufacture a new Pet mail event. */
export function nativePetSignals(record, selected, readThrough = new Map(), flash = {}) {
  const chats = [...Object.values(record.chats), ...Object.values(record.gatewayCaptureDrafts ?? {})]
  const awaiting = chat => Boolean(chat?.activity?.needsInput || chat?.agentRun?.request || chat?.gatewayUnknown)
  const busy = chats.some(chat => Boolean(chat.pending))
  return { activity: { busy, awaitingInput: chats.some(awaiting),
    toolRunning: Boolean(selected?.pending && Object.values(selected.agentRun?.tools ?? {}).some(tool => !tool.complete)),
    error: Boolean(flash.error), ...(flash.justCompleted ? { justCompleted: true } : {}) },
    busy: Boolean(selected?.pending), awaiting: awaiting(selected),
    unread: chats.some(chat => chat.unread && readThrough.get(chat.id) !== chat.messages.length),
    }
}


/** A cron-history descriptor names an existing native session, never a URL or
 * pseudo-session route. The current connection is the only admissible source. */
export async function openNativeTaskSession({ host, route, descriptor }) {
  if (!descriptor || !descriptor.sessionId || descriptor.connectionId !== route.connectionId || !descriptor.profile) throw new Error('任务会话的原生归属已变化。')
  const result = await host.openSessionWindow(descriptor.sessionId, {
    connectionId: descriptor.connectionId, profile: descriptor.profile, ...(descriptor.readOnly ? { watch: true } : {}) })
  if (!result?.ok) throw new Error(result?.error || '无法打开原生任务会话。')
  return result
}
