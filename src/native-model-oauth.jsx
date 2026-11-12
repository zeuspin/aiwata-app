import React, { useEffect, useRef, useState } from 'react'
import { Dialog, Field } from './management-ui.jsx'

/** Original provider OAuth UI; credentials and exchanges stay in the gateway. */
export function NativeModelOAuthDialog({ live, profile, provider, onClose, onApproved }) {
  const [flow, setFlow] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, retry] = useState(0)
  const active = useRef(false), current = useRef(null), approved = useRef(onApproved), codeInput = useRef(null)
  approved.current = onApproved
  const call = (action, params = {}) => live.capability('model.oauth.' + action, profile, { provider: provider.id, ...params })
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      const handle = current.current; current.current = null
      if (handle) void call('cancel', { handle }).catch(() => {})
    }
  }, [live, profile, provider.id])
  function accept(result) {
    if (result.status === 'approved' && result.ok !== false) {
      current.current = null; setFlow(previous => ({ ...previous, status: 'approved' })); setError(''); approved.current?.()
      return true
    }
    if (result.status !== 'pending') {
      current.current = null; setFlow(previous => ({ ...previous, status: 'error' })); setError(result.error_message || result.message || '原生提供方授权未完成。')
    }
    return false
  }
  useEffect(() => {
    if (!flow?.handle || flow.status !== 'pending') return
    let cancelled = false, timer, failures = 0
    const isCurrent = () => !cancelled && active.current && current.current === flow.handle
    const expires = setTimeout(() => {
      if (!isCurrent()) return
      current.current = null; setFlow(previous => ({ ...previous, status: 'error' })); setError('提供方授权已过期，请重新开始。')
      void call('cancel', { handle: flow.handle }).catch(() => {})
    }, Math.max(0, flow.deadline - Date.now()))
    async function poll() {
      try {
        const result = await call('poll', { handle: flow.handle })
        if (!isCurrent()) return
        failures = 0; setError('')
        accept(result)
        if (result.status === 'pending') timer = setTimeout(poll, 1200)
      } catch (problem) {
        if (!isCurrent()) return
        setError(problem.message)
        if (++failures < 3) timer = setTimeout(poll, 1200 * failures)
      }
    }
    if (flow.flow === 'device_code') timer = setTimeout(poll, 0)
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(expires) }
  }, [flow?.handle, flow?.status, revision])
  async function start() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await call('start')
      if (!active.current) { void call('cancel', { handle: result.handle }).catch(() => {}); return }
      current.current = result.handle
      setFlow({ ...result, status: 'pending', deadline: Date.now() + Math.max(1, result.expires_in || 300) * 1000 })
    } catch (problem) { if (active.current) setError(problem.message) }
    finally { if (active.current) setBusy(false) }
  }
  const url = flow?.flow === 'device_code' ? flow.verification_url : flow?.auth_url
  const submitting = flow?.flow === 'pkce' && flow.status === 'pending'
  return <Dialog title={'网页登录 · ' + provider.name} onClose={onClose} submit={submitting ? '提交授权码' : null} onSubmit={async form => {
    const code = String(form.get('code') || '').trim(), handle = current.current
    if (codeInput.current) codeInput.current.value = ''
    if (!code || !handle) return '请输入提供方返回的授权码或回调 URL。'
    try {
      const result = await call('submit', { handle, code })
      if (active.current && current.current === handle) accept(result)
    } catch (problem) {
      if (active.current && current.current === handle) setError(problem.message.replaceAll(code, '[已隐藏授权码]'))
    }
    return false
  }}>
    <p>登录原生提供方，授权只写入当前连接的 {profile || 'default'} Profile。不会把令牌保存到浏览器。</p>
    {!flow && <button type="button" className="primary" disabled={busy} onClick={() => void start()}>{busy ? '正在准备授权…' : '开始授权'}</button>}
    {flow?.status === 'pending' && <>
      {flow.user_code && <Field label="设备授权码" value={flow.user_code} readOnly onFocus={event => event.target.select()} />}
      {url && <a className="secondary" href={url} target="_blank" rel="noopener noreferrer" onClick={event => {
        event.preventDefault()
        try {
          const address = new URL(url)
          if (!['https:', 'http:'].includes(address.protocol) || address.username || address.password) throw new Error('提供方授权地址无效。')
          void window.hermesDesktop.openExternal(address.href).catch(problem => { if (active.current) setError(problem.message) })
        } catch (problem) { setError(problem.message) }
      }}>打开提供方授权网页</a>}
      {submitting ? <Field ref={codeInput} label="授权码或完整回调 URL" name="code" type="password" autoComplete="new-password" required />
        : <p role="status">在网页完成授权后返回，这里会检查原生登录结果。</p>}
    </>}
    {flow?.status === 'approved' && <p role="status">授权已完成，可返回选择模型。</p>}
    {flow?.status === 'error' && <button type="button" className="secondary" onClick={() => { setFlow(null); setError('') }}>重新开始授权</button>}
    {error && <p role="alert" className="management-error">{error}</p>}
    {error && flow?.status === 'pending' && flow.flow === 'device_code' && <button type="button" className="secondary" onClick={() => { setError(''); retry(value => value + 1) }}>重新检查授权</button>}
  </Dialog>
}
