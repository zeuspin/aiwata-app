const profileKey = profile => !profile || profile === 'default' ? 'default' : profile
const sameOwner = (left, right) => Boolean(left && right && left.connectionId === right.connectionId && profileKey(left.profile) === profileKey(right.profile))
const nonempty = value => typeof value === 'string' && value.length > 0
const boundsValid = value => value && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key])) && value.width > 0 && value.height > 0

function quickState(state) {
  return {
    connected: state?.connected === true,
    sessions: (Array.isArray(state?.sessions) ? state.sessions : [])
      .filter(row => !row.archived && nonempty(row.id)).slice(0, 5)
      .map(row => ({ id: row.id, title: row.title?.trim() || row.preview?.trim() || row.id })),
  }
}

function submitResult(value, target) {
  if (!value || typeof value.ok !== 'boolean') return { ok: false, code: 'timeout', retryable: false, message: 'Native prompt acceptance was not confirmed.' }
  if (value.ok && target !== 'current' && target !== 'new' && value.sessionId !== target) {
    return { ok: false, code: 'submit-identity-mismatch', retryable: false, message: 'The prompt was accepted by a different session than the one requested.' }
  }
  if (value.ok && target === 'new' && (!nonempty(value.sessionId) || !nonempty(value.runtimeSessionId))) {
    return { ok: false, code: 'timeout', retryable: false, message: 'Native acceptance did not identify the new session.' }
  }
  // Only the original QuickEntrySubmitResult crosses IPC; never project a
  // callback's gateway result, connection descriptor or credentials wholesale.
  const result = { ok: value.ok }
  for (const key of ['code', 'message']) if (typeof value[key] === 'string') result[key] = value[key]
  if (typeof value.retryable === 'boolean') result.retryable = value.retryable
  for (const key of ['sessionId', 'runtimeSessionId']) if (value[key] === null || typeof value[key] === 'string') result[key] = value[key]
  return result
}

/**
 * Primary renderer only; install once per immutable connection/profile lifetime.
 * No gateway, runtime, storage, route mutation or native window creation lives here.
 *
 * getState(): { owner:{connectionId,profile}, quickEntry:{connected,sessions},
 *   petOverlayActive?:boolean, petOverlay?:PetOverlayStatePayload,
 *   theme?:{preference:'system'|'light'|'dark', rendered:'light'|'dark'} }
 * sessions are native stored-session rows (id/title/preview/archived), newest first.
 * subscribe(notify) returns a disposer and must fire when this snapshot changes,
 * including owner/logout changes. Dispose before swapping account/client instances.
 *
 * Every action receives (...args, context), where context is frozen
 * {owner,signal,isCurrent}. Actions must bind native work to context.owner and
 * check isCurrent()/signal before any asynchronous UI mutation or further send.
 * submitQuickEntry(payload,context) MUST resolve the native QuickEntrySubmitResult
 * only after the existing normal submit path proves acceptance/non-acceptance.
 * Preserve payload.target, including current/new/stored id; picked sessions must
 * return the same sessionId, new sessions must return both accepted identities.
 * Current-chat slash commands may return {ok:true} without a backend identity.
 *
 * Other actions: deepLink(originalPayload,ctx), focusSession(originalId,ctx),
 * openFolder(ctx), openUpdates({target:'client'},ctx), submitPet(text,ctx),
 * popInPet(ctx), savePetBounds(bounds,ctx), setPetScale(scale,ctx), openPetApp(ctx).
 * focusSession must use native runtime-to-stored mapping and existing Bot scope.
 * deepLink must use original confirmation/authorization flows, never auto-install.
 * popInPet owns closing the original overlay + active-state update; openPetApp
 * owns clearing unread + opening the most recent native thread. Bounds/scale
 * persistence stays with the owning feature; the adapter persists nothing.
 *
 * petOverlay is the exact native store snapshot, including plugin bubble lines,
 * reaction nonce, cross-session activity and primary busy/awaiting. Omit it when
 * unavailable; never synthesize a sprite from Bot avatars or mock activity.
 * onGap({feature,code}) reports unavailable/unimplemented/failed actions without
 * claiming success. Deep links are released only when a handler is supplied.
 */
