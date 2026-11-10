import React, { useLayoutEffect, useRef } from 'react'
import { ConversationMarker, ConversationStatus, describeChat } from './conversation-meta.jsx'
import { Icon, IconButton } from './icons.jsx'
import { getManagement, platforms } from './management.mjs'
import { menuShortcut } from './tab-controls.jsx'

export const sections = [
  { id: 'projects', title: '项目', icon: 'home' },
  { id: 'bots', title: 'Bot 与群聊', icon: 'bot' },
  { id: 'library', title: '素材库', icon: 'folders' },
  { id: 'tasks', title: '定时任务', icon: 'clock' },
  { id: 'skills', title: '技能工具', icon: 'spark' },
  { id: 'connectors', title: '消息连接器', icon: 'link' },
  { id: 'memory', title: '记忆与学习', icon: 'book' },
]

export function Rail({ active, navigate, account, balance, menu, setMenu, logout, onOffline, openAccount }) {
  const activeSection = { 'project-settings': 'projects', 'bot-settings': 'bots' }[active] ?? active
  return <nav className="rail" aria-label="工作台导航">
    <div className="rail-actions">
      {sections.map(item => <IconButton key={item.id} icon={item.icon} label={item.title}
        aria-pressed={activeSection === item.id} onClick={() => navigate(item.id)} />)}
    </div>
    <div className="rail-bottom">
      <IconButton icon="coins" label="积分余额" aria-expanded={menu === 'credits'}
        onClick={() => setMenu(menu === 'credits' ? '' : 'credits')} />
      <button type="button" className="icon-button" aria-label="账号菜单" title="账号菜单"
        aria-expanded={menu === 'account'} onClick={() => setMenu(menu === 'account' ? '' : 'account')}>
        <span className="avatar" style={{ '--avatar': account.color }}>{account.initial}</span>
      </button>
    </div>
    {menu === 'credits' && <div className="popover rail-popover credits-popover" aria-label="积分余额详情">
      <div className="popover-caption">AIWATA 积分</div>
      <div className="balance-row"><span>可用余额</span><strong>{balance.toLocaleString('zh-CN')} 积分</strong></div>
      <button className="menu-row" onClick={() => openAccount('usage')}><Icon name="file" />查看用量明细</button>
    </div>}
    {menu === 'account' && <div className="popover rail-popover" aria-label="账号操作">
      <div className="account-heading">
        <span className="avatar" style={{ '--avatar': account.color }}>{account.initial}</span>
        <div>{account.name}<small>演示账号</small></div>
      </div>
      <button className="menu-row" onClick={() => openAccount('profile')}><Icon name="settings" />个人资料</button>
      <button className="menu-row" onClick={() => openAccount('usage')}><Icon name="coins" />积分和用量</button>
      <button className="menu-row" onClick={onOffline}><Icon name="offline" />模拟断网</button>
      <button className="menu-row" onClick={logout}><Icon name="logout" />退出登录</button>
    </div>}
  </nav>
}

function ChatRow({ item, current, select, onMenu }) {
  const openMenu = event => onMenu(event, item.id)
  return <div className="chat-row-wrap" onContextMenu={openMenu}>
    <button className="context-row chat-row" aria-label={item.title} aria-description={describeChat(item)}
      aria-current={current ? 'page' : undefined} onClick={() => select(item.id)}
      onKeyDown={event => { if (menuShortcut(event)) openMenu(event) }}>
      <span className="marker-slot"><ConversationMarker marker={item.marker} /></span>
      <span className="chat-name">{item.title}</span>
      <ConversationStatus chat={item} />
    </button>
    <IconButton className="chat-row-menu" icon="more" label={'会话操作 · ' + item.title} onClick={openMenu} />
  </div>
}

export function contextItems(record, section) {
  const management = getManagement(record)
  const items = {
    'project-settings': [['all', '所有项目', 'folders'], ...record.projects.map(item => [item.id, item.name, 'folder'])],
    'bot-settings': [['all', '全部 Bot 与群聊', 'folders'], ...record.bots.map(item => [item.id, item.name, 'bot']), ...record.groups.map(item => [item.id, item.name, 'group'])],
    library: [['all', '全部', 'folders'], ['recent', '最近', 'clock'], ['docs', '文档', 'file']],
    tasks: [['all', '全部任务', 'folders'], ...management.tasks.map(item => [item.id, item.name, 'clock'])],
    skills: [['installed', '已安装', 'spark'], ['available', '技能目录', 'book']],
    connectors: [['all', '全部连接器', 'folders'], ...management.connectors.map(item => [item.id, item.name, platforms[item.id].icon])],
    memory: [['all', '全部学习记录', 'book'], ['memory', '工作记忆', 'file'], ['user', '用户偏好', 'settings'], ['skill', '学习技能', 'spark']],
  }
  return items[section] ?? []
}

