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

export function TabStrip({ label, tabs, active, layout, onSelect, onDoubleClick, onClose, onMenu, onPreview, onPreviewEnd, className }) {
  const strip = useRef(null)
  const selectionTimer = useRef(null)
  const pointerAnchor = useRef(null)

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
    const sessionStrip = className === 'session-tabs'
    let scrollTimer

    function updateSessionEdges() {
      const track = element.getBoundingClientRect()
      const inset = Number.parseFloat(getComputedStyle(element).scrollPaddingInlineStart) || 0
      for (const tab of element.children) {
        const bounds = tab.getBoundingClientRect()
        tab.toggleAttribute('data-clipped', bounds.left < track.left + inset - 1 || bounds.right > track.right - inset + 1)
      }
    }

    function onSessionScroll() {
      updateSessionEdges()
      clearTimeout(scrollTimer)
      if (pointerAnchor.current) return
      scrollTimer = setTimeout(() => {
        const first = element.firstElementChild
        if (!first) return
        const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0
        const stride = first.getBoundingClientRect().width + gap
        if (!stride) return
        const snapped = Math.round(element.scrollLeft / stride) * stride
        if (Math.abs(snapped - element.scrollLeft) > 1) element.scrollLeft = snapped
      }, 140)
    }

    function reveal() {
      const inset = Number.parseFloat(getComputedStyle(element).scrollPaddingInlineStart) || 0
      if (sessionStrip) {
        // Fit whole compact tabs between the two corner insets.
        const width = Math.max(0, element.clientWidth - 2 * inset)
        const slots = Math.max(1, Math.floor((width + inset) / (83 + inset)))
        element.style.setProperty('--session-tab-width', (width - (slots - 1) * inset) / slots + 'px')
      }
      const selected = element.querySelector('.selected > [role="tab"]')
      if (pointerAnchor.current?.button !== selected) {
        pointerAnchor.current = null
        element.style.removeProperty('--tab-offset')
        element.style.removeProperty('--tab-scroll-extension')
      }
      if (!selected) {
        if (sessionStrip) updateSessionEdges()
        return
      }
      const tab = selected.parentElement.getBoundingClientRect()
      const track = element.getBoundingClientRect()
      const anchor = pointerAnchor.current
      if (anchor) {
        const button = selected.getBoundingClientRect()
        const shift = Number.parseFloat(element.style.getPropertyValue('--tab-offset')) || 0
        const naturalLeft = tab.left + element.scrollLeft - shift
        const clickOffset = Math.min(anchor.offset, Math.max(0, button.right - tab.left - 3))
        const minLeft = track.left + inset
        const maxLeft = track.right - inset - tab.width
        const left = Math.max(minLeft, Math.min(anchor.x - clickOffset, maxLeft))
        // Add room on either side when the new strip would otherwise clamp
        // the scroll position before the clicked tab reaches its anchor.
        const scroll = Math.max(0, naturalLeft - left)
        element.style.setProperty('--tab-offset', Math.max(0, left - naturalLeft) + 'px')
        element.style.setProperty('--tab-scroll-extension', Math.ceil(scroll) + 'px')
        element.scrollLeft = scroll
      } else {
        if (tab.left < track.left + inset) element.scrollLeft += tab.left - track.left - inset
        else if (tab.right > track.right - inset) element.scrollLeft += tab.right - track.right + inset
      }
      if (sessionStrip) updateSessionEdges()
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(element)
    if (sessionStrip) element.addEventListener('scroll', onSessionScroll, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', onSessionScroll)
      clearTimeout(scrollTimer)
      clearTimeout(selectionTimer.current)
    }
  }, [active, tabs.length, layout, className])

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
    {tabs.map(({ id, title, icon, chat, marker, deferSelect }) => <div className={'workbench-tab ' + (id === active ? 'selected' : '')} key={id}
      onContextMenu={event => onMenu(event, id)}
      onPointerEnter={onPreview ? event => onPreview(event, id) : undefined} onPointerLeave={onPreviewEnd}>
      <button role="tab" title={title} aria-label={title} aria-description={chat ? describeChat(chat, marker) : undefined}
        aria-selected={id === active} onClick={event => {
          clearTimeout(selectionTimer.current)
          if (onDoubleClick && event.detail > 1) return
          // Keep the tab under the pointer when selecting it would change the pane layout.
          if (event.detail === 1 && (deferSelect || (pointerAnchor.current && id !== active))) {
            selectionTimer.current = setTimeout(() => onSelect(id), 300)
          }
          else onSelect(id)
        }}
        onDoubleClick={onDoubleClick && (event => {
          clearTimeout(selectionTimer.current)
          const button = event.currentTarget
          pointerAnchor.current = { button, x: event.clientX, offset: event.clientX - button.parentElement.getBoundingClientRect().left }
          onDoubleClick(id)
        })}
        onKeyDown={event => onKeyDown(event, id)}>
        {chat ? <ConversationMarker marker={marker} /> : <Icon name={icon} size={15} />}
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
