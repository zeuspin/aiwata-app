import React, { useSyncExternalStore } from 'react'

const emptyChrome = Object.freeze({ custom: typeof window !== 'undefined' && window.hermesDesktop?.windowControls?.custom === true })
const emptySubscribe = () => () => {}
const emptySnapshot = () => emptyChrome

export function NativeWindowControls() {
  const chrome = window.aiwataNativeChrome
  const state = useSyncExternalStore(chrome?.subscribe ?? emptySubscribe, chrome?.snapshot ?? emptySnapshot)
  const controls = window.hermesDesktop?.windowControls
  if (!state.custom || !controls) return null
  return <div className="native-window-controls" aria-label="窗口控制">
    <button type="button" aria-label="最小化窗口" onClick={() => controls.minimize()}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 8.5h10" /></svg></button>
    <button type="button" aria-label={state.maximized ? '还原窗口' : '最大化窗口'} onClick={() => controls.toggleMaximize()}><svg viewBox="0 0 12 12" aria-hidden="true">{state.maximized ? <path d="M3.5 1.5h7v7M1.5 3.5h7v7h-7z" /> : <path d="M1.5 1.5h9v9h-9z" />}</svg></button>
    <button type="button" className="native-window-close" aria-label="关闭窗口" onClick={() => controls.close()}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9" /></svg></button>
  </div>
}

export function NativeWindowFrame({ children }) {
  return <>
    {window.hermesDesktop && <div className="native-window-fallback-drag" aria-hidden="true" />}
    {children}
    <NativeWindowControls />
  </>
}
