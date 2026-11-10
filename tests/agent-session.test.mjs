import test from 'node:test'
import assert from 'node:assert/strict'
import { createMockAgent } from '../src/agent-session.mjs'
import { createWorkspace } from '../src/workspace.mjs'

test('approval stops a simulated run until the matching request is resolved', () => {
  const scheduled = new Map()
  const agent = createMockAgent({
    schedule: fn => { const id = Symbol(); scheduled.set(id, fn); return id },
    cancel: id => scheduled.delete(id),
  })
  const events = []
  const runScheduled = () => {
    while (scheduled.size) {
      const [id, fn] = scheduled.entries().next().value
      scheduled.delete(id)
      fn()
    }
  }
  agent.request('prompt.submit', { session_id: 's', text: '演示审批' }, {
    turnId: 't', onEvent: event => events.push(event), approvalMode: 'manual',
  })
  runScheduled()
  const request = events.at(-1)
  assert.equal(request.method, 'approval')
  assert.deepEqual(agent.request('approval.respond', { session_id: 's', request_id: 'stale', choice: 'once' }), { resolved: 0 })
  assert.equal(scheduled.size, 0)
  assert.deepEqual(agent.request('approval.respond', { session_id: 's', request_id: request.id, choice: 'once' }), { resolved: 1 })
  runScheduled()
  assert.ok(events.some(event => event.type === 'message.delta'))
  assert.equal(events.at(-1).data.status, 'complete')
})

test('queued messages charge when admitted and stay paused after an interruption', () => {
  const api = createWorkspace()
  api.login('lin')
  const { chats, credits } = api.current()
  api.setDraft('plan', '第一轮')
  assert.equal(api.send('plan', 'first').ok, true)
  api.setDraft('plan', '第二轮')
  assert.equal(api.queuePrompt('plan', 'second'), true)
  assert.equal(api.current().credits, credits - 12)
  api.applyAgentEvent('plan', 'first', { type: 'message.complete', data: { status: 'interrupted' } }, true)
  assert.equal(chats.plan.activity.queuePaused, true)
  assert.equal(api.startQueuedPrompt('plan').ok, false)
  api.pausePromptQueue('plan', false)
  assert.equal(api.startQueuedPrompt('plan').runId, 'second')
  assert.equal(api.current().credits, credits - 24)
  assert.equal(chats.plan.messages.at(-1).text, '第二轮')
})

test('replayed deltas are ignored and final output is recorded once', () => {
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('plan', '开始')
  api.send('plan', 't')
  const event = { type: 'message.delta', data: { text: '一段', turn_id: 't', segment: 0, offset: 0 } }
  api.applyAgentEvent('plan', 't', event, true)
  api.applyAgentEvent('plan', 't', event, true)
  assert.equal(api.current().chats.plan.agentRun.text, '一段')
  const done = { type: 'message.complete', data: { status: 'complete', text: '一段' } }
  api.applyAgentEvent('plan', 't', done, false)
  assert.equal(api.applyAgentEvent('plan', 't', done, false), false)
  assert.equal(api.current().chats.plan.messages.at(-1).text, '一段')
  assert.equal(api.current().chats.plan.unread, true)
})

test('a lost mock run settles once and preserves partial output, drafts, and the paused queue', () => {
  const api = createWorkspace()
  api.login('lin')
  const { chats, credits } = api.current()
  api.setDraft('plan', '第一轮')
  api.send('plan', 'lost-run')
  api.applyAgentEvent('plan', 'lost-run', { type: 'message.delta', data: { text: '已经生成的文字' } }, true)
  api.setDraft('plan', '等待执行')
  api.queuePrompt('plan', 'queued-run')
  api.setDraft('plan', '正在编写的草稿')

  assert.equal(api.recoverOrphanedAgentRuns(), true)
  assert.equal(api.recoverOrphanedAgentRuns(), false)
  assert.equal(chats.plan.pending, null)
  assert.equal(chats.plan.messages.at(-1).status, 'interrupted')
  assert.equal(chats.plan.messages.at(-1).text, '已经生成的文字')
  assert.equal(chats.plan.activity.queuePaused, true)
  assert.equal(chats.plan.queue[0].text, '等待执行')
  assert.equal(chats.plan.draft, '正在编写的草稿')
  assert.equal(api.current().credits, credits - 12)
  assert.equal(api.applyAgentEvent('plan', 'lost-run', { type: 'message.complete', data: { text: '过期结果' } }, true), false)
})

