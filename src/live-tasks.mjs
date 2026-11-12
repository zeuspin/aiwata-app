export function gatewayTaskRoomId(delivery) {
  return typeof delivery === 'string'
    ? /^room:([A-Za-z0-9][A-Za-z0-9._:-]{0,127})@default$/.exec(delivery)?.[1] ?? null
    : null
}

export function gatewayTaskPlatform(delivery) {
  return typeof delivery === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(delivery) &&
    !['local', 'all', 'origin'].includes(delivery)
}

export function gatewayTask(job) {
  const profile = job.profile
  return {
    id: profile + ':' + job.id,
    gatewayId: job.id,
    gatewayProfile: profile,
    name: job.name,
    profile: profile === 'default' ? profile : 'bot:' + profile,
    prompt: job.prompt,
    model: job.model || '', provider: job.provider || '',
    script: job.script || '', noAgent: Boolean(job.no_agent), catchUp: job.catch_up ?? null,
    schedule: job.schedule?.expr ?? job.schedule?.run_at ?? job.schedule_display ?? '',
    timezone: job.timezone ?? '',
    repeat: job.repeat?.times ?? '',
    deliver: Array.isArray(job.deliver) ? job.deliver.join(',') : job.deliver ?? 'local',
    workdir: job.workdir ?? '',
    enabled: Boolean(job.enabled),
    state: job.state,
    nextRun: job.next_run_at,
    lastRun: job.last_run_at,
    lastStatus: job.last_status,
    lastError: job.last_error,
    lastDeliveryError: job.last_delivery_error,
    deliveryOutcome: job.delivery_unverified && job.latest_execution?.delivery_outcome === 'delivered'
      ? 'unverified' : job.latest_execution?.delivery_outcome,
    running: job.live_execution?.id ?? null,
    history: [],
  }
}
