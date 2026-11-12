// Projection of AIWATA's native ConnectionRequestPayload / ConnectionOperationStatus. No credential
// value from a user action enters this snapshot; required_env is metadata, not a saved form draft.
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value, max = 16000) => typeof value === 'string' && value.length <= max && !value.includes('\0')
const id = value => text(value, 512) && Boolean(value)
const kinds = ['connector', 'mcp', 'plugin', 'skill']
const states = ['pending', 'initiated', 'connected', 'skipped', 'failed', 'expired', 'not_connected']
const actions = ['authorize', 'connect', 'enable', 'install', 'reconnect']
const list = value => Array.isArray(value) && value.length <= 200 && value.every(v => text(v, 1000))
const clone = value => JSON.parse(JSON.stringify(value))

export function safeConnectionURL(value) {
  if (!text(value, 16000)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname) ? url.href : null
  } catch { return null }
}

function projectTarget(value) {
  if (!record(value) || !id(value.name) || !kinds.includes(value.kind) || !states.includes(value.state) || !actions.includes(value.action)) return null
  const target = { name: value.name, kind: value.kind, state: value.state, action: value.action }
  for (const key of ['detail', 'instructions', 'discovery_error', 'connection_id', 'alias', 'attempt', 'hint', 'display', 'description',
    'repo', 'sha', 'subdir', 'requires_hermes', 'target_profile', 'skill']) {
    if (value[key] == null) continue
    if (!text(value[key])) return null
    target[key] = value[key]
  }
  for (const key of ['resolved', 'has_desktop_half', 'enabled', 'already_installed']) {
    if (value[key] == null) continue
    if (typeof value[key] !== 'boolean') return null
    target[key] = value[key]
  }
  for (const key of ['tools', 'platforms', 'missing_env']) {
    if (value[key] == null) continue
    if (!list(value[key])) return null
    target[key] = [...value[key]]
  }
  for (const [key, options] of [['tier', ['official', 'verified', 'community']],
    ['app_state', ['present', 'missing_app', 'app_not_running', 'unknown']], ['phase', ['downloading', 'python_packages', 'loading_tools']]]) {
    if (value[key] == null) continue
    if (!options.includes(value[key])) return null
    target[key] = value[key]
  }
  if (value.connect_url != null) target.connect_url = safeConnectionURL(value.connect_url)
  if (value.scan != null) {
    if (!record(value.scan) || !['passed', 'warnings', 'failed'].includes(value.scan.status) || !text(value.scan.summary)) return null
    target.scan = { status: value.scan.status, summary: value.scan.summary }
  }
  if (value.launch != null) {
    if (!record(value.launch) || !['remote', 'stdio'].includes(value.launch.kind) || !text(value.launch.target)) return null
    target.launch = { kind: value.launch.kind, target: value.launch.target }
    if (value.launch.env != null) { if (!list(value.launch.env)) return null; target.launch.env = [...value.launch.env] }
    if (value.launch.cwd != null) { if (!text(value.launch.cwd)) return null; target.launch.cwd = value.launch.cwd }
  }
  if (value.approved != null) {
    if (!record(value.approved) || typeof value.approved.force !== 'boolean' || typeof value.approved.enable !== 'boolean' ||
      (value.approved.ref != null && !text(value.approved.ref, 100))) return null
    target.approved = { force: value.approved.force, enable: value.approved.enable, ...(value.approved.ref != null ? { ref: value.approved.ref } : {}) }
  }
  if (value.required_env != null) {
    if (!Array.isArray(value.required_env) || value.required_env.length > 100) return null
    const names = new Set()
    target.required_env = []
    for (const field of value.required_env) {
      if (!record(field) || !/^[A-Za-z_][A-Za-z0-9_]{0,199}$/.test(field.name) || names.has(field.name) ||
        typeof field.required !== 'boolean' || typeof field.secret !== 'boolean' || !text(field.default ?? '', 65536) ||
        (field.prompt != null && !text(field.prompt))) return null
      names.add(field.name)
      target.required_env.push({ name: field.name, required: field.required, secret: field.secret,
        default: field.secret ? '' : field.default ?? '', ...(field.prompt ? { prompt: field.prompt } : {}) })
    }
  }
  if (value.server_errors != null) {
    if (!Array.isArray(value.server_errors) || value.server_errors.length > 100 ||
      !value.server_errors.every(row => record(row) && text(row.name) && text(row.error))) return null
    target.server_errors = value.server_errors.map(({ name, error }) => ({ name, error }))
  }
  return target
}