test('demo prompts can fill an empty draft without replacing typed text', () => {
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('plan', '请保留这条草稿')
  assert.equal(api.fillDemoPrompt('plan', '演示审批'), false)
  assert.equal(api.current().chats.plan.draft, '请保留这条草稿')
  api.setDraft('plan', '')
  assert.equal(api.fillDemoPrompt('plan', '演示审批'), true)
  assert.equal(api.current().chats.plan.draft, '演示审批')
})

test('quoted room replies keep their thread and recipient through the queue', () => {
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('release', '请核对标题')
  api.send('release', 'thread-1')
  api.applyAgentEvent('release', 'thread-1', { type: 'room.event', data: {
    event_id: 'answer-1', kind: 'message.member',
    actor: { id: 'editor', display_name: '文案助手' },
    payload: { thread_id: 'thread-1', text: '请确认标题' },
  } }, true)
  assert.equal(api.setGroupReply('release', 'answer-1'), true)
  api.setDraft('release', '确认，继续吧')
  assert.equal(api.queuePrompt('release', 'queued-reply'), true)
  assert.equal(api.getChat('release').groupReply, null)
  api.applyAgentEvent('release', 'thread-1', { type: 'message.complete', data: { status: 'complete' } }, true)
  assert.equal(api.startQueuedPrompt('release').ok, true)
  const { lastInput, messages } = api.getChat('release')
  assert.equal(lastInput.threadId, 'thread-1')
  assert.equal(lastInput.reply.memberId, 'editor')
  assert.equal(messages.at(-1).reply.text, '请确认标题')
})

test('a capped discussion resumes the existing run once and keeps member and thread identity', () => {
  const scheduled = new Set()
  const agent = createMockAgent({ schedule: fn => (scheduled.add(fn), fn), cancel: fn => scheduled.delete(fn) })
  const frames = []
  const drain = () => {
    while (scheduled.size) {
      const [next] = scheduled
      scheduled.delete(next)
      next()
    }
  }
  agent.request('groups.send', { room_id: 'release', event_id: 'send-1', payload: {
    text: '演示轮次上限', thread_id: 'discussion', attachments: [],
  } }, { turnId: 'send-1', members: [{ id: 'copy', name: '文案助手' }], onEvent: frame => frames.push(frame) })
  drain()
  assert.equal(frames.at(-1).data.kind, 'room.paused')
  assert.equal(agent.request('groups.continue', { room_id: 'release', discussion_event_id: 'other' }).continued, false)
  assert.equal(agent.request('groups.continue', { room_id: 'release', discussion_event_id: 'send-1' }).continued, true)
  assert.equal(agent.request('groups.continue', { room_id: 'release', discussion_event_id: 'send-1' }).continued, false)
  drain()
  const messages = frames.filter(frame => frame.data?.kind === 'message.member')
  assert.ok(messages.length >= 2)
  assert.ok(messages.every(frame => frame.data.actor.id === 'copy' && frame.data.payload.thread_id === 'discussion'))
  assert.equal(frames.at(-1).data.status, 'complete')
})

test('group approval can only resolve the matching member, attempt and request', () => {
  const scheduled = new Set()
  const agent = createMockAgent({ schedule: fn => (scheduled.add(fn), fn), cancel: fn => scheduled.delete(fn) })
  const frames = []
  agent.request('groups.send', { room_id: 'release', payload: { text: '演示审批', thread_id: 'thread' } }, {
    turnId: 'approval-run', approvalMode: 'manual', members: [{ id: 'copy', name: '文案助手' }],
    onEvent: frame => frames.push(frame),
  })
  while (scheduled.size) {
    const [next] = scheduled
    scheduled.delete(next)
    next()
  }
  const { params } = frames.at(-1)
  const action = { room_id: 'release', member_id: 'copy', request_id: params.request_id,
    task_id: params.task_id, execution_generation: params.execution_generation, choice: 'once' }
  assert.equal(agent.request('groups.approve', { ...action, member_id: 'other' }).approved, false)
  assert.equal(agent.request('groups.approve', { ...action, execution_generation: 0 }).approved, false)
  assert.equal(agent.request('groups.approve', action).approved, true)
  assert.equal(agent.request('groups.approve', action).approved, false)
})

test('explicit room mentions take precedence, and do not match email or a longer handle', async () => {
  const { routeRoomMessage } = await import('../src/room.mjs')
  const members = [{ id: 'editor', name: '文案助手' }, { id: 'designer', name: '设计助手' }]
  assert.deepEqual(routeRoomMessage(members, { routing: 'everyone' }, '找 @designer，看看').map(bot => bot.id), ['designer'])
  assert.deepEqual(routeRoomMessage(members, { routing: 'everyone' }, '发给 hi@designer 或 @designer-extra', 'editor').map(bot => bot.id), ['editor'])
  assert.deepEqual(routeRoomMessage(members, { routing: 'lead', lead: 'editor' }, '@设计助手 帮忙', 'editor').map(bot => bot.id), ['designer'])
})

