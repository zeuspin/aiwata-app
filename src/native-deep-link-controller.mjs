const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value)
const message = error => error instanceof Error ? error.message : String(error)

/** Review queue for the original native deep-link vocabulary. All classifiers
 * come from the selected core. Payload/config/credential material stays only in
 * this lifetime's memory; no link value is persisted or logged. */
export function createNativeDeepLinkController({ library, live, host, isCurrent, onChange,
  navigate = () => false, insertBlueprint, connectionDone, onInstalled = () => {} }) {
  const owner = Object.freeze({ ...live.route }), queue = [], aborter = new AbortController()
  let disposed = false
  const current = () => !disposed && !aborter.signal.aborted && isCurrent()
  const assertCurrent = () => { if (!current()) throw new Error('确认所属工作区已变化。') }
  const publish = () => { if (current()) onChange() }
  const request = async (method, params, timeoutMs) => {
    assertCurrent()
    const { profile, ...input } = params ?? {}
    if (profile && profile !== owner.profile && !(profile === 'default' && !owner.profile)) throw new Error('安装目标 Profile 与审查对象不一致。')
    const result = await live.rpc(method, input, owner.profile, timeoutMs)
    assertCurrent(); return result
  }
  const api = async (path, options) => { assertCurrent(); const result = await live.api(path, { ...options, profile: owner.profile }); assertCurrent(); return result }
  async function inspect(item) {
    item.status = 'loading'; item.error = null; publish()
    const probe = await library.inspectAgentPlugin(request, { identifier: item.repo, ...(item.catalogName ? { catalogName: item.catalogName } : {}), profile: owner.profile })
    assertCurrent()
    item.probe = probe
    const sha = item.catalogName && !probe.catalogPin ? item.catalogSha : probe.sha
    if (!probe.ok || !fullSha(sha) || !probe.agent && !probe.desktop) throw new Error(probe.error || '原生审查未返回可安装的完整提交身份。')
    item.sha = sha; item.status = 'review'; publish()
  }
  async function receive(payload) {
    if (!current()) return
    const item = { id: crypto.randomUUID(), owner, type: 'unsupported', status: 'loading', busy: false, error: null, payload }
    queue.push(item); publish()
    try {
      if (payload?.kind === 'mcp' && payload.name === 'install') {
        const parsed = library.parseMcpInstallDeepLink(payload.params ?? {})
        if (!parsed.ok) throw new Error('原生 MCP 深链校验失败：' + parsed.error)
        Object.assign(item, { type: 'mcp', request: parsed.request, status: 'review' }); publish(); return
      }
      const action = library.resolveDeepLinkAction(payload)
      if (action.type === 'skill-install') { Object.assign(item, { type: 'skill', identifier: action.identifier, status: 'review' }); publish(); return }
      else if (action.type === 'plugin-install' || action.type === 'plugin-catalog-install') {
        Object.assign(item, { type: 'plugin', enable: action.enable ?? true, force: action.force ?? false, legacyHint: action.legacyHint, repo: action.repo })
        if (action.type === 'plugin-catalog-install') {
          const resolved = await library.lookupPluginCatalogEntry(action.name, { request })
          assertCurrent()
          if (!resolved.ok) throw new Error('原生插件目录未确认该条目：' + resolved.error)
          const entry = resolved.entry
          Object.assign(item, { repo: entry.subdir ? entry.repo + '#' + entry.subdir : entry.repo, catalogName: entry.name, catalogSha: entry.sha, summary: entry.summary })
        }
        await inspect(item); return
      } else if (action.type === 'composer-blueprint') {
        if (typeof insertBlueprint === 'function' && await insertBlueprint(action, owner)) { assertCurrent(); queue.splice(queue.indexOf(item), 1); publish(); return }
        item.detail = '蓝图命令需要原生 composer 插入门面；本链接仍保留，未执行。'
      } else if (action.type === 'connection-done') {
        if (typeof connectionDone === 'function' && await connectionDone(action, owner)) { assertCurrent(); queue.splice(queue.indexOf(item), 1); publish(); return }
        item.detail = '需要按操作 ID 查询原生连接状态；链接携带的 status 不作为授权成功证据。'
      } else {
        const path = library.pathFromHermesDeepLink(payload.kind, payload.name ?? '', payload.params ?? {})
        if (path && await navigate(path, owner)) { assertCurrent(); queue.splice(queue.indexOf(item), 1); publish(); return }
        if (path) item.path = path
        item.detail = path ? '此原生路径尚未映射到当前工作台：' + path : '原生解析器未返回可在此工作台执行的操作。'
      }
      item.status = 'blocked'; publish()
    } catch (error) {
      if (!current()) return
      item.status = 'blocked'; item.error = message(error); publish()
    }
  }
  async function pollSkill(item) {
    for (;;) {
      const status = await api('/api/actions/' + encodeURIComponent(item.actionName) + '/status?lines=200')
      item.lines = status.lines ?? []; publish()
      if (!status.running) {
        if (status.exit_code !== 0) {
          if (status.exit_code != null) delete item.actionName
          throw new Error(item.lines.slice(-5).join('\n') || '原生安装操作未确认成功。')
        }
        return
      }
      await new Promise(resolve => {
        const done = () => { clearTimeout(timer); aborter.signal.removeEventListener('abort', done); resolve() }
        const timer = setTimeout(done, 700)
        aborter.signal.addEventListener('abort', done, { once: true })
      })
      assertCurrent()
    }
  }
  async function installPlugin(item, values) {
    if (!fullSha(item.sha)) throw new Error('请先重新审查插件提交。')
    const agent = item.probe.agent && item.legacyHint !== 'desktop'
    const desktop = item.probe.desktop && item.legacyHint !== 'agent'
    const enable = values.enable ?? item.enable, force = values.force ?? item.force
    let installed = item.agentResult
    if (agent && !item.agentInstalled) {
      installed = await library.installAgentPlugin(request, { identifier: item.repo, enable, force,
        ...(item.catalogName ? { catalogName: item.catalogName } : {}), inspectedSha: item.sha, profile: owner.profile })
      assertCurrent()
      if (!installed.ok) {
        if (installed.timedOut) { item.status = 'unknown'; throw new Error('原生安装尚未确认；请先检查插件状态，避免重复安装。') }
        if (installed.sourceMoved) { item.status = 'stale'; throw new Error('插件源已变化，需要重新审查。') }
        if (installed.inspectedShaUnsupported) { item.status = 'blocked'; throw new Error('后端无法锁定已审查提交，未绕过此保护。') }
        throw new Error(installed.error || '原生 Agent 插件未安装。')
      }
      item.agentInstalled = true; item.agentResult = installed
    }
    if (desktop) {
      assertCurrent()
      if (agent && owner.connectionId === 'local') {
        const name = installed?.pluginName ?? item.probe.agentName
        if (!name || typeof host.reconcileDesktopPluginsReport !== 'function') throw new Error('Agent 部分已安装；当前宿主无法确认同一包的桌面部分。')
        const report = await host.reconcileDesktopPluginsReport(); assertCurrent()
        const refusal = report.refused?.find(row => row.name === name)
        if (refusal) throw new Error('Agent 部分已安装；桌面部分被原生宿主拒绝：' + refusal.reason)
        const root = await host.desktopPluginsRoot(); assertCurrent()
        const listing = await host.readDir(root); assertCurrent()
        const folder = listing.entries?.find(row => row.name === name && row.isDirectory)
        const files = folder && await host.readDir(folder.path); assertCurrent()
        if (!files?.entries?.some(row => row.name === 'plugin.js')) throw new Error('Agent 部分已安装；尚未证实桌面入口文件。')
      } else {
        if (typeof host.installDesktopPlugin !== 'function') throw new Error('当前宿主没有桌面插件安装接口。')
        const result = await host.installDesktopPlugin({ identifier: item.repo, sha: item.sha, force, ...(item.catalogName ? { catalogName: item.catalogName } : {}) })
        assertCurrent()
        if (!result.ok) { if (result.sourceMoved) item.status = 'stale'; throw new Error(result.error || '原生桌面插件未安装。') }
      }
      item.desktopInstalled = true
      item.notice = '桌面插件文件已由原生宿主确认；此工作台的动态插件入口加载尚未接入。'
    }
    if (!agent && !desktop) throw new Error('此链接没有可安装的插件部分。')
  }
  async function confirm(values = {}) {
    const item = queue[0]
    if (!current() || !item || item.busy || item.status !== 'review') return false
    item.busy = true; item.error = null; publish()
    try {
      if (item.type === 'mcp') {
        const name = String(values.name ?? item.request.name).trim()
        if (!library.MCP_DEEPLINK_NAME_RE.test(name)) throw new Error('MCP 名称无效。')
        const config = await api('/api/config'), servers = config.mcp_servers ?? {}
        if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('原生 MCP 配置形状无效，未覆盖保存。')
        if (Object.hasOwn(servers, name)) throw new Error('同名 MCP 已存在，请更换名称；不会覆盖已有配置。')
        const result = await api('/api/mcp/servers', { method: 'PUT', body: { servers: { ...servers, [name]: item.request.config } } })
        if (!result?.ok) throw new Error('原生 MCP 保存未确认。')
      } else if (item.type === 'skill') {
        if (!item.actionName) {
          const result = await api('/api/skills/hub/install', { method: 'POST', body: { identifier: item.identifier } })
          if (!result?.ok || !result.name) throw new Error('原生技能安装操作未启动。')
          item.actionName = result.name
        }
        await pollSkill(item)
      } else if (item.type === 'plugin') await installPlugin(item, values)
      else return false
      assertCurrent(); item.status = 'done'; await onInstalled(item.type, owner); return true
    } catch (error) {
      if (current()) item.error = message(error)
      return false
    } finally { item.busy = false; publish() }
  }
  return { receive, confirm,
    snapshot: () => current() && queue[0] ? { ...queue[0], queued: queue.length - 1 } : null,
    dismiss() { if (current() && !queue[0]?.busy) { queue.shift(); publish() } },
    async recheck() { const item = queue[0]; if (!current() || item?.type !== 'plugin' || item.busy || item.agentInstalled) return; try { await inspect(item) } catch (error) { if (current()) { item.status = 'blocked'; item.error = message(error); publish() } } },
    dispose() { if (disposed) return; disposed = true; aborter.abort(); queue.splice(0) },
  }
}
