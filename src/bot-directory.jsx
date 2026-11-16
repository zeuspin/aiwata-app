import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BotFace, GroupFace } from './bot-avatar.jsx'
import { botPresence, botPresenceLabels } from './bot-presence.mjs'
import { ConversationStatus } from './conversation-meta.jsx'
import { Icon, IconButton } from './icons.jsx'
import { groupMember, resolveGroupMembers } from './management.mjs'
import { Confirm, Dialog, Field, valueOf } from './management-ui.jsx'
import { ContextMenu, menuPosition, menuShortcut } from './tab-controls.jsx'
import { conversationPreview, directorySections, updateDirectory } from './bot-directory.mjs'
import './bot-directory.css'

export function BotDirectory({ record, account, chat, select, onManageBots, onCreateBot, onMarkUnread,
  compact = false, onExpandBots, visible, onSearchChange, onListScroll, onOpenSection }) {
  const { search = '', searching = false, scrollTop = 0, directory = {} } = record.navigation?.modules?.bots ?? {}
  const [menu, setMenu] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [preview, setPreview] = useState(null)
  const previewTimer = useRef(null)
  const previewId = useId()
  const list = useRef(null)
  const input = useRef(null)
  const restored = useRef(null)
  const primary = record.bots.find(bot => bot.isDefault)
  const primaryMatches = primary && (!search.trim() || primary.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const sections = directorySections(record, directory, search)
  const categories = directory.categories ?? []
  useLayoutEffect(() => {
    if (!visible) return
    list.current.scrollTop = scrollTop
    restored.current = list.current.scrollTop
  }, [visible, scrollTop])

  function clearPreview() {
    clearTimeout(previewTimer.current)
    setPreview(null)
  }
  useEffect(() => {
    clearPreview()
    window.addEventListener('resize', clearPreview)
    return () => {
      clearTimeout(previewTimer.current)
      window.removeEventListener('resize', clearPreview)
    }
  }, [compact, visible])
  useEffect(() => {
    if (!preview) return
    function escape(event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      clearPreview()
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [preview])
  function showPreview(event, item) {
    if (!compact || !visible || menu) return
    clearTimeout(previewTimer.current)
    const anchor = event.currentTarget
    const show = () => setPreview({ item, anchor })
    if (event.type === 'focus') show()
    else previewTimer.current = setTimeout(show, 220)
  }
  function previewEvents(item) {
    return { onPointerEnter: event => { if (event.pointerType !== 'touch') showPreview(event, item) },
      onPointerLeave: clearPreview, onFocus: event => showPreview(event, item), onBlur: clearPreview,
      'aria-describedby': preview?.item.id === item.id ? previewId : undefined }
  }

  function change(action) { onSearchChange({ directory: updateDirectory(directory, action) }) }
  function openMenu(event, kind, item) { clearPreview(); setMenu({ ...menuPosition(event), kind, item, label: item ? item.name + '的操作' : '新建' }) }
  function dismiss(focus) { if (focus) menu?.anchor?.focus(); setMenu(null) }
  function toggleSearch() {
    if (compact) onExpandBots?.()
    onSearchChange({ searching: !searching, ...searching ? { search: '' } : {} })
    if (!searching) requestAnimationFrame(() => input.current?.focus())
  }
  function categoryDialog(item, moveId) { setDialog({ kind: 'category', item, moveId }) }
  function rowMenu(item) {
    return [[{ label: (directory.pinned ?? []).includes(item.id) ? '取消置顶' : '置顶', icon: 'tag', run: () => change({ type: 'pin', id: item.id }) },
      { label: '移至分类…', icon: 'folder', run: () => setDialog({ kind: 'move', item }) }],
    [...(onMarkUnread ? [{ label: record.chats[item.id]?.unread ? '标为已读' : '标为未读', icon: 'mail', run: () => onMarkUnread(item.id) }] : []),
      { label: item.kind === 'group' ? '群聊设置' : 'Bot 设置', icon: 'settings', run: () => onManageBots(item.id) }]]
  }
  const menuGroups = !menu ? [] : menu.kind === 'create' ? [
    [{ label: '新建 Bot', icon: 'add', run: () => onCreateBot('bot') },
      { label: '新建群聊', icon: 'group', run: () => onCreateBot('group') }],
    [{ label: '新建分类', icon: 'folder', run: () => categoryDialog() },
      { label: '管理全部 Bot', icon: 'settings', run: () => onManageBots(null) }],
  ] : menu.kind === 'category' ? [[
    { label: '重命名分类', icon: 'edit', run: () => categoryDialog(menu.item) },
    { label: '删除分类…', icon: 'trash', run: () => setDialog({ kind: 'remove', item: menu.item }) },
  ]] : rowMenu(menu.item)

  return <>
    <header className={"context-header bot-directory-header" + (compact ? " bot-directory-compact" : "")}>
      <h1>Bot</h1>
      <div className="context-header-actions">
        {onOpenSection && <IconButton icon="right" label="打开 Bot 与群聊" onClick={onOpenSection} />}
        <IconButton icon="search" label="搜索侧栏" aria-expanded={searching} onClick={toggleSearch} />
        <IconButton icon="add" label="新建 Bot、群聊或分类" aria-haspopup="menu" aria-expanded={menu?.kind === 'create'} onClick={event => openMenu(event, 'create')} />
      </div>
    </header>
    {searching && <input ref={input} className="context-search" value={search} placeholder="搜索 Bot 与群聊…" aria-label="筛选侧栏"
      onChange={event => onSearchChange({ search: event.target.value })} />}
    <div className={"context-scroll bot-directory" + (compact ? " bot-directory-compact" : "")} ref={list} onScroll={event => {
      clearPreview()
      if (!visible || event.currentTarget.scrollTop === restored.current) return
      restored.current = null
      onListScroll?.(event.currentTarget.scrollTop)
    }}>
      {primaryMatches &&
        <button className="primary-bot-entry" aria-label={'主 Bot · ' + primary.name} aria-current={chat?.id === primary.id ? 'page' : undefined}
          onClick={() => { clearPreview(); select(primary.id) }} onContextMenu={event => openMenu(event, 'row', { ...primary, kind: 'bot' })}
          onKeyDown={event => { if (menuShortcut(event)) openMenu(event, 'row', { ...primary, kind: 'bot' }) }} {...previewEvents(primary)}>
          <span className="primary-bot-portrait"><BotFace bot={primary} size="large" state={botPresence(record.chats[primary.id])} interactive />
            <svg className="primary-bot-crown" aria-hidden="true" viewBox="0 0 28 20" fill="none">
              <path d="m3 5 6 4 5-7 5 7 6-4-3 12H6L3 5Z" fill="#E5AD32" stroke="#BA8118" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M7 14h14" stroke="#FFF0B8" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="14" cy="10.5" r="1.4" fill="#FFF0B8" />
            </svg></span>
          <span className="primary-bot-name">{primary.name}</span>
        </button>}
      {sections.map(category => <section className="bot-directory-category" key={category.id} aria-label={category.name}>
        <div className="bot-category-heading"><h2>{category.name}</h2>
          {category.id && <IconButton icon="more" label={'分类操作 · ' + category.name} onClick={event => openMenu(event, 'category', category)} />}
        </div>
        {category.items.map(item => {
          const session = record.chats[item.id]
          const presence = item.kind === 'bot' ? botPresence(session) : null
          return <div className="chat-row-wrap bot-directory-row" key={item.id} onContextMenu={event => openMenu(event, 'row', item)}>
            <button className="context-row" aria-label={item.name} aria-current={chat?.id === item.id ? 'page' : undefined}
              aria-description={presence ? botPresenceLabels[presence] : '群聊'} onClick={() => { clearPreview(); select(item.id) }} {...previewEvents(item)}
              onKeyDown={event => { if (menuShortcut(event)) openMenu(event, 'row', item) }}>
              {item.kind === 'bot' ? <BotFace bot={item} state={presence} interactive />
                : <GroupFace account={account} members={resolveGroupMembers(item, record.bots).map(id => groupMember(item, record.bots, id))} />}
              <span className="bot-directory-copy"><span className="bot-directory-title">{item.name}</span>
                <span className="bot-directory-preview">{conversationPreview(session, item)}</span></span>
              <span className="bot-directory-status">{(directory.pinned ?? []).includes(item.id) && <Icon name="tag" size={11} />}
                {session && <ConversationStatus chat={session} />}</span>
            </button>
            <IconButton className="chat-row-menu" icon="more" label={'Bot 列表操作 · ' + item.name} aria-haspopup="menu"
              onClick={event => openMenu(event, 'row', item)} />
          </div>
        })}
        {!category.items.length && <p className="bot-directory-empty">{category.id ? '将 Bot 或群聊移入此分类' : '新建 Bot，开始协作'}</p>}
      </section>)}
      {!sections.length && !primaryMatches && <p className="bot-directory-empty">没有匹配的 Bot 或群聊</p>}
    </div>
    {preview && compact && visible && createPortal(<BotDirectoryPreview id={previewId} preview={preview}
      record={record} account={account} />, document.body)}
    {menu && createPortal(<ContextMenu position={menu} groups={menuGroups} dismiss={dismiss} />, document.body)}
    {dialog?.kind === 'category' && <Dialog title={dialog.item ? '重命名分类' : '新建分类'} onClose={() => setDialog(null)} onSubmit={form => {
      const id = dialog.item?.id ?? crypto.randomUUID()
      let next = updateDirectory(directory, { type: 'save-category', id, name: valueOf(form, 'name') })
      if (dialog.moveId) next = updateDirectory(next, { type: 'move', id: dialog.moveId, category: id })
      onSearchChange({ directory: next })
    }}><Field label="分类名称" name="name" defaultValue={dialog.item?.name} maxLength={40} required autoFocus />
      <small>分类只整理列表，不改变项目或记忆范围。</small></Dialog>}
    {dialog?.kind === 'move' && <Dialog title={'移动「' + dialog.item.name + '」'} onClose={() => setDialog(null)} onSubmit={form => {
      change({ type: 'move', id: dialog.item.id, category: valueOf(form, 'category') })
    }}><label>移至分类<select name="category" aria-label="移至分类" defaultValue={categories.some(row => row.id === directory.placements?.[dialog.item.id]) ? directory.placements[dialog.item.id] : ''} autoFocus>
      <option value="">未分组</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></label><button type="button" className="secondary" onClick={() => categoryDialog(null, dialog.item.id)}><Icon name="add" size={14} />新建分类并移入</button>
    </Dialog>}
    {dialog?.kind === 'remove' && <Confirm title={'删除分类「' + dialog.item.name + '」？'} submit="删除分类" onClose={() => setDialog(null)}
      onConfirm={() => change({ type: 'remove-category', id: dialog.item.id })}>其中的 Bot 和群聊将移回“未分组”，会话会保留。</Confirm>}
  </>
}


function BotDirectoryPreview({ id, preview, record, account }) {
  const ref = useRef(null)
  const { item, anchor } = preview
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect()
    const panel = ref.current
    const theme = window.getComputedStyle(anchor)
    for (const name of ['--surface', '--text', '--muted', '--line']) panel.style.setProperty(name, theme.getPropertyValue(name))
    const bounds = panel.getBoundingClientRect()
    panel.style.left = Math.max(8, Math.min(rect.right + 12, window.innerWidth - bounds.width - 8)) + 'px'
    panel.style.top = Math.max(8, Math.min(rect.top + rect.height / 2 - bounds.height / 2, window.innerHeight - bounds.height - 8)) + 'px'
  }, [preview])
  return <aside ref={ref} id={id} className="bot-directory-preview-card" role="tooltip">
    <header>{item.kind === 'group'
      ? <GroupFace account={account} members={resolveGroupMembers(item, record.bots).map(id => groupMember(item, record.bots, id))} />
      : <BotFace bot={item} size="small" still />}<strong>{item.name}</strong></header>
    <p>{conversationPreview(record.chats[item.id], item)}</p>
  </aside>
}
