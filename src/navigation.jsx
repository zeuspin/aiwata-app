import React, { useLayoutEffect, useRef } from 'react'
import { ConversationStatus, describeChat, ProjectMarkerPicker } from './conversation-meta.jsx'
import { BotFace, GroupFace } from './bot-avatar.jsx'
import { botPresence, botPresenceLabels } from './bot-presence.mjs'
import { Icon, IconButton } from './icons.jsx'
import { getManagement, platforms, resolveGroupMembers } from './management.mjs'
import { menuShortcut } from './tab-controls.jsx'

export const sections = [
  { id: 'projects', title: '项目', icon: 'aiwata' },
  { id: 'bots', title: 'Bot 与群聊', icon: 'botChat' },
  { id: 'library', title: '素材库', icon: 'folders' },
  { id: 'tasks', title: '定时任务', icon: 'clock' },
  { id: 'skills', title: '技能工具', icon: 'spark' },
  { id: 'connectors', title: '消息连接器', icon: 'link' },
  { id: 'memory', title: '记忆与学习', icon: 'book' },
]

export function Rail({ active, navigate, account, balance, menu, setMenu, logout, onOffline, openAccount,
  collapsed, panel, onOpenPanel, onLeavePanel }) {
  const activeSection = { 'project-settings': 'projects', 'bot-settings': 'bots' }[active] ?? active
  return <nav className="rail" aria-label="工作台导航">
    <div className="rail-actions">
      {sections.map((item, index) => {
        const floating = collapsed && index < 4
        return <React.Fragment key={item.id}>
          {index === 4 && <div className="rail-divider" aria-hidden="true" />}
          <IconButton icon={item.icon} label={item.title} className={floating ? 'rail-panel-trigger' : ''}
            aria-pressed={activeSection === item.id} aria-expanded={floating ? panel === item.id : undefined}
            aria-controls={panel === item.id ? 'rail-panel' : undefined}
            onPointerEnter={floating ? event => onOpenPanel(event, item.id, false) : undefined}
            onPointerLeave={floating ? onLeavePanel : undefined}
            onClick={event => floating ? onOpenPanel(event, item.id, true) : navigate(item.id)} />
        </React.Fragment>
      })}
    </div>
    <div className="rail-bottom">
      <IconButton icon="trash" label="回收站" className="rail-panel-trigger" aria-expanded={panel === 'archive'}
        aria-controls={panel === 'archive' ? 'rail-panel' : undefined}
        onClick={event => onOpenPanel(event, 'archive', true)} />
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
      <span className="chat-name">{item.title}</span>
      <ConversationStatus chat={item} />
    </button>
    <IconButton className="chat-row-menu" icon="more" label={'会话操作 · ' + item.title} onClick={openMenu} />
  </div>
}

export function ArchiveList({ record, chat, select, onChatMenu, onClose }) {
  const archived = Object.values(record.chats).filter(item => item.archived)
  return <>
    <header className="context-header">
      <h1>回收站</h1>
      <IconButton icon="close" label="关闭回收站" onClick={onClose} />
    </header>
    <div className="context-scroll archive-list">
      <div className="context-label">已归档会话{archived.length > 0 && ' · ' + archived.length}</div>
      {archived.length ? archived.map(item => <ChatRow key={item.id} item={item}
        current={chat?.id === item.id} select={select} onMenu={onChatMenu} />)
        : <p className="context-label">暂无已归档会话</p>}
    </div>
  </>
}

