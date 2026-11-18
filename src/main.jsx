import { nativeAuxiliaryWindow } from './native-window-entry.mjs'

// Keep primary JSX, styles and native initialization out of auxiliary windows.
// The original entry owns preference hydration, providers and window routing.
const auxiliary = nativeAuxiliaryWindow(window.location.search, __AIWATA_NATIVE__)
if (['quick', 'overlay', 'wake', 'hud'].includes(auxiliary)) {
  const transparent = document.createElement('style')
  transparent.textContent = 'html,body,#root{background:transparent !important;}'
  document.head.appendChild(transparent)
}
const boot = auxiliary ? import('#native-auxiliary') : import('./primary-main.jsx')
boot.catch(error => {
  if (!auxiliary) void window.hermesDesktop?.localUsers?.reportWorkspace?.('failed').catch(() => {})
  const root = document.getElementById('root')
  root.setAttribute('role', 'alert')
  root.textContent = 'AIWATA 界面无法载入：' + error.message
  console.error(error)
})
