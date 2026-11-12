import React, { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from './live-query.jsx'

export function catalogBotModel(choice) {
  if (!choice.startsWith('catalog:')) return null
  try {
    const [provider, model] = JSON.parse(choice.slice(8))
    return typeof provider === 'string' && typeof model === 'string' ? { provider, model } : null
  } catch { return null }
}

export function NativeBotModelField({ live, profile, choice, onChange, currentModel }) {
  const result = useLiveQuery(live, 'capability', ['model.options', profile, { refresh: true }], profile)
  return <label>模型<select value={choice} onChange={event => onChange(event.target.value)}>
    <option value="" disabled={Boolean(currentModel)}>工作区默认模型</option>
    {currentModel && <option value="existing">{currentModel} · 当前配置</option>}
    {(result?.data?.providers ?? []).map(provider => <optgroup key={provider.slug} label={provider.name || provider.slug}>
      {[...new Set(provider.models ?? [])].map(model => <option key={model} value={'catalog:' + JSON.stringify([provider.slug, model])} disabled={provider.authenticated === false}>
        {model}{provider.authenticated === false ? '（需先授权）' : ''}
      </option>)}
    </optgroup>)}
    <option value="custom">自定义模型</option>
  </select>
    {!result && <small role="status">正在读取此 Profile 的原生模型目录…</small>}
    {result?.error && <small role="alert">模型目录读取失败：{result.error}；仍可保留当前配置或手动填写。</small>}
  </label>
}

// Full native controls stay outside the staged editor so immediate native writes
// cannot be silently replaced by stale checkbox state when Save is pressed.
export function NativeBotControls({ live, bot, report }) {
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  useEffect(() => { generation.current++; return () => { generation.current++ } }, [live, bot.profile])
  if (!live?.native || !live.openNativeSurface) return null
  const open = async surface => {
    if (busy) return
    const attempt = generation.current
    setBusy(true)
    try { await live.openNativeSurface(surface, bot.profile) }
    catch (error) { if (attempt === generation.current) report(error.message, true) }
    finally { if (attempt === generation.current) setBusy(false) }
  }
  return <div className="bot-profile-links" aria-label={bot.name + '的完整原生配置'}>
    <button type="button" className="secondary" disabled={busy} onClick={() => void open('capabilities')}>完整技能、工具与 MCP 配置</button>
    <button type="button" className="secondary" disabled={busy} onClick={() => void open('settings')}>模型授权与高级设置</button>
  </div>
}
