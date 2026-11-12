// Same restart REST/action contract as the original desktop's system-actions.
// No process launcher or alternate gateway owner is introduced here.
export async function connectorApplyPlan(api, profile) {
  const status = await api('/api/status', { profile })
  const profiles = Array.isArray(status.gateway_shared_with)
    ? [...new Set(status.gateway_shared_with.map(name => String(name).trim()).filter(Boolean))]
    : []
  const sharedProfiles = profiles.length > 1
    ? profiles.sort((a, b) => a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)) : []
  return { profile, sharedProfiles, confirmationKey: JSON.stringify([profile, sharedProfiles]) }
}

export async function applyNativeConnectorConfiguration(api, profile, { confirmationKey, signal } = {},
  pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {
  signal?.throwIfAborted()
  if (!confirmationKey) throw new Error('请先查看网关影响范围并确认重启。')
  const plan = await connectorApplyPlan(api, profile)
  signal?.throwIfAborted()
  if (plan.confirmationKey !== confirmationKey) throw new Error('网关共享范围已变化，请重新打开确认。')
  const started = await api('/api/gateway/restart', { profile, method: 'POST' })
  signal?.throwIfAborted()
  if (started.ok !== true || started.name !== 'gateway-restart') throw new Error(started.error || '网关未确认启动重启操作。')
  await watchNativeConnectorRestart(api, profile, signal, pause)
  return { ok: true, sharedProfiles: plan.sharedProfiles }
}

export async function watchNativeConnectorRestart(api, profile, signal,
  pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {
  let answered = false, lastError
  for (let attempt = 0; attempt < 18; attempt++) {
    await pause(1200)
    signal?.throwIfAborted()
    let status
    try { status = await api('/api/actions/gateway-restart/status?lines=200', { profile }) }
    catch (error) { lastError = error; continue }
    signal?.throwIfAborted()
    answered = true
    // A replacement process has no in-memory action registry. The original
    // client keeps polling this healthy intermediate answer through the window.
    if (!status.running && status.exit_code == null) continue
    if (!status.running) {
      if (status.exit_code !== 0) throw new Error('网关重启失败，请检查原生诊断后重试。')
      return { ok: true }
    }
  }
  if (!answered) throw lastError || new Error('网关重启后未恢复响应。')
  // No-service installations keep their foreground gateway action alive.
  return { ok: true }
}
