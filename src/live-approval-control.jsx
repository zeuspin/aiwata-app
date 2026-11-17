import React, { useEffect, useRef, useState } from 'react'
import { approvalModes } from './composer.mjs'
import { Icon } from './icons.jsx'

export default function LiveApprovalControl({ live, profile, connected, name, report }) {
  const [mode, setMode] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const root = useRef(null)
  const button = useRef(null)
  const revision = useRef(0)
  const mounted = useRef(false)

  function nativeMode(result) {
    if (!approvalModes.some(option => option.id === result?.value)) throw new Error('AIWATA 返回了未知的审批方式。')
    return result.value
  }

  async function read() {
    const current = ++revision.current
    try {
      const value = nativeMode(await live.rpc('config.get', { key: 'approvals.mode' }, profile))
      if (mounted.current && revision.current === current) { setMode(value); setError('') }
    } catch (problem) {
      if (mounted.current && revision.current === current) setError(problem.message)
    }
  }

  useEffect(() => {
    mounted.current = true
    setMode(null)
    setOpen(false)
    setBusy(false)
    setError('')
    if (connected) void read()
    return () => { mounted.current = false; revision.current++ }
  }, [live, profile, connected])

  useEffect(() => {
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])

  async function select(value) {
    if (busy || !connected) return
    const current = ++revision.current
    setBusy(true)
    try {
      const confirmed = nativeMode(await live.rpc('config.set', { key: 'approvals.mode', value }, profile))
      if (!mounted.current || revision.current !== current) return
      setMode(confirmed)
      setError('')
      setOpen(false)
      button.current?.focus()
    } catch (problem) {
      if (mounted.current && revision.current === current) { setError(problem.message); report(problem.message, true) }
    } finally {
      if (mounted.current && revision.current === current) setBusy(false)
    }
  }

  const option = approvalModes.find(option => option.id === mode)
  return <div ref={root} className="live-approval-control" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus() }
  }}>
    <button ref={button} type="button" className={'control-text ' + (mode === 'off' ? 'warning' : '')}
      aria-label="Agent 批准方式" title={error || option?.label || '正在读取审批方式'} aria-expanded={open}
      disabled={!connected || busy || (!mode && !error)} onClick={() => {
        if (!open) void read()
        setOpen(value => !value)
      }}>
      <Icon name="shield" size={/* @ai-token sys.icon.size.15 */ 15} /><span>{busy ? '正在保存…' : option?.label || (error ? '审批方式' : '读取审批方式…')}</span>
    </button>
    {open && <div className="popover composer-menu" aria-label="批准方式选项">
      <div className="popover-caption">{name ? name + ' · ' : ''}当前配置档的所有会话</div>
      {approvalModes.map(option => <button key={option.id} className="menu-row menu-option" type="button"
        aria-pressed={mode === option.id} disabled={busy} onClick={() => void select(option.id)}>
        <span>{option.label}<small>{option.description}</small></span>{mode === option.id && <Icon name="check" size={/* @ai-token sys.icon.size.15 */ 15} />}
      </button>)}
      {error && <><p role="alert" className="management-error">{error}</p>
        <button type="button" className="menu-row" disabled={busy} onClick={() => void read()}>重新读取审批方式</button></>}
    </div>}
  </div>
}
