import React, { useState } from 'react'
import { BotFace } from './bot-avatar.jsx'
import { automaticEyeColor, botBodyColors, botEyeColors, botEyeStyles, botShapes, getBotAppearance } from './bot-appearance.mjs'
import { botPresenceLabels } from './bot-presence.mjs'
import { botPortraits, getPortraitDesign, portraitDesignFields, randomPortraitBatch, resolveBotPortrait } from './bot-portraits.mjs'
import './bot-avatar-picker.css'

function ColorChoices({ label, colors, value, customValue, automatic, onChange }) {
  const isCustom = value != null && !colors.some(([, color]) => color === value)
  return <fieldset className="bot-look-field">
    <legend>{label}</legend>
    <div className="bot-color-choices">
      {automatic && <button type="button" className="bot-color-auto" aria-pressed={value == null}
        onClick={() => onChange(null)}>自动</button>}
      {colors.map(([name, color]) => <button key={color} type="button" className="bot-color-swatch"
        aria-label={name} title={name} aria-pressed={value === color}
        style={{ '--swatch': color }} onClick={() => onChange(color)} />)}
      <label className={'bot-color-custom' + (isCustom ? ' is-selected' : '')} title={'自定义' + label}>
        <input type="color" aria-label={'自定义' + label} value={value ?? customValue}
          onInput={event => onChange(event.currentTarget.value)} />
      </label>
    </div>
  </fieldset>
}

const portraitGroups = [
  ['发型与配饰', ['hair', 'hairColor', 'accessory']],
  ['脸部', ['face', 'skin', 'eyeColor']],
  ['衣服与背景', ['clothing', 'background']],
]
const families = [['character', '几何角色'], ['portrait', '人物头像'], ['photo', '上传图片']]

