import React, { useEffect, useRef, useState } from 'react'
import LiveRelay from './live-relay.jsx'
import { NativeWhatsAppSetup } from './native-whatsapp.jsx'
import { defaultProfile, platforms } from './management.mjs'
import { Badge, Confirm, Dialog, Empty, Entry, Field, Frame, Panel, Profiles, dateLabel, valueOf } from './management-ui.jsx'

const stateLabels = {
  connected: '已连接', connecting: '连接中', reconnecting: '重连中',
  disabled: '已停用', not_configured: '待配置', pending_restart: '待应用',
  gateway_stopped: '网关未运行', startup_failed: '启动失败', fatal: '连接失败',
  failed: '连接失败', error: '连接异常', disconnected: '已断开',
}
const stateLabel = state => stateLabels[state] ?? '等待网关状态'
// Platform identity/schema comes from the original gateway, not this UI catalog.
const knownPlatform = id => Object.hasOwn(platforms,id) ? platforms[id] : null
const platformFor = item => ({ name:item.name || knownPlatform(item.id)?.name || item.id,icon:knownPlatform(item.id)?.icon || 'link' })
const inlineSetup = item => Boolean(knownPlatform(item.id)) || item.id==='whatsapp' || item.fields.length>0

export function ConnectorRestartImpact({ plan }) {
  if (!plan) return <p role="status">正在检查网关与共享 Profile 的影响范围…</p>
  return <>
    {plan.sharedProfiles.length > 1
      ? <p>此连接使用共享网关。重启会暂时中断以下全部 Profile：<strong>{plan.sharedProfiles.join('、')}</strong>。</p>
      : <p>重启将暂时中断此网关的连接和运行中的工作。</p>}
    <p>确认后由原生 AIWATA 执行重启并检查结果。请先等待工作结束，或确认可以中断；配置和会话数据会保留。</p>
  </>
}

function NativeConnectorApplyDialog({ live, profile, onClose, onApplied }) {
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const [revision, retry] = useState(0)
  const owner = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    owner.current = controller
    setPlan(null); setError('')
    live.connector('apply-plan', profile).then(result => {
      if (!controller.signal.aborted) setPlan(result)
    }, problem => { if (!controller.signal.aborted) setError(problem.message) })
    return () => controller.abort()
  }, [live, profile, revision])
  return <Dialog title="应用网关配置并重启？" onClose={onClose} submit="确认重启" submitDisabled={!plan || Boolean(error)} onSubmit={async () => {
    const controller = owner.current
    if (!plan || !controller || controller.signal.aborted) return false
    try {
      await live.connector('apply', profile, { confirmationKey: plan.confirmationKey, signal: controller.signal })
      if (controller.signal.aborted) return false
      onApplied()
    } catch (problem) {
      if (controller.signal.aborted) return false
      setPlan(null); setError(problem.message)
      return false
    }
  }}>
    <ConnectorRestartImpact plan={plan} />
    {error && <><p role="alert" className="management-error">{error}</p>
      <button type="button" className="secondary" onClick={() => retry(value => value + 1)}>重新检查影响范围</button></>}
  </Dialog>
}

