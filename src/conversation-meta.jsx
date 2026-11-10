import React, { useEffect, useRef, useState } from 'react'
import { IconButton } from './icons.jsx'
import { conversationStatus, markerColors, markerDetails, markerEmojis, showsRunningArc, statusLabels } from './conversation-meta.mjs'

export function describeChat(chat) {
  const [, marker] = markerDetails(chat.marker) ?? []
  const status = statusLabels[conversationStatus(chat)]
  return [marker && '标记：' + marker, '状态：' + status].filter(Boolean).join('，')
}

export function ConversationStatus({ chat }) {
  const status = conversationStatus(chat)
  return <span className={'conversation-status ' + status} title={statusLabels[status]} aria-hidden="true">
    {showsRunningArc(status) && <span className="conversation-status-arc" />}
    <span className="conversation-status-dot" />
  </span>
}

export function ConversationMarker({ marker }) {
  const [value, label, color] = markerDetails(marker) ?? []
  if (!value) return null
  return color
    ? <span className="conversation-marker color-marker" style={{ '--marker-color': color }} title={label} aria-hidden="true" />
    : <span className="conversation-marker emoji-marker" title={label} aria-hidden="true">{value}</span>
}

export function MarkerDialog({ title, marker, onClose, onSave }) {
  const dialog = useRef(null)
  const [selection, setSelection] = useState(marker ?? null)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  function choose(next) {
    setSelection(next)
    setSaveFailed(false)
  }

  function choice(kind, value, label) {
    const selected = selection?.kind === kind && selection.value === value
    return <button key={value} className="marker-choice" type="button"
      aria-label={label} aria-pressed={selected} title={label} onClick={() => choose({ kind, value })}>
      <ConversationMarker marker={{ kind, value }} />
    </button>
  }

  return <dialog ref={dialog} className="project-dialog marker-dialog" aria-labelledby="marker-heading" onCancel={onClose}>
    <header>
      <h2 id="marker-heading">会话标记</h2>
      <IconButton icon="close" label="关闭" onClick={onClose} />
    </header>
    <p className="muted marker-session-title">{title}</p>
    <div className="marker-group" role="group" aria-label="纯色标">
      <h3>纯色标</h3>
      <div className="marker-choices">{markerColors.map(([value, label]) => choice('color', value, label))}</div>
    </div>
    <div className="marker-group" role="group" aria-label="Emoji 表情">
      <h3>Emoji 表情</h3>
      <div className="marker-choices">{markerEmojis.map(([value, label]) => choice('emoji', value, label))}</div>
    </div>
    {saveFailed && <p className="danger" role="alert">标记未能保存，请重新打开会话后再试。</p>}
    <footer>
      <button type="button" className="secondary" disabled={!selection} onClick={() => choose(null)}>清除标记</button>
      <button type="button" className="primary" onClick={() => { if (!onSave(selection)) setSaveFailed(true) }}>保存标记</button>
    </footer>
  </dialog>
}
