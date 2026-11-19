import React, { useEffect, useId, useState } from 'react'
import { InlineSettingsForm } from './bot-settings-content.jsx'
import { Dialog, Field, Text, valueOf } from './management-ui.jsx'
import { demoBotMcp, demoBotToolsets, getProfileSkills } from './management.mjs'

const languages = [
  ['', '跟随对话'], ['简体中文', '简体中文'], ['繁體中文', '繁體中文'],
  ['English', 'English'], ['日本語', '日本語'], ['한국어', '한국어'],
  ['Français', 'Français'], ['Deutsch', 'Deutsch'], ['Español', 'Español'],
]
const supportedLanguages = new Set(languages.map(([value]) => value))
const languageRule = /^<!-- AIWATA:reply-language -->\r?\n默认用 (.+) 答复，除非用户明确指定其他语言。\r?\n<!-- \/AIWATA:reply-language -->(?:\r?\n\r?\n)?/

function splitSoul(soul = '') {
  const rule = soul.match(languageRule)
  return rule && supportedLanguages.has(rule[1])
    ? { language: rule[1], soul: soul.slice(rule[0].length) }
    : { language: '', soul }
}

function joinSoul(soul, language) {
  return language
    ? '<!-- AIWATA:reply-language -->\n默认用 ' + language + ' 答复，除非用户明确指定其他语言。\n<!-- /AIWATA:reply-language -->\n\n' + soul
    : soul
}

const sections = [['overview', '概览'], ['soul', 'SOUL'], ['memory', '记忆'], ['skills', '技能'], ['tools', '工具']]

function CapabilityChoices({ label, input, choices, empty }) {
  return <fieldset className="management-members">
    <legend>{label}</legend>
    {choices.length ? choices.map(({ id, name, enabled, locked }) => <label key={id} className="management-check">
      <input type="checkbox" name={input} value={id} defaultChecked={enabled} disabled={locked} />
      {name}{locked ? '（已锁定）' : ''}
    </label>) : <small>{empty}</small>}
  </fieldset>
}

