import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ConversationMarker, ConversationStatus, describeChat } from './conversation-meta.jsx'
import { Icon, IconButton } from './icons.jsx'

export function menuShortcut(event) {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

export function menuPosition(event) {
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget
  const anchor = target.matches('button') ? target : target.querySelector('button') ?? target
  if (event.type === 'contextmenu' && (event.clientX || event.clientY)) {
    return { anchor, x: event.clientX, y: event.clientY }
  }
  const rect = anchor.getBoundingClientRect()
  return { anchor, x: rect.left, y: rect.bottom + 4 }
}

export function TabStrip({ label, tabs, active, onSelect, onClose, onMenu, onPreview, onPreviewEnd, className }) {
  const strip = useRef(null)

  useEffect(() => {
    const element = strip.current
    function scrollTabs(event) {
      if (element.scrollWidth <= element.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      event.preventDefault()
      element.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1)
    }
    element.addEventListener('wheel', scrollTabs, { passive: false })
    return () => element.removeEventListener('wheel', scrollTabs)
  }, [])

  useLayoutEffect(() => {
    const element = strip.current
    function reveal() {
      const tab = element.querySelector('.selected')?.getBoundingClientRect()
      if (!tab) return
      const track = element.getBoundingClientRect()
      const inset = Number.parseFloat(getComputedStyle(element).scrollPaddingInlineStart) || 0
      if (tab.left < track.left + inset) element.scrollLeft += tab.left - track.left - inset
      else if (tab.right > track.right - inset) element.scrollLeft += tab.right - track.right + inset
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(element)
    return () => observer.disconnect()
  }, [active, tabs.length])

  function onKeyDown(event, id) {
    if (menuShortcut(event)) return onMenu(event, id)
    const directions = { ArrowLeft: -1, ArrowRight: 1 }
    const index = tabs.findIndex(tab => tab.id === id)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : directions[event.key] ? (index + directions[event.key] + tabs.length) % tabs.length : null
    if (next === null) return
    event.preventDefault()
    onSelect(tabs[next].id)
    strip.current.querySelectorAll('[role="tab"]')[next]?.focus()
  }

  return <div className={'tab-strip ' + className} ref={strip} role="tablist" aria-label={label} onScroll={onPreviewEnd}>
    {tabs.map(({ id, title, icon, chat }) => <div className={'workbench-tab ' + (id === active ? 'selected' : '')} key={id}
      onContextMenu={event => onMenu(event, id)}
      onPointerEnter={onPreview ? event => onPreview(event, id) : undefined} onPointerLeave={onPreviewEnd}>
      <button role="tab" title={title} aria-label={title} aria-description={chat ? describeChat(chat) : undefined}
        aria-selected={id === active} onClick={() => onSelect(id)}
        onKeyDown={event => onKeyDown(event, id)}>
        {chat ? <ConversationMarker marker={chat.marker} /> : <Icon name={icon} size={15} />}
        <span className="tab-name">{title}</span>
        {chat && <ConversationStatus chat={chat} />}
      </button>
      <IconButton icon="close" label={'关闭 ' + title} onClick={() => onClose(id)} />
    </div>)}
  </div>
}

export function ContextMenu({ position, groups, dismiss }) {
  const root = useRef(null)

  useLayoutEffect(() => {
    const menu = root.current
    const rect = menu.getBoundingClientRect()
    menu.style.left = Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)) + 'px'
    menu.style.top = Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8)) + 'px'
    menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [position])

  useEffect(() => {
    function onPointerDown(event) {
      if (!root.current?.contains(event.target)) dismiss(false)
    }
    function onResize() { dismiss(false) }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
    }
  }, [dismiss])

  return <div className="popover tab-context-menu" ref={root} role="menu" aria-label={position.label}
    onContextMenu={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismiss(true)
      }
      if (event.key === 'Tab') dismiss(false)
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const rows = [...root.current.querySelectorAll('button:not(:disabled)')]
      const index = rows.indexOf(document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
      rows[next]?.focus()
    }}>
    {groups.filter(group => group.length).map((group, index) => <React.Fragment key={index}>
      {index > 0 && <div role="separator" className="menu-divider" />}
      {group.map(item => <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
        className={'menu-row ' + (item.danger ? 'danger' : '')} onClick={() => {
          dismiss(false)
          item.run()
        }}>
        <Icon name={item.icon} size={16} />{item.label}
      </button>)}
    </React.Fragment>)}
  </div>
}

export function TabDialog({ action, onClose, onSubmit }) {
  const dialog = useRef(null)
  const [title, setTitle] = useState(action.title)
  const deleting = action.kind === 'delete'
  const moving = action.kind === 'move'
  const [projectId, setProjectId] = useState(action.targets?.[0]?.id ?? '')
  const [moveFailed, setMoveFailed] = useState(false)

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  return <dialog ref={dialog} className="project-dialog" aria-labelledby="tab-dialog-title" onCancel={onClose}>
    <header><h2 id="tab-dialog-title">{deleting ? '删除会话？' : moving ? '移动到项目' : '重命名标签页'}</h2>
      <IconButton icon="close" label="关闭" onClick={onClose} /></header>
    <form onSubmit={event => {
      event.preventDefault()
      if (moving) {
        if (!onSubmit(projectId)) setMoveFailed(true)
      } else if (deleting || title.trim()) onSubmit(title)
    }}>
      {deleting
        ? <p>「{action.title}」及其消息和草稿将从工作区删除。</p>
        : moving
          ? <><p>「{action.title}」将使用目标项目的工作目录。</p>
              <label>目标项目<select autoFocus value={projectId} onChange={event => { setProjectId(event.target.value); setMoveFailed(false) }}>
                {action.targets.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select></label>
              {moveFailed && <p role="alert" className="danger">暂时无法移动，请等会话运行结束后重试。</p>}</>
        : <label>名称<input autoFocus value={title} maxLength={80} required onChange={event => setTitle(event.target.value)} /></label>}
      <footer>
        <button className="secondary" type="button" autoFocus={deleting} onClick={onClose}>取消</button>
        <button className={'primary ' + (deleting ? 'danger-action' : '')} disabled={moving ? !projectId : !deleting && !title.trim()}>
          {deleting ? '删除会话' : moving ? '移动' : '保存'}
        </button>
      </footer>
    </form>
  </dialog>
}
