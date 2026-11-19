import React, { useLayoutEffect, useId, useRef, useState } from 'react'
import { Icon, IconButton } from './icons.jsx'
import { defaultProfile } from './management.mjs'
import './management.css'

export const dateLabel = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
export const valueOf = (form, name) => String(form.get(name) ?? '').trim()

export function Frame({ icon, title, description, children, actions, back, live, compact }) {
  if (compact) return <div className="management-content management-content-compact">{children}</div>
  return <div className="management-content">
    {back && <button className="management-back" onClick={back.onClick}><Icon name="back" size={/* @ai-token sys.icon.size.15 */ 15} />{back.label}</button>}
    <header className="management-header">
      <div className="management-heading">
        <span className="management-icon"><Icon name={icon} size={/* @ai-token sys.icon.size.20 */ 20} /></span>
        <div><h2>{title}</h2><p>{description}</p></div>
      </div>
      <div className="management-actions">{actions}</div>
    </header>
    <div className="management-preview"><span />{live ? '本机 AIWATA' : '本地演示'}</div>
    {children}
  </div>
}

export function Panel({ title, description, actions, children }) {
  return <section className="management-panel">
    <div className="management-panel-heading">
      <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
      {actions && <div className="management-actions">{actions}</div>}
    </div>
    {children}
  </section>
}

export function Entry({ icon, face, title, subtitle, children }) {
  return <div className="management-entry">
    {face ?? (icon && <span className="entry-icon"><Icon name={icon} size={/* @ai-token sys.icon.size.17 */ 17} /></span>)}
    <div className="entry-text"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
    {children && <div className="management-actions">{children}</div>}
  </div>
}

export function Badge({ children, tone }) {
  return <span className={['management-badge', tone].filter(Boolean).join(' ')}>{children}</span>
}

export function Empty({ children }) {
  return <p className="management-empty">{children}</p>
}

export function Dialog({ title, onClose, onSubmit, submit = '保存', secondarySubmit, submitDisabled = false, danger = false, className, children }) {
  const ref = useRef(null)
  const titleId = useId()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useLayoutEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    // Close before React removes the focused dialog so native focus restoration runs.
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className={['project-dialog', 'management-dialog', className].filter(Boolean).join(' ')} aria-labelledby={titleId} onCancel={event => {
    event.preventDefault()
    if (!saving) onClose()
  }}>
    <header><h2 id={titleId}>{title}</h2><IconButton icon="close" label="关闭" disabled={saving} onClick={onClose} /></header>
    <form onSubmit={async event => {
      event.preventDefault()
      if (saving || (!submit && !secondarySubmit)) return
      const submitter = event.nativeEvent.submitter
      const values = submitter ? new FormData(event.currentTarget, submitter) : new FormData(event.currentTarget)
      setSaving(true)
      try {
        const problem = await onSubmit(values)
        if (problem === false) setError('')
        else if (problem) setError(problem)
        else onClose()
      } catch (problem) { setError(problem.message) }
      finally { setSaving(false) }
    }}>
      {children}
      {error && <p role="alert" className="management-error">{error}</p>}
      <footer>
        <button type="button" className="secondary" disabled={saving} onClick={onClose}>{submit ? '取消' : '关闭'}</button>
        {secondarySubmit && <button className="secondary" name="submitAction" value="secondary" disabled={saving}>{secondarySubmit}</button>}
        {submit && <button className={danger ? 'primary danger-action' : 'primary'} disabled={submitDisabled || saving}>{submit}</button>}
      </footer>
    </form>
  </dialog>
}

export function Confirm({ title, children, onClose, onConfirm, submit = '删除' }) {
  return <Dialog title={title} onClose={onClose} onSubmit={onConfirm} submit={submit} danger>
    <p>{children}</p>
  </Dialog>
}

export function Field({ label, ...props }) {
  return <label>{label}<input {...props} /></label>
}

export function Text({ label, ...props }) {
  return <label>{label}<textarea rows={3} {...props} /></label>
}

export function Profiles({ bots, label = '所属 Profile', name, value, onChange, defaultValue }) {
  return <label className="management-select">{label}
    <select aria-label={label} name={name} value={value} defaultValue={defaultValue} onChange={onChange}>
      <option value={defaultProfile}>默认 Profile</option>
      {bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name} · {bot.profile ?? bot.id}</option>)}
    </select>
  </label>
}