export function connectionRequestSnapshot(value) {
  if (!record(value) || !id(value.op_id) || !Number.isSafeInteger(value.seq) || value.seq < 0 ||
      !Number.isFinite(value.deadline_at) || value.deadline_at <= 0 || !Array.isArray(value.targets) || value.targets.length > 100 ||
      (value.settled !== undefined && typeof value.settled !== 'boolean')) return null
  const targets = value.targets.map(projectTarget)
  if (targets.some(target => !target) || new Set(targets.map(target => target.name)).size !== targets.length) return null
  const snapshot = { op_id: value.op_id, seq: value.seq, deadline_at: value.deadline_at, targets, settled: value.settled ?? false }
  if (value.timeout_seconds != null) {
    if (!Number.isFinite(value.timeout_seconds) || value.timeout_seconds <= 0) return null
    snapshot.timeout_seconds = value.timeout_seconds
  }
  if (value.tool_call_id != null) { if (!text(value.tool_call_id, 512)) return null; snapshot.tool_call_id = value.tool_call_id }
  if (value.settled_at != null) { if (!Number.isFinite(value.settled_at)) return null; snapshot.settled_at = value.settled_at }
  if (value.settled_by != null) {
    if (!['all_resolved', 'continue', 'deadline', 'interrupt'].includes(value.settled_by)) return null
    snapshot.settled_by = value.settled_by
  }
  if (value.display != null) {
    if (!record(value.display) || !list(value.display.suggested)) return null
    snapshot.display = { suggested: [...value.display.suggested] }
  }
  return snapshot
}

export function mergeConnectionRequest(previous, payload, { replace = false } = {}) {
  const next = connectionRequestSnapshot(payload)
  if (!next || previous && (previous.op_id !== next.op_id ? !replace : next.seq <= previous.seq)) return previous
  if (!previous || previous.op_id !== next.op_id) return next
  // Status/update snapshots omit opening-card metadata. All target states still come from the server.
  return { ...previous, ...next }
}

export function connectionTargetAnswer(request, name, status, values = {}, now = Date.now() / 1000) {
  if (!request || request.settled || now >= request.deadline_at || !['approved', 'skipped'].includes(status)) return null
  const target = request.targets.find(row => row.name === name)
  if (!target || ['connected', 'skipped', 'not_connected'].includes(target.state)) return null
  if (status === 'skipped') return { targets: [{ name, status }] }
  if (target.kind === 'connector' || !['pending', 'failed', 'expired'].includes(target.state) || !record(values)) return null
  const specs = target.required_env ?? [], declared = new Set(specs.map(spec => spec.name))
  if (Object.keys(values).some(key => !declared.has(key)) || specs.some(spec =>
    !text(values[spec.name] ?? '', 65536) || spec.required && !String(values[spec.name] ?? '').trim())) return null
  const env = Object.fromEntries(specs.filter(spec => Boolean(values[spec.name])).map(spec => [spec.name, values[spec.name]]))
  const answer = { targets: [{ name, status, ...(Object.keys(env).length ? { env } : {}) }] }
  return JSON.stringify(answer).length <= 65536 ? answer : null
}

export async function sendConnectionTarget({ request, name, status, values, send, clear, now }) {
  const answer = connectionTargetAnswer(request, name, status, values, now)
  clear()
  if (!answer) throw new Error('连接请求已变化，或必填信息尚未填写。')
  return send(answer)
}
