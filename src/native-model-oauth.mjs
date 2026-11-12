// Thin owner/lifetime adapter for the original provider device-code/PKCE API.
// The gateway owns credentials and provider implementation; no token returns to UI.
export function createNativeModelOAuth({ api, stops, check = () => {} }) {
  const flows = new Map(), targets = new Map()
  let disposed = false, disposal
  const alive = () => { if (disposed) throw new Error('模型授权所属工作区已关闭。'); check() }
  const keyFor = (profile, provider) => JSON.stringify([profile || 'default', provider])
  async function release(flow, approved = false) {
    flow.closed = true; flows.delete(flow.handle)
    if (targets.get(flow.key) === flow.handle) targets.delete(flow.key)
    if (flow.session && !approved && !flow.canceled) {
      flow.canceled = true
      await api('/api/providers/oauth/sessions/' + encodeURIComponent(flow.session), { profile: flow.profile, method: 'DELETE' })
    }
  }
  const owned = (profile, params) => {
    alive()
    const flow = flows.get(params.handle)
    if (!flow || flow.closed || flow.key !== keyFor(profile, params.provider)) throw new Error('模型授权已取消或归属已变化，请重新开始。')
    return flow
  }
  const ensureCurrent = flow => { alive(); if (flow.closed) throw new Error('模型授权已取消。') }
  const service = {
    async start(profile, { provider }) {
      alive()
      if (!provider) throw new Error('请选择模型提供方。')
      const key = keyFor(profile, provider), old = flows.get(targets.get(key))
      if (old) await release(old)
      alive()
      const flow = { key, profile, provider, handle: crypto.randomUUID(), closed: false }
      flow.startDone = new Promise(resolve => { flow.finishStart = resolve })
      flows.set(flow.handle, flow); targets.set(key, flow.handle)
      try {
        const result = await api('/api/providers/oauth/' + encodeURIComponent(provider) + '/start', { profile, method: 'POST', body: {} })
        flow.session = result.session_id
        ensureCurrent(flow)
        if (!flow.session || !['device_code', 'pkce'].includes(result.flow)) throw new Error(result.error_message || '原生提供方未返回支持的授权流程。')
        return { handle: flow.handle, flow: result.flow, auth_url: result.auth_url,
          verification_url: result.verification_url, user_code: result.user_code,
          expires_in: result.expires_in, poll_interval: result.poll_interval }
      } catch (error) { await release(flow).catch(() => {}); throw error }
      finally { flow.finishStart() }
    },
    async poll(profile, params) {
      const flow = owned(profile, params)
      const result = await api(`/api/providers/oauth/${encodeURIComponent(flow.provider)}/poll/${encodeURIComponent(flow.session)}?wait=25`, { profile, timeoutMs: 45000 })
      ensureCurrent(flow)
      if (result.status !== 'pending') await release(flow, true)
      return result
    },
    async submit(profile, params) {
      const flow = owned(profile, params), code = String(params.code || '').trim()
      if (!code) throw new Error('请输入提供方返回的授权码或回调 URL。')
      const result = await api(`/api/providers/oauth/${encodeURIComponent(flow.provider)}/submit`, {
        profile, method: 'POST', body: { session_id: flow.session, code },
      })
      ensureCurrent(flow)
      if (result.status !== 'pending') await release(flow, true)
      return result
    },
    async cancel(profile, params) { const flow = owned(profile, params); await release(flow); return { ok: true } },
    dispose() {
      if (disposed) return disposal
      disposed = true
      const pending = [...flows.values()]
      disposal = Promise.all(pending.map(async flow => { await release(flow).catch(() => {}); await flow.startDone; await release(flow).catch(() => {}) }))
      stops?.delete(service.dispose)
      return disposal
    },
  }
  stops?.add(service.dispose)
  return service
}