export function contextItems(record, section) {
  const management = getManagement(record)
  const items = {
    'project-settings': [['all', '所有项目', 'folders'], ...record.projects.map(item => [item.id, item.name])],
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
  onChatMenu, onToggleProject, onManageProject, onProjectMarkerChange, onManageBots, visible, onSearchChange, onListScroll, onOpenSection }) {
  const collapsed = record.navigation?.collapsedProjects ?? []
  const { searching = false, search = '', scrollTop = 0 } = record.navigation?.modules?.[section] ?? {}
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

  const title = { 'project-settings': '项目设置', 'bot-settings': 'Bot 与群聊管理' }[section] ?? sections.find(item => item.id === section)?.title
  const match = label => label.toLowerCase().includes(search.trim().toLowerCase())
  const projectChats = Object.values(record.chats).filter(item => ![...record.bots, ...record.groups].some(bot => bot.id === item.id))
  const items = contextItems(record, section)
  const groupFace = group => <GroupFace members={resolveGroupMembers(group, record.bots).map(id => record.bots.find(bot => bot.id === id))} />
  return <>
    <header className="context-header">
      <h1>{section === 'projects' ? 'AIWATA' : title}</h1>
      <div className="context-header-actions">
        {onOpenSection && <IconButton icon="right" label={'打开' + title} onClick={onOpenSection} />}
        {section === 'projects' && <IconButton icon="add" label="新建项目" onClick={createProject} />}
        {section === 'projects' && onManageProject && <IconButton icon="settings" label="项目设置" onClick={() => onManageProject(null)} />}
        {section === 'bots' && onManageBots && <IconButton icon="settings" label="管理 Bot 与群聊" onClick={() => onManageBots(null)} />}
        <IconButton icon="search" label="搜索侧栏" aria-expanded={searching} onClick={toggleSearch} />
      </div>
    </header>
    {searching && <input ref={searchInput} className="context-search" value={search}
      onChange={event => onSearchChange({ search: event.target.value })} placeholder="搜索…" aria-label="筛选侧栏" />}
    {section === 'projects' && <button className="context-row new-chat" onClick={() => newChat()}><Icon name="edit" />新聊天</button>}
    <div className="context-scroll" ref={list} onScroll={saveScroll}>
      {section === 'projects' && <>
        <div className="context-label">项目</div>
        {record.projects.map(project => {
          const chats = projectChats.filter(item => !item.archived && item.projectId === project.id)
          if (!match(project.name) && !chats.some(item => match(item.title))) return null
          const expanded = Boolean(search) || !collapsed.includes(project.id)
          return <div className="project-group" key={project.id}>
            <div className="project-row">
              <ProjectMarkerPicker title={project.name} marker={project.marker} onSave={marker => onProjectMarkerChange(project.id, marker)} />
              <button className="context-row project-name" aria-expanded={expanded} onClick={() => onToggleProject(project.id)}>
                <span className="project-title">{project.name}</span>
              </button>
              <IconButton icon="add" label={'在 ' + project.name + ' 中新建会话'} onClick={() => newChat(project.id)} />
              {onManageProject && <IconButton icon="settings" label={'项目设置 · ' + project.name} onClick={() => onManageProject(project.id)} />}
            </div>
            {expanded && chats.filter(item => match(project.name) || match(item.title)).map(item =>
              <ChatRow key={item.id} item={item} current={chat?.id === item.id} select={select} onMenu={onChatMenu} />)}
          </div>
        })}
        {projectChats.filter(item => !item.archived && !item.projectId && match(item.title)).map(item =>
          <ChatRow key={item.id} item={item} current={chat?.id === item.id} select={select} onMenu={onChatMenu} />)}
      </>}
      {section === 'bots' && [
        { title: 'Bot', data: record.bots, icon: 'bot' }, { title: '群聊', data: record.groups, icon: 'group' },
      ].map(group => <div key={group.title} className="project-group">
        <div className="context-label">{group.title}</div>
        {group.data.filter(item => match(item.name)).map(item => {
          const session = record.chats[item.id]
          const presence = group.icon === 'bot' ? botPresence(session) : null
          return <div key={item.id} className="chat-row-wrap managed-chat-row">
            <button className="context-row" title={presence ? item.name + ' · ' + botPresenceLabels[presence] : undefined}
              aria-description={presence ? 'Bot ' + botPresenceLabels[presence] + '；会话' + describeChat(session) : describeChat(session)}
              aria-current={chat?.id === item.id ? 'page' : undefined} onClick={() => select(item.id)}>
              {presence ? <BotFace bot={item} state={presence} size="small" /> : groupFace(item)}
              <span className="chat-name">{item.name}</span><ConversationStatus chat={session} />
            </button>
            {onManageBots && <IconButton className="chat-row-menu" icon="settings" label={'管理 · ' + item.name} onClick={() => onManageBots(item.id)} />}
          </div>
        })}
      </div>)}
      {items.filter(([, label]) => match(label)).map(([id, label, icon]) => {
        const current = (selectedItem ?? (section === 'skills' ? 'installed' : 'all')) === id
        if (section === 'project-settings' && id !== 'all') {
          const project = record.projects.find(item => item.id === id)
          return <div key={id} className={'project-row' + (current ? ' selected-project-row' : '')}>
            <ProjectMarkerPicker title={label} marker={project.marker} onSave={marker => onProjectMarkerChange(id, marker)} />
            <button className="context-row project-name" aria-current={current ? 'page' : undefined} onClick={() => selectItem(id)}>
              <span className="project-title">{label}</span>
            </button>
          </div>
        }
        const bot = section === 'bot-settings' && icon === 'bot' && record.bots.find(item => item.id === id)
        const group = section === 'bot-settings' && icon === 'group' && record.groups.find(item => item.id === id)
        return <button key={id} className="context-row" aria-current={current ? 'page' : undefined}
          onClick={() => selectItem(id === 'all' ? null : id)}>
          {bot ? <BotFace bot={bot} size="small" still /> : group ? groupFace(group) : <Icon name={icon} />}
          {group ? <span className="chat-name">{label}</span> : label}
        </button>
      })}
    </div>
  </>
}
