// Presentation mapping over the existing relay/WhatsApp APIs, scoped to this client.
const encode = encodeURIComponent
export function createNativeMessagingFlows({ api, stops, check = () => {} }) {
  const links = new Map(), pairings = new Map()
  let disposed = false, disposal
  const alive = () => { if (disposed) throw new Error('消息配对所属工作区已关闭。'); check() }
  const owner = (profile, platform) => JSON.stringify([profile || 'default', platform || ''])
  const pairingView = (flow, result) => ({ id: flow.id, status: result.status, qrPayload: result.qr_payload,
    expiresAt: result.expires_at, accountId: result.account_id, accountName: result.account_name,
    accountPhone: result.account_phone, error: result.error, mode: result.mode, allowedUsers: result.allowed_users })
  async function cancelPairing(flow) {
    flow.closed = true; pairings.delete(flow.id)
    if (flow.nativeId && !flow.canceled && !flow.applied) {
      flow.canceled = true
      await api('/api/messaging/whatsapp/onboarding/' + encode(flow.nativeId), { profile: flow.profile, method: 'DELETE' })
    }
  }
  const ownPairing = (profile, id) => {
    const flow = pairings.get(id)
    if (!flow || flow.closed || flow.profile !== profile) throw new Error('WhatsApp 配对对象或归属已变化。')
    return flow
  }
  const service = {
    async call(action, profile, params = {}) {
      alive()
      const options = { profile }, platform = params.platform
      if (action === 'relayRead') {
        const result = await api('/api/messaging/relay', options); alive()
        const row = result.platforms?.find(row => row.platform === platform)
        return { managedBy: result.managed_by || 'connector', portalUrl: result.portal_url, botUrl: row?.bot_url,
          accounts: (row?.accounts || []).map(account => ({ id: account.platformUserId, displayName: account.displayName, handle: account.handle })) }
      }
      if (action === 'relayStart') {
        const result = await api('/api/messaging/relay/' + encode(platform) + '/link', { ...options, method: 'POST' }); alive()
        if (!result.code || !result.command) throw new Error('原生网关未返回绑定命令。')
        const id = crypto.randomUUID(); links.set(id, { owner: owner(profile, platform), code: result.code })
        return { id, command: result.command, expiresAt: result.expires_at, botUrl: result.bot_url }
      }
      if (action === 'relayStatus' || action === 'relayDismiss') {
        const flow = links.get(params.id)
        if (!flow && action === 'relayDismiss') return { ok: true }
        if (!flow || flow.owner !== owner(profile, platform)) throw new Error('共享 Bot 绑定对象或归属已变化。')
        if (action === 'relayDismiss') { links.delete(params.id); return { ok: true } }
        const result = await api('/api/messaging/relay/link/' + encode(flow.code), options); alive()
        if (result.state !== 'pending') links.delete(params.id)
        return result
      }
      if (action === 'relayUnlink') return api(`/api/messaging/relay/${encode(platform)}/accounts/${encode(params.id)}`, { ...options, method: 'DELETE' })
      if (action === 'whatsappStart') {
        const flow = { id: crypto.randomUUID(), profile, closed: false }
        flow.startDone = new Promise(resolve => { flow.finishStart = resolve }); pairings.set(flow.id, flow)
        try {
          const result = await api('/api/messaging/whatsapp/onboarding/start', { ...options, method: 'POST', body: {
            mode: params.mode || 'bot', allowed_users: params.allowedUsers || '', reset_session: Boolean(params.resetSession), profile,
          } })
          flow.nativeId = result.pairing_id; alive()
          if (flow.closed) throw new Error('WhatsApp 配对已取消。')
          if (!flow.nativeId) throw new Error('原生网关未返回 WhatsApp 配对身份。')
          return pairingView(flow, result)
        } catch (error) { await cancelPairing(flow).catch(() => {}); throw error }
        finally { flow.finishStart() }
      }
      const flow = ownPairing(profile, params.id), path = '/api/messaging/whatsapp/onboarding/' + encode(flow.nativeId)
      if (action === 'whatsappCancel') { await cancelPairing(flow); return { ok: true } }
      if (action === 'whatsappStatus') {
        const result = await api(path, options); alive()
        if (flow.closed) throw new Error('WhatsApp 配对已取消。')
        return pairingView(flow, result)
      }
      if (action === 'whatsappApply') {
        const result = await api(path + '/apply', { ...options, method: 'POST', body: { mode: params.mode || 'bot', allowed_users: params.allowedUsers || '', profile } })
        alive()
        if (flow.closed) throw new Error('WhatsApp 配对已取消。')
        if (result.ok === false) throw new Error(result.error || 'WhatsApp 配置未保存。')
        flow.applied = true; pairings.delete(flow.id)
        return result
      }
      throw new Error('原生消息配对操作不可用。')
    },
    dispose() {
      if (disposed) return disposal
      disposed = true; links.clear()
      disposal = Promise.all([...pairings.values()].map(async flow => {
        await cancelPairing(flow).catch(() => {}); await flow.startDone; await cancelPairing(flow).catch(() => {})
      }))
      stops?.delete(service.dispose); return disposal
    },
  }
  stops?.add(service.dispose)
  return service
}