export function BotProfileDefinition({ item, live, details, management, page, onPageChange, onSave, onDirtyChange, onBusyChange, plans, memory, report }) {
  const editorId = useId()
  const original = splitSoul(item.soul)
  const skills = live ? (details?.skills ?? []).map(skill => ({
    id: skill.name, name: skill.name, installed: true, enabled: skill.enabled, locked: skill.locked,
  })) : getProfileSkills(management, item.id)
  const choices = (native, demo, selected) => live ? (native ?? []).map(row => ({
    id: row.name, name: row.label || row.name, enabled: Boolean(row.enabled),
  })) : demo.map(([id, name]) => ({ id, name, enabled: Boolean(selected?.includes(id)) }))
  const tools = choices(details?.toolsets, demoBotToolsets, item.toolsets)
  const mcp = choices(details?.mcp_servers, demoBotMcp, item.mcpServers)
  const panel = key => ({ id: editorId + '-' + key, role: 'tabpanel', hidden: page !== key, 'aria-labelledby': editorId + '-tab-' + key })

  async function save(form) {
    const language = valueOf(form, 'replyLanguage')
    if (!supportedLanguages.has(language)) return '请选择可用的答复语言。'
    const soul = String(form.get('soul') ?? '')
    const selectedSkills = new Set(form.getAll('skills'))
    const nextSkills = skills.map(skill => ({
      ...skill, enabled: skill.installed && !skill.locked ? selectedSkills.has(skill.id) : Boolean(skill.enabled),
    }))
    const toolsets = form.getAll('toolsets')
    const mcpServers = form.getAll('mcp')
    const description = valueOf(form, 'description')
    const settings = {
      ...item, description, toolsets, mcpServers,
      soul: language === original.language && soul === original.soul ? item.soul : joinSoul(soul, language),
    }
    if (!live) return onSave(settings, { skills: Object.fromEntries(nextSkills.map(({ id, installed, enabled, locked }) => [id, { installed, enabled, locked }])) })
    const changed = (rows, selected) => rows.some(row => row.enabled !== selected.includes(row.id))
    return onSave(settings, {
      revision: item.revision, desktopRevision: item.desktopRevision, originalSoul: item.soul, originalDescription: item.description,
      ...(nextSkills.some((skill, index) => skill.enabled !== Boolean(skills[index].enabled))
        ? { disabled_skills: nextSkills.filter(skill => !skill.enabled).map(skill => skill.id) } : {}),
      ...(changed(tools, toolsets) ? { enabled_toolsets: toolsets } : {}),
      ...(changed(mcp, mcpServers) ? { enabled_mcp_servers: mcpServers } : {}),
    })
  }

  return <InlineSettingsForm onSubmit={save} onDirtyChange={onDirtyChange} onBusyChange={onBusyChange}
    showActions={false} afterForm={<>
      {page === 'overview' && <div className="bot-profile-overview-extra">
        {plans}<BotProfileVoice bot={item} live={live} report={report} />
      </div>}
      <section {...panel('memory')}>{page === 'memory' && memory}</section>
    </>}>
    <div className="bot-editor-tabs" role="tablist" aria-label="Bot 定义">
      {sections.map(([key, label], index) => <button type="button" key={key} id={editorId + '-tab-' + key}
        role="tab" aria-selected={page === key} aria-controls={editorId + '-' + key} tabIndex={page === key ? 0 : -1}
        onClick={() => onPageChange(key)} onKeyDown={event => {
          const count = sections.length
          const next = { ArrowLeft: (index + count - 1) % count, ArrowRight: (index + 1) % count, Home: 0, End: count - 1 }[event.key]
          if (next === undefined) return
          event.preventDefault()
          onPageChange(sections[next][0])
          event.currentTarget.parentElement.children[next].focus()
        }}>{label}</button>)}
    </div>
    <section {...panel('overview')} className="bot-profile-definition-fields">
      <Text className="bot-profile-description" name="description" label="简介" defaultValue={item.description}
        placeholder="简述这个 Bot 的职责" rows={2} maxLength={200} />
      <label className="bot-profile-language">Bot 答复语言<select aria-label="Bot 答复语言" name="replyLanguage" defaultValue={original.language}>
        {languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </section>
    <section {...panel('soul')} className="bot-profile-definition-fields">
      <Text name="soul" label="角色指令（SOUL.md）" defaultValue={original.soul} rows={6} />
      <small>概览中的答复语言会与本页指令一起写入 SOUL.md。</small>
    </section>
    <section {...panel('skills')}>
      <CapabilityChoices label="已安装技能" input="skills" choices={skills.filter(skill => skill.installed)} empty="暂无已安装技能。" />
    </section>
    <section {...panel('tools')} className="bot-profile-definition-fields">
      <CapabilityChoices label="工具组" input="toolsets" choices={tools} empty="没有可配置的工具组。" />
      <CapabilityChoices label="MCP" input="mcp" choices={mcp} empty="此 Profile 没有配置 MCP 服务器。" />
    </section>
  </InlineSettingsForm>
}

function BotProfileVoice({ bot, live, report }) {
  const [voice, setVoice] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [attempt, retry] = useState(0)
  const profile = bot.profile

  useEffect(() => {
    if (!live?.botVoice) return
    let active = true
    setError('')
    void live.botVoice(profile).then(result => { if (active) setVoice(result) })
      .catch(problem => { if (active) setError(problem.message) })
    return () => { active = false }
  }, [live, profile, attempt])

  return <section className="bot-profile-voice">
    <strong>Bot 音色</strong>
    {!live?.botVoice ? <small>当前连接未提供音色配置</small>
      : error ? <><small role="alert">{error}</small><button type="button" className="secondary" onClick={() => retry(value => value + 1)}>重试</button></>
      : !voice ? <small>正在读取…</small>
      : <><small>{[voice.provider, voice.value || (voice.field ? '默认音色' : '由语音引擎管理')].filter(Boolean).join(' · ')}</small>
        {voice.field && <button type="button" className="secondary" onClick={() => setEditing(true)}>编辑音色</button>}</>}
    {editing && <Dialog title="Bot 音色" onClose={() => { setEditing(false); retry(value => value + 1) }} onSubmit={async form => {
      const value = valueOf(form, 'voice')
      if (!value) return '请输入语音引擎支持的音色名称或 ID。'
      setVoice(await live.botVoice(profile, { provider: voice.provider, previous: voice.value, value }))
      report('Bot 音色已保存')
    }}><Field name="voice" label={'音色名称或 ID · ' + voice.provider} defaultValue={voice.value} maxLength={160} autoFocus /></Dialog>}
  </section>
}
