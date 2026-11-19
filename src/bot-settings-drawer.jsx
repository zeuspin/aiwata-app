
import React, { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { IconButton } from './icons.jsx'
import './bot-settings-drawer.css'

export function BotSettingsDrawer({ name, group, avatarOnly, busy, onClose, returnFocus, children }) {

  const dialog = useRef(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  useEffect(() => () => {
    if (returnFocus?.isConnected) returnFocus.focus()
    else document.querySelector('.bot-conversation-pill')?.focus()
  }, [returnFocus])
  return <dialog ref={dialog} className={'bot-settings-drawer' + (avatarOnly ? ' bot-avatar-dialog' : '')} aria-labelledby={titleId}
    onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); if (!busy) onClose() }}>
    <header className="bot-settings-drawer-heading">
      <div><span>{avatarOnly ? name : group ? '群聊设置' : 'Bot 设置'}</span><h2 id={titleId}>{avatarOnly ? '更换头像' : name}</h2></div>
      <IconButton icon="close" label={avatarOnly ? '关闭头像编辑' : group ? '关闭群聊设置' : '关闭 Bot 设置'} disabled={busy} onClick={onClose} />
    </header>
    <div className="bot-settings-drawer-body">{children}</div>
  </dialog>
}
