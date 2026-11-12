export const scriptOnlyTask = task => Boolean(task?.noAgent && task.script?.trim())
export function nativeCronPayload(task) {
  const { name, schedule, timezone, repeat, workdir, deliver } = task
  const data = { name, schedule, timezone, repeat, workdir, deliver }
  const scriptOnly = scriptOnlyTask(task)
  if (!scriptOnly || task.prompt?.trim()) data.prompt = task.prompt
  if (!scriptOnly && (task.gatewayId || task.model?.trim())) {
    data.model = task.model?.trim() || null
    data.provider = task.provider?.trim() || null
  }
  if (task.catchUpChanged || !task.gatewayId && typeof task.catchUp === 'boolean') data.catch_up = task.catchUp
  return data
}
export function blueprintInitialValues(blueprint) {
  return Object.fromEntries(blueprint.fields.map(field => [field.name,
    field.name === 'deliver' && (!field.default || field.default === 'origin') ? 'local' : field.default ?? '']))
}
export function cronRunRoute(row, route, profile, now = Date.now()) {
  if (!row.id || row.source !== 'cron') return null
  const writable = row.ended_at != null || (typeof row.scheduler_owned === 'boolean' ? row.scheduler_owned
    : typeof row.is_active === 'boolean' ? row.is_active : typeof row.last_active === 'number' && now - row.last_active * 1000 < 300000)
  return { connectionId: route?.connectionId || 'local', profile: profile || 'default', sessionId: row.id, session: row, readOnly: !writable }
}
