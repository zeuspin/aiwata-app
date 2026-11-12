// Native contracts: tui_gateway/contracts/{server_requests,display,connectors_operation}.py
// Replies (especially passwords and env values) are transient: this ledger stores only ownership,
// deadlines and the small question/option identifiers needed to validate an answer.
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const only = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key))
const text = (value, max = 65536) => typeof value === 'string' && value.length <= max && !value.includes('\0')
const idText = value => text(value, 200) && Boolean(value)
const optional = (value, check) => value === undefined || value === null || check(value)
const strings = value => Array.isArray(value) && value.length <= 200 && value.every(v => text(v, 1024))
export const automaticDesktopReplyLimit = 1024 * 1024
export const desktopReplyBodyLimit = automaticDesktopReplyLimit + 65536
const bounded = (value, limit = 65536) => { try { return Buffer.byteLength(JSON.stringify(value), 'utf8') <= limit } catch { return false } }
const automaticMethods = new Set(['preview.read', 'preview.act', 'terminal.read', 'window.read'])
const modes = ['light', 'dark', 'system']
const theme = value => only(value, ['accent', 'mode', 'layout']) && optional(value.accent, v => text(v, 100)) &&
  optional(value.mode, v => modes.includes(v)) && optional(value.layout, v => text(v, 100))
export const desktopRequestMethods = Object.freeze(['clarify', 'approval', 'sudo', 'secret', 'vault.unlock_prompt',
  'vault.save_login', 'vault.code', 'terminal.read', 'preview.read', 'preview.act', 'window.read', 'tour',
  'theme.apply', 'theme.pick', 'setup_beat', 'display.install.sudo'])
const methods = new Set(desktopRequestMethods)
const windowMethods = new Set(['terminal.read', 'preview.read', 'preview.act', 'window.read', 'tour', 'theme.apply'])
const deadlines = { 'terminal.read': 30000, 'preview.read': 45000, 'preview.act': 45000, 'window.read': 30000,
  tour: 45000, 'theme.apply': 15000, 'theme.pick': 300000, setup_beat: 300000, clarify: 300000,
  approval: 300000, 'vault.save_login': 180000, 'vault.code': 180000, 'display.install.sudo': 300000 }

function setupAnswer(value, context) {
  const label = v => optional(v.label, x => text(x, 1000))
  switch (context.beat) {
    case 'name': return only(value, ['name']) && text(value.name, 1000)
    case 'theme': return only(value, ['accent', 'mode']) && theme(value)
    case 'connectors': return only(value, ['connected', 'newly_connected']) && strings(value.connected) &&
      (value.newly_connected === undefined || strings(value.newly_connected))
    case 'plugins': return only(value, ['installed', 'label']) && strings(value.installed) && label(value)
    case 'layout': case 'tour': case 'build': {
      const key = context.beat
      return only(value, key === 'layout' ? [key] : [key, 'label']) && text(value[key], 1000) && label(value) &&
        context.options?.includes(value[key]) === true
    }
    default: return false
  }
}

export function validDesktopResult(method, result, context = {}) {
  const limit = automaticMethods.has(method) ? automaticDesktopReplyLimit : 65536
  if (!record(result) || !bounded(result, limit)) return false
  if (method === 'clarify') return only(result, ['answers', 'outcome']) &&
    optional(result.outcome, v => ['submitted', 'timed_out', 'cancelled'].includes(v)) &&
    optional(result.answers, v => record(v) && Object.entries(v).every(([key, answer]) =>
      context.qids?.includes(key) && (answer === null || text(answer))))
  if (method === 'approval') return only(result, ['choice', 'all']) && ['once', 'session', 'always', 'deny'].includes(result.choice) &&
    optional(result.all, v => typeof v === 'boolean')
  if (method === 'theme.pick') return only(result, ['picked', 'said', 'cancelled']) && optional(result.picked, theme) &&
    optional(result.said, text) && optional(result.cancelled, v => typeof v === 'boolean')
  if (method === 'setup_beat') return only(result, ['answer', 'said', 'wrote_instead']) &&
    optional(result.answer, v => setupAnswer(v, context)) && optional(result.said, v => context.beat === 'name' && text(v)) &&
    (result.wrote_instead === undefined || typeof result.wrote_instead === 'boolean')
  return methods.has(method) && only(result, ['value']) && text(result.value, limit)
}