function PortraitControls({ botId, look, select }) {
  const [panel, setPanel] = useState(look.portraitDesign ? 'custom' : 'presets')
  const [candidates, setCandidates] = useState([])
  const design = getPortraitDesign(look.portrait, look.portraitDesign)
  const person = resolveBotPortrait(look.portrait, design)
  const swatches = {
    skin: person.skin[0], hairColor: person.hair[0], eyeColor: person.eyeColor,
    clothing: person.shirt[0], background: person.background,
  }
  const options = panel === 'random'
    ? candidates.map(candidate => [candidate.hair, portraitDesignFields.hair.options[candidate.hair], candidate])
    : Object.entries(botPortraits).map(([portrait, { label }]) => [portrait, label, undefined])

  return <div className="bot-look-options">
    <div className="bot-portrait-toolbar">
      <div className="bot-portrait-tabs" role="group" aria-label="人物头像编辑方式">
        {[['presets', '预设'], ...(candidates.length ? [['random', '随机候选']] : []), ['custom', '自定义']].map(([key, label]) =>
          <button type="button" key={key} aria-pressed={panel === key} onClick={() => setPanel(key)}>{label}</button>)}
      </div>
      <button type="button" className="secondary" onClick={() => {
        setCandidates(randomPortraitBatch())
        setPanel('random')
      }}>{panel === 'random' ? '换一批' : '随机生成'}</button>
    </div>
    {panel === 'custom' ? <div className="bot-portrait-generator" role="group" aria-label="人物头像组合器">
      {portraitGroups.map(([title, fields]) => <fieldset key={title} className="bot-look-field">
        <legend>{title}</legend>
        <div className="bot-portrait-generator-fields">
          {fields.map(field => {
            const { label, options } = portraitDesignFields[field]
            return <label key={field}>
              <span>{label}{swatches[field] && <i style={{ background: swatches[field] }} aria-hidden="true" />}</span>
              <select value={design[field]} onChange={event => select({ portraitDesign: { ...design, [field]: event.target.value } })}>
                {Object.entries(options).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
          })}
        </div>
      </fieldset>)}
    </div> : <>
      <p className="bot-look-hint" aria-live="polite">{panel === 'random' ? '从这 10 个候选中选一个，再到「自定义」微调。' : '选择一个人物预设，也可以在此基础上自定义。'}</p>
      <div className="bot-shape-grid bot-portrait-grid" role="group" aria-label={panel === 'random' ? '随机头像候选' : '人物头像预设'}>
        {options.map(([portrait, label, candidate]) => <button type="button" key={portrait}
          aria-pressed={look.portrait === portrait && (candidate
            ? Boolean(look.portraitDesign) && Object.entries(candidate).every(([field, value]) => design[field] === value)
            : !look.portraitDesign)}
          onClick={() => select({ portrait, portraitDesign: candidate })}>
          <BotFace bot={{ id: botId, appearance: { mode: 'portrait', portrait, portraitDesign: candidate } }} size="activity" still />
          <span>{label}</span>
        </button>)}
      </div>
    </>}
  </div>
}

export function BotAvatarPicker({ bot, onChange, previewState, onPreviewState, onUpload, onRemovePhoto, pending, error }) {
  const [showEmptyPhoto, setShowEmptyPhoto] = useState(false)
  const look = getBotAppearance(bot)
  const select = patch => onChange({ ...look, ...patch })
  const family = showEmptyPhoto && !bot.avatar ? 'photo' : look.mode

  function selectFamily(mode) {
    setShowEmptyPhoto(mode === 'photo' && !bot.avatar)
    if (mode === 'photo' && !bot.avatar) return
    select(mode === 'portrait' ? { mode, portrait: look.portrait ?? 'amber' } : { mode })
  }

  return <section className="bot-look-picker" aria-label="Bot 头像外观">
    <div className="bot-look-preview">
      <div className="bot-look-preview-stage">
        <strong>实时预览</strong>
        <BotFace bot={bot} state={previewState} size="preview" />
      </div>
      <label className="bot-look-state">头像动效预览<select value={previewState} onChange={event => onPreviewState(event.target.value)}>
        {Object.entries(botPresenceLabels).map(([state, label]) => <option value={state} key={state}>{label}</option>)}
      </select></label>
      <div className="bot-look-list-preview"><BotFace bot={bot} size="small" still /><span>列表尺寸</span></div>
    </div>
    <div className="bot-look-config">
      <div className="bot-look-families" role="group" aria-label="头像系列">
        {families.map(([mode, label]) => <button type="button" key={mode} aria-pressed={family === mode}
          disabled={pending} onClick={() => selectFamily(mode)}>{label}</button>)}
      </div>
      {family === 'photo' && <div className="bot-look-photo">
        <strong>{bot.avatar ? '当前图片' : '选择一张头像图片'}</strong>
        <p className="bot-look-hint">支持 PNG、JPEG 或 WebP，最大 256 KB。</p>
        {!bot.avatar && <p className="bot-look-hint">上传完成后会替换当前头像。</p>}
        <div className="bot-look-photo-actions">
          <label className="secondary bot-look-upload">{pending ? '读取中…' : bot.avatar ? '更换图片' : '选择图片'}
            <input type="file" aria-label="上传头像图片" accept="image/png,image/jpeg,image/webp" disabled={pending} onChange={onUpload} />
          </label>
          {bot.avatar && <button type="button" className="secondary" disabled={pending} onClick={() => {
            setShowEmptyPhoto(true)
            onRemovePhoto()
          }}>移除图片</button>}
        </div>
        {error && <small className="bot-look-error" role="alert">{error}</small>}
      </div>}
      <div hidden={family !== 'portrait'}>
        {look.portrait && <PortraitControls botId={bot.id} look={look} select={select} />}
      </div>
      {family === 'character' && <div className="bot-look-options bot-geometry-options">
        <fieldset className="bot-look-field">
          <legend>角色轮廓</legend>
          <div className="bot-shape-grid">
            {Object.entries(botShapes).map(([shape, { label }]) => <button type="button" key={shape}
              aria-pressed={look.shape === shape} onClick={() => select({ shape })}>
              <BotFace bot={{ id: bot.id, appearance: { ...look, mode: 'character', shape } }} size="activity" still />
              <span>{label}</span>
            </button>)}
          </div>
        </fieldset>
        <div className="bot-geometry-detail">
          <div className="bot-geometry-heading">
            <h3>配色与眼睛</h3>
            <button type="button" className="secondary" onClick={() => {
              const { shape, bodyColor, eyeColor, eyeStyle } = getBotAppearance({ id: bot.id })
              select({ shape, bodyColor, eyeColor, eyeStyle })
            }}>恢复默认几何外观</button>
          </div>
          <ColorChoices label="身体颜色" colors={botBodyColors} value={look.bodyColor} onChange={bodyColor => select({ bodyColor })} />
          <div className="bot-geometry-eyes">
            <ColorChoices label="眼睛颜色" colors={botEyeColors} value={look.eyeColor} customValue={automaticEyeColor(look.bodyColor)}
              automatic onChange={eyeColor => select({ eyeColor })} />
            <label>眼睛形状<select value={look.eyeStyle} onChange={event => select({ eyeStyle: event.target.value })}>
              {Object.entries(botEyeStyles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
          </div>
        </div>
      </div>}
    </div>
  </section>
}
