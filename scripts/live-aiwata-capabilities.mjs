import { randomUUID, createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import { isSlashCommandName } from '../src/composer.mjs'

const record = value => value && typeof value === 'object' && !Array.isArray(value)
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
const exact = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key))
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]))
const providerFields = ['slug', 'name', 'models', 'total_models', 'is_current', 'is_user_defined', 'source', 'aliases', 'auth_type', 'authenticated', 'key_env', 'unavailable_models']
export const providerView = value => pick(value, providerFields)

const serverName = value => text(value, 80) && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)
const publicUrl = value => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname)
  } catch { return false }
}
function mcpConfig(config) {
  return exact(config, ['url', 'command', 'args', 'auth', 'enabled']) &&
    ((text(config.url, 2048) && publicUrl(config.url) && !config.command && !config.args) ||
      (!config.url && text(config.command, 1000) && (config.args === undefined || Array.isArray(config.args) && config.args.length <= 40 && config.args.every(arg => text(arg, 2000))))) &&
    (config.auth === undefined || config.auth === 'oauth' && !!config.url) &&
    (config.enabled === undefined || typeof config.enabled === 'boolean')
}
const serverView = row => {
  const safe = pick(row, ['name', 'transport', 'command', 'env', 'auth', 'oauth_tokens_present', 'enabled', 'source', 'plugin'])
  if (row.url) { try { const url = new URL(row.url); safe.url = url.origin + url.pathname } catch {} }
  return safe
}
const signature = row => createHash('sha256').update(JSON.stringify(pick(row, ['name', 'url', 'command', 'args', 'env', 'source', 'plugin']))).digest('hex')

export function capabilityRequest(body) {
  if (!exact(body, ['method', 'profile', 'params']) || !text(body.method) ||
      (body.profile !== undefined && !/^(?:default|[a-zA-Z0-9][a-zA-Z0-9_-]{0,79})$/.test(body.profile))) throw new Error('无法识别配置请求。')
  const params = body.params ?? {}
  let valid = false
  switch (body.method) {
    case 'complete.path': case 'complete.slash': valid = exact(params, ['session_id', 'cwd', body.method === 'complete.path' ? 'word' : 'text']) &&
      (params.session_id === undefined || text(params.session_id, 200)) && (params.cwd === undefined || text(params.cwd, 4096)) &&
      typeof (params.word ?? params.text) === 'string' && (params.word ?? params.text).length <= 2048 && !/[\u0000-\u001f\u007f]/.test(params.word ?? params.text); break
    case 'skill.expand': valid = exact(params, ['session_id', 'name', 'arg']) && text(params.session_id, 200) && text(params.name, 200) &&
      typeof params.arg === 'string' && params.arg.length <= 100000 && isSlashCommandName(params.name); break
    case 'mcp.catalog': case 'mcp.servers.list': case 'mcp.servers.status': valid = exact(params, []) ; break
    case 'mcp.servers.add': valid = exact(params, ['name', 'preset', 'config', 'bearer_token']) && serverName(params.name) &&
      (params.preset === undefined || text(params.preset, 100)) && (params.config === undefined ? !!params.preset : mcpConfig(params.config)) &&
      (params.bearer_token === undefined || text(params.bearer_token, 8192)); break
    case 'mcp.servers.set_api_key': valid = exact(params, ['name', 'value', 'env_var']) && serverName(params.name) && text(params.value, 8192) &&
      (params.env_var === undefined || /^[A-Z][A-Z0-9_]{1,99}$/.test(params.env_var) && !/^(HERMES|AIWATA|HOME|PATH|PYTHON|NODE|LD_|DYLD_|SHELL|TMP)/.test(params.env_var)); break
    case 'mcp.servers.test': case 'mcp.servers.remove': case 'mcp.servers.oauth.start': valid = exact(params, ['name']) && serverName(params.name); break
    case 'mcp.toggle': valid = exact(params, ['name', 'enabled']) && serverName(params.name) && typeof params.enabled === 'boolean'; break
    case 'mcp.servers.oauth.poll': case 'mcp.servers.oauth.cancel': valid = exact(params, ['name', 'handle']) && serverName(params.name) && /^[a-f0-9-]{36}$/.test(params.handle); break
    case 'model.options': valid = exact(params, ['refresh']) && (params.refresh === undefined || typeof params.refresh === 'boolean'); break
    case 'model.save_key': valid = exact(params, ['slug', 'api_key']) && text(params.slug, 100) && text(params.api_key, 8192); break
    case 'model.disconnect': valid = exact(params, ['slug']) && text(params.slug, 100); break
  }
  if (!valid) throw new Error('这个配置操作或参数不受支持。')
  return { method: body.method, profile: body.profile === 'default' ? '' : body.profile ?? '', params }
}

