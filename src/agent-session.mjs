export const demoPrompts = [
  ['流式回复和任务进度', '整理当前项目的交付清单'],
  ['审批卡片', '演示审批：预览发布脚本的执行申请'],
  ['追问卡片', '演示追问：先确认交付格式'],
  ['子 Agent 并行', '演示子 Agent 并行核对文案和素材'],
  ['浏览器联动', '演示浏览器：打开发布预览并核对标题'],
  ['失败与重试', '演示失败：模拟供应商暂时不可用'],
]

const event = (type, data) => ({ type, data })
const roomEvent = (kind, data) => event('room.event', { kind, ...data })
const todo = status => event('todo.updated', {
  revision: status === 'completed' ? 2 : 1,
  todos: [
    { id: 'scope', content: '确认任务范围', status: 'completed' },
    { id: 'result', content: '整理交付结果', status },
  ],
})

function stream(text, turnId) {
  const chunks = []
  for (let offset = 0; offset < text.length; offset += 12) {
    chunks.push(event('message.delta', { text: text.slice(offset, offset + 12), turn_id: turnId, segment: 0, offset }))
  }
  return [...chunks, event('message.complete', { text, status: 'complete', usage: { input: 108, output: 76, total: 184 } })]
}

function scenario(text, turnId, approvalMode, retryDemo) {
  const steps = [todo('in_progress')]
  if (text.includes('演示失败') && !retryDemo) {
    return [...steps, event('message.complete', { status: 'error', error: '模拟供应商暂时不可用。可以重试。', recoverable: true })]
  }
  if (text.includes('演示审批') && approvalMode !== 'off') {
    const id = turnId + ':approval'
    steps.push({ method: 'approval', id, params: {
      request_id: id, command: './scripts/publish.sh --dry-run', description: '确认发布脚本的试运行操作',
      choices: ['once', 'session', 'deny'], tool_name: 'terminal',
    } })
  }
  if (text.includes('演示追问')) {
    steps.push({ method: 'clarify', id: turnId + ':clarify', params: {
      questions: [{ qid: 'format', question: '你想先看哪种交付格式？', choices: ['检查清单', '发布说明'] }],
    } })
  }
  if (text.includes('演示子 Agent')) {
    const children = ['核对文案', '核对素材'].map((goal, task_index) => ({
      subagent_id: turnId + ':child:' + task_index, goal, task_index, task_count: 2,
    }))
    steps.push(...children.map(child => event('subagent.start', child)),
      ...children.map(child => event('subagent.complete', { ...child, status: 'completed', summary: '已提交核对结果。' })))
  }
  const browsing = text.includes('演示浏览器')
  const name = browsing ? 'browser_exec' : 'read_file'
  const args = browsing ? { url: 'https://preview.aiwata.local/release' } : { path: '发布清单.md' }
  steps.push(event('tool.start', { tool_id: turnId + ':tool', name, args }))
  if (browsing) steps.push(event('preview.open', { url: 'https://preview.aiwata.local/docs', label: '帮助文档' }),
    event('preview.open', { url: args.url, label: '发布预览' }))
  steps.push(event('tool.complete', {
    tool_id: turnId + ':tool', name, summary: browsing ? '已打开并检查发布预览。' : '已读取模拟项目资料。',
    result: browsing ? { title: '发布预览' } : { path: args.path, sections: ['范围', '待办', '交付'] },
  }), todo('completed'))
  return steps
}

