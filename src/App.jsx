import React, { useEffect, useReducer, useRef, useState } from 'react'
import { accounts as demoAccounts } from './fixtures.mjs'
import { createWorkspace } from './workspace.mjs'
import { createLocalAttachmentStore } from './local-attachments.mjs'
import { Icon } from './icons.jsx'
import { NativeLegacyCacheNotice } from './native-legacy-cache-notice.jsx'
import { Workbench } from './workbench.jsx'
import { LocalUserLogin } from './local-user-login.jsx'
import { createBrowserLocalUsers } from './local-users.mjs'
import { connectLiveAiwata } from './live-aiwata.mjs'

const native = window.aiwataNativeRuntime
const live = Boolean(native) || __AIWATA_LIVE__
const selectedAccountKey = 'aiwata-live-selected-account'

export function App({ onUserLogout }) {
  const [mockService] = useState(() => !native && !live ? createBrowserLocalUsers(window.localStorage, createLocalAttachmentStore(window.indexedDB)) : null)
  const [mockUser, setMockUser] = useState(null)

  const [snapshot,setSnapshot]=useState(()=>native?.snapshot)
  const [connectionsOpen,setConnectionsOpen]=useState(false)
  useEffect(()=>native?.subscribe(setSnapshot),[])
  if (mockService && !mockUser) return <LocalUserLogin demo service={mockService} onSelected={setMockUser} />
  return <>
    <WorkspaceApp key={snapshot ? snapshot.storageNamespace+':'+snapshot.epoch : mockUser?.id ?? 'mock'} native={snapshot}
      selectedUser={mockUser} onUserLogout={mockService ? () => setMockUser(null) : onUserLogout}
      onManageConnections={()=>setConnectionsOpen(true)} />
    {snapshot && <NativeLegacyCacheNotice route={snapshot.route} storage={window.localStorage} enabled={snapshot.status==='ready'} />}
    {connectionsOpen && native && <React.Suspense fallback={null}><NativeConnectionsDialog
      host={window.hermesDesktop} currentRoute={snapshot.route} onClose={()=>setConnectionsOpen(false)}
      onActivate={async route=>{if(await native.selectRoute(route))setConnectionsOpen(false)}} /></React.Suspense>}
  </>
}
const NativeConnectionsDialog=React.lazy(()=>import('./native-connections.jsx').then(module=>({default:module.NativeConnectionsDialog})))

function WorkspaceApp({native,onManageConnections,selectedUser,onUserLogout}) {
  const accounts=native?.accounts ?? (selectedUser ? [selectedUser] : demoAccounts)
  const [workspace] = useState(() => {
    const api = createWorkspace(window.localStorage, createLocalAttachmentStore(window.indexedDB), { live, accounts, storageNamespace: native?.storageNamespace })
    api.setOnline(navigator.onLine)
    return api
  })
  const [, refresh] = useReducer(version => version + 1, 0)
  const [simulatedOffline, setSimulatedOffline] = useState(false)
  const [connection, setConnection] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [loginError, setLoginError] = useState('')
  const loginInProgress = useRef(false)
  const lifetime=useRef(0),activeClient=useRef(null)
  useEffect(()=>{
    lifetime.current++
    return ()=>{lifetime.current++;loginInProgress.current=false;void activeClient.current?.close();activeClient.current=null}
  },[])

  async function selectAccount(id) {
    if (!live) { workspace.login(id); refresh(); return }
    if (loginInProgress.current || (native && native.status!=='ready')) return
    loginInProgress.current = true
    setLoginError('')
    setConnecting(true)
    const generation=lifetime.current
    let client
    try {
      client = native ? await native.connect() : await connectLiveAiwata(id)
      if(generation!==lifetime.current){await client.close();return}
      const [projects, inventory, bots, rooms] = await Promise.all([
        client.rpc('projects.list'), client.sessions(), client.bots().catch(() => null), client.rooms().catch(() => null),
      ])
      if(generation!==lifetime.current){await client.close();return}
      if (!workspace.login(id)) throw new Error('无法进入当前工作区。')
      workspace.syncGatewayInventory(projects.projects, inventory.sessions, inventory)
      if (bots) workspace.syncGatewayBots(bots.bots)
      if (rooms) workspace.syncGatewayRooms(rooms)
      sessionStorage.setItem(selectedAccountKey, id)
      activeClient.current=client
      setConnection(client)
      refresh()
    } catch (error) {
      await client?.close()
      if(generation===lifetime.current)setLoginError(error.message)
    } finally { if(generation===lifetime.current){loginInProgress.current=false;setConnecting(false)} }
  }

  function closeConnection() {
    if (!live) { onUserLogout?.(); return }
    sessionStorage.removeItem(selectedAccountKey)
    void Promise.resolve(connection?.retire?.() ?? connection?.close()).catch(() => {})
    activeClient.current=null
    setConnection(null)
    onUserLogout?.()
  }

  useEffect(() => {
    if (!live) { if (selectedUser) selectAccount(selectedUser.id); return }
    if (native && native.status!=='ready') return
    const saved = native?.accounts[0].id ?? sessionStorage.getItem(selectedAccountKey)
    if (saved && workspace.online) void selectAccount(saved)
  }, [])

  useEffect(() => {
    function applyConnectivity() {
      workspace.setOnline(live || (navigator.onLine && !simulatedOffline))
      refresh()
    }
    applyConnectivity()
    window.addEventListener('online', applyConnectivity)
    window.addEventListener('offline', applyConnectivity)
    return () => {
      window.removeEventListener('online', applyConnectivity)
      window.removeEventListener('offline', applyConnectivity)
    }
  }, [workspace, simulatedOffline])

  const account = accounts.find(item => item.id === workspace.accountId)
  return account && (!live || connection)
    ? <Workbench key={account.id} account={account} api={workspace} live={connection} onLogout={closeConnection} onManageConnections={native ? onManageConnections : undefined} refresh={refresh} onOffline={() => setSimulatedOffline(true)} />
    : <main className="login-screen">
        <section className="login-card" aria-labelledby="login-title">
          <img className="login-brand" src="./aiwata-app-icon.svg" alt="" />
          <h1 id="login-title">{workspace.online ? '登录 AIWATA' : '工作台已锁定'}</h1>
          <p>{connecting ? '正在连接此用户的 AIWATA 工作区…' : workspace.online ? native ? '连接原 AIWATA 桌面工作区。' : '选择演示账号，进入你的本机工作区。' : '请恢复网络连接，再登录你的工作区。'}</p>
          {native && native.status!=='ready' && <p role="status">{native.error || '原生连接配置已更新，正在重新确认工作区…'}</p>}
          {native && <button onClick={onManageConnections}>管理连接</button>}
          {loginError && <p role="alert" className="management-error">{loginError}</p>}
          {workspace.online
            ? <div className="account-choices">{accounts.map(item =>
                <button key={item.id} disabled={connecting || (native && native.status!=='ready')} onClick={() => selectAccount(item.id)}>
                  <span className="avatar" style={{ '--avatar': item.color }}>{item.initial}</span>
                  <span>{item.name}<small>{native ? '原生桌面连接' : '演示账号'}</small></span>
                  <Icon name="right" size={15} />
                </button>)}</div>
            : <button className="primary" onClick={() => setSimulatedOffline(false)} disabled={!simulatedOffline}>恢复模拟网络</button>}
          <span className="login-note">{native ? 'AIWATA 桌面应用' : live ? 'AIWATA 本机联调' : '本地交互原型'}</span>
        </section>
      </main>
}
