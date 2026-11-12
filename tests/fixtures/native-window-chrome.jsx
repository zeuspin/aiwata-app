import React, { useReducer, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Workbench } from '../../src/workbench.jsx'
import { createWorkspace } from '../../src/workspace.mjs'
import { accounts } from '../../src/fixtures.mjs'
import { bindNativeWindowChrome } from '../../src/native-window-chrome.mjs'
import { NativeWindowFrame } from '../../src/native-window-chrome.jsx'
import '../../src/styles.css'

const mode = new URLSearchParams(location.search).get('platform') || 'mac'
const phase = new URLSearchParams(location.search).get('phase')
let notify
const command = name => (...args) => {
  if (args.length) throw new Error('Window IPC must not receive React events')
  document.querySelector('#window-command').textContent = name
}
const host = {
  windowControls: { custom: mode === 'wslg', minimize: command('minimize'), toggleMaximize: command('maximize'), close: command('close') },
  onWindowStateChanged: callback => { notify = callback; return () => {} },
}
const environment = {
  get innerWidth() { return innerWidth },
  navigator: { platform: mode === 'mac' ? 'MacIntel' : mode === 'windows' ? 'Win32' : 'Linux' },
  addEventListener: (...args) => window.addEventListener(...args), removeEventListener: (...args) => window.removeEventListener(...args),
}
const chrome = bindNativeWindowChrome({ host, element: document.documentElement, environment })
const state = { darwinMajor: mode === 'mac' ? 26 : 0, windowButtonPosition: mode === 'mac' ? { x: 12, y: 10 } : null, nativeOverlayWidth: mode === 'mac' ? 0 : 144, customWindowControls: mode === 'wslg' }
chrome.prime(state)
window.hermesDesktop = host
window.aiwataNativeRuntime = { chrome }
const storage = new Map()
const api = createWorkspace({ getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) })
api.login(accounts[0].id)
function Fixture() {
  const [, refresh] = useReducer(value => value + 1, 0)
  const caption = useSyncExternalStore(chrome.subscribe, chrome.snapshot)
  return <NativeWindowFrame>{phase ? <main className="login-screen"><section className="login-card"><h1>{phase === 'loading' ? '正在连接（测试）' : '连接失败（测试）'}</h1></section></main> : <Workbench account={accounts[0]} api={api} refresh={refresh} />}
    {!caption.fullscreen && mode !== 'wslg' && <div data-host-caption style={{ position: 'fixed', top: 0, left: mode === 'mac' ? 12 : undefined, right: mode === 'mac' ? undefined : 0, width: mode === 'mac' ? 60 : 144, height: 34, zIndex: 100, background: '#ffe6ce', pointerEvents: 'none', fontSize: 9 }}>模拟系统按钮</div>}
    <aside style={{ position: 'fixed', bottom: 2, right: 2, zIndex: 100, fontSize: 10, background: 'white' }}>布局测试：模拟 {mode} <output id="window-command" /> <button onClick={() => notify({ ...state, isFullscreen: !chrome.snapshot().fullscreen })}>模拟全屏切换</button></aside>
  </NativeWindowFrame>
}
createRoot(document.getElementById('root')).render(<Fixture />)
