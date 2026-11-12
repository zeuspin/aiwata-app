const botId = member => member.target?.kind === 'peer'
  ? 'bot:peer:'+JSON.stringify([member.target.installation_id,member.target.profile || member.profile])
  : 'bot:'+member.profile

export function mergeRoomEvents(previous, events) {
  const since = previous.at(-1)?.seq ?? 0
  const added = events.filter(event => event.seq > since)
  return added.length ? [...previous, ...added] : previous
}

export function gatewayGroup(room, context, driver, previous) {
  const members = room.members.map(member => botId(member))
  const leadMember = room.members.find(member => member.member_id === context?.lead_member_id)
  return { id: room.room_id, name: room.name, members, gatewayRoom: true,
    memberDetails: room.members.map(member=>({id:botId(member),memberId:member.member_id,profile:member.profile,name:member.display_name || member.profile,roomHandle:member.handle ?? member.profile,peer:member.target?.kind==='peer',target:member.target})),
    memberHandles: Object.fromEntries(room.members.map(member => [botId(member), member.handle ?? member.profile])),
    peerStates: driver ? (driver.peer_routes??[]).map(route=>({memberId:route.member_id,status:route.status})) : previous?.peerStates??[],
    purpose: context?.purpose ?? previous?.purpose ?? '', notes: context?.notes ?? previous?.notes ?? '',
    routing: context?.routing ?? previous?.routing ?? 'everyone',
    lead: context ? (leadMember ? botId(leadMember) : null) : previous?.lead ?? null,
    routingModes: driver?.routing_modes ?? previous?.routingModes ?? ['everyone', 'lead'],
  }
}

export function projectRoom(snapshot, events) {
  const { room, driver_status: driver } = snapshot
  const members = new Map(room.members.map(member => [member.member_id, member]))
  const statuses = {}
  const messages = []
  const discussions = new Map()
  const latestDiscussions = new Map(events.filter(event => event.kind === 'message.user')
    .map(event => [event.payload?.thread_id, event.event_id]))
  let paused = null
  let pausedThread = null
  let stoppedAt = 0
  for (const event of events) {
    const { payload = {}, actor, kind, event_id: id } = event
    if (kind === 'message.user') {
      discussions.set(id, event.seq)
      if (pausedThread === payload.thread_id) paused = null
    } else if (kind === 'room.stop_requested') {
      stoppedAt = event.seq
      paused = null
    } else if (kind === 'room.activity' && payload.status === 'bounded' && (discussions.get(payload.discussion_event_id) ?? event.seq) > stoppedAt) {
      paused = payload.discussion_event_id ?? null
      pausedThread = payload.thread_id
    } else if (['room.continued', 'room.activity'].includes(kind) && paused === payload.discussion_event_id) paused = null
    const taskMember = members.get(payload.member_id)
    if (taskMember && latestDiscussions.get(payload.thread_id) === payload.discussion_event_id) {
      const status = { 'turn.settled': payload.passed ? 'passed' : 'completed', 'turn.failed': 'failed',
        'turn.cancelled': 'stopped', 'turn.deferred': payload.reason === 'member_unavailable' ? 'failed' : null }[kind]
      if (status) statuses[botId(taskMember)] = status
    }
    if (kind === 'turn.failed') {
      const error = payload.error === 'runtime_draining' ? '此成员的网关暂不可用。' : payload.error
      messages.push({ id, role: 'agent', author: taskMember?.display_name || taskMember?.profile || payload.member_id,
        memberId: taskMember ? botId(taskMember) : undefined, threadId: payload.thread_id,
        ...(Number.isFinite(event.created_at) ? { timestamp: event.created_at * 1000 } : {}),
        status: 'error', error: typeof error === 'string' && error.trim()
          ? error : '此成员执行失败，请检查模型和连接状态。' })
    }
    if (kind !== 'message.user' && kind !== 'message.member') continue
    const member = kind === 'message.member' && members.get(actor?.id)
    if (member && (!payload.discussion_event_id || latestDiscussions.get(payload.thread_id) === payload.discussion_event_id)) {
      statuses[botId(member)] = 'completed'
    }
    const manifest = payload.attachments ?? []
    messages.push({ id, role: kind === 'message.member' ? 'agent' : 'user', text: payload.text ?? '',
      threadId: payload.thread_id, memberId: member ? botId(member) : undefined,
      ...(Number.isFinite(event.created_at) ? { timestamp: event.created_at * 1000 } : {}),
      author: actor?.display_name || (member && (member.display_name || member.profile)) || undefined,
      scheduled: actor?.kind === 'user' && typeof actor.id === 'string' && actor.id.startsWith('cron:'),
      attachments: manifest.map(attachment => attachment.name),
      attachmentDetails: Object.fromEntries(manifest.map(attachment => [attachment.name, {
        kind: attachment.kind === 'image' ? 'image' : 'file', roomAttachment: attachment.attachment_id, roomEvent: id,
      }])),
    })
  }
  for (const activity of driver?.member_activity ?? []) {
    const member = members.get(activity.member_id)
    if (member) statuses[botId(member)] = activity.status === 'stopping' ? 'stopped' : activity.status
  }
  const approvals = []
  const attempts = []
  for (const action of driver?.pending_actions ?? []) {
    const member = members.get(action.member_id)
    const memberName = member?.display_name || member?.profile || action.member_id
    if (member) statuses[botId(member)] = 'waiting'
    if (action.kind === 'approval') {
      approvals.push({ id: action.request_id, method: 'approval', params: {
        ...action.approval, choices: action.approval?.choices ?? action.choices ?? ['once', 'deny'],
        member_id: action.member_id, task_id: action.task_id, execution_generation: action.execution_generation, member_name: memberName,
      } })
    } else if (['retry', 'discard'].includes(action.kind)) attempts.push({ ...action, memberName })
  }
  return { messages, statuses, paused, approvals, attempts, ready: Boolean(driver),
    working: Boolean(driver?.working || driver?.member_activity?.length), error: driver?.last_error ?? '' }
}