test('retrying a failed group turn keeps its discussion and does not post or charge again', () => {
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('release', '演示失败')
  api.send('release', 'room-first')
  api.applyAgentEvent('release', 'room-first', {
    type: 'message.complete', data: { status: 'error', recoverable: true },
  }, true)
  const { credits } = api.current()
  api.setDraft('release', '下一条草稿')
  assert.equal(api.retryGroupPrompt('release', 'room-first', 'room-retry'), true)
  assert.equal(api.retryGroupPrompt('release', 'room-first', 'room-repeat'), false)
  const chat = api.getChat('release')
  assert.equal(chat.lastInput.threadId, 'room-first')
  assert.equal(chat.lastInput.discussionId, 'room-first')
  assert.equal(chat.draft, '下一条草稿')
  assert.equal(chat.messages.filter(message => message.role === 'user').length, 1)
  assert.equal(api.current().credits, credits)
})

test('a canonical mention wins over a colliding display name', async () => {
  const { routeRoomMessage } = await import('../src/room.mjs')
  const members = [{ id: 'editor', name: 'designer' }, { id: 'designer', name: '设计助手' }]
  assert.deepEqual(routeRoomMessage(members, {}, '@designer 请检查').map(bot => bot.id), ['designer'])
})

test('denying one room member does not stop other members from replying', () => {
  const scheduled = new Set()
  const agent = createMockAgent({ schedule: fn => (scheduled.add(fn), fn), cancel: fn => scheduled.delete(fn) })
  const frames = []
  const drain = () => {
    while (scheduled.size) {
      const [next] = scheduled
      scheduled.delete(next)
      next()
    }
  }
  agent.request('groups.send', { room_id: 'release', payload: { text: '演示审批', thread_id: 'thread' } }, {
    turnId: 'denial-run', approvalMode: 'manual', members: [{ id: 'editor', name: '文案助手' }, { id: 'designer', name: '设计助手' }],
    onEvent: frame => frames.push(frame),
  })
  drain()
  assert.equal(agent.request('groups.approve', { room_id: 'release', ...frames.at(-1).params, choice: 'deny' }).approved, true)
  drain()
  assert.deepEqual(frames.filter(frame => frame.data?.kind === 'message.member').map(frame => frame.data.actor.id), ['designer'])
  assert.equal(frames.at(-1).data.status, 'complete')
})

test('a Bot avatar follows the conversation from thinking to working, waiting, and done', async () => {
  const { botPresence } = await import('../src/bot-presence.mjs')
  const api = createWorkspace()
  api.login('lin')
  const bot = () => api.getChat('editor')
  assert.equal(botPresence(bot()), 'idle')
  api.setDraft('editor', '请检查文案')
  api.send('editor', 'bot-presence')
  assert.equal(botPresence(bot()), 'thinking')
  api.applyAgentEvent('editor', 'bot-presence', {
    type: 'tool.start', data: { tool_id: 'review', name: 'read_file' },
  }, true)
  assert.equal(botPresence(bot()), 'working')
  api.applyAgentEvent('editor', 'bot-presence', {
    type: 'tool.complete', data: { tool_id: 'review', name: 'read_file' },
  }, true)
  assert.equal(botPresence(bot()), 'working')
  api.applyAgentEvent('editor', 'bot-presence', { method: 'approval', id: 'review-approval', params: {} }, true)
  assert.equal(botPresence(bot()), 'waiting')
  api.applyAgentEvent('editor', 'bot-presence', { type: 'message.complete', data: { status: 'complete', text: '已完成' } }, true)
  assert.equal(botPresence(bot()), 'done')
})

test('room avatars show a request or pause only for affected members', async () => {
  const { roomMemberPresence } = await import('../src/bot-presence.mjs')
  const chat = { pending: 'room-run', agentRun: {
    room: { statuses: { editor: 'running', designer: 'completed' } },
    request: { params: { member_id: 'editor' } },
  } }
  assert.equal(roomMemberPresence(chat, 'editor'), 'waiting')
  assert.equal(roomMemberPresence(chat, 'designer'), 'done')
  assert.equal(roomMemberPresence(chat, 'researcher'), 'idle')
  chat.agentRun.request = null
  chat.agentRun.room.paused = 'room-run'
  assert.equal(roomMemberPresence(chat, 'designer'), 'waiting')
  assert.equal(roomMemberPresence(chat, 'researcher'), 'idle')
})
