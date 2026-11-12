const automatic = new Set(['preview.read', 'preview.act', 'terminal.read', 'window.read', 'theme.apply', 'tour'])
const interactive = new Set(['theme.pick', 'setup_beat'])
const parked = kind => ['secure', 'interactive', 'legacy'].includes(kind)
const secure = new Set(['sudo', 'secret', 'vault.code', 'vault.unlock_prompt', 'vault.save_login', 'display.install.sudo'])
const legacy = new Set(['approval', 'clarify'])
const errorOf = (code, message) => ({ code, message })
const unavailable = () => errorOf(-32603, 'Desktop request was interrupted before it could be confirmed. Retry the request.')
const keyOf = (id, profile = '') => JSON.stringify([profile, id])

/** Transient server-request lifecycle. Nothing here writes workspace state or
 * retains submitted credential values. Watch frames and reconnect replay use
 * the same entry point, so replay cannot repeat a mutating native action. */
export function createDesktopRequestDispatcher({ active, currentChatId, resolveSession, invoke, reply,
  onLegacy = () => {}, onWithdraw = () => {}, onChange = () => {}, onError = () => {} }) {
  const records = new Map()
  const retired = new Set()
  let disposed = false
  const alive = () => !disposed && active()
  const requests = () => [...records.values()].filter(record => ['secure', 'interactive'].includes(record.kind) && record.state === 'parked').map(record => record.view)
  const changed = () => onChange(requests())
  const scopeValid = record => alive() && (!record.session ||
    resolveSession(record.frame) === record.session && record.session.gatewayGeneration === record.generation &&
    (record.session.gatewayProfile ?? '') === record.profile)
  const valid = record => scopeValid(record) && !record.controller.signal.aborted
  const visible = record => record.session && currentChatId() === record.session.id
  const emit = async (record, result, error) => {
    if (!alive()) return false
    try {
      await reply({ id: record.frame.id, sessionId: record.sessionId, profile: record.profile,
        ...(error ? { error } : { result }) })
      return true
    } catch {
      if (alive()) onError('无法提交 Agent 请求，请重新打开会话后重试。')
      return false
    }
  }
  const complete = (record, result, error) => {
    record.state = 'complete'
    // Secure results are deliberately never placed on the replay cache.
    if (!parked(record.kind)) record.answer = error ? { error } : { result }
    void emit(record, result, error)
    changed()
  }
  function cancel(record, reason = 'interrupted') {
    if (!record || record.state === 'cancelled' || record.state === 'complete') return
    record.controller.abort(reason)
    record.state = 'cancelled'
    delete record.answer
    onWithdraw(record.session, record.frame)
    changed()
  }
  function prune() {
    if (records.size < 512) return
    for (const [key, record] of records) {
      if (['complete', 'cancelled'].includes(record.state)) { records.delete(key); retired.add(key) }
      if (records.size < 384) break
    }
  }
  function handle(frame) {
    if (!alive() || !frame || typeof frame !== 'object') return false
    const event = frame.params
    if (frame.method === 'event') {
      if (event?.type === 'request.cancel') cancel(records.get(keyOf(event.payload?.id, frame.profile)), event.payload?.reason)
      if (['approval.settled', 'clarify.settled'].includes(event?.type)) {
        for (const record of records.values()) if (record.profile === (frame.profile ?? '') && record.kind === 'legacy' &&
          (record.frame.id === event.payload?.prompt_id || record.frame.params?.request_id === event.payload?.prompt_id)) {
          cancel(record, 'resolved')
        }
      }
      return false
    }
    if (typeof frame.id !== 'string' || !frame.id || typeof frame.method !== 'string') return false
    const key = keyOf(frame.id, frame.profile)
    if (retired.has(key)) {
      void emit({ frame, sessionId: frame.params?.session_id ?? '', profile: frame.profile ?? '' }, undefined, unavailable())
      return true
    }
    const existing = records.get(key)
    if (existing) {
      if (existing.state === 'suspended' && valid(existing)) {
        existing.state = 'parked'
        if (existing.kind === 'legacy') onLegacy(existing.session, existing.frame)
        changed()
      } else if (existing.state === 'complete' && existing.answer) {
        const error = !scopeValid(existing) ? unavailable() : existing.kind === 'automatic' && !visible(existing)
          ? errorOf(4404, 'This window is not showing the requested session.') : existing.answer.error
        void emit(existing, error ? undefined : existing.answer.result, error)
      }
      return true
    }
    prune()
    const method = frame.method
    const session = resolveSession(frame)
    const profile = frame.profile ?? ''
    const sessionId = typeof frame.params?.session_id === 'string' ? frame.params.session_id : ''
    const kind = automatic.has(method) ? 'automatic' : secure.has(method) ? 'secure' : interactive.has(method) ? 'interactive' : legacy.has(method) ? 'legacy' : 'unsupported'
    const record = { frame, session, sessionId, profile, kind, generation: session?.gatewayGeneration,
      controller: new AbortController(), state: 'running' }
    record.view = { id: frame.id, wireId: frame.id, method, params: frame.params ?? {}, chatId: session?.id ?? null,
      sessionId, profile, generation: record.generation, title: session?.title ?? '' }
    records.set(key, record)
    if (kind === 'unsupported') {
      complete(record, undefined, errorOf(-32601, 'This desktop client does not implement that request.'))
      return true
    }
    if ((!session && !(method === 'display.install.sudo' && !sessionId)) || session?.gatewayRoom ||
        frame.params?.execution_generation != null && frame.params.execution_generation !== record.generation) {
      complete(record, undefined, errorOf(4404, 'This window is not showing the requested session.'))
      return true
    }
    if (kind === 'legacy') {
      record.state = 'parked'
      onLegacy(session, frame)
      return true
    }
    if (kind === 'secure' || kind === 'interactive') {
      record.state = 'parked'
      changed()
      return true
    }
    if (!visible(record)) {
      complete(record, undefined, errorOf(4404, 'This window is not showing the requested session.'))
      return true
    }
    void (async () => {
      try {
        const result = await invoke(session, method, frame.params ?? {}, record.controller.signal)
        if (!alive() || record.state !== 'running') return
        if (!scopeValid(record)) { complete(record, undefined, unavailable()); return }
        if (!valid(record)) return
        if (!visible(record)) { complete(record, undefined, errorOf(4404, 'This window is not showing the requested session.')); return }
        const value = result == null ? '' : JSON.stringify(result)
        if (typeof value !== 'string' || new TextEncoder().encode(JSON.stringify({ value })).byteLength > 1024 * 1024) throw new Error('Invalid native result')
        complete(record, { value })
      } catch {
        if (valid(record) && record.state === 'running') complete(record, undefined, errorOf(-32603, 'The desktop capability could not complete this request.'))
      }
    })()
    return true
  }
  async function respond(request, value, beforeReply) {
    const record = request && records.get(keyOf(request.wireId ?? request.id, request.profile))
    if (!record || record.view !== request || !['secure', 'interactive'].includes(record.kind) || record.state !== 'parked' || !valid(record) ||
        record.session && !visible(record)) return false
    let answer
    if (record.kind === 'interactive') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 16000) return false
      answer = value
    } else if (value === null) answer = ''
    else if (record.frame.method === 'vault.save_login') {
      if (!value || typeof value.identifier !== 'string' || typeof value.password !== 'string' ||
          value.identifier.length > 4000 || value.password.length > 16000) return false
      answer = JSON.stringify({ identifier: value.identifier, password: value.password })
    } else {
      if (typeof value !== 'string' || value.length > 16000 || value.includes('\0')) return false
      answer = value
    }
    if (record.kind === 'interactive') beforeReply?.()
    if (!valid(record) || record.session && !visible(record)) return false
    record.state = 'answering'
    changed()
    const accepted = await emit(record, record.kind === 'interactive' ? answer : { value: answer })
    answer = ''
    // A completion can arrive after logout/cancel: never restore its old card.
    if (!valid(record) || record.state !== 'answering') return false
    record.state = accepted ? 'complete' : 'parked'
    changed()
    return accepted
  }
  function disconnect() {
    for (const record of records.values()) {
      if (!['running', 'parked', 'answering'].includes(record.state)) continue
      record.controller.abort('disconnected')
      onWithdraw(record.session, record.frame)
      if (parked(record.kind)) {
        record.state = 'suspended'
        record.controller = new AbortController()
      } else {
        record.state = 'complete'
        record.answer = { error: unavailable() }
      }
    }
    changed()
  }
  return {
    handle, requests, respond, disconnect,
    async answerComposer(session, text) {
      const record = [...records.values()].find(row => row.session === session && row.kind === 'interactive' && row.state === 'parked')
      if (!record || !text.trim()) return false
      const value = record.frame.method === 'setup_beat' && record.frame.params?.beat !== 'name'
        ? { wrote_instead: true } : { said: text.trim() }
      const accepted = await respond(record.view, value)
      return accepted ? value.wrote_instead ? 'continue' : 'consumed' : 'failed'
    },
    settle(id, profile = '') {
      const record = records.get(keyOf(id, profile))
      if (record) { record.state = 'complete'; changed() }
    },
    contextChanged() {
      for (const record of records.values()) {
        if (record.kind === 'automatic' && record.state === 'running' && (!visible(record) || !scopeValid(record))) {
          const error = !scopeValid(record) ? unavailable() : errorOf(4404, 'This window is not showing the requested session.')
          cancel(record, 'navigation')
          // Retain a refusal for a reconnect replay without executing it again.
          complete(record, undefined, error)
        } else if (parked(record.kind) && record.state === 'parked' && !scopeValid(record)) {
          cancel(record, 'scope changed')
        }
      }
    },
    abortSession(session) {
      for (const record of records.values()) if (record.session === session) cancel(record, 'interrupted')
    },
    dispose() {
      for (const record of records.values()) cancel(record, 'logout')
      disposed = true
      records.clear()
      retired.clear()
      changed()
    },
  }
}