function TelegramSetup({ live, profile, item, onClose, onApplied }) {
  const [setup, setSetup] = useState(null)
  const [ready, setReady] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [copyState, setCopyState] = useState('')
  const active = useRef(false)
  const pairing = useRef(null)
  const closePairing = id => live.connector('telegramCancel', profile, { id }).catch(() => {})

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      if (pairing.current) void live.connector('telegramCancel', profile, { id: pairing.current }).catch(() => {})
    }
  }, [live, profile])

  useEffect(() => {
    if (!setup) return
    let cancelled = false
    let pollTimer
    const expire = () => {
      cancelled = true
      pairing.current = null
      setSetup(null)
      setReady(null)
      setError('配对已过期，请重新生成二维码。')
    }
    const expiry = setTimeout(expire, Math.max(0, Date.parse(setup.expiresAt) - Date.now()))
    async function poll() {
      try {
        const result = await live.connector('telegramStatus', profile, { id: setup.id })
        if (cancelled) return
        if (result.status === 'expired') return expire()
        setError('')
        if (result.status === 'ready') return setReady(result)
      } catch (problem) {
        if (cancelled) return
        setError(problem.message)
      }
      pollTimer = setTimeout(poll, 2500)
    }
    if (!ready) pollTimer = setTimeout(poll, 1500)
    return () => { cancelled = true; clearTimeout(expiry); clearTimeout(pollTimer) }
  }, [live, profile, setup, ready])

  async function start() {
    setStarting(true)
    setError('')
    setCopyState('')
    try {
      const { toDataURL } = await import('qrcode')
      if (!active.current) return
      const result = await live.connector('telegramStart', profile)
      if (!active.current) return void closePairing(result.id)
      pairing.current = result.id
      const qr = await toDataURL(result.deepLink, { errorCorrectionLevel: 'M', margin: 3, width: 224 })
      if (active.current) setSetup({ ...result, qr })
    } catch (problem) {
      if (active.current) setError(problem.message)
    } finally {
      if (active.current) setStarting(false)
    }
  }

  return <Dialog title="Telegram 扫码配置" onClose={onClose} submit="保存配置" submitDisabled={!ready} onSubmit={async form => {
    if (!setup || !ready) return '请先在 Telegram 中确认。'
    const allowedUserIds = [...new Set(valueOf(form, 'allowedIds').split(/[,，\s]+/).filter(Boolean))]
    if (!allowedUserIds.length || allowedUserIds.length > 30 || allowedUserIds.some(id => !/^[0-9]{3,20}$/.test(id))) {
      return '请输入 1 到 30 个有效的 Telegram 用户 ID。'
    }
    const result = await live.connector('telegramApply', profile, { id: setup.id, allowedUserIds })
    pairing.current = null
    await onApplied(result)
  }}>
    {item.configured && <p>保存后会替换此 Profile 的 Telegram Bot 和允许用户列表。</p>}
    {ready ? <>
      <p role="status">{ready.username ? '@' + ready.username + ' 已确认。' : '已在 Telegram 中确认。'}</p>
      <Field label="允许使用的 Telegram 用户 ID" name="allowedIds" defaultValue={ready.ownerId ?? ''}
        placeholder="多个 ID 可用逗号分隔" maxLength={630} required />
      <small>只有这里列出的用户可以使用这个 Bot。</small>
    </> : setup ? <div className="connector-telegram-qr">
      <img src={setup.qr} width="224" height="224" alt="Telegram Bot 配对二维码" />
      <small role="status">用手机扫码，在 Telegram 中确认创建 Bot。</small>
      {window.aiwataPreview ? <>
        <button type="button" className="secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(setup.deepLink); setCopyState('copied') }
          catch { setCopyState('manual') }
        }}>复制 Telegram 链接</button>
        {copyState === 'copied' && <small role="status">链接已复制。</small>}
        {copyState === 'manual' && <Field label="Telegram 链接" value={setup.deepLink} readOnly onFocus={event => event.target.select()} />}
      </> : <a href={setup.deepLink} target="_blank" rel="noreferrer">在 Telegram 中打开</a>}
    </div> : <>
      <p>在 Telegram 中确认创建 Bot，回到这里核对允许使用的账号。</p>
      <button type="button" className="secondary management-inline-action" disabled={starting} onClick={() => void start()}>
        {starting ? '正在生成二维码…' : '生成二维码'}
      </button>
    </>}
    {error && <p role="alert" className="management-error">{error}</p>}
  </Dialog>
}

function ConnectorSetup({ item, onClose, onSave }) {
  const name = platformFor(item).name
  return <Dialog title={'配置 ' + name} onClose={onClose} onSubmit={form => {
    const env = {}
    const clear = []
    for (const field of item.fields) {
      const value = valueOf(form, field.key)
      if (form.has('clear:' + field.key)) {
        if (value && value !== field.value) return field.label + '不能同时替换和清除。'
        clear.push(field.key)
      } else if (value && value !== field.value) env[field.key] = value
    }
    const enabled = form.has('enabled')
    if (enabled !== item.enabled || clear.length || Object.keys(env).length) return onSave({ enabled, env, clear })
  }}>
    <label className="management-check"><input name="enabled" type="checkbox" defaultChecked={item.enabled} />启用连接器</label>
    <small>输入新值可替换已保存的配置。留空会保留现有值。</small>
    {item.fields.map(field => <div key={field.key} className="connector-field">
      <Field label={field.label + (field.required ? '（必需）' : '')} name={field.key}
        type={field.secret ? 'password' : 'text'} defaultValue={field.value ?? ''} maxLength={4096}
        placeholder={field.isSet && !field.value ? '已保存，输入新值可替换' : undefined}
        autoComplete={field.secret ? 'new-password' : 'off'} />
      {field.isSet && <label className="management-check">
        <input type="checkbox" name={'clear:' + field.key} />清除已保存的值
      </label>}
    </div>)}
  </Dialog>
}

