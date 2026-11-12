import React, { useState } from 'react'
import { Dialog, Field } from './management-ui.jsx'
import { useLiveQuery } from './live-query.jsx'
import { blueprintInitialValues } from './native-cron.mjs'

export function NativeCronModelField({ live, profile, model, provider }) {
  const options = useLiveQuery(live, 'capability', ['model.options', profile, { refresh: true }], profile)
  const [choice, setChoice] = useState(model ? JSON.stringify([provider || '', model]) : '')
  const providers = (options?.data?.providers || []).filter(row => row.authenticated !== false)
  const known = !choice || providers.some(row => (row.models || []).some(model => JSON.stringify([row.slug, model]) === choice))
  return <>
    <label>任务模型<select name="modelChoice" value={choice} onChange={event => setChoice(event.target.value)}>
      <option value="">运行时跟随 Profile 默认模型</option>
      {!known && <option value={choice}>{model} · 当前保存的模型</option>}
      {providers.map(row => <optgroup key={row.slug} label={row.name || row.slug}>
        {(row.models || []).map(model => <option key={model} value={JSON.stringify([row.slug, model])}>{model}</option>)}
      </optgroup>)}
    </select></label>
    {options?.error && <small role="alert">无法读取模型目录：{options.error}。当前保存的模型仍会保留。</small>}
  </>
}

export function NativeTaskBlueprintDialog({ live, profile, blueprint, targets, rooms, onClose, onCreated }) {
  const [values, setValues] = useState(() => blueprintInitialValues(blueprint))
  const set = (field, value) => setValues(previous => ({ ...previous, [field]: value }))
  const deliveryValid = !blueprint.fields.some(field => field.name === 'deliver') || values.deliver === 'local'
    || rooms.some(room => room.value === values.deliver) || targets.some(row => row.configured && row.id === values.deliver)
  return <Dialog title={blueprint.title} onClose={onClose} submit="创建模板任务" submitDisabled={!deliveryValid} onSubmit={async () => {
    await live.task('blueprint-create', { profile, blueprint: blueprint.key, values })
    await onCreated()
  }}>
    <p>{blueprint.description}</p><p>所属 Profile：{profile}；模板与任务都使用此 Profile 的原生目录。</p>
    {blueprint.fields.map(field => field.name === 'deliver'
      ? <label key={field.name}>{field.label}<select value={values[field.name]} onChange={event => set(field.name, event.target.value)}>
        <option value="local">仅保存到此桌面</option>
        {rooms.map(room => <option key={room.value} value={room.value}>{room.name}</option>)}
        {targets.filter(row => row.configured).map(row => <option key={row.id} value={row.id}>{row.name || row.id}</option>)}
      </select></label>
      : ['enum', 'weekdays'].includes(field.type) && field.strict !== false
        ? <label key={field.name}>{field.label}<select value={values[field.name]} required={!field.optional} onChange={event => set(field.name, event.target.value)}>
          <option value="">{field.optional ? '未设置' : '请选择'}</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>{field.help && <small>{field.help}</small>}</label>
        : <Field key={field.name} label={field.label} type={field.type === 'time' ? 'time' : 'text'} value={values[field.name]} required={!field.optional}
          placeholder={field.help || ''} onChange={event => set(field.name, event.target.value)} />)}
  </Dialog>
}