// Local transport. Wire names and payload fields mirror the gateway; turn
// timing and the demo responses live here so the view only consumes events.
export function createMockAgent({ schedule = setTimeout, cancel = clearTimeout } = {}) {
  const runs = new Map()

  function deliver(run, frame) {
    if (frame.type === 'message.complete') runs.delete(run.sessionId)
    run.onEvent({ ...frame, session_id: run.sessionId })
  }

  function advance(run) {
    run.timer = schedule(() => {
      if (runs.get(run.sessionId) !== run) return
      const frame = run.steps.shift()
      if (frame.method) run.waiting = frame
      if (frame.data?.kind === 'room.paused') run.paused = true
      deliver(run, frame)
      if (!run.waiting && !run.paused && runs.get(run.sessionId) === run) advance(run)
    }, 155)
  }

  function resolve(run, id) {
    if (!run?.waiting || run.waiting.id !== id) return false
    run.waiting = null
    advance(run)
    return true
  }

  return {
    hasRun(sessionId, turnId) {
      return runs.get(sessionId)?.turnId === turnId
    },
    request(method, params, options) {
      const sessionId = params.session_id ?? params.room_id
      const run = runs.get(sessionId)
      if (method === 'prompt.submit' || method === 'groups.send' || method === 'groups.retry') {
        if (run) return { status: 'queued' }
        const group = method !== 'prompt.submit'
        const text = params.text ?? params.payload.text
        const received = (params.attachments ?? params.payload?.attachments ?? [])
          .map(({ name, blob }) => `${name}（${blob.size} B）`)
        const next = { sessionId, turnId: options.turnId, onEvent: options.onEvent,
          discussionId: group ? (params.event_id ?? options.turnId) : null,
          steps: scenario(text, options.turnId, options.approvalMode, options.retryDemo), waiting: null }
        const members = options.members ?? []
        const threadId = params.payload?.thread_id
        if (group) {
          const member = members[0]
          for (const frame of next.steps) if (frame.method && member) {
            frame.params = { ...frame.params, member_id: member.id, member_name: member.name,
              task_id: options.turnId + ':' + member.id, execution_generation: 1 }
          }
          next.steps.unshift(
            roomEvent('room.routed', { members }),
            roomEvent('member.activity', { members, status: 'running' }),
          )
        }
        const normal = next.steps.at(-1)?.type !== 'message.complete'
        if (normal) {
          const memberMessages = (round, message) => members.map(member => roomEvent('message.member', {
            room_id: sessionId, event_id: options.turnId + ':' + round + ':' + member.id,
            actor: { kind: 'member', id: member.id, display_name: member.name },
            payload: { thread_id: threadId, text: message },
          }))
          if (group) {
            next.steps.push(...memberMessages(1, '我已完成负责部分的检查，并提交到本轮汇总。'))
            if (text.includes('演示轮次上限')) {
              next.steps.push(roomEvent('room.paused', { discussionId: next.discussionId }),
                roomEvent('member.activity', { members, status: 'running' }),
                ...memberMessages(2, '我已继续检查，并补充了后续建议。'))
            }
          }
          const reference = text.replace(/\s+/g, ' ').slice(0, 52) || '附件'
          const receipt = received.length ? '已接收本地附件：' + received.join('、') + '。\n\n' : ''
          const result = receipt + '已整理「' + reference + '」的工作清单。\n\n1. 确认目标和输入资料。\n2. 校对关键内容并标注待确认项。\n3. 把结果保存为可复核的交付记录。'
          next.steps.push(...stream(result, options.turnId))
        }
        runs.set(next.sessionId, next)
        advance(next)
        return { status: 'streaming' }
      }
      if (method === 'groups.continue') {
        if (!run?.paused || run.discussionId !== params.discussion_event_id) return { continued: false }
        run.paused = false
        deliver(run, roomEvent('room.continued', { discussionId: run.discussionId }))
        advance(run)
        return { continued: true }
      }
      if (method === 'groups.approve') {
        const action = run?.waiting?.params
        if (!run?.discussionId || run.waiting?.method !== 'approval' || !action?.member_id ||
          !['member_id', 'task_id', 'execution_generation', 'request_id'].every(key => action[key] === params[key]) ||
          !action.choices.includes(params.choice)) return { approved: false }
        if (params.choice === 'deny') {
          const denied = { id: action.member_id }
          const othersReply = run.steps.some(frame => frame.data?.kind === 'message.member' && frame.data.actor.id !== denied.id)
          const deniedStatus = roomEvent('member.activity', { members: [denied], status: 'denied' })
          if (!othersReply) {
            run.steps = [deniedStatus, todo('cancelled'), ...stream('已拒绝该操作，未执行发布脚本。', run.turnId)]
          } else {
            run.steps = [deniedStatus, ...run.steps.flatMap(frame => {
              if (['tool.start', 'tool.complete', 'preview.open'].includes(frame.type)) return []
              if (frame.data?.kind === 'message.member' && frame.data.actor.id === denied.id) return []
              if (frame.data?.kind === 'member.activity') return [roomEvent('member.activity',
                { ...frame.data, members: frame.data.members.filter(member => member.id !== denied.id) })]
              return [frame]
            })]
          }
        }
        return { approved: resolve(run, params.request_id) }
      }
      if (method === 'approval.respond') {
        if (run?.discussionId) return { resolved: 0 }
        if (run?.waiting?.method !== 'approval' || run.waiting.id !== params.request_id ||
          !run.waiting.params.choices.includes(params.choice)) return { resolved: 0 }
        if (params.choice === 'deny') run.steps = [todo('cancelled'), ...stream('已拒绝该操作。我保留了检查结果，未执行发布脚本。', run.turnId)]
        return { resolved: Number(resolve(run, params.request_id)) }
      }
      if (method === 'groups.stop') {
        if (!run?.discussionId) return { cancelled: 0 }
        cancel(run.timer)
        deliver(run, event('message.complete', { status: 'interrupted', partial: true }))
        return { cancelled: 1 }
      }
      if (method === 'session.interrupt') {
        if (!run) return { status: 'not_interrupted' }
        cancel(run.timer)
        deliver(run, event('message.complete', { status: 'interrupted', partial: true }))
        return { status: 'interrupted' }
      }
      throw new Error('Unknown simulated Agent method: ' + method)
    },
    respond(sessionId, id, result) {
      const run = runs.get(sessionId)
      if (run?.waiting?.method !== 'clarify' || run.waiting.id !== id) return false
      const answer = result.answers?.format
      if (answer) {
        const firstDelta = run.steps.findIndex(frame => frame.type === 'message.delta')
        run.steps.splice(firstDelta, Infinity, ...stream('已按「' + answer + '」整理交付内容。\n\n• 目标与输入\n• 核对步骤\n• 交付结果', run.turnId))
      }
      return resolve(run, id)
    },
    discard(sessionId) {
      const run = runs.get(sessionId)
      if (run) cancel(run.timer)
      runs.delete(sessionId)
    },
    dispose() {
      for (const run of runs.values()) cancel(run.timer)
      runs.clear()
    },
  }
}