export default function LiveConnectors({ record, selected, profile, setProfile, live, report, openGroups, onGroupOpenChange }) {
  const [snapshot, setSnapshot] = useState(null)
  const [revision, reload] = useState(0)
  const [dialog, setDialog] = useState(null)
  const [checking, setChecking] = useState('')
  const nativeProfile = profile === defaultProfile ? profile : record.bots.find(bot => bot.id === profile)?.profile
  const current = useRef(nativeProfile)
  const mounted = useRef(false)
  const currentLive = useRef(live)
  currentLive.current = live
  current.current = nativeProfile
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const data = snapshot?.profile === nativeProfile ? snapshot : null
  const refresh = () => reload(value => value + 1)
  const close = () => setDialog(null)

  useEffect(() => {
    let active = true
    void live.connector('read', nativeProfile).then(result => {
      if (active) setSnapshot({ profile: nativeProfile, items: result.platforms })
    }).catch(error => { if (active) setSnapshot({ profile: nativeProfile, error: error.message }) })
    return () => { active = false }
  }, [live, nativeProfile, revision])

  async function change(action, params) {
    const result = await live.connector(action, nativeProfile, params)
    if (current.current === nativeProfile) refresh()
    return result
  }

  async function pairingApplied(result, label) {
    if (live.native && result.restart_started) {
      try {
        await live.connector('watch-restart', nativeProfile)
        if (mounted.current && current.current === nativeProfile) report(label + '已保存，原生网关重启操作已完成')
      } catch (error) {
        if (mounted.current && current.current === nativeProfile) report(label + '已保存，但网关重启未确认：' + error.message, true)
      }
    } else if (mounted.current && current.current === nativeProfile) report(result.hot_served ? label + '已保存并交给网关'
      : label + '已保存，请应用网关配置' + (result.restart_error ? '：' + result.restart_error : ''), Boolean(result.restart_error))
    if (mounted.current && current.current === nativeProfile) refresh()
  }

  async function openMessaging() {
    try {
      if (!live.openNativeSurface) throw new Error('原生消息连接器入口暂不可用。')
      await live.openNativeSurface('messaging', nativeProfile)
    } catch (error) {
      if (mounted.current && currentLive.current===live && current.current===nativeProfile) report(error.message,true)
    }
  }

  async function test(item) {
    setChecking(item.id)
    try {
      const result = await change('test', { platform: item.id })
      if (current.current === nativeProfile) report('连接检查 · ' + stateLabel(result.state), !result.ok)
    } catch (error) {
      if (current.current === nativeProfile) report(error.message, true)
    } finally { setChecking('') }
  }

  const items = (data?.items ?? []).filter(item => !selected || selected === 'all' || item.id === selected)
  return <Frame live icon="link" title="消息连接器" description="按 Profile 管理消息平台凭据、连接状态和配对用户。"
    actions={<>
      <Profiles bots={record.bots} label="管理 Profile" value={profile} onChange={event => { close(); setProfile(event.target.value) }} />
      <button className="secondary" onClick={refresh}>刷新</button>
    </>}>
    {data?.error && <p className="management-error" role="alert">{data.error}</p>}
    {!data && <Empty>正在读取连接器状态…</Empty>}
    {data?.items && <Panel title="消息平台" description="连接检查读取 AIWATA 网关状态。"
      actions={<button className="secondary" onClick={() => setDialog({ kind: 'apply' })}>应用网关配置</button>}>
      {items.length ? items.map(item => {
        const platform = platformFor(item)
        const group = JSON.stringify([profile, item.id])
        const logOpen = openGroups?.[group] ?? selected === item.id
        const subtitle = item.relayFronted ? '共享 Bot' : item.running ? '网关运行中' : '网关未运行'
        return <div key={item.id} className="management-connector">
          <Entry icon={platform.icon} title={platform.name} subtitle={subtitle}>
            <Badge tone={item.needsApply ? 'warning' : item.state === 'connected' ? 'positive' : ''}>
              {item.relay ? '由 Team Gateway 管理' : item.needsApply ? '配置待应用' : stateLabel(item.state)}
            </Badge>
            {item.relayFronted && <button className="secondary" onClick={() => setDialog({ kind: 'relay', item, profile: nativeProfile })}>
              管理共享 Bot 绑定
            </button>}
            {item.id === 'telegram' && !item.relay && <button className="secondary"
              onClick={() => setDialog({ kind: 'telegram', item, profile: nativeProfile })}>扫码配置</button>}
            {!item.relay && inlineSetup(item) && <button className="secondary" onClick={() => setDialog({ kind: 'edit', item })}>配置</button>}
            {live.native && !knownPlatform(item.id) && <button className="secondary" onClick={()=>void openMessaging()}>打开原生消息连接器</button>}
            {!item.relay && <button className="secondary" disabled={!!checking} onClick={() => void test(item)}>
              {checking === item.id ? '检查中…' : '测试连接'}
            </button>}
            {live.native && item.id === 'whatsapp' && !item.relay && <button className="secondary"
              onClick={() => setDialog({ kind: 'whatsapp', item, profile: nativeProfile })}>扫码配置</button>}
          </Entry>
          {!inlineSetup(item) && <p className="muted">此平台的完整配置在原生消息连接器中管理；打开后选择此平台。</p>}
          {(item.pending.length > 0 || item.approved.length > 0) && <details className="management-history">
            <summary>配对用户 <span>{item.pending.length} 待批准 · {item.approved.length} 已授权</span></summary>
            {item.pending.map(row => <Entry key={row.request_id || row.user_id} title={row.user_name || row.user_id} subtitle={row.user_id}>
              <button className="secondary" disabled={!row.request_id} onClick={() => setDialog({ kind: 'approve', item, row })}>批准配对</button>
            </Entry>)}
            {item.approved.map(row => <Entry key={row.user_id} title={row.user_name || row.user_id} subtitle={row.user_id}>
              <button className="secondary" onClick={() => setDialog({ kind: 'revoke', item, row })}>撤销授权</button>
            </Entry>)}
          </details>}
          <details className="management-history" open={logOpen}>
            <summary onClick={event => {
              event.preventDefault()
              onGroupOpenChange(group, !logOpen)
            }}>连接检查记录 <span>{item.logs.length}</span></summary>
            {item.logs.length ? item.logs.map((row, index) => <Entry key={row.time + ':' + index} title={stateLabel(row.state)} subtitle={dateLabel(row.time)}>
              <Badge tone={row.ok && row.authPosture !== 'deny_all' ? 'positive' : 'warning'}>
                {row.ok ? row.authPosture === 'deny_all' ? '待授权' : '通过' : '待处理'}
              </Badge>
            </Entry>) : <Empty>暂无检查记录。</Empty>}
          </details>
        </div>
      }) : <Empty>请选择一个消息平台。</Empty>}
    </Panel>}
    {dialog?.kind === 'relay' && dialog.profile === nativeProfile && <LiveRelay live={live} profile={nativeProfile}
      platform={dialog.item.id} name={platformFor(dialog.item).name} onClose={close} />}
    {dialog?.kind === 'telegram' && dialog.profile === nativeProfile && <TelegramSetup live={live} profile={nativeProfile}
      item={dialog.item} onClose={close} onApplied={result => pairingApplied(result, 'Telegram ')} />}
    {dialog?.kind === 'whatsapp' && dialog.profile === nativeProfile && <NativeWhatsAppSetup key={nativeProfile} live={live} profile={nativeProfile}
      configured={dialog.item.configured} onClose={close} onApplied={result => pairingApplied(result, 'WhatsApp ')} />}
    {dialog?.kind === 'edit' && <ConnectorSetup item={dialog.item} onClose={close} onSave={async patch => {
      const result = await change('save', { platform: dialog.item.id, ...patch })
      report(result.hot_served ? '连接器配置已保存并交给网关' : '配置已保存，可以应用到网关')
    }} />}
    {dialog?.kind === 'apply' && live.native && <NativeConnectorApplyDialog key={nativeProfile} live={live} profile={nativeProfile} onClose={close}
      onApplied={() => { refresh(); report('网关重启操作已完成，连接状态会继续刷新') }} />}
    {dialog?.kind === 'apply' && !live.native && <Dialog title="应用此 Profile 的网关配置？" onClose={close} submit="应用配置" onSubmit={async () => {
      await change('apply')
      report('网关已重新加载配置')
    }}><p>{nativeProfile === defaultProfile && live.executionMode === 'native'
      ? 'AIWATA 会重启当前账号的网关，工作台随后自动重连。若账号有任务正在运行，请等任务结束后再试。'
      : 'AIWATA 会重新加载所选 Profile 的连接。若网关正在处理任务，请等任务结束后再试。'}</p></Dialog>}
    {dialog?.kind === 'approve' && <Dialog title="批准配对？" onClose={close} submit="批准配对" onSubmit={async () => {
      await change('approve', { platform: dialog.item.id, id: dialog.row.request_id })
      report('已授权配对用户')
    }}><p>允许 {dialog.row.user_name || dialog.row.user_id} 通过 {platformFor(dialog.item).name} 使用此 Profile 的 Bot。</p></Dialog>}
    {dialog?.kind === 'revoke' && <Confirm title="撤销配对授权？" onClose={close} submit="撤销授权" onConfirm={async () => {
      await change('revoke', { platform: dialog.item.id, id: dialog.row.user_id })
      report('已撤销配对授权')
    }}>将撤销 {dialog.row.user_name || dialog.row.user_id} 的配对授权，并更新此 Profile 的允许用户列表。</Confirm>}
  </Frame>
}
