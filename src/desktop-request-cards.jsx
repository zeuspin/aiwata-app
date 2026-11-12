import React, { useEffect, useRef, useState } from 'react'
import './agent-transcript.css'
import { desktopChoiceAllowsText, desktopChoiceOptions } from './desktop-choice.mjs'

const titles = {
  sudo: '需要管理员密码', secret: '需要授权信息', 'vault.code': '需要验证码',
  'vault.unlock_prompt': '解锁密码管理器', 'vault.save_login': '保存登录信息',
  'display.install.sudo': '安装组件需要管理员密码',
}

/** Input values live only in this mounted card and the single reply in flight.
 * They never enter the conversation, workspace persistence or replay cache. */
export function DesktopRequestCard({ request, onRespond, disabled = false, error = '' }) {
  const [value, setValue] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [problem, setProblem] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const current = useRef(request)
  const mounted = useRef(false)
  current.current = request
  useEffect(() => {
    mounted.current = true
    setValue('')
    setIdentifier('')
    setProblem('')
    setSubmitting(false)
    return () => { mounted.current = false }
  }, [request])
  if (request && ['theme.pick', 'setup_beat'].includes(request.method)) return <DesktopChoiceCard request={request} onRespond={onRespond} disabled={disabled} error={error} />
  if (!request || !titles[request.method]) return null
  const params = request.params ?? {}
  const login = request.method === 'vault.save_login'
  const code = request.method === 'vault.code'
  const title = titles[request.method]
  const description = request.method === 'secret' ? params.prompt
    : login ? params.origin || params.site : code ? params.hint || params.site
      : request.method === 'vault.unlock_prompt' ? params.display_name || params.backend : null
  const clear = () => { setValue(''); setIdentifier('') }
  async function submit(cancelled) {
    if (disabled || submitting) return
    const owner = request
    const answer = cancelled ? null : login ? { identifier, password: value } : value
    clear()
    setProblem('')
    setSubmitting(true)
    try {
      const accepted = await onRespond(owner, answer)
      if (!accepted && mounted.current && current.current === owner) setProblem('这个请求已变化或提交未确认，请重新输入后重试。')
    } catch {
      if (mounted.current && current.current === owner) setProblem('未能提交，请重新输入后重试。')
    } finally {
      if (mounted.current && current.current === owner) setSubmitting(false)
    }
  }
  const busy = disabled || submitting
  return <form className="agent-request" aria-label={title} autoComplete="off" onSubmit={event => {
    event.preventDefault()
    void submit(false)
  }}>
    <h3>{title}</h3>
    <div className="agent-request-content">
      <p>{request.chatId ? '接收会话：' + (request.title || '当前会话') : '当前账号的桌面安装请求'}</p>
      {description && <p>{description}</p>}
      {params.env_var && <p><code>{params.env_var}</code></p>}
      {params.command && <pre>{params.command}</pre>}
      {login && <label>账号<input autoComplete="off" value={identifier} required maxLength={4000} disabled={busy}
        onChange={event => setIdentifier(event.target.value)} /></label>}
      <label>{code ? '验证码' : login ? '密码' : request.method === 'secret' ? '授权值' : '密码'}
        <input type="password" autoComplete="new-password" value={value} required maxLength={16000} disabled={busy}
          spellCheck={false} autoCapitalize="none" onChange={event => setValue(event.target.value)} />
      </label>
      {(problem || error) && <p role="alert">{problem || error}</p>}
    </div>
    <div className="agent-card-actions">
      <button type="submit" className="primary" disabled={busy}>{submitting ? '提交中…' : '提交'}</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => void submit(true)}>跳过</button>
    </div>
  </form>
}


function DesktopChoiceCard({ request, onRespond, disabled, error }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const owner = useRef(request)
  owner.current = request
  const params = request.params ?? {}
  const theme = request.method === 'theme.pick'
  const options = desktopChoiceOptions(request)
  const acceptsText = desktopChoiceAllowsText(request)
  async function answer(value) {
    if (disabled || busy) return
    setBusy(true); setProblem('')
    const current = request
    try {
      const accepted = await onRespond(request, value)
      if (!accepted && owner.current === current) setProblem('未能提交，请重试。')
    } catch (error) { if (owner.current === current) setProblem(error.message) }
    finally { if (owner.current === current) setBusy(false) }
  }
  return <form className="agent-request" aria-label={theme ? '外观选择' : '开始设置'} onSubmit={event => {
    event.preventDefault(); if (acceptsText && text.trim()) void answer({ said: text.trim() })
  }}>
    <h3>{theme ? params.picker === 'accent' ? '选择主题颜色' : '选择布局' : params.question || '开始设置'}</h3>
    <div className="agent-request-content">
      <p>接收会话：{request.title || '当前会话'}</p>
      <div className="agent-card-actions">{options.map(option => <button key={option.id} type="button" className="secondary"
        disabled={disabled || busy} onClick={() => void answer(option.answer)}>
        {option.color && <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12,
          borderRadius: '50%', background: option.color, marginRight: 6 }} />}{option.label}
      </button>)}</div>
      {acceptsText && <label>{params.beat === 'name' ? '你的称呼' : '也可以直接描述你的选择'}
        <input value={text} maxLength={1000} disabled={disabled || busy} placeholder={typeof params.card?.suggested === 'string' ? params.card.suggested : ''}
          onChange={event => setText(event.target.value)} />
      </label>}
      {!acceptsText && <p>也可以在会话输入框继续说明你的需求。</p>}
      {(problem || error) && <p role="alert">{problem || error}</p>}
    </div>
    <div className="agent-card-actions">
      {acceptsText && <button type="submit" className="primary" disabled={disabled || busy || !text.trim()}>确认</button>}
      <button type="button" className="secondary" disabled={disabled || busy} onClick={() => void answer(theme ? { cancelled: true } : {})}>跳过</button>
    </div>
  </form>
}
