const auxiliaryWindows = new Set(['quick', 'overlay', 'wake', 'hud', 'secondary', 'browser'])
const nativeSurfaces = new Set(['settings', 'artifacts', 'capabilities', 'cron', 'messaging', 'webhooks', 'session-import'])

// These flags are emitted by the existing Electron host before the hash route.
export function nativeAuxiliaryWindow(search, native) {
  if (!native) return null
  const params = new URLSearchParams(search)
  const kind = params.get('win')
  if (auxiliaryWindows.has(kind)) return kind
  // These are original full peers, not secondary session windows. Keep normal
  // peers and the primary on the new workbench unless main pinned this surface.
  return params.get('peer') === '1' && params.has('profile') && params.has('connectionId') && nativeSurfaces.has(params.get('nativeSurface'))
    ? 'native-surface' : null
}
