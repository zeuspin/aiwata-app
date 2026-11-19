import React, { useEffect, useRef, useState } from 'react'
import LiveProviderManager from './live-provider-manager.jsx'
import { Dialog, Empty, Field } from './management-ui.jsx'
import { modelSwitchWarning } from './session-model-warning.mjs'

export default function LiveModelPicker({ chat, live, onSelect, onClose }) {
  const [inventory, setInventory] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [selection, setSelection] = useState(chat.gatewayModelPick ?? null)
  const [confirmation, setConfirmation] = useState(null)
  const [authorization, setAuthorization] = useState(false)
  const [busy, setBusy] = useState(false)
  const initialized = useRef(false)
  const sessionId = chat.gatewayId ?? chat.gatewayStoredId

  useEffect(() => {
    let active = true
    setInventory(null)
    setError('')
    void live.rpc('model.options', { explicit_only: true, ...(sessionId ? { session_id: sessionId } : {}),
      ...(refresh ? { refresh: true } : {}),
    }, chat.gatewayProfile).then(result => {
      if (!active) return
      setInventory(result)
      if (!initialized.current && sessionId && result.model && result.provider) {
        const provider = result.providers.find(row => row.slug === result.provider || row.name === result.provider || row.aliases?.includes(result.provider))
        setSelection({ model: result.model, provider: provider?.slug ?? result.provider })
      }
      initialized.current = true
    }).catch(problem => { if (active) setError(problem.message) })
    return () => { active = false }
  }, [live, chat.id, chat.gatewayProfile, sessionId, refresh])

  const filtered = (inventory?.providers ?? []).map(provider => ({ ...provider,
    models: [...new Set(provider.models ?? [])].filter(model =>
      (provider.name + ' ' + provider.slug + ' ' + model).toLowerCase().includes(query.trim().toLowerCase())),
  })).filter(provider => provider.models.length)
  const selected = selection?.model ?? '跟随档案默认模型'
  if (authorization) return <LiveProviderManager live={live} initialProfile={chat.gatewayProfile} onClose={() => { setAuthorization(false); setRefresh(value => value + 1) }} />
  return <Dialog title="选择会话模型" onClose={onClose} className="live-model-dialog"
    submit={confirmation ? '确认切换' : '使用此模型'} submitDisabled={!inventory || busy} onSubmit={async () => {
      setBusy(true)
      try {
        const result = await onSelect(selection, confirmation)
        if (result.confirmation) {
          setConfirmation(result.confirmation)
          return false
        }
        if (!result.selected) return '网关未确认模型选择。'
      } finally { setBusy(false) }
    }}>
    {confirmation ? <>
      <p>切换到 {selected}</p>
      <p className="model-confirmation">{modelSwitchWarning(confirmation) || 'AIWATA 要求确认这次模型切换。'}</p>
      <button className="secondary management-inline-action" type="button" disabled={busy} onClick={() => setConfirmation(null)}>返回模型列表</button>
    </> : <>
      <p>{sessionId ? '选择会影响这个会话接下来的回复。' : '首次发送时使用所选模型。'}</p>
      <Field label="搜索模型" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
      {error && <p className="management-error" role="alert">{error}</p>}
      {!inventory && !error && <p role="status">正在读取模型清单…</p>}
      <button type="button" className="secondary management-inline-action" disabled={busy}
        onClick={() => setRefresh(value => value + 1)}>刷新模型清单</button>
      <button type="button" className="secondary management-inline-action" onClick={() => setAuthorization(true)}>管理模型授权</button>
      {inventory && <div className="live-model-options" role="group" aria-label="会话模型选项">
        <button type="button" className="menu-row menu-option" aria-pressed={selection === null} disabled={busy}
          onClick={() => setSelection(null)}>跟随档案默认模型</button>
        {filtered.map(provider => <section key={provider.slug}>
          <h3>{provider.name || provider.slug}</h3>
          {provider.warning && <p className="muted">{provider.warning}</p>}
          {provider.models.map(model => {
            const unavailable = provider.authenticated === false || provider.unavailable_models?.includes(model)
            return <button type="button" className="menu-row menu-option" key={model} disabled={unavailable || busy}
              aria-pressed={selection?.model === model && selection?.provider === provider.slug}
              onClick={() => setSelection({ model, provider: provider.slug })}>
              <span>{model}{unavailable && <small>暂不可用</small>}</span>
            </button>
          })}
        </section>)}
        {!filtered.length && <Empty>没有匹配的模型。</Empty>}
      </div>}
    </>}
  </Dialog>
}
