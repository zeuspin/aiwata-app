import React, { useEffect, useRef, useState } from 'react'
import { Icon, IconButton } from './icons.jsx'
import { Confirm } from './management-ui.jsx'
import { localUserAppearance } from './local-users.mjs'
import { DesktopLoadingScreen } from './startup-screens.jsx'
import { desktopMilestone } from './startup-state.mjs'

const startupMessages = ['正在准备本地运行环境。', '正在启动并连接网关。', '正在载入工作区设置与会话。', '正在打开工作台。']

export function LocalUserLogin({ service, onSelected, demo = false }) {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)
  const [notice, setNotice] = useState('')
  const [startup, setStartup] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [revision, setRevision] = useState(0)
  const lifetime = useRef(0), pending = useRef(false)
  useEffect(() => {
    const version = ++lifetime.current
    setError('')
    void service.list().then(snapshot => {
      if (version === lifetime.current) { setUsers(snapshot.users.map(localUserAppearance)); setError(snapshot.error || ''); setNotice(snapshot.notice || '') }
    }).catch(problem => { if (version === lifetime.current) setError(problem.message) })
    const refresh = () => { if (!pending.current) setRevision(value => value + 1) }
    window.addEventListener('focus', refresh)
    const unsubscribe = service.onChanged?.(refresh)
    return () => { lifetime.current++; pending.current = false; window.removeEventListener('focus', refresh); unsubscribe?.() }
  }, [service, revision])

  async function run(action, propagate = false) {
    if (pending.current || closing) return false
    pending.current = true
    const version = ++lifetime.current
    setBusy(true); setError(''); setNotice('')
    try {
      await action(() => version === lifetime.current)
      return true
    } catch (problem) {
      if (version === lifetime.current) setError(problem.message)
      if (propagate) throw problem
      return false
    } finally {
      if (version === lifetime.current) { pending.current = false; setBusy(false) }
    }
  }
  const locked = busy || closing
  if (startup) return <DesktopLoadingScreen boot={{ ...startup, message: startupMessages[desktopMilestone(startup)] }} />
  return <main className="login-screen"><section className="login-card local-user-card" aria-labelledby="local-user-title">
    <img className="login-brand" src="./aiwata-app-icon.svg" alt="" />
    <h1 id="local-user-title">登录 AIWATA</h1>
    <p>选择本机虚拟用户，进入独立工作区。无需注册。</p>
    {users === null && !error && <p role="status">正在读取本机用户…</p>}
    {error && <p role="alert" className="management-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="account-choices">{users?.map(user => <div className="local-user-row" key={user.id}>
      <button type="button" className="local-user-select" aria-label={'进入' + user.name} disabled={locked} onClick={() => void run(async current => {
        if (service.onStartupProgress) setStartup({ phase: 'renderer.init', progress: 0 })
        else setNotice('正在打开 ' + user.name + ' 的工作区…')
        const stopProgress = service.onStartupProgress?.(value => {
          if (current()) setStartup(previous => value.progress >= (previous?.progress ?? 0) ? value : previous)
        })
        try {
          const result = await service.activate(user.id)
          if (!current()) return
          if (!result?.ok) throw new Error('无法进入此用户工作区。')
          if (!result.opening) await onSelected?.(user)
        } finally {
          stopProgress?.()
          if (current()) { setStartup(null); setNotice('') }
        }
      })}>
        <span className="avatar" style={{ '--avatar': user.color }}>{user.initial}</span>
        <span>{user.name}<small>{demo ? '演示用户' : '本机虚拟用户'}</small></span><Icon name="right" size={/* @ai-token sys.icon.size.15 */ 15} />
      </button>
      <IconButton icon="trash" label={'删除' + user.name} disabled={locked} onClick={() => setDeleting(user)} />
    </div>)}</div>
    {users?.length === 0 && <p role="status">暂无本机用户，请输入用户名创建。</p>}
    <form className="local-user-create" onSubmit={event => {
      event.preventDefault()
      const form = event.currentTarget, name = new FormData(form).get('username')
      void run(async current => {
        await service.create(String(name ?? ''))
        if (!current()) return
        const snapshot = await service.list()
        if (current()) { setUsers(snapshot.users.map(localUserAppearance)); form.reset(); setNotice('用户已创建，请选择用户进入工作区。') }
      })
    }}>
      <label htmlFor="local-username">新用户名</label>
      <div><input id="local-username" name="username" placeholder="输入用户名" maxLength={40} required disabled={locked || users === null} />
      <button className="primary" disabled={locked || users === null}>创建用户</button></div>
    </form>
    <button type="button" className="secondary" disabled={locked} onClick={() => setRevision(value => value + 1)}>刷新用户列表</button>
    <span className="login-note">{demo ? '演示模式：数据保存在此浏览器中。' : '本机测试用户；删除用户会清理其所属测试数据。'}</span>
    {deleting && <Confirm title={'删除用户“' + deleting.name + '”？'} submit="删除用户和数据" onClose={() => setDeleting(null)} onConfirm={async () => {
      const id = deleting.id
      const target = service
      return run(async current => {
        const outcome = await target.remove(id)
        if (!current()) return
        if (outcome?.currentUserId === id && outcome.users?.some(user => user.id === id)) {
          setClosing(true); setNotice(outcome.notice || '正在关闭此用户应用并删除测试数据…')
          return
        }
        const snapshot = await target.list()
        if (current()) { setUsers(snapshot.users.map(localUserAppearance)); setNotice('用户及所属测试数据已删除。') }
      }, true).then(result => result ? undefined : false)
    }}>将清理此用户的会话、配置、凭据、记忆、文件和本机缓存，无法恢复。其他用户不受影响。仍有未能退出的所属应用时，删除会暂停并提示。</Confirm>}
  </section></main>
}
