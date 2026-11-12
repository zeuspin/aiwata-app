// The original Electron listener owns loopback; the original gateway owns PKCE,
// DCR, credentials and commits. Only opaque, lifetime-scoped handles reach UI.
export function createNativeMcpOAuth({ host, rpc, route, stops, check = () => {} }) {
  const flows = new Map(), targets = new Map()
  let disposed = false, disposal
  const alive = () => { if (disposed) throw new Error('MCP 授权所属工作区已关闭。'); check() }
  const target = (profile, name) => JSON.stringify([profile || 'default', name])
  const request = async (action, flow, params = {}) => {
    const result = await rpc('mcp.servers.oauth.' + action, { name: flow.name, ...params }, flow.profile)
    if (result.ok === false) throw new Error(result.error_message || 'MCP 授权未完成。')
    return result
  }
  async function release(flow, approved = false) {
    flow.closed = true
    flows.delete(flow.handle)
    if (targets.get(flow.target) === flow.handle) targets.delete(flow.target)
    // Cancellation emits a synthetic result: fence it before closing native wait.
    if (flow.listener && !flow.listenerClosed) { flow.listenerClosed = true; await host.mcpOauth.cancel(flow.listener.id).catch(() => {}) }
    if (flow.session && !approved && !flow.sessionCanceled) { flow.sessionCanceled = true; await request('cancel', flow, { session_id: flow.session }).catch(() => {}) }
  }
  const owned = (profile, { name, handle }) => {
    alive()
    const flow = flows.get(handle)
    if (!flow || flow.closed || flow.target !== target(profile, name)) throw new Error('MCP 授权对象或归属已变化，请重新开始。')
    return flow
  }
  const service = {
    async start(profile, { name }) {
      alive()
      if (!name) throw new Error('MCP 服务器名称缺失。')
      if (!host?.mcpOauth && route?.connectionId !== 'local') throw new Error('原生宿主未提供本机 MCP 授权回调，请升级 AIWATA Desktop。')
      const key = target(profile, name), old = flows.get(targets.get(key))
      if (old) await release(old)
      alive()
      const flow = { handle: crypto.randomUUID(), target: key, profile, name, closed: false }
      flow.startDone = new Promise(resolve => { flow.finishStart = resolve })
      flows.set(flow.handle, flow); targets.set(key, flow.handle)
      try {
        if (host?.mcpOauth) flow.listener = await host.mcpOauth.listen()
        alive()
        if (flow.closed) throw new Error('MCP 授权已取消。')
        const result = await request('start', flow, flow.listener ? { client_redirect_uri: flow.listener.redirectUri } : {})
        flow.session = result.session_id
        alive()
        if (flow.closed) throw new Error('MCP 授权已取消。')
        if (!flow.session || !result.auth_url) throw new Error('MCP 未返回授权网页和会话身份。')
        const redirect = new URL(result.auth_url).searchParams.get('redirect_uri')
        if (flow.listener && redirect !== flow.listener.redirectUri) throw new Error('请升级原生后端以支持本机 MCP 授权回调。')
        if (!flow.listener) {
          const url = new URL(redirect || '')
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !Number(url.port) || url.pathname !== '/callback' || url.username || url.password || url.search || url.hash) throw new Error('MCP 未提供有效的本机回环地址。')
        }
        if (flow.listener) void host.mcpOauth.wait(flow.listener.id).then(async callback => {
          if (flow.closed || disposed) return
          alive()
          if (!callback.state) throw new Error(callback.error || 'MCP 回调缺少 state。')
          const { iss, ...rest } = callback
          await request('callback', flow, { session_id: flow.session, ...rest, ...(iss ? { iss } : {}) })
        }).catch(error => { if (!flow.closed && !disposed) flow.relayError = error })
        return { handle: flow.handle, auth_url: result.auth_url }
      } catch (error) { await release(flow); throw error }
      finally { flow.finishStart() }
    },
    async poll(profile, params) {
      const flow = owned(profile, params)
      if (flow.relayError) throw flow.relayError
      const result = await request('poll', flow, { session_id: flow.session })
      alive()
      if (flow.closed) throw new Error('MCP 授权已取消。')
      if (flow.relayError) throw flow.relayError
      if (result.status !== 'pending') await release(flow, result.status === 'approved')
      return result
    },
    async cancel(profile, params) {
      const flow = owned(profile, params)
      await release(flow)
      return { ok: true, status: 'cancelled' }
    },
    dispose() {
      if (disposed) return disposal
      disposed = true
      const pending = [...flows.values()]
      disposal = Promise.all(pending.map(async flow => { await release(flow); await flow.startDone; await release(flow) }))
      stops?.delete(service.dispose)
      return disposal
    },
  }
  stops?.add(service.dispose)
  return service
}
