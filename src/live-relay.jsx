import React, { useEffect, useRef, useState } from 'react'
import { Dialog, Empty, Entry, Field } from './management-ui.jsx'

function RelayUrl({ url, label }) {
  if (!url) return null
  return window.aiwataPreview ? <Field label={label} readOnly value={url} onFocus={event => event.target.select()} />
    : <a href={url} target="_blank" rel="noreferrer">{label}</a>
}

function RelayCode({ link, onDismiss }) {
  const [copied, setCopied] = useState(false)
  const command = useRef(null)
  return <div className="relay-code">
    <p>打开共享 Bot，发送下面的一次性绑定命令。</p>
    {link.qr && <img src={link.qr} alt="共享 Bot 二维码" width="192" height="192" />}
    <RelayUrl url={link.botUrl} label="打开共享 Bot" />
    <label>一次性绑定命令<input ref={command} readOnly value={link.command} onFocus={event => event.target.select()} /></label>
    <div className="management-actions">
      <button className="secondary" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(link.command); setCopied(true) }
        catch { command.current?.focus(); command.current?.select() }
      }}>{copied ? '已复制命令' : '复制命令'}</button>
      <button className="secondary" type="button" onClick={onDismiss}>停止等待</button>
    </div>
    <small role="status">正在等待绑定确认…</small>
  </div>
}

export default function LiveRelay({ live, profile, platform, name, onClose }) {
  const [view, setView] = useState(null)
  const [link, setLink] = useState(null)
  const [remove, setRemove] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const active = useRef(false)
  const current = useRef(null)
  const call = (action, params) => live.connector(action, profile, { platform, ...params })

  async function load() {
    const result = await call('relayRead')
    if (active.current) setView(result)
    return result
  }

  useEffect(() => {
    active.current = true
    void load().catch(problem => { if (active.current) setError(problem.message) })
    return () => {
      active.current = false
      if (current.current) void call('relayDismiss', { id: current.current }).catch(() => {})
    }
  }, [live, profile, platform])

  function dismiss() {
    const id = current.current
    current.current = null
    if (id) void call('relayDismiss', { id }).catch(() => {})
    setLink(null)
  }

  useEffect(() => {
    if (!link) return
    let stopped = false
    let timer
    let failures = 0
    let inactive = false
    const expiry = Date.parse(link.expiresAt)
    const isCurrent = () => !stopped && current.current === link.id
    const finish = async () => {
      const after = await call('relayRead')
      if (!isCurrent()) return
      setView(after)
      dismiss()
      const added = after.accounts.some(account => !link.before.has(account.id))
      setError('')
      setNotice(added ? '已绑定新账号。' : expiry <= Date.now() ? '绑定命令已过期。' : '暂未发现新绑定的账号。')
    }
    async function poll() {
      try {
        if (inactive) return await finish()
        const result = await call('relayStatus', { id: link.id })
        if (!isCurrent()) return
        failures = 0
        if (result.state === 'refused') {
          dismiss()
          setError('Team Gateway 拒绝了此绑定。')
          return
        }
        inactive = result.state === 'inactive' || expiry <= Date.now()
        if (inactive) return await finish()
      } catch (problem) {
        if (!isCurrent()) return
        if (++failures >= 5 || expiry <= Date.now()) {
          if (expiry <= Date.now()) {
            try { return await finish() } catch {}
          }
          if (isCurrent()) { dismiss(); setError(problem.message) }
          return
        }
      }
      timer = setTimeout(poll, 3000)
    }
    timer = setTimeout(poll, 1800)
    return () => { stopped = true; clearTimeout(timer) }
  }, [link, live, profile, platform])

  async function start() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const before = await load()
      if (!active.current || before.managedBy !== 'connector') return
      const result = await call('relayStart')
      if (!active.current) return void call('relayDismiss', { id: result.id }).catch(() => {})
      current.current = result.id
      const botUrl = result.botUrl ?? before.botUrl
      let qr = ''
      if (botUrl) {
        try {
          const { toDataURL } = await import('qrcode')
          qr = await toDataURL(botUrl, { errorCorrectionLevel: 'M', margin: 3, width: 192 })
        } catch {}
      }
      if (active.current) setLink({ ...result, botUrl, qr, before: new Set(before.accounts.map(account => account.id)) })
    } catch (problem) {
      if (active.current) setError(problem.message)
    } finally {
      if (active.current) setBusy(false)
    }
  }

  const accountLabel = account => account.displayName || account.handle || account.id
  return <Dialog title={name + ' · Team Gateway'} onClose={onClose} submit={remove ? '解除绑定' : false}
    danger={!!remove} onSubmit={async () => {
      if (!remove) return
      const result = await call('relayUnlink', { id: remove.id })
      if (!result.unlinked) return '网关未确认解除绑定。'
    }}>
    {remove ? <p>解除 {accountLabel(remove)} 与当前工作区的绑定后，该平台账号将无法通过共享 Bot 访问工作区。</p> : <>
      {view?.managedBy === 'portal' && <><p>此账号的绑定由 Portal 管理。</p><RelayUrl url={view.portalUrl} label="打开 Portal" /></>}
      {view?.managedBy === 'unknown' && <p>暂时无法确认绑定由谁管理。</p>}
      {view && (view.accounts.length ? view.accounts.map(account => <Entry key={account.id} title={accountLabel(account)} subtitle={account.id}>
        {view.managedBy === 'connector' && <button type="button" className="secondary" disabled={busy || !!link}
          onClick={() => setRemove(account)}>解除绑定</button>}
      </Entry>) : <Empty>还没有绑定账号。</Empty>)}
      {link ? <RelayCode link={link} onDismiss={dismiss} /> : view?.managedBy === 'connector' &&
        <button type="button" className="secondary management-inline-action" disabled={busy} onClick={() => void start()}>
          {busy ? '正在生成命令…' : '生成绑定命令'}
        </button>}
      {!link && (!view || view.managedBy === 'unknown') && (error || view ? <button type="button" className="secondary management-inline-action"
        onClick={() => { setError(''); void load().catch(problem => { if (active.current) setError(problem.message) }) }}>刷新绑定状态</button>
        : <p role="status">正在读取绑定状态…</p>)}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="management-error" role="alert">{error}</p>}
    </>}
  </Dialog>
}
