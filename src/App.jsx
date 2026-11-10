import React, { useEffect, useReducer, useState } from 'react'
import { accounts } from './fixtures.mjs'
import { createWorkspace } from './workspace.mjs'
import { createLocalAttachmentStore } from './local-attachments.mjs'
import { Icon } from './icons.jsx'
import { Workbench } from './workbench.jsx'

export function App() {
  const [workspace] = useState(() => {
    const api = createWorkspace(window.localStorage, createLocalAttachmentStore(window.indexedDB))
    api.setOnline(navigator.onLine)
    return api
  })
  const [, refresh] = useReducer(version => version + 1, 0)
  const [simulatedOffline, setSimulatedOffline] = useState(false)

  useEffect(() => {
    function applyConnectivity() {
      workspace.setOnline(navigator.onLine && !simulatedOffline)
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
  return account
    ? <Workbench key={account.id} account={account} api={workspace} refresh={refresh} onOffline={() => setSimulatedOffline(true)} />
    : <main className="login-screen">
        <section className="login-card" aria-labelledby="login-title">
          <img className="login-brand" src="/aiwata-app-icon.svg" alt="" />
          <h1 id="login-title">{workspace.online ? '登录 AIWATA' : '工作台已锁定'}</h1>
          <p>{workspace.online ? '选择演示账号，进入你的本机工作区。' : '请恢复网络连接，再登录你的工作区。'}</p>
          {workspace.online
            ? <div className="account-choices">{accounts.map(item =>
                <button key={item.id} onClick={() => { workspace.login(item.id); refresh() }}>
                  <span className="avatar" style={{ '--avatar': item.color }}>{item.initial}</span>
                  <span>{item.name}<small>演示账号</small></span>
                  <Icon name="right" size={15} />
                </button>)}</div>
            : <button className="primary" onClick={() => setSimulatedOffline(false)} disabled={!simulatedOffline}>恢复模拟网络</button>}
          <span className="login-note">本地交互原型</span>
        </section>
      </main>
}
