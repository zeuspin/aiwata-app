import { conversationStatus } from './conversation-meta.mjs'

export const botPresenceLabels = {
  idle: '待命', thinking: '思考中', working: '执行中', waiting: '待确认',
  blocked: '遇到问题', done: '已完成', stopped: '已停止',
}

export function botPresence(chat) {
  if (!chat) return 'idle'
  const status = conversationStatus(chat)
  if (status === 'needs-input') return 'waiting'
  if (status === 'stalled') return 'blocked'
  if (status === 'background') return 'working'
  if (status === 'working') {
    const run = chat.agentRun
    const started = run?.text || Object.keys(run?.tools ?? {}).length || Object.keys(run?.children ?? {}).length
    return started ? 'working' : 'thinking'
  }
  const outcome = chat.messages.at(-1)
  if (outcome?.role !== 'agent') return 'idle'
  if (outcome.status === 'complete') return 'done'
  if (outcome.status === 'error') return 'blocked'
  if (outcome.status === 'interrupted') return 'stopped'
  return 'idle'
}

export function roomMemberPresence(chat, id) {
  const room = chat.pending ? chat.agentRun?.room : chat.roomOutcome
  const status = room?.statuses?.[id]
  if (chat.agentRun?.request?.params?.member_id === id) return 'waiting'
  if (room?.paused && ['queued', 'running', 'completed'].includes(status)) return 'waiting'
  if (status === 'queued') return 'thinking'
  if (status === 'running') return 'working'
  if (status === 'completed') return 'done'
  if (status === 'failed' || status === 'denied') return 'blocked'
  if (status === 'stopped') return 'stopped'
  return 'idle'
}