export function createDesktopRequestLedger({ profile = '', now = Date.now, limit = 64, retiredLimit = 2048 } = {}) {
  const live = new Map(), retired = new Map()
  const retire = (id, state) => {
    live.delete(id); retired.set(id, state)
    while (retired.size > retiredLimit) retired.delete(retired.keys().next().value)
  }
  const expire = () => { for (const [id, request] of live) if (request.expires <= now()) retire(id, 'expired') }
  const track = frame => {
    expire()
    if (!/^srq-[a-f0-9]{12}$/.test(frame?.id) || !methods.has(frame.method) || !record(frame.params) ||
        !text(frame.params.session_id, 200) || (!frame.params.session_id && frame.method !== 'display.install.sudo')) return 'invalid'
    if (retired.has(frame.id)) return 'retired'
    const existing = live.get(frame.id)
    if (existing) return existing.sessionId === frame.params.session_id && existing.method === frame.method ? 'duplicate' : 'invalid'
    if (live.size >= limit) return 'full'
    const context = { qids: Array.isArray(frame.params.questions) ? frame.params.questions.map(question => question.qid) : [], beat: frame.params.beat,
      options: Array.isArray(frame.params.card?.options) ? frame.params.card.options.map(option => option.id) : [] }
    live.set(frame.id, { sessionId: frame.params.session_id, method: frame.method, expires: now() + (deadlines[frame.method] ?? 120000), context })
    return 'new'
  }
  return {
    track,
    get(id) { expire(); return live.get(id) },
    snapshot() { expire(); return [...live].map(([id, request]) => ({ id, ...request })) },
    cancel(frame) {
      if (frame?.params?.type !== 'request.cancel') return false
      const id = frame.params.payload?.id, request = live.get(id)
      if (!/^srq-[a-f0-9]{12}$/.test(id) || (request && frame.params.session_id !== undefined && frame.params.session_id !== request.sessionId)) return false
      // A cancel may win the race against a reconnect snapshot that still contains the request.
      retire(id, 'cancelled'); return true
    },
    receive(frame, connection) {
      if (!frame?.method || typeof frame.id !== 'string') return true
      if (!methods.has(frame.method)) {
        connection?.reply(frame.id, undefined, { code: -32601, message: 'Method not supported by this desktop client.' })
        return false
      }
      const state = track(frame)
      if (state === 'full' || state === 'invalid') connection?.reply(frame.id, undefined,
        { code: state === 'full' ? -32000 : -32602, message: state === 'full' ? 'Too many pending desktop requests.' : 'Invalid native desktop request.' })
      return state === 'new'
    },
    reply(connection, body, { method } = {}) {
      expire()
      if (!only(body, ['id', 'session_id', 'profile', 'result', 'error']) || (body.profile ?? '') !== profile) return false
      const request = live.get(body.id)
      if (!request || body.session_id !== request.sessionId || (method && request.method !== method) ||
          Object.hasOwn(body, 'result') === Object.hasOwn(body, 'error')) return false
      if (Object.hasOwn(body, 'error')) {
        const error = body.error
        if (!only(error, ['code', 'message']) || !Number.isSafeInteger(error.code) || !text(error.message, 2000)) return false
        if (error.code === 4404) {
          if (!windowMethods.has(request.method)) return false
          // Old canonical owners consume the first error as an answer; don't let another window
          // lose its request. Native timeout/cancel remains authoritative for those peers.
          if (connection.capabilities?.declines_not_shown === true) connection.reply(body.id, undefined, error)
          retire(body.id, 'declined'); return true
        }
        connection.reply(body.id, undefined, error)
      } else {
        if (!validDesktopResult(request.method, body.result, request.context)) return false
        connection.reply(body.id, body.result)
      }
      retire(body.id, 'answered'); return true
    },
  }
}

export const sessionControlFields = Object.freeze({
  'tools.show': ['session_id'], 'process.list': ['session_id'], 'process.stop': ['session_id'],
  'process.kill': ['session_id', 'process_id'], 'subagent.list': ['session_id'],
  'subagent.tail': ['session_id', 'subagent_id'], 'subagent.interrupt': ['session_id', 'subagent_id'],
  'subagent.steer': ['session_id', 'subagent_id', 'text'],
  'connectors.operation.status': ['owner', 'op_id'], 'connectors.operation.wake': ['owner', 'op_id'],
  'connection.respond': ['owner', 'op_id', 'result'],
  'connectors.connect': ['owner', 'connectors', 'reconnect', 'alias', 'connection_id'],
})
function connectionAnswer(value) {
  return only(value, ['targets', 'settled_by', 'said']) && bounded(value) &&
    optional(value.settled_by, v => ['all_resolved', 'continue', 'deadline', 'interrupt'].includes(v)) && optional(value.said, text) &&
    (value.targets === undefined || Array.isArray(value.targets) && value.targets.length <= 100 && value.targets.every(target =>
      only(target, ['name', 'status', 'detail', 'env']) && idText(target.name) && ['approved', 'skipped'].includes(target.status) &&
      optional(target.detail, text) && optional(target.env, env => record(env) && Object.entries(env).every(([key, val]) =>
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && text(val)))) )
}
export function allowedSessionControlCall(method, params) {
  const fields = sessionControlFields[method]
  if (!fields || !only(params, fields)) return false
  if (!fields.includes('owner')) return fields.every(field => field === 'text' ? text(params[field]) && Boolean(params[field]) : idText(params[field]))
  if (!only(params.owner, ['type', 'session_id']) || params.owner.type !== 'session' || !idText(params.owner.session_id)) return false
  if (method === 'connectors.connect') return Array.isArray(params.connectors) && params.connectors.length > 0 && params.connectors.length <= 100 &&
    params.connectors.every(v => typeof v === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(v) && v.length <= 200) && params.reconnect === true &&
    optional(params.alias, v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(v) && params.connectors.length === 1) &&
    optional(params.connection_id, v => idText(v) && params.connectors.length === 1 && !params.alias)
  return idText(params.op_id) && (method !== 'connection.respond' || connectionAnswer(params.result))
}
