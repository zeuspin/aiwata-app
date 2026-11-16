import React, { useLayoutEffect, useRef } from 'react'
import { ConversationMarker, ConversationStatus, describeChat, ProjectMarkerPicker } from './conversation-meta.jsx'
import { BotDirectory } from './bot-directory.jsx'
import { BotFace, GroupFace } from './bot-avatar.jsx'
import { Icon, IconButton } from './icons.jsx'
import { getManagement, groupMember, platforms, resolveGroupMembers } from './management.mjs'
import { ArchivePolicy } from './archive-policy.jsx'
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
  collapsed, panel, onOpenPanel, onLeavePanel, live, onManageCapabilities, onManageConnections, onOpenNativeSurface }) {
  const activeSection = { 'project-settings': 'projects', 'bot-settings': 'bots' }[active] ?? active
  return <nav className="rail" aria-label="主导航栏">
    <div className="rail-actions">
      {sections.map((item, index) => {
        const floating = collapsed && index < 4
        return <React.Fragment key={item.id}>
          {index === 4 && <div className="rail-divider" aria-hidden="true" />}
          <IconButton icon={item.icon} label={item.title} selected={activeSection === item.id} className={floating ? 'rail-panel-trigger' : ''}
            aria-pressed={activeSection === item.id} aria-expanded={floating ? panel === item.id : undefined}
            aria-controls={panel === item.id ? 'rail-panel' : undefined}
            onPointerEnter={floating ? event => onOpenPanel(event, item.id, false) : undefined}
            onPointerLeave={floating ? onLeavePanel : undefined}
            onClick={event => floating ? onOpenPanel(event, item.id, true) : navigate(item.id)} />
        </React.Fragment>
      })}
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
      {live ? <p role="status">未接入积分服务，暂时无法查询真实余额与用量。</p>
        : <><p className="muted">演示余额，不代表真实账户积分。</p>
          <div className="balance-row"><span>可用余额</span><strong>{balance.toLocaleString('zh-CN')} 积分</strong></div></>}
      <button className="menu-row" onClick={() => openAccount('usage')}><Icon name="file" />查看用量明细</button>
    </div>}
    {menu === 'account' && <div className="popover rail-popover" aria-label="账号操作">
      <div className="account-heading">
        <span className="avatar" style={{ '--avatar': account.color }}>{account.initial}</span>
        <div>{account.name}<small>{live ? 'AIWATA 工作区' : '演示账号'}</small></div>
      </div>
      <button className="menu-row" aria-expanded={panel === 'archive'} aria-controls={panel === 'archive' ? 'rail-panel' : undefined}
        onClick={event => onOpenPanel(event, 'archive', true)}><Icon name="archive" />归档记录</button>
      {onOpenNativeSurface && <button className="menu-row" onClick={()=>onOpenNativeSurface('settings')}><Icon name="settings" />高级原生设置</button>}
      {onManageConnections && <button className="menu-row" onClick={onManageConnections}><Icon name="link" />连接管理</button>}
      {live && <><button className="menu-row" onClick={() => onManageCapabilities('models')}><Icon name="settings" />模型授权</button>
      <button className="menu-row" onClick={() => onManageCapabilities('mcp')}><Icon name="link" />MCP 管理</button></>}
      <button className="menu-row" onClick={() => openAccount('profile')}><Icon name="settings" />个人资料</button>
      <button className="menu-row" onClick={() => openAccount('usage')}><Icon name="coins" />积分和用量</button>
      <button className="menu-row" disabled={live} aria-describedby={live ? 'offline-demo-status' : undefined}
        onClick={onOffline}><Icon name="offline" />模拟断网</button>
      {live && <small id="offline-demo-status" className="muted">模拟断网仅在演示模式可用。</small>}
      <button className="menu-row" onClick={logout}><Icon name="logout" />退出登录</button>
    </div>}
  </nav>
}

function ChatRow({ item, current, select, onMenu, project }) {
  const openMenu = event => onMenu(event, item.id)
  return <div className="chat-row-wrap" onContextMenu={openMenu}>
    <button className="context-row chat-row" aria-label={item.title} aria-description={(project ? project.name : '无项目') + '，' + describeChat(item, project?.marker)}
      aria-current={current ? 'page' : undefined} onClick={() => select(item.id)}
      onKeyDown={event => { if (menuShortcut(event)) openMenu(event) }}>
      {project ? <ConversationMarker marker={project.marker} /> : <Icon name="comment" size={14} />}
      <span className="chat-name">{item.title}</span>
      <ConversationStatus chat={item} />
    </button>
    <IconButton className="chat-row-menu" icon="more" label={'会话操作 · ' + item.title} onClick={openMenu} />
  </div>
}

export function ArchiveList({ record, chat, select, onChatMenu, onClose, live }) {
  const archived = Object.values(record.chats).filter(item => item.archived)
  return <>
    <header className="context-header">
      <h1>归档记录</h1>
      <IconButton icon="close" label="关闭归档记录" onClick={onClose} />
    </header>
    <div className="context-scroll archive-list">
      <ArchivePolicy live={live} />
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
    connectors: [['all', '全部连接器', 'folders'], ...Object.entries(platforms).map(([id, item]) => [id, item.name, item.icon])],
    memory: [['all', '全部学习记录', 'book'], ['memory', '工作记忆', 'file'], ['user', '用户偏好', 'settings'], ['skill', '学习技能', 'spark']],
  }
  return items[section] ?? []
}

export function ContextList({ section, record, account, chat, select, newChat, createProject, selectItem, selectedItem,
  onChatMenu, onToggleProject, onManageProject, onProjectMarkerChange, onManageBots, onCreateBot, onMarkUnread, compact, onExpandBots, visible, onSearchChange, onListScroll, onOpenSection }) {

  const collapsed = record.navigation?.collapsedProjects ?? []
  const { searching = false, search = '', scrollTop = 0 } = record.navigation?.modules?.[section] ?? {}
  const list = useRef(null)
  const searchInput = useRef(null)
  const restoredTop = useRef(null)

  useLayoutEffect(() => {
    if (!visible || section === 'bots') return
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

  const title = { 'project-settings': '项目设置', 'bot-settings': '全部 Bot 管理' }[section] ?? sections.find(item => item.id === section)?.title
  const match = label => label.toLowerCase().includes(search.trim().toLowerCase())
  const projectChats = Object.values(record.chats).filter(item => ![...record.bots, ...record.groups].some(bot => bot.id === item.id))
  const items = contextItems(record, section)
  const groupFace = group => <GroupFace account={account} members={resolveGroupMembers(group, record.bots).map(id => groupMember(group,record.bots,id))} />
  if (section === 'bots') return <BotDirectory {...{ record, account, chat, select, onManageBots, onCreateBot, onMarkUnread,
    compact, onExpandBots, visible, onSearchChange, onListScroll, onOpenSection }} />
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
              <ChatRow key={item.id} item={item} project={project} current={chat?.id === item.id} select={select} onMenu={onChatMenu} />)}
          </div>
        })}
        <div className="context-label">无项目</div>
        {projectChats.filter(item => !item.archived && !item.projectId && match(item.title)).map(item =>
          <ChatRow key={item.id} item={item} current={chat?.id === item.id} select={select} onMenu={onChatMenu} />)}
      </>}
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