export function createCapabilityBridge({ connect, writeProfile, providerCatalog, directoryFor, draftCompletion }) {
  const flows = new WeakMap()
  const activeFlows = new Set()
  const forget = flow => { flows.get(flow.client)?.delete(flow.handle); activeFlows.delete(flow) }
  const cancelServer = async (home, name) => {
    for (const flow of [...activeFlows]) if (flow.home === home && flow.name === name) {
      const result = await flow.cancel()
      if (!result.ok) throw new Error('未能结束此连接的旧授权，请稍后重试。')
      forget(flow)
    }
  }
  const epochs = new Map()
  const epochKey = (home, name) => home + ':' + name
  const bump = (home, name) => epochs.set(epochKey(home, name), (epochs.get(epochKey(home, name)) ?? 0) + 1)
  const call = async (client, body, active) => {
    const { method, profile, params } = capabilityRequest(body)
    const check = () => { if (!active()) throw new Error('已退出当前工作区。') }
    check()
    const { connection, home } = await connect(client, profile)
    const identity = await stat(home)
    const execute = async () => {
      check()
      const current = await stat(home)
      if (current.ino !== identity.ino || current.dev !== identity.dev) throw new Error('配置档已变化，请重新打开。')
      if (method.startsWith('complete.') || method === 'skill.expand') {
        const snapshot = params.session_id ? await connection.call('session.resume', { session_id: params.session_id }) : null
        const cwd = await directoryFor(client.workspace, snapshot?.info?.cwd ?? params.cwd ?? client.workspace)
        check()
        const session = snapshot ? { session_id: snapshot.session_id } : {}
        if (method === 'skill.expand') {
          const choices = await connection.call('complete.slash', { ...session, text: '/' + params.name })
          if (!choices.items?.some(row => row.kind === 'skill' && row.text.trim().replace(/^\//, '') === params.name)) throw new Error('此技能在当前会话不可用。')
          const known = await connection.call('command.resolve', { name: params.name }).catch(() => null)
          if (known?.canonical) throw new Error('请使用工作台对应的操作入口。')
          const result = await connection.call('command.dispatch', { ...session, name: params.name, arg: params.arg })
          check()
          if (result.type !== 'skill' || typeof result.message !== 'string') throw new Error('AIWATA 未返回技能调用内容。')
          return pick(result, ['message', 'display', 'name'])
        }
        if (method === 'complete.path') {
          const word = params.word
          const query = word.replace(/^@(?:(?:file|folder):)?/, '')
          if (query && !/^[a-zA-Z][a-zA-Z0-9_-]*:/.test(query)) {
            const directory = resolve(cwd, query.endsWith('/') ? query : dirname(query))
            await directoryFor(client.workspace, directory)
          }
        }
        const result = !snapshot && draftCompletion
          ? await draftCompletion(client, { method, profile, profileHome: home, cwd, ...(method === 'complete.path' ? { word: params.word } : { text: params.text }) }, active)
          : await connection.call(method, method === 'complete.path'
            ? { ...session, cwd, word: params.word } : { ...session, text: params.text })
        check()
        return { items: (result.items ?? []).slice(0, 90).map(row => pick(row, ['text', 'display', 'meta', 'kind'])),
          ...(Number.isSafeInteger(result.replace_from) ? { replace_from: result.replace_from } : {}) }
      }
      if (method.startsWith('mcp.')) {
        const nativeCall = async (verb, input) => {
          try { return await connection.call(verb, input, 90000) }
          catch { throw new Error('MCP 服务未完成请求，请重试或检查原生连接设置。') }
        }
        if (['mcp.servers.add', 'mcp.servers.remove', 'mcp.servers.set_api_key', 'mcp.toggle'].includes(method)) {
          await cancelServer(home, params.name)
          check()
        }
        const list = () => nativeCall('mcp.servers.list', {})
        const find = async () => {
          const row = (await list()).servers.find(row => row.name === params.name)
          if (!row) throw new Error('连接已移除，请刷新列表。')
          return row
        }
        if (method === 'mcp.servers.oauth.start') {
          const row = await find()
          const map = flows.get(client) ?? new Map()
          flows.set(client, map)
          if (map.size >= 8) throw new Error('请先关闭未完成的授权。')
          const result = await nativeCall(method, params)
          const cancel = () => nativeCall('mcp.servers.oauth.cancel', { name: params.name, session_id: result.session_id })
          if (!active() || !result.ok || !publicUrl(result.auth_url)) { await cancel(); throw new Error('无法开始网页授权。') }
          const handle = randomUUID()
          const flow = { client, handle, profile, home, identity, name: params.name, signature: signature(row), epoch: epochs.get(epochKey(home, params.name)),
            nativeId: result.session_id, expires: Date.now() + 900000, cancel }
          map.set(handle, flow)
          activeFlows.add(flow)
          return { handle, auth_url: result.auth_url }
        }
        if (method.startsWith('mcp.servers.oauth.')) {
          const map = flows.get(client)
          const flow = map?.get(params.handle)
          if (!flow || flow.profile !== profile || flow.home !== home || flow.name !== params.name) throw new Error('授权已失效，请重新开始。')
          if (method.endsWith('cancel')) {
            const result = await flow.cancel()
            if (result.ok) forget(flow)
            return { ok: result.ok, status: result.status }
          }
          if (flow.expires < Date.now() || flow.identity.ino !== current.ino || flow.identity.dev !== current.dev ||
            flow.epoch !== epochs.get(epochKey(home, params.name)) || signature(await find()) !== flow.signature) {
            await flow.cancel(); forget(flow); throw new Error('连接已变化，请重新开始授权。')
          }
          const result = await nativeCall(method, { name: params.name, session_id: flow.nativeId })
          check()
          if (result.status !== 'pending') forget(flow)
          return { ok: result.ok, status: result.status, ...(result.status === 'error' ? { error_message: '授权未完成，请重试。' } : {}) }
        }
        if (method === 'mcp.servers.set_api_key') {
          const server = await find()
          if (params.env_var && !params.env_var.startsWith('MCP_') && !server.env?.includes(params.env_var)) throw new Error('请选择此连接已声明的凭据字段。')
        }
        if (method === 'mcp.toggle') {
          const { servers } = await list()
          if (!servers.some(row => row.name === params.name)) throw new Error('连接已移除，请刷新列表。')
          const { connection: primary } = await connect(client, '')
          const enabled = servers.filter(row => row.name === params.name ? params.enabled : row.enabled).map(row => row.name)
          check()
          const result = await primary.call('profiles.configure', { name: profile || 'default', enabled_mcp_servers: enabled })
          if (!result.ok) throw new Error('AIWATA 未确认连接状态。')
          return { ok: true }
        }
        let result
        try { result = await nativeCall(method, params) }
        catch { throw new Error('MCP 操作失败，请检查连接配置与授权后重试。') }
        check()
        if (method === 'mcp.servers.list') return { servers: (result.servers ?? []).map(serverView) }
        if (method === 'mcp.catalog') return { servers: (result.servers ?? []).map(row => pick(row, ['name', 'description', 'installed', 'enabled', 'requires', 'transport'])) }
        if (method === 'mcp.servers.status') return { servers: (result.servers ?? []).map(row => pick(row, ['name', 'status', 'tools', 'connected', 'disabled', 'needs_auth'])) }
        if (method === 'mcp.servers.test') return { ok: result.ok, tools: result.ok ? (result.tools ?? []).map(tool => pick(tool, ['name', 'description'])) : [],
          oauth_needed: result.oauth_needed, ...(result.ok ? {} : { error: '连接测试未通过，请检查地址、程序和授权。' }) }
        if (['mcp.servers.add', 'mcp.servers.remove'].includes(method)) bump(home, params.name)
        return { ok: result.ok, ...(result.removed !== undefined ? { removed: result.removed } : {}) }
      }
      let result
      try {
        result = await connection.call(method, method === 'model.options' ? { explicit_only: true, include_unconfigured: true, ...params } : params, 90000)
      } catch (error) {
        if (method === 'model.save_key') throw new Error('保存授权失败，请检查提供方、密钥和 AIWATA 配置。')
        throw error
      }
      check()
      if (method === 'model.options') {
        const schema = providerCatalog ? await providerCatalog(client, {}, active) : {}
        check()
        return { providers: (result.providers ?? []).map(row => ({ ...providerView(row), ...schema[row.slug] })) }
      }
      if (method === 'model.save_key') return { provider: providerView(result.provider) }
      return pick(result, ['slug', 'name', 'disconnected'])
    }
    return ['complete.path', 'complete.slash', 'skill.expand', 'model.options', 'mcp.catalog', 'mcp.servers.list', 'mcp.servers.status', 'mcp.servers.oauth.poll'].includes(method) ? execute() : writeProfile(home, execute)
  }
  call.close = client => {
    const map = flows.get(client)
    flows.delete(client)
    for (const flow of map?.values() ?? []) { activeFlows.delete(flow); void flow.cancel().catch(() => {}) }
  }
  return call
}