export function installNativePrimaryBridge({ host, owner, getState, subscribe, actions = {}, onGap = () => {} }) {
  if (!nonempty(owner?.connectionId) || typeof getState !== 'function') throw new TypeError('Native primary bridge requires an explicit owner route and getState.')
  const route = Object.freeze({ connectionId: owner.connectionId, profile: profileKey(owner.profile) })
  const aborter = new AbortController(), disposers = [], correlations = new Set(), reported = new Map()
  let disposed = false, lastTheme, lastTitleBar, deepLinksReady = false
  const gap = (feature, code) => {
    if (reported.get(feature) === code) return
    reported.set(feature, code)
    onGap(Object.freeze({ feature, code }))
  }
  function dispose() {
    if (disposed) return
    disposed = true; aborter.abort()
    for (const off of disposers.splice(0)) off()
    correlations.clear()
  }
  function isCurrent() {
    if (disposed) return false
    if (sameOwner(route, getState()?.owner)) return true
    // The global capture surface must stop offering an old owner's sessions.
    host?.quickEntry?.pushState?.({ connected: false, sessions: [] })
    dispose()
    return false
  }
  const context = Object.freeze({ owner: route, signal: aborter.signal, isCurrent })
  const retain = off => { if (typeof off === 'function') { if (disposed) off(); else disposers.push(off) } }
  const listen = (api, name, callback) => {
    if (typeof api?.[name] === 'function' && !disposed) retain(api[name](value => { if (isCurrent()) callback(value) }))
  }
  function invoke(name, ...args) {
    if (!isCurrent()) return
    if (typeof actions[name] !== 'function') { gap(name, 'action-unavailable'); return }
    try {
      const result = actions[name](...args, context)
      if (result && typeof result.then === 'function') void result.catch(() => { if (isCurrent()) gap(name, 'action-failed') })
    } catch { if (isCurrent()) gap(name, 'action-failed') }
  }
  function pushPet() {
    if (!isCurrent()) return
    const payload = getState()?.petOverlay
    if (!payload) { gap('petOverlay', 'state-unavailable'); return }
    host?.petOverlay?.pushState?.({ info: payload.info, activity: payload.activity, busy: payload.busy,
      awaiting: payload.awaiting, unread: payload.unread, reaction: payload.reaction,
      ...(payload.pluginMessages === undefined ? {} : { pluginMessages: payload.pluginMessages }) })
  }
  function publish() {
    if (!isCurrent()) return
    const state = getState()
    host?.quickEntry?.pushState?.(quickState(state.quickEntry))
    if (state.petOverlayActive) pushPet()
    const theme = state.theme
    if (!theme || !['system', 'light', 'dark'].includes(theme.preference) || !['light', 'dark'].includes(theme.rendered)) return
    const mode = theme.preference === 'system' ? 'system' : theme.rendered
    if (mode !== lastTheme) { host?.setNativeTheme?.(mode); lastTheme = mode }
    if (nonempty(theme.background) && nonempty(theme.foreground)) {
      const signature = JSON.stringify([theme.background, theme.foreground])
      if (signature !== lastTitleBar) { host?.setTitleBarTheme?.({ background: theme.background, foreground: theme.foreground }); lastTitleBar = signature }
    }
  }
  async function quickSubmit(raw) {
    // The native relay uses a correlation id. Legacy bare strings have none and
    // cannot be acknowledged safely (the original primary bridge ignores them).
    if (!raw || typeof raw !== 'object' || !nonempty(raw.correlationId) || typeof raw.text !== 'string' || !raw.text.trim()) return
    const { correlationId, text } = raw
    if (correlations.has(correlationId)) return
    correlations.add(correlationId)
    const target = nonempty(raw.target) ? raw.target : 'current'
    let result
    if (typeof actions.submitQuickEntry !== 'function') {
      gap('submitQuickEntry', 'action-unavailable')
      result = { ok: false, code: 'submit-unavailable', retryable: true, message: 'The native prompt submit path is unavailable.' }
    } else {
      try { result = submitResult(await actions.submitQuickEntry({ correlationId, target, text }, context), target) }
      catch {
        // The callback may have dispatched before throwing; only explicit
        // non-admission proof can offer retry. The native composer understands
        // timeout as unknown and retains the draft without double-submitting.
        result = { ok: false, code: 'timeout', retryable: false, message: 'Native prompt acceptance is unknown.' }
      }
    }
    if (isCurrent()) host?.quickEntry?.ackSubmit?.(correlationId, result)
  }
  if (!isCurrent()) return { dispose, isCurrent, context, gaps: () => [...reported].map(([feature, code]) => ({ feature, code })) }
  listen(host?.quickEntry, 'onSubmit', raw => { void quickSubmit(raw) })
  listen(host?.petOverlay, 'onControl', payload => {
    if (!payload) return
    if (payload.type === 'ready') pushPet()
    else if (payload.type === 'pop-in') invoke('popInPet')
    else if (payload.type === 'submit' && typeof payload.text === 'string') invoke('submitPet', payload.text)
    else if (payload.type === 'bounds' && boundsValid(payload.bounds)) invoke('savePetBounds', { x: payload.bounds.x, y: payload.bounds.y, width: payload.bounds.width, height: payload.bounds.height })
    else if (payload.type === 'scale' && Number.isFinite(payload.scale) && payload.scale > 0) invoke('setPetScale', payload.scale)
    else if (payload.type === 'open-app') invoke('openPetApp')
    // toggle-app is handled by Electron before it reaches the primary.
  })
  listen(host, 'onFocusSession', id => { if (nonempty(id)) invoke('focusSession', id) })
  listen(host, 'onOpenFolderRequested', () => invoke('openFolder'))
  listen(host, 'onOpenUpdatesRequested', () => invoke('openUpdates', { target: 'client' }))
  listen(host, 'onDeepLink', payload => { if (payload?.kind) invoke('deepLink', payload) })
  if (typeof subscribe === 'function' && !disposed) retain(subscribe(publish))
  publish()
  function releaseDeepLinks() {
    if (deepLinksReady) return true
    if (typeof actions.deepLink !== 'function' || typeof host?.onDeepLink !== 'function' || !isCurrent()) {
      gap('deepLink', 'action-unavailable'); return false
    }
    try {
      deepLinksReady = true
      reported.delete('deepLink')
      const ready = host.signalDeepLinkReady?.()
      if (ready && typeof ready.then === 'function') void ready.then(result => {
        if (isCurrent() && result?.ok === false) { deepLinksReady = false; gap('deepLink', 'ready-failed') }
      }, () => { if (isCurrent()) { deepLinksReady = false; gap('deepLink', 'ready-failed') } })
    } catch { deepLinksReady = false; gap('deepLink', 'ready-failed') }
    return deepLinksReady
  }
  releaseDeepLinks()
  return { dispose, isCurrent, context, releaseDeepLinks, gaps: () => [...reported].map(([feature, code]) => ({ feature, code })) }
}
