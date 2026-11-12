import React, { useEffect, useRef, useState } from 'react'
import { Dialog, Field } from './management-ui.jsx'

export function NativeWhatsAppSetup({ live, profile, configured, onClose, onApplied }) {
  const [mode, setMode] = useState('bot'), [allowedUsers, setAllowedUsers] = useState('')
  const [setup, setSetup] = useState(null), [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [repair, setRepair] = useState(false)
  const active = useRef(false), pairing = useRef(null)
  const call = (action, params = {}) => live.connector('whatsapp' + action, profile, params)
  useEffect(() => {
    active.current = true
    return () => { active.current = false; if (pairing.current) void call('Cancel', { id: pairing.current }).catch(() => {}) }
  }, [live, profile])
  useEffect(() => {
    let canceled = false
    setQr('')
    if (setup?.qrPayload) void import('qrcode').then(({ toDataURL }) => toDataURL(setup.qrPayload, { width: 240, margin: 3 }))
      .then(url => { if (!canceled) setQr(url) }, problem => { if (!canceled) setError(problem.message) })
    return () => { canceled = true }
  }, [setup?.qrPayload])
  useEffect(() => {
    if (!setup?.id || ['connected', 'error', 'expired', 'cancelled'].includes(setup.status)) return
    let canceled = false, timer, failures = 0
    const id = setup.id, expiry = Date.parse(setup.expiresAt)
    const current = () => !canceled && active.current && pairing.current === id
    async function poll() {
      if (!current()) return
      if (Number.isFinite(expiry) && Date.now() >= expiry) {
        setError('WhatsApp 配对已过期，请重新开始。'); setSetup(null); pairing.current = null
        void call('Cancel', { id }).catch(() => {}); return
      }
      try {
        const result = await call('Status', { id })
        if (!current()) return
        failures = 0; setSetup(result); setError(result.error || '')
        if (['connected', 'error', 'expired', 'cancelled'].includes(result.status)) return
      } catch (problem) {
        if (!current()) return
        setError(problem.message)
        if (++failures >= 5) return
      }
      timer = setTimeout(poll, 2000)
    }
    timer = setTimeout(poll, 1000)
    return () => { canceled = true; clearTimeout(timer) }
  }, [setup?.id, setup?.status, live, profile])
  async function start(resetSession = false) {
    if (busy) return
    setBusy(true); setError(''); setRepair(false)
    try {
      if (pairing.current) await call('Cancel', { id: pairing.current })
      pairing.current = null; setSetup(null)
      const result = await call('Start', { mode, allowedUsers, resetSession })
      if (!active.current) { void call('Cancel', { id: result.id }).catch(() => {}); return }
      pairing.current = result.id; setSetup(result); setError(result.error || '')
    } catch (problem) { if (active.current) setError(problem.message) }
    finally { if (active.current) setBusy(false) }
  }
  return <Dialog title="WhatsApp 扫码配置" onClose={onClose} submit="保存 WhatsApp 配置" submitDisabled={setup?.status !== 'connected' || repair} onSubmit={async () => {
    if (!pairing.current || setup?.status !== 'connected') return '请先在 WhatsApp 完成配对。'
    const result = await call('Apply', { id: pairing.current, mode, allowedUsers })
    pairing.current = null
    if (!active.current) return false
    await onApplied(result)
  }}>
    <p>复用原生 WhatsApp 会话与配对流程。手机在「已关联的设备」中扫码；保存后由原生网关应用配置并报告重启结果。</p>
    <label>使用方式<select value={mode} disabled={busy} onChange={event => setMode(event.target.value)}>
      <option value="bot">Bot 模式</option><option value="self-chat">与自己聊天</option>
    </select></label>
    <Field label="允许使用的用户（可选）" value={allowedUsers} disabled={busy} onChange={event => setAllowedUsers(event.target.value)} placeholder="留空保留已保存的允许列表" />
    {setup?.status === 'connected' ? <p role="status">已连接：{setup.accountName || setup.accountPhone || setup.accountId || 'WhatsApp 账户'}</p>
      : qr ? <div className="connector-telegram-qr"><img src={qr} alt="WhatsApp 设备配对二维码" width="240" height="240" /><p role="status">等待手机扫码…</p></div>
        : setup && <p role="status">正在准备原生配对二维码…</p>}
    {error && <p role="alert" className="management-error">{error}</p>}
    <div className="management-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => void start(false)}>{busy ? '正在准备…' : '检查连接 / 生成二维码'}</button>
      {(configured || setup) && <button type="button" className="secondary" disabled={busy} onClick={() => setRepair(true)}>重新配对…</button>}
    </div>
    {repair && <><p>重新配对会备份并重建此 Profile 的 WhatsApp 登录会话。若当前网关仍在使用它，原生服务会拒绝操作；请先按原流程停用并应用配置。</p>
      <div className="management-actions"><button type="button" className="secondary" onClick={() => setRepair(false)}>取消重新配对</button>
        <button type="button" className="primary danger-action" disabled={busy} onClick={() => void start(true)}>确认重新配对</button></div></>}
  </Dialog>
}
