// Storage, SSH, OAuth windows and updates remain owned by the original desktop.
// This controller holds only the dialog lifetime; opening a route is delegated.
const text = value => String(value ?? '').trim()
const ownerKey = route => JSON.stringify([route?.connectionId || 'local', route?.profile || 'default'])
const editableKinds = new Set(['local', 'remote', 'ssh'])
const remoteUrl = value => {
  const url = text(value)
  return !url || /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`
}

export function connectionRoute(connection) {
  return { connectionId: connection.id, profile: 'default' }
}

export function connectionDraft(connection = {}) {
  return {
    id: connection.id || null, persisted: Boolean(connection.id), kind: connection.kind || 'remote',
    label: connection.label || '', url: connection.url || '', authMode: connection.authMode || 'token',
    token: '', tokenSet: Boolean(connection.tokenSet), oauthConnected: false,
    host: connection.host ? `${connection.user ? `${connection.user}@` : ''}${connection.host}${connection.port ? `:${connection.port}` : ''}` : '',
    keyPath: connection.keyPath || '', remoteHermesPath: connection.remoteHermesPath || '', remoteProfile: connection.remoteProfile || '',
    headers: (connection.headerNames || []).map(name => ({ name, stored: true, value: '' })),
  }
}

/** Omission keeps a saved token; null keeps an existing header's secret. */
export function connectionPayload(draft) {
  if (!editableKinds.has(draft?.kind)) throw new Error('请选择本机、SSH 或 URL 连接。')
  if (!text(draft.label)) throw new Error('请填写连接名称。')
  const payload = { ...(draft.id ? { id: draft.id } : {}), kind: draft.kind, label: text(draft.label) }
  if (draft.kind === 'remote') {
    if (!text(draft.url)) throw new Error('请填写网关 URL。')
    payload.url = remoteUrl(draft.url)
    payload.authMode = draft.authMode
    if (draft.authMode === 'token' && text(draft.token)) payload.token = text(draft.token)
    payload.headers = Object.fromEntries((draft.headers || []).filter(row => text(row.name))
      .map(row => [text(row.name), text(row.value) || (row.stored ? null : '')]))
  } else if (draft.kind === 'ssh') {
    if (!text(draft.host)) throw new Error('请填写 SSH 主机。')
    // Native normalization parses this composite. Separate stored user/port
    // would override a host the user just edited.
    Object.assign(payload, { host: text(draft.host), keyPath: text(draft.keyPath),
      remoteHermesPath: text(draft.remoteHermesPath), remoteProfile: text(draft.remoteProfile) })
  }
  return payload
}

export function createNativeConnectionsController({ host, currentRoute, getCurrentRoute = () => currentRoute, onActivate }) {
  const owner = ownerKey(currentRoute), listeners = new Set(), bridge = host?.connections
  let disposed = false, actionSeq = 0, listSeq = 0, registryRevision = 0, draftRevision = 0
  let state = { registry: null, loading: false, busy: null, draft: null, confirmation: null,
    error: '', notice: '', probe: null, sshHosts: [], sshResolution: null, updateResults: [] }
  const current = () => !disposed && ownerKey(getCurrentRoute()) === owner
  const publish = patch => {
    if (!current()) return
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  const errorText = (error, draft = state.draft) => {
    let message = error instanceof Error ? error.message : String(error || '原生操作未完成。')
    const secrets = [draft?.token, ...(draft?.headers || []).map(row => row.value)].filter(Boolean)
    for (const secret of [...new Set(secrets.flatMap(value => [value, text(value)]))].filter(Boolean).sort((a, b) => b.length - a.length)) {
      message = message.replaceAll(secret, '[已隐藏凭据]')
    }
    return message
  }
  const fail = error => { publish({ error: errorText(error) }); return false }
  const required = (object, method) => {
    if (typeof object?.[method] !== 'function') throw new Error('当前原生宿主未提供此连接操作。')
    return object[method].bind(object)
  }
  const accepted = result => {
    if (result?.ok === false) throw new Error(result.error || result.message || '原生操作未完成。')
    return result
  }
  const saved = id => {
    const connection = state.registry?.connections.find(row => row.id === id)
    if (!connection) throw new Error('连接已不存在，请刷新连接列表。')
    return connection
  }
  const canRemove = id => {
    const connection = saved(id)
    if (connection.kind === 'local') throw new Error('本机连接不能删除。')
    if (id === (getCurrentRoute()?.connectionId || 'local')) throw new Error('请先打开其他连接，再删除当前连接。')
    return connection
  }
  async function run(name, task, apply, { draft = false, mutation = false } = {}) {
    if (!current() || state.busy) return false
    const sequence = ++actionSeq, revision = draftRevision, secretDraft = state.draft
    const valid = () => current() && sequence === actionSeq && (!draft || revision === draftRevision)
    if (mutation) registryRevision++
    publish({ busy: name, notice: '' })
    try {
      const result = await task()
      if (!valid()) return false
      apply?.(result)
      return true
    } catch (error) {
      if (valid()) publish({ error: errorText(error, secretDraft) })
      return false
    } finally {
      if (valid()) publish({ busy: null })
    }
  }
  function setDraft(draft) {
    if (!current()) return false
    draftRevision++; actionSeq++
    publish({ draft, busy: null, confirmation: null, probe: null, sshResolution: null, notice: '' })
    return true
  }
  async function load() {
    if (!current()) return false
    const sequence = ++listSeq, revision = registryRevision
    const valid = () => current() && sequence === listSeq && revision === registryRevision
    publish({ loading: true })
    try {
      const registry = await required(bridge, 'list')()
      if (!valid()) return false
      publish({ registry })
      return true
    } catch (error) {
      if (valid()) publish({ error: errorText(error) })
      return false
    } finally {
      if (current() && sequence === listSeq) publish({ loading: false })
    }
  }
  function persistDraft(allowPlainTextToken = false) {
    return run('save', async () => {
      const payload = connectionPayload(state.draft)
      if (allowPlainTextToken) payload.allowPlainTextToken = true
      return accepted(await required(bridge, 'save')(payload))
    }, result => {
      draftRevision++
      publish({ registry: result.registry, draft: null, busy: null, confirmation: null, error: '', notice: '连接已保存；打开连接后才切换工作区。' })
    }, { draft: true, mutation: true })
  }
  const controller = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    load,
    clearError: () => publish({ error: '' }),
    create(kind = 'remote') {
      if (!editableKinds.has(kind)) return fail('请选择本机、SSH 或 URL 连接。')
      return setDraft(connectionDraft({ kind }))
    },
    edit(id) {
      if (!current()) return false
      try {
        const connection = saved(id)
        if (!editableKinds.has(connection.kind)) return fail('此历史连接类型不能在这里编辑。')
        return setDraft(connectionDraft(connection))
      } catch (error) { return fail(error) }
    },
    patchDraft(patch) {
      if (!current() || !state.draft) return false
      const next = { ...state.draft, ...patch }
      if (patch.url !== undefined || patch.authMode !== undefined) Object.assign(next, { oauthConnected: false, tokenSet: false })
      return setDraft(next)
    },
    cancelDraft: () => setDraft(null),
    async save() {
      if (!current() || state.busy || !state.draft) return false
      let payload
      try { payload = connectionPayload(state.draft) } catch (error) { return fail(error) }
      if (state.registry?.secureTokenStorage === false && (payload.token || Object.values(payload.headers || {}).some(Boolean))) {
        publish({ confirmation: { kind: 'plaintext', revision: draftRevision } })
        return false
      }
      return persistDraft()
    },
    requestRemove(id) {
      if (!current() || state.busy) return false
      try { const row = canRemove(id); publish({ confirmation: { kind: 'remove', id, label: row.label } }); return true }
      catch (error) { return fail(error) }
    },
    requestUpdate(id) {
      if (!current() || state.busy) return false
      try {
        const row = saved(id)
        if (row.kind !== 'ssh') throw new Error('仅 SSH 托管安装使用此更新入口。')
        required(bridge, 'updateManaged')
        publish({ confirmation: { kind: 'update', id, label: row.label } }); return true
      } catch (error) { return fail(error) }
    },
    requestUpdateAll() {
      if (!current() || state.busy) return false
      try { required(bridge, 'updateAll'); publish({ confirmation: { kind: 'updateAll' } }); return true }
      catch (error) { return fail(error) }
    },
    cancelConfirmation: () => publish({ confirmation: null }),
    async confirm() {
      if (!current() || state.busy || !state.confirmation) return false
      const confirmation = state.confirmation
      if (confirmation.kind === 'plaintext') {
        if (confirmation.revision !== draftRevision || !state.draft) return false
        return persistDraft(true)
      }
      return run(confirmation.kind, async () => {
        if (confirmation.kind === 'remove') {
          canRemove(confirmation.id)
          return accepted(await required(bridge, 'remove')(confirmation.id))
        }
        if (confirmation.kind === 'update') return accepted(await required(bridge, 'updateManaged')(confirmation.id))
        return required(bridge, 'updateAll')()
      }, result => {
        publish({ ...(result.registry ? { registry: result.registry } : {}), confirmation: null,
          updateResults: result.results || [], error: '', notice: confirmation.kind === 'remove' ? '连接已删除。' : result.message || '更新操作已结束，请核对结果。' })
      }, { mutation: true })
    },
    makePrimary(id) {
      return run('primary', async () => { saved(id); return accepted(await required(bridge, 'setPrimary')(id)) },
        result => publish({ registry: result.registry, error: '', notice: '默认连接已保存；当前工作区保持原连接。' }), { mutation: true })
    },
    setLaunchMode(mode) {
      return run('launchMode', async () => {
        if (!['last-used', 'primary'].includes(mode)) throw new Error('未知的启动连接策略。')
        return accepted(await required(bridge, 'setLaunchMode')(mode))
      }, result => publish({ registry: result.registry, error: '' }), { mutation: true })
    },
    test(id) {
      return run('test', async () => {
        saved(id)
        const result = accepted(await required(bridge, 'test')(id))
        if (result.reachable === false || result.ok !== true && result.reachable !== true) throw new Error(result.error || '连接测试未通过。')
        return result
      }, () => publish({ error: '', notice: '连接测试通过。' }))
    },
    activate(id) {
      return run('open', async () => {
        const target = connectionRoute(saved(id))
        await required({ onActivate }, 'onActivate')(target)
      })
    },
    loadSshHosts() {
      return run('sshHosts', () => required(host, 'sshConfigHosts')(), result => publish({ sshHosts: result.hosts || [] }))
    },
    resolveSsh() {
      return run('sshResolve', () => {
        if (state.draft?.kind !== 'ssh' || !text(state.draft.host)) throw new Error('请先填写 SSH 主机。')
        return required(host, 'sshResolveHost')(text(state.draft.host))
      }, result => publish({ sshResolution: result, draft: { ...state.draft, keyPath: state.draft.keyPath || result.identityFile || '' } }), { draft: true })
    },
    probe() {
      return run('probe', async () => {
        if (state.draft?.kind !== 'remote' || !text(state.draft.url)) throw new Error('请先填写网关 URL。')
        const result = await required(host, 'probeConnectionConfig')(remoteUrl(state.draft.url))
        if (!result.reachable) throw new Error(result.error || '无法探测此网关。')
        return result
      }, result => publish({ probe: result, notice: '网关可达；认证方式仍使用当前选择。' }), { draft: true })
    },
    signIn() {
      return run('oauth', async () => {
        const draft = state.draft
        if (draft?.kind !== 'remote' || draft.authMode !== 'oauth' || !text(draft.url) || !text(draft.label)) throw new Error('请先填写连接名称、URL 并选择网页登录。')
        const result = accepted(await required(host, 'oauthLoginConnectionConfig')(remoteUrl(draft.url), {
          connectionId: draft.id, label: text(draft.label), kind: 'remote', authMode: 'oauth',
        }))
        if (!result.connected) throw new Error(result.error || '网页登录尚未完成。')
        return result
      }, result => publish({ draft: { ...state.draft, id: result.connectionId || state.draft.id, oauthConnected: true }, error: '', notice: '网页登录已完成。' }), { draft: true })
    },
    signOut() {
      return run('oauthLogout', async () => {
        if (state.draft?.kind !== 'remote' || !text(state.draft.url)) throw new Error('请先填写网关 URL。')
        return accepted(await required(host, 'oauthLogoutConnectionConfig')(remoteUrl(state.draft.url)))
      }, () => publish({ draft: { ...state.draft, oauthConnected: false }, notice: '网页登录已退出。' }), { draft: true })
    },
    dispose() {
      if (disposed) return
      disposed = true; actionSeq++; listSeq++; draftRevision++
      unsubscribe?.(); listeners.clear()
      state = { ...state, draft: null, confirmation: null, busy: null }
    },
  }
  const unsubscribe = bridge?.onChanged?.(() => { if (current()) void load() })
  return controller
}
