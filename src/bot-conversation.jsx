import React, { useId } from 'react'
import { BotFace, GroupFace } from './bot-avatar.jsx'
import { roomMemberPresence } from './bot-presence.mjs'
import { botHandle } from './room.mjs'
import { groupRouting } from './management.mjs'
import './bot-conversation.css'
import './bot-conversation-header.css'

const states = { queued: '排队中', running: '执行中', completed: '已回复', waiting: '待确认',
  failed: '失败', denied: '操作已拒绝', stopped: '已停止', passed: '暂无补充' }

export function BotConversationHeader({ bot, group, members, chat, account, onManage }) {
  const descriptionId = useId()
  const room = chat.pending ? chat.agentRun?.room : chat.roomOutcome
  const request = chat.agentRun?.request
  const lead = group?.routing === 'lead' && members.find(member => member.id === group.lead)
  const routing = groupRouting[group?.routing ?? 'everyone']
  const name = bot?.name ?? group.name
  const description = group && [routing, lead?.name, group.purpose].filter(Boolean).join(' · ')
  return <header className="bot-conversation-header bot-conversation-header-compact">
    <div className="bot-conversation-heading bot-conversation-heading-compact">
      <h2 className="bot-conversation-title">
        <button type="button" className="bot-conversation-pill" onClick={onManage}
          aria-label={name + (bot ? '，Bot 设置' : '，群聊设置')} aria-describedby={description ? descriptionId : undefined} title={name}>
          {bot ? <BotFace bot={bot} size="activity" still /> : <GroupFace members={members} account={account} large />}
          <span className="bot-conversation-name">{name}</span>
        </button>
      </h2>
    </div>
    {description && <div className="bot-conversation-meta">
      <p id={descriptionId} className="bot-conversation-description" title={description}>{description}</p>
    </div>}
    {group && <ul className="room-member-list" aria-label="群成员">
      {members.map(member => {
        const presence = roomMemberPresence(chat, member.id)
        const awaiting = request?.params.member_id === member.id || chat.roomApprovals?.some(item => item.params.member_id === member.profile)
        const status = presence === 'waiting' ? 'waiting' : room?.statuses?.[member.id]
        return <li key={member.id} title={'@' + botHandle(member)}>
          <BotFace bot={member} state={presence} size="small" /><span>{member.name}</span>
          {status && <small className={'room-member-status ' + status}>{status === 'waiting' && !awaiting ? '待继续' : states[status]}</small>}
        </li>
      })}
    </ul>}
    {group && <span className="sr-only" role="status">
      {room?.paused ? '讨论达到轮次上限，等待继续' : request?.params.member_name ? request.params.member_name + '等待确认'
        : members.filter(member => room?.statuses?.[member.id] === 'running').map(member => member.name).join('、') +
          (members.some(member => room?.statuses?.[member.id] === 'running') ? '正在处理' : '')}
    </span>}
  </header>
}

export function DiscussionPause({ onContinue, onStop, disabled }) {
  return <section className="room-pause agent-request" aria-label="讨论已暂停">
    <h3>讨论达到轮次上限</h3>
    <p>可以让成员在当前讨论中再继续一轮。</p>
    <div className="agent-card-actions">
      <button className="primary" disabled={disabled} onClick={onContinue}>继续讨论</button>
      <button className="secondary" disabled={disabled} onClick={onStop}>结束讨论</button>
    </div>
  </section>
}
