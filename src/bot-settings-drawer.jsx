
import React, { useEffect, useId, useRef } from 'react'
import { IconButton } from './icons.jsx'
import './bot-settings-drawer.css'

export function BotSettingsDrawer({ name, group, busy, onClose, returnFocus, children }) {

  const dialog = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const trigger = returnFocus
    dialog.current.showModal()
    return () => {
      if (trigger?.isConnected) trigger.focus()
      else document.querySelector('.bot-conversation-pill')?.focus()
    }
  }, [])
  return <dialog ref={dialog} className="bot-settings-drawer" aria-labelledby={titleId}
    onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); if (!busy) onClose() }}>
    <header className="bot-settings-drawer-heading">
      <div><span>{group ? '群聊设置' : 'Bot 设置'}</span><h2 id={titleId}>{name}</h2></div>
      <IconButton icon="close" label={group ? "关闭群聊设置" : "关闭 Bot 设置"} disabled={busy} onClick={onClose} />
    </header>
    <div className="bot-settings-drawer-body">{children}</div>
  </dialog>
}
