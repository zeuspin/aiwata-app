import React, { useState } from 'react'
import { Dialog, Empty, Field } from './management-ui.jsx'
import { useLiveQuery } from './live-query.jsx'
import { NativeModelOAuthDialog } from './native-model-oauth.jsx'

export function CapabilityProfile({ bots = [], value, onChange, disabled }) {
  return <label className="management-select">配置档
    <select aria-label="配置档" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      <option value="default">默认 Profile</option>
      {bots.filter(bot => bot.profile).map(bot => <option key={bot.profile} value={bot.profile}>{bot.name}</option>)}
    </select>
  </label>
}

export default function LiveProviderManager({ live, bots, initialProfile = 'default', onClose, onChanged }) {
  const [profile, setProfile] = useState(initialProfile || 'default')
  return <ProviderScope key={profile} live={live} profile={profile} onClose={onClose} onChanged={onChanged}
    profileControl={bots && <CapabilityProfile bots={bots} value={profile} onChange={setProfile} />} />
}

function ProviderScope({ live, profile, profileControl, onClose, onChanged }) {
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(null)
  const [disconnecting, setDisconnecting] = useState(null)
  const [query, setQuery] = useState('')
  const [authorizing, setAuthorizing] = useState(null)
  const result = useLiveQuery(live, 'capability', ['model.options', profile, { refresh: true }], revision)
  const oauth = useLiveQuery(live, 'capability', live.native && ['model.oauth.providers', profile], revision)
  const providers = result?.data?.providers ?? []
  const changed = () => { setRevision(value => value + 1); onChanged?.() }
  if (authorizing) return <NativeModelOAuthDialog key={profile + ':' + authorizing.id} live={live} profile={profile} provider={authorizing}
    onClose={() => { setAuthorizing(null); changed() }} onApproved={changed} />
  if (editing) return <Dialog title={'授权 ' + editing.name} onClose={() => setEditing(null)} submit="保存授权" onSubmit={async form => {
    const api_key = String(form.get('api_key') || '').trim()
    if (!api_key) return '请输入 API 密钥。'
    await live.capability('model.save_key', profile, { slug: editing.slug, api_key })
    changed()
  }}>
    <p>密钥保存在当前账号的{profile === 'default' ? '默认 Profile' : ' Bot 配置档'}，不会显示已保存的密钥。</p>
    <Field label="API 密钥" name="api_key" type="password" required autoFocus autoComplete="new-password" maxLength={8192} />
  </Dialog>
  if (disconnecting) return <Dialog title={'断开 ' + disconnecting.name} onClose={() => setDisconnecting(null)} submit="断开授权" danger onSubmit={async () => {
    await live.capability('model.disconnect', profile, { slug: disconnecting.slug })
    changed()
  }}><p>将移除此配置档中该提供方的授权。使用它的会话可能无法继续生成。外部授权来源需在原生来源设置中撤销。</p></Dialog>
  return <Dialog title="模型授权" onClose={onClose} submit={null} className="live-capability-dialog">
    {profileControl}
    <p>为当前配置档连接模型提供方，再回到会话选择模型。</p>
    <Field label="搜索提供方" value={query} onChange={event => setQuery(event.target.value)} />
    <button type="button" className="secondary" onClick={() => changed()}>刷新授权状态</button>
    {result?.error && <p role="alert" className="management-error">{result.error}</p>}
    {oauth?.error && <p role="alert" className="management-error">网页登录状态读取失败：{oauth.error}</p>}
    {!result && <p role="status">正在读取提供方…</p>}
    {live.native && <div className="capability-list">
      {(oauth?.data?.providers ?? []).filter(provider => (provider.name + ' ' + provider.id).toLowerCase().includes(query.toLowerCase())).map(provider => <section key={provider.id} className="capability-card">
        <div><strong>{provider.name}</strong><small>{provider.status?.logged_in ? '已登录原生提供方' : '尚未登录'}</small></div>
        {provider.flow === 'external' ? <p className="muted">此提供方由已有的外部工具管理。{provider.cli_command ? `请使用 ${provider.cli_command} 登录后刷新。` : '请在该工具完成登录后刷新。'}</p>
          : <div className="capability-actions"><button type="button" className="secondary" onClick={() => setAuthorizing(provider)}>{provider.status?.logged_in ? '重新登录' : '网页登录'}</button></div>}
      </section>)}
    </div>}
    <div className="capability-list">
      {providers.filter(provider => (provider.name + ' ' + provider.slug).toLowerCase().includes(query.toLowerCase())).map(provider =>
        <section key={provider.slug} className="capability-card">
          <div><strong>{provider.name}</strong><small>{provider.authenticated ? '已授权' : '未授权'}{provider.is_current ? ' · 当前模型提供方' : ''}</small></div>
          <div className="capability-actions">
            {provider.auth_type === 'api_key' && provider.key_env && <button type="button" className="secondary" onClick={() => setEditing(provider)}>{provider.authenticated ? '更新密钥' : '添加密钥'}</button>}
            {provider.authenticated && !['local', 'virtual'].includes(provider.auth_type) && <button type="button" className="secondary" onClick={() => setDisconnecting(provider)}>断开授权</button>}
          </div>
          {!provider.authenticated && (provider.auth_type !== 'api_key' || !provider.key_env) && !(oauth?.data?.providers ?? []).some(row => row.id === provider.slug) && <p className="muted">此提供方需要外部登录或专用配置，完成原生提供方配置后刷新。</p>}
        </section>)}
      {result?.data && !providers.length && <Empty>AIWATA 没有返回可配置的提供方。</Empty>}
    </div>
  </Dialog>
}
