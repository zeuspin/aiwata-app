
import React, { useEffect, useId, useRef, useState } from 'react'
import { Empty } from './management-ui.jsx'
import { gatewayGroup } from './live-room-state.mjs'
import './bot-settings-content.css'

export function InlineSettingsForm({ children, onSubmit, submit = '保存', submitDisabled, dirtyToken, onDirtyChange, onBusyChange, showActions = true, afterForm }) {

  const id = useId()
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const baseline = useRef(dirtyToken)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { if (dirtyToken !== baseline.current) setDirty(true) }, [dirtyToken])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => { onBusyChange?.(saving) }, [saving, onBusyChange])
  return <div className="bot-settings-inline">
    <form id={id} onChange={() => setDirty(true)} onSubmit={async event => {
      event.preventDefault()
      if (saving || submitDisabled) return
      setSaving(true)
      try {
        const problem = await onSubmit(new FormData(event.currentTarget))
        if (!active.current) return
        if (problem === false) setError('')
        else if (problem) setError(typeof problem === 'string' ? problem : problem.message || '保存未完成，请重试。')
        else { baseline.current = dirtyToken; setDirty(false); setError('') }
      } catch (problem) { if (active.current) setError(problem.message) }
      finally { if (active.current) setSaving(false) }
    }}>
      <fieldset className="bot-settings-fields" disabled={saving}>{children}</fieldset>
    </form>
    {afterForm}
    {error && <p role="alert" className="management-error">{error}</p>}
    {(showActions || dirty || saving) && <footer className="bot-settings-save">
      <small role="status">{saving ? "正在保存…" : dirty ? "有未保存的修改" : "修改后保存，仅影响当前配置"}</small>
      <button form={id} className="primary" disabled={saving || submitDisabled || !dirty}>{saving ? "保存中…" : submit}</button>
    </footer>}
  </div>
}

export function BotSettingsContent({ item, kind, record, management, live, Editor, GroupEditor, onSave, onDirtyChange, onBusyChange, onOpenProfileSection, onOpenNativeSettings, report }) {

  const [snapshot, setSnapshot] = useState(live ? null : {item, version: 0})
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  const callbacks = useRef({onBusyChange, onDirtyChange})
  callbacks.current = {onBusyChange, onDirtyChange}
  async function load() {
    const latest = (kind === 'bot' ? record.bots : record.groups).find(entry => entry.id === item.id) ?? item
    if (!live) return {item: latest}
    if (kind === 'bot') {
      const details = await live.botDetails(latest.profile)
      return {details, item: {...latest, soul: details.soul, description: details.description, model: details.model.default, provider: details.model.provider}}
    }
    const state = await live.room('groups.state', {room_id: latest.id})
    return {item: {...latest, ...gatewayGroup(state.room, state.context, state.driver_status, latest)}}
  }
  useEffect(() => {
    const token = ++generation.current
    setError('')
    void load().then(result => { if (token === generation.current) setSnapshot({...result, version: token}) })
      .catch(problem => { if (token === generation.current) setError(problem.message) })

    return () => { generation.current++; callbacks.current.onBusyChange?.(false); callbacks.current.onDirtyChange?.(false) }
  }, [item.id, live, attempt])
  async function save(settings, options) {
    const token = generation.current
    const result = await onSave(settings, options, snapshot.item)
    if (result || token !== generation.current) return result
    callbacks.current.onDirtyChange?.(false)
    try {
      const next = await load()
      if (token === generation.current) setSnapshot({...next, version: snapshot.version + 1})
    } catch (problem) {
      if (token === generation.current) { setSnapshot(null); setError('已保存，但重新读取设置失败：' + problem.message) }
    } finally { if (token === generation.current) callbacks.current.onBusyChange?.(false) }
  }
  if (error) return <div className="bot-settings-inline"><p role="alert" className="management-error">{error}</p><button className="secondary" onClick={() => setAttempt(value => value + 1)}>{"重新读取设置"}</button></div>
  if (!snapshot) return <Empty>正在读取当前{kind === 'bot' ? ' Bot' : '群聊'}设置…</Empty>
  const shared = {key: snapshot.version, item: snapshot.item, live, embedded: true, onSave: save, onDirtyChange, onBusyChange}
  return <><p className="bot-settings-scope">{live ? "本机 AIWATA" : "本地演示"} · {item.name}{kind === 'bot' ? ' 的独立配置' : ' 的群聊配置'}</p>
    {kind === 'bot' ? <Editor {...shared} bots={record.bots} management={management} details={snapshot.details} report={report}
      onOpenProfileSection={onOpenProfileSection} onOpenNativeSettings={onOpenNativeSettings} />
      : <GroupEditor {...shared} bots={[...record.bots, ...(snapshot.item.memberDetails ?? []).filter(member => !record.bots.some(bot => bot.id === member.id))]} />}
  </>
}
