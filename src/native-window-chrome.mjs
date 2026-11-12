const positive = value => Number.isFinite(value) && value >= 0

export function nativeChromeLayout(state = {}, overlay = null, metrics = {}) {
  const height = metrics.height ?? 34
  const fullscreen = state.isFullscreen === true
  const custom = !fullscreen && state.customWindowControls === true
  const mac = state.darwinMajor > 0 || (state.darwinMajor == null && state.platform === 'mac')
  let left = 0, right = 0
  if (!fullscreen) {
    if (mac) left = (positive(state.windowButtonPosition?.x) ? state.windowButtonPosition.x : 12) + (metrics.macControlOffset ?? 74)
    else if (!custom && overlay) ({ left, right } = overlay)
    else right = positive(state.nativeOverlayWidth) ? state.nativeOverlayWidth : (metrics.overlayFallback ?? 144)
  }
  return { left, right, height, custom, maximized: state.isMaximized === true, fullscreen }
}

function windowState(value = {}) {
  const out = {}
  for (const key of ['isFullscreen', 'isMaximized', 'customWindowControls']) {
    if (typeof value[key] === 'boolean') out[key] = value[key]
  }
  for (const key of ['darwinMajor', 'nativeOverlayWidth']) {
    if (positive(value[key])) out[key] = value[key]
  }
  if (value.windowButtonPosition === null) out.windowButtonPosition = null
  else if (positive(value.windowButtonPosition?.x) && positive(value.windowButtonPosition?.y)) {
    out.windowButtonPosition = { x: value.windowButtonPosition.x, y: value.windowButtonPosition.y }
  }
  return out
}

/** Window-only native facts; never retain connection descriptors or credentials. */
export function bindNativeWindowChrome({ host, element, environment = window, metrics }) {
  const overlay = environment.navigator?.windowControlsOverlay
  const subscribers = new Set()
  let state = { platform: /mac/i.test(environment.navigator?.platform ?? '') ? 'mac' : 'other', customWindowControls: host.windowControls?.custom === true }
  let snapshot, disposed = false, receivedEvent = false
  function publish() {
    if (disposed) return
    const rect = overlay?.visible ? overlay.getTitlebarAreaRect() : null
    const geometry = rect?.width > 0 ? {
      left: Math.max(0, Math.round(rect.x ?? rect.left ?? 0)),
      right: Math.max(0, Math.round(environment.innerWidth - (rect.x ?? rect.left ?? 0) - rect.width)),
    } : null
    const next = nativeChromeLayout(state, geometry, metrics)
    if (snapshot && Object.keys(next).every(key => next[key] === snapshot[key])) return
    snapshot = Object.freeze(next)
    element.dataset.nativeWindow = 'true'
    element.style.setProperty('--native-titlebar-height', next.height + 'px')
    element.style.setProperty('--native-caption-left', next.left + 'px')
    element.style.setProperty('--native-caption-right', next.right + 'px')
    subscribers.forEach(callback => callback())
  }
  publish()
  const detach = host.onWindowStateChanged?.(value => {
    if (disposed) return
    receivedEvent = true
    state = { ...state, ...windowState(value) }; publish()
  })
  overlay?.addEventListener('geometrychange', publish)
  environment.addEventListener('resize', publish)
  function dispose() {
    if (disposed) return
    disposed = true
    detach?.(); subscribers.clear()
    overlay?.removeEventListener('geometrychange', publish)
    environment.removeEventListener('resize', publish)
    environment.removeEventListener('beforeunload', dispose)
    delete element.dataset.nativeWindow
    for (const key of ['--native-titlebar-height', '--native-caption-left', '--native-caption-right']) element.style.removeProperty(key)
  }
  environment.addEventListener('beforeunload', dispose)
  return {
    snapshot: () => snapshot,
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback) },
    prime(value) { if (!disposed && !receivedEvent) { state = { ...state, ...windowState(value) }; publish() } },
    dispose,
  }
}
