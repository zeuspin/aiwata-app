import React, { useId, useRef, useState } from 'react'
import { conversationStatus, markerColors, markerDetails, showsRunningArc, statusLabels } from './conversation-meta.mjs'
import { Icon } from './icons.jsx'

export function describeChat(chat, projectMarker) {
  const [, marker] = markerDetails(projectMarker) ?? []
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
  return <span className="conversation-marker color-marker" style={{ '--marker-color': color }} title={label} aria-hidden="true" />
}

export function ProjectMarkerPicker({ title, marker, onSave, label = '更换标记 · ' + title, emptyIcon, triggerText }) {
  const id = useId()
  const trigger = useRef(null)
  const picker = useRef(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [, currentLabel] = markerDetails(marker) ?? []

  function choice(kind, value, label) {
    const selected = marker?.kind === kind && marker.value === value
    return <button key={value} className="marker-choice" type="button"
      aria-label={label} aria-pressed={selected} title={label} onClick={() => {
        if (!onSave({ kind, value })) {
          setSaveFailed(true)
          return
        }
        picker.current.hidePopover()
        trigger.current.focus()
      }}>
      <ConversationMarker marker={{ kind, value }} />
    </button>
  }

  return <>
    <button type="button" ref={trigger} className="project-marker-button" popoverTarget={id} aria-haspopup="dialog"
      title={label} aria-label={label} aria-description={currentLabel}
      onClick={() => setSaveFailed(false)}>
      {!marker && emptyIcon ? <Icon name={emptyIcon} /> : <ConversationMarker marker={marker} />}
      {triggerText && <>{triggerText}<Icon name="chevron" size={12} /></>}
    </button>
    <div ref={picker} id={id} popover="auto" className="popover project-marker-picker" role="dialog"
      aria-label={'项目标记 · ' + title}>
      <div className="marker-group" role="group" aria-label="纯色标">
        <h3>纯色标</h3>
        <div className="marker-choices">{markerColors.map(([value, label]) => choice('color', value, label))}</div>
      </div>
      <label className="marker-custom-color">
        自定义颜色
        <input type="color" aria-label="自定义项目颜色" value={markerDetails(marker)?.[2] ?? '#5b84c4'}
          onChange={event => { setSaveFailed(!onSave({ kind: 'color', value: event.target.value })) }} />
      </label>
      {saveFailed && <p className="danger" role="alert">标记未能保存，请重试。</p>}
    </div>
  </>
}
