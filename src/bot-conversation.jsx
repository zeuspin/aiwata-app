import React from 'react'
import { IconButton } from './icons.jsx'
import { BotFace, GroupFace } from './bot-avatar.jsx'
import { botPresence, botPresenceLabels, roomMemberPresence } from './bot-presence.mjs'
import { botHandle } from './room.mjs'
import { groupRouting } from './management.mjs'
import { models } from './composer.mjs'
import './bot-conversation.css'

const states = { queued: '排队中', running: '执行中', completed: '已回复', waiting: '待确认',
  failed: '失败', denied: '操作已拒绝', stopped: '已停止' }

export function BotConversationHeader({ bot, group, members, chat, onManage }) {
  const room = chat.pending ? chat.agentRun?.room : chat.roomOutcome
  const request = chat.agentRun?.request
  const presence = bot ? botPresence(chat) : null
  const model = bot && (models.find(item => item.id === bot.model && item.provider === bot.provider)?.label || bot.model || '工作区默认模型')
  const lead = group?.routing === 'lead' && members.find(member => member.id === group.lead)
  const routing = groupRouting[group?.routing ?? 'everyone']
  return <header className="bot-conversation-header">
    <div className="bot-conversation-heading">
      {bot ? <BotFace bot={bot} state={presence} /> : <GroupFace members={members} large />}
      <div className="bot-conversation-identity">
        <h2>{bot?.name ?? group.name}</h2>
        <p>{bot ? [bot.description, model].filter(Boolean).join(' · ')
          : [routing, lead?.name, group.purpose].filter(Boolean).join(' · ')}</p>
      </div>
      {bot && <span className="bot-presence-label" data-presence={presence} role="status">{botPresenceLabels[presence]}</span>}
      <IconButton icon="settings" label={bot ? 'Bot 设置' : '群聊设置'} onClick={onManage} />
    </div>
    {group && <ul className="room-member-list" aria-label="群成员">
      {members.map(member => {
        const presence = roomMemberPresence(chat, member.id)
        const awaiting = request?.params.member_id === member.id
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

export function DiscussionPause({ onContinue, onStop }) {
  return <section className="room-pause agent-request" aria-label="讨论已暂停">
    <h3>讨论达到轮次上限</h3>
    <p>可以让成员在当前讨论中再继续一轮。</p>
    <div className="agent-card-actions">
      <button className="primary" onClick={onContinue}>继续讨论</button>
      <button className="secondary" onClick={onStop}>结束讨论</button>
    </div>
  </section>
}
