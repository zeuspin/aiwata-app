import React, { useState } from 'react'
import { BotFace } from './bot-avatar.jsx'
import { canWearHeadwear, getPeekingDesign, peekingFields, peekingHair, peekingHeadwear,
  peekingPalettes, peekingPresets, randomPeekingBatch, updatePeekingDesign } from './bot-peeking.mjs'

const equal = (a, b) => Object.keys(peekingFields).every(field => a[field] === b[field])

function Lock({ field, locked, toggle }) {
  const selected = locked.includes(field)
  return <button type="button" className="bot-part-lock" aria-label={(selected ? '解锁' : '锁定') + peekingFields[field].label}
    aria-pressed={selected} onClick={() => toggle(field)}>{selected ? '已锁定' : '锁定'}</button>
}

function PartCatalog({ field, design, botId, locked, change, toggle }) {
  const [group, setGroup] = useState('全部')
  const options = peekingFields[field].options
  const groups = ['全部', ...new Set(Object.values(options).map(item => item.group))]
  const isHair = field === 'hair'
  return <fieldset className="bot-look-field bot-part-catalog">
    <legend>{peekingFields[field].label} <small>{Object.keys(options).length - (isHair ? 0 : 1)} 种</small></legend>
    <div className="bot-part-catalog-toolbar">
      <div className="bot-part-groups" role="group" aria-label={peekingFields[field].label + '分类'}>
        {groups.map(name => <button type="button" key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}
      </div>
      <Lock field={field} locked={locked} toggle={toggle} />
    </div>
    <div className="bot-part-grid" role="group" aria-label={isHair ? '探头发型部件' : '探头头饰部件'}>
      {Object.entries(options).filter(([, item]) => group === '全部' || item.group === group).map(([id, item]) => {
        const compatible = isHair ? !locked.includes('headwear') || canWearHeadwear(id, design.headwear) : canWearHeadwear(design.hair, id)
        // Incompatible headwear remains visible in the library on a suitable head.
        const preview = isHair ? updatePeekingDesign(design, 'hair', id) : getPeekingDesign({ ...design, headwear: id,
          hair: compatible ? design.hair : Object.keys(peekingHair).find(hair => canWearHeadwear(hair, id)) })
        return <button type="button" key={id} aria-pressed={design[field] === id} disabled={!compatible}
          title={compatible ? item.label : isHair ? '此发型不适配已锁定的头饰，请先解锁头饰' : item.label + ' · 请先选择适配的发型'}
          onClick={() => change(field, id)}>
          <BotFace bot={{ id: botId, appearance: { mode: 'peeking', peekingDesign: preview } }} size="activity" still />
          <span>{item.label}</span>
        </button>
      })}
    </div>
    {!isHair && <p className="bot-look-hint">灰色头饰需要先换发型；簪钗适配盘发和束发，巾帽适配较低的发型。</p>}
  </fieldset>
}

export function PeekingControls({ botId, design: raw, onChange, pending }) {
  const design = getPeekingDesign(raw)
  const [panel, setPanel] = useState('presets')
  const [candidates, setCandidates] = useState([])
  const [locked, setLocked] = useState([])
  const [notice, setNotice] = useState('')
  const toggle = field => {
    setLocked(values => values.includes(field) ? values.filter(value => value !== field) : [...values, field])
    setCandidates([])
  }
  function change(field, value) {
    const next = updatePeekingDesign(design, field, value)
    setCandidates([])
    setNotice(field === 'hair' && design.headwear !== next.headwear ? '已移除不适配新发型的头饰，其他部件保持不变。' : '')
    onChange(next)
  }
  function generate() {
    const batch = randomPeekingBatch({ design, locked })
    setCandidates(batch.map((candidate, i) => ({ label: '候选 ' + (i + 1), design: candidate })))
    setNotice(locked.length === Object.keys(peekingFields).length ? '所有部件都已锁定。解锁部分部件后可以生成更多变化。' : '')
    setPanel('random')
  }
  const choices = panel === 'random' ? candidates : peekingPresets
  return <fieldset className="bot-look-options bot-peeking-controls" disabled={pending}>
    <div className="bot-portrait-toolbar">
      <div className="bot-portrait-tabs" role="group" aria-label="探头头像编辑方式">
        {[['presets', '预设'], ...(candidates.length ? [['random', '随机候选']] : []), ['custom', '部件编辑']].map(([key, label]) =>
          <button type="button" key={key} aria-pressed={panel === key} onClick={() => setPanel(key)}>{label}</button>)}
      </div>
      <button type="button" className="secondary" onClick={generate}>{panel === 'random' ? '换一批' : '随机生成'}</button>
    </div>
    <div className="bot-peeking-summary">
      <span>36 种发型 · 32 种头饰</span>
      {locked.length > 0 && <button type="button" onClick={() => {
        setLocked([]); setCandidates([]); setPanel('custom'); setNotice('')
      }}>解锁全部（{locked.length}）</button>}
    </div>
    {notice && <p className="bot-look-hint" role="status">{notice}</p>}
    {panel === 'custom' ? <>
      <PartCatalog field="hair" design={design} botId={botId} locked={locked} change={change} toggle={toggle} />
      <PartCatalog field="headwear" design={design} botId={botId} locked={locked} change={change} toggle={toggle} />
      <div className="bot-part-details">
        {['face', 'eyewear', 'earrings'].map(field => <div className="bot-part-detail" key={field}>
          <div className="bot-part-field-heading"><label htmlFor={'peeking-' + botId + '-' + field}>{peekingFields[field].label}</label>
            <Lock field={field} locked={locked} toggle={toggle} /></div>
          <select id={'peeking-' + botId + '-' + field} value={design[field]} onChange={event => change(field, event.target.value)}>
            {Object.entries(peekingFields[field].options).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>
        </div>)}
      </div>
      <div className="bot-part-palettes">
        {['hairColor', 'headwearColor', 'skin', 'clothing', 'background'].map(field => <fieldset key={field} className="bot-look-field bot-part-palette">
          <legend>{peekingFields[field].label}</legend>
          <div className="bot-part-palette-row">
            <div className="bot-color-choices">
              {Object.entries(peekingPalettes[field]).map(([id, { label, colors }]) => <button type="button" key={id}
                className="bot-color-swatch" style={{ '--swatch': colors[0] }}
                aria-label={peekingFields[field].label + ' · ' + label} title={label}
                aria-pressed={design[field] === id} onClick={() => change(field, id)} />)}
            </div>
            <Lock field={field} locked={locked} toggle={toggle} />
          </div>
        </fieldset>)}
      </div>
      <p className="bot-look-hint">锁定想保留的部件，再随机生成候选。仅点击候选时才应用到当前头像。</p>
    </> : <>
      <p className="bot-look-hint">{panel === 'random' ? `从这 ${candidates.length} 个候选中选一个，再到「部件编辑」微调。` : '选择预设，或随机组合；发型、头饰和各组配色都可以独立调整。'}</p>
      <div className="bot-shape-grid bot-portrait-grid bot-peeking-presets" role="group" aria-label={panel === 'random' ? '探头随机候选' : '探头头像预设'}>
        {choices.map(({ label, design: candidate }, index) => <button type="button" key={index} aria-pressed={equal(design, candidate)}
          title={peekingHair[candidate.hair].label + ' · ' + peekingHeadwear[candidate.headwear].label}
          onClick={() => { onChange(candidate); setNotice('') }}>
          <BotFace bot={{ id: botId, appearance: { mode: 'peeking', peekingDesign: candidate } }} size="activity" still />
          <span>{label}</span>
        </button>)}
      </div>
    </>}
  </fieldset>
}