export function projectAgentEvent(chat, frame, viewed) {
  const run = chat.agentRun ?? { text: '', tools: {}, children: {}, todos: [], segments: {} }
  const { type, data } = frame
  if (frame.method === 'approval' || frame.method === 'clarify') {
    return { agentRun: { ...run, request: frame }, activity: { ...chat.activity, needsInput: true } }
  }
  if (type === 'message.delta' && data.text) {
    const segment = data.segment ?? 0
    const previous = run.segments[segment] ?? ''
    if (data.offset != null && data.offset < previous.length) return null
    return { agentRun: { ...run, text: run.text + data.text, segments: { ...run.segments, [segment]: previous + data.text } } }
  }
  if (type === 'tool.start' || type === 'tool.complete') {
    const tool = { ...run.tools[data.tool_id], ...data, complete: type === 'tool.complete' }
    return { agentRun: { ...run, tools: { ...run.tools, [data.tool_id]: tool } } }
  }
  if (type === 'todo.updated') return { agentRun: { ...run, todos: data.todos } }
  if (type === 'preview.open') return { agentRun: { ...run, preview: data } }
  if (type === 'room.event' && data.kind === 'room.routed') {
    return { agentRun: { ...run, room: { statuses: Object.fromEntries(data.members.map(member => [member.id, 'queued'])) } } }
  }
  if (type === 'room.event' && data.kind === 'member.activity') {
    const statuses = { ...run.room?.statuses, ...Object.fromEntries(data.members.map(member => [member.id, data.status])) }
    return { agentRun: { ...run, room: { ...run.room, statuses } } }
  }
  if (type === 'room.event' && (data.kind === 'room.paused' || data.kind === 'room.continued')) {
    const paused = data.kind === 'room.paused'
    return { agentRun: { ...run, room: { ...run.room, paused: paused ? data.discussionId : null } },
      activity: { ...chat.activity, needsInput: paused } }
  }
  if (type === 'room.event' && data.kind === 'message.member') {
    if (chat.messages.some(message => message.id === data.event_id)) return null
    const statuses = { ...run.room?.statuses, [data.actor.id]: 'completed' }
    return { messages: [...chat.messages, { role: 'agent', id: data.event_id, author: data.actor.display_name,
      memberId: data.actor.id, threadId: data.payload.thread_id, text: data.payload.text }],
    agentRun: { ...run, room: { ...run.room, statuses } } }
  }
  if (type === 'subagent.start' || type === 'subagent.complete') {
    const child = { ...data, complete: type === 'subagent.complete' }
    return { agentRun: { ...run, children: { ...run.children, [data.subagent_id]: child } } }
  }
  if (type === 'message.complete') {
    const status = data.status ?? 'complete'
    const { request, segments, room, ...details } = run
    const input = chat.lastInput
    const memberStatuses = room?.statuses && Object.fromEntries(Object.entries(room.statuses).map(([id, state]) => [
      id, state === 'completed' || state === 'denied' ? state : status === 'error' ? 'failed' : status === 'interrupted' ? 'stopped' : state,
    ]))
    return {
      pending: null, agentRun: null, unread: !viewed,
      ...(input?.threadId ? { roomOutcome: { statuses: memberStatuses ?? {} } } : {}),
      activity: { ...chat.activity, needsInput: false, queuePaused: Boolean(chat.queue?.length && status !== 'complete') },
      messages: [...chat.messages, { role: 'agent', ...details, text: data.text || run.text, status,
        ...(input?.threadId ? { id: input.runId + ':outcome', threadId: input.threadId, author: '协作汇总' } : {}),
        error: data.error, usage: data.usage, recoverable: data.recoverable }],
    }
  }
  return null
}