export function ContextList({ section, record, chat, select, newChat, createProject, selectItem, selectedItem,
  onChatMenu, onToggleProject, onManageProject, onManageBots, visible, onSearchChange, onListScroll, onGroupOpenChange }) {
  const collapsed = record.navigation?.collapsedProjects ?? []
  const { searching = false, search = '', scrollTop = 0, openGroups } = record.navigation?.modules?.[section] ?? {}
  const archiveOpen = openGroups?.archived ?? Boolean(search)
  const list = useRef(null)
  const searchInput = useRef(null)
  const restoredTop = useRef(null)

  useLayoutEffect(() => {
    if (!visible) return
    list.current.scrollTop = scrollTop
    restoredTop.current = list.current.scrollTop
  }, [visible, scrollTop])

  function toggleSearch() {
    if (searching) {
      onSearchChange({ searching: false, search: '' })
    } else {
      onSearchChange({ searching: true })
      requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }))
    }
  }

  function saveScroll(event) {
    const top = event.currentTarget.scrollTop
    if (!visible || top === restoredTop.current) return
    restoredTop.current = null
    onListScroll(top)
  }

  const title = { 'project-settings': '项目目录', 'bot-settings': 'Bot 与群聊管理' }[section] ?? sections.find(item => item.id === section)?.title
  const match = label => label.toLowerCase().includes(search.trim().toLowerCase())
  const projectChats = Object.values(record.chats).filter(item => ![...record.bots, ...record.groups].some(bot => bot.id === item.id))
  const archivedChats = projectChats.filter(item => item.archived && match(item.title))
  const items = contextItems(record, section)
  return <>
    <header className="context-header">
      <h1>{section === 'projects' ? 'AIWATA' : title}</h1>
      <div className="context-header-actions">
        {section === 'projects' && <IconButton icon="add" label="新建项目" onClick={createProject} />}
        {section === 'projects' && onManageProject && <IconButton icon="settings" label="管理项目目录" onClick={() => onManageProject(null)} />}
        {section === 'bots' && onManageBots && <IconButton icon="settings" label="管理 Bot 与群聊" onClick={() => onManageBots(null)} />}
        <IconButton icon="search" label="搜索侧栏" aria-expanded={searching} onClick={toggleSearch} />
      </div>
    </header>
    {searching && <input ref={searchInput} className="context-search" value={search}
      onChange={event => onSearchChange({ search: event.target.value })} placeholder="搜索…" aria-label="筛选侧栏" />}
    {section === 'projects' && <button className="context-row new-chat" onClick={() => newChat(chat?.projectId)}><Icon name="edit" />新聊天</button>}
    <div className="context-scroll" ref={list} onScroll={saveScroll}>
      {section === 'projects' && <>
        <div className="context-label">项目</div>
        {record.projects.map(project => {
          const chats = projectChats.filter(item => !item.archived && item.projectId === project.id)
          if (!match(project.name) && !chats.some(item => match(item.title))) return null
          const expanded = Boolean(search) || !collapsed.includes(project.id)
          return <div className="project-group" key={project.id}>
            <div className="project-row">
              <button className="context-row project-name" aria-expanded={expanded} onClick={() => onToggleProject(project.id)}>
                <Icon name={expanded ? 'openFolder' : 'folder'} />
                <span>{project.name}</span>
              </button>
              <IconButton icon="add" label={'在 ' + project.name + ' 中新建会话'} onClick={() => newChat(project.id)} />
              {onManageProject && <IconButton icon="settings" label={'管理项目 · ' + project.name} onClick={() => onManageProject(project.id)} />}
            </div>
            {expanded && chats.filter(item => match(project.name) || match(item.title)).map(item =>
              <ChatRow key={item.id} item={item} current={chat?.id === item.id} select={select} onMenu={onChatMenu} />)}
          </div>
        })}
        {projectChats.filter(item => !item.archived && !item.projectId && match(item.title)).map(item =>
          <ChatRow key={item.id} item={item} current={chat?.id === item.id} select={select} onMenu={onChatMenu} />)}
        {archivedChats.length > 0 && <details className="archived-chats" open={archiveOpen}>
          <summary onClick={event => {
            event.preventDefault()
            onGroupOpenChange('archived', !archiveOpen)
          }}>已归档会话 <span>{archivedChats.length}</span></summary>
          {archivedChats.map(item => <ChatRow key={item.id} item={item} current={chat?.id === item.id}
            select={select} onMenu={onChatMenu} />)}
        </details>}
      </>}
      {section === 'bots' && [
        { title: 'Bot', data: record.bots, icon: 'bot' }, { title: '群聊', data: record.groups, icon: 'group' },
      ].map(group => <div key={group.title} className="project-group">
        <div className="context-label">{group.title}</div>
        {group.data.filter(item => match(item.name)).map(item => {
          const session = record.chats[item.id]
          return <div key={item.id} className="chat-row-wrap managed-chat-row">
            <button className="context-row" aria-description={describeChat(session)}
              aria-current={chat?.id === item.id ? 'page' : undefined} onClick={() => select(item.id)}>
              <Icon name={group.icon} /><span className="chat-name">{item.name}</span><ConversationStatus chat={session} />
            </button>
            {onManageBots && <IconButton className="chat-row-menu" icon="settings" label={'管理 · ' + item.name} onClick={() => onManageBots(item.id)} />}
          </div>
        })}
      </div>)}
      {items.filter(([, label]) => match(label)).map(([id, label, icon]) =>
        <button key={id} className="context-row" aria-current={(selectedItem ?? (section === 'skills' ? 'installed' : 'all')) === id ? 'page' : undefined}
          onClick={() => selectItem(id === 'all' ? null : id)}><Icon name={icon} />{label}</button>)}
    </div>
  </>
}
