import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { approvalModes } from './composer.mjs'
import { Icon } from './icons.jsx'

const initialState = { mode: null, busy: false, error: '' }
const modeKey = 'approvals.mode'

function nativeMode(result) {
  if (!approvalModes.some(option => option.id === result?.value)) throw new Error('AIWATA 返回了未知的审批方式。')
  return result.value
}

export function useLiveApprovalMode(live, profile, connected, report) {
  const scope = useMemo(() => ({ revision: 0, saving: false }), [live, profile, connected])
  const active = useRef(null)
  const [status, setStatus] = useState(null)
  const state = status?.scope === scope ? status.state : initialState

  function update(patch) {
    setStatus(previous => ({ scope, state: { ...(previous?.scope === scope ? previous.state : initialState), ...patch } }))
  }

  async function read() {
    if (!live || !connected || scope.saving) return
    const revision = ++scope.revision
    const current = () => active.current === scope && scope.revision === revision
    try {
      const mode = nativeMode(await live.rpc('config.get', { key: modeKey }, profile))
      if (current()) update({ mode, error: '' })
    } catch (problem) {
      if (current()) update({ error: problem.message })
    }
  }

  useLayoutEffect(() => {
    active.current = scope
    return () => { active.current = null; scope.revision++ }
  }, [scope])
  useEffect(() => { void read() }, [scope])

  async function save(value) {
    if (!live || !connected || scope.saving || active.current !== scope) return false
    scope.saving = true
    const revision = ++scope.revision
    const current = () => active.current === scope && scope.revision === revision
    update({ busy: true, error: '' })
    try {
      const mode = nativeMode(await live.rpc('config.set', { key: modeKey, value }, profile))
      if (!current()) return false
      update({ mode })
      if (mode !== value) throw new Error('AIWATA 未应用所选的审批方式。')
      return true
    } catch (problem) {
      if (current()) { update({ error: problem.message }); report(problem.message, true) }
      return false
    } finally {
      scope.saving = false
      if (current()) update({ busy: false })
    }
  }

  return { ...state, scope, read, save }
}

export function LiveApprovalControl({ approval, connected }) {
  const { mode, busy, error, scope, read, save } = approval
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const button = useRef(null)
  useEffect(() => { setOpen(false) }, [scope])

  useEffect(() => {
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])

  async function select(value) {
    if (await save(value)) {
      setOpen(false)
      button.current?.focus()
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
      <Icon name={option?.icon ?? 'shield'} size={/* @ai-token sys.icon.size.15 */ 15} /><span>{busy ? '正在保存…' : option?.label || (error ? '审批方式' : '读取审批方式…')}</span>
    </button>
    {open && <ApprovalMenu mode={mode} disabled={busy} onSelect={value => void select(value)}>
      {error && <><p role="alert" className="management-error">{error}</p>
        <button type="button" className="menu-row" disabled={busy} onClick={() => void read()}>重新读取审批方式</button></>}
    </ApprovalMenu>}
  </div>
}

export function ApprovalMenu({ mode, disabled, onSelect, children }) {
  return <div className="popover composer-menu approval-menu" aria-label="批准方式选项">
    {approvalModes.map(option => <button key={option.id} type="button"
      className={'approval-option' + (option.id === 'off' ? ' warning' : '')}
      aria-pressed={mode === option.id} disabled={disabled} onClick={() => onSelect(option.id)}>
      <Icon name={option.icon} />
      <span className="approval-option-copy">
        <strong>{option.label}</strong>
        <small>{option.description}</small>
      </span>
      {mode === option.id && <span className="approval-option-check" aria-hidden="true"><Icon name="tick" /></span>}
    </button>)}
    {children}
  </div>
}
