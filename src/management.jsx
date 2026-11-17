import { BotSettingsContent, InlineSettingsForm } from './bot-settings-content.jsx'
import { gatewayGroup } from './live-room-state.mjs'
import React, { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { getBotAppearance } from './bot-appearance.mjs'
import { BotFace, GroupFace } from './bot-avatar.jsx'
import { BotAvatarPicker } from './bot-avatar-picker.jsx'
import { botPresence } from './bot-presence.mjs'
import { models } from './composer.mjs'
import { Icon, IconButton } from './icons.jsx'
import { gatewayTask, gatewayTaskPlatform, gatewayTaskRoomId } from './live-tasks.mjs'
import { nativeCronPayload, scriptOnlyTask, cronRunRoute } from './native-cron.mjs'
import { NativeBotControls, NativeBotModelField, catalogBotModel } from './native-bot-controls.jsx'
import { NativeCronModelField, NativeTaskBlueprintDialog } from './native-cron.jsx'
import {
  canUseProfileId, defaultProfile, getManagement, getProfileMemory, getProfileSkills,
  groupMember, groupRouting, isScheduleInput, memorySettings, memoryTypes, platforms, replaceEntry, resolveGroupMembers,
} from './management.mjs'
import { Badge, Confirm, Dialog, Empty, Entry, Field, Frame, Panel, Profiles, Text, dateLabel, valueOf } from './management-ui.jsx'

const LiveMemory = lazy(() => import('./live-memory.jsx'))
const LiveConnectors = lazy(() => import('./live-connectors.jsx'))
const newId = () => crypto.randomUUID()

function ProjectSettings({ selected, record, management, api, persist, commit, onSelectItem, onNavigate, live, mutateProject, report }) {
  const [dialog, setDialog] = useState(null)
  const project = record.projects.find(item => item.id === selected)
  const otherFolders = id => live ? (record.projects.find(item => item.id === id)?.folders ?? []).filter(folder => folder !== project?.folder)
    : management.projectFolders[id] ?? []
  const close = () => setDialog(null)

  function gatewayChange(method, params, message) {
    return mutateProject(method, params).then(() => { if (message) report(message) }, error => error.message)
  }

  async function addFolderDialog() {
    if (!live) { setDialog({ kind: 'folder', project }); return }
    try {
      const choices = (await live.folders()).filter(folder => !project.folders.includes(folder.path))
      setDialog({ kind: 'folder', project, choices })
    } catch (error) { report(error.message, true) }
  }

  function update(project, patch, message) {
    if (live) return gatewayChange('projects.update', { id: project.id, ...patch }, message)
    return commit(() => api.updateProject(project.id, { name: project.name, folder: project.folder, ...patch }), message)
  }

  function addFolder(form) {
    const project = dialog.project
    const folder = valueOf(form, 'folder')
    if (!folder) return '请输入目录路径。'
    if ([project.folder, ...otherFolders(project.id)].includes(folder)) return '该目录已关联到此项目。'
    if (live) return gatewayChange('projects.add_folder', { id: project.id, path: folder }, '已关联目录')
    return persist({ projectFolders: { ...management.projectFolders, [project.id]: [...otherFolders(project.id), folder] } }, '已关联演示目录')
  }

  return <Frame live={live} icon={project ? 'settings' : 'folders'} title={project?.name ?? '项目设置'}
    description={project ? '管理项目名称和工作目录。' : '选择一个已有项目，查看或修改它的设置。'}
    back={onNavigate && { label: '返回项目会话', onClick: () => onNavigate('projects') }}>
    {project ? <>
      <Panel title="项目名称" description={project.name}
        actions={<button className="secondary" onClick={() => setDialog({ kind: 'rename', project })}>重命名</button>} />
      <Panel title="工作目录" description="新会话默认使用主目录。"
        actions={<button className="secondary" onClick={addFolderDialog}>
          <Icon name="add" size={/* @ai-token sys.icon.size.15 */ 15} />关联目录
        </button>}>
        <Entry icon="openFolder" title={project.folder || '未设置主目录'} subtitle="主目录" />
        {otherFolders(project.id).map(folder => <Entry key={folder} icon="folder" title={folder} subtitle="附加目录">
          <button className="secondary" onClick={() => {
            if (live) {
              void gatewayChange('projects.set_primary', { id: project.id, path: folder }, '主目录已更新')
                .then(error => { if (error) report(error, true) })
              return
            }
            const oldFolder = project.folder
            const error = update(project, { folder }, '主目录已更新')
            if (!error) {
              const folders = otherFolders(project.id).filter(item => item !== folder)
              if (oldFolder) folders.unshift(oldFolder)
              persist({ projectFolders: { ...management.projectFolders, [project.id]: folders } })
            }
          }}>设为主目录</button>
          <IconButton icon="close" label={'解除关联 · ' + folder} onClick={() => {
            if (live) void gatewayChange('projects.remove_folder', { id: project.id, path: folder }, '已解除目录关联')
              .then(error => { if (error) report(error, true) })
            else persist({ projectFolders: { ...management.projectFolders, [project.id]: otherFolders(project.id).filter(item => item !== folder) } }, '已解除目录关联')
          }} />
        </Entry>)}
      </Panel>
      <Panel title="移除项目" description="会话和磁盘文件会保留。"
        actions={<button className="secondary danger" onClick={() => setDialog({ kind: 'remove', project })}>移除项目…</button>} />
    </> : record.projects.length ? <div className="management-panel">
      {record.projects.map(item => <button type="button" key={item.id} className="management-entry project-settings-link"
        onClick={() => onSelectItem(item.id)}>
        <span className="entry-text"><strong>{item.name}</strong><small>{item.folder || '未设置主目录'}</small></span>
        <Icon name="right" size={/* @ai-token sys.icon.size.15 */ 15} />
      </button>)}
    </div> : <Empty>暂无项目。可从项目侧栏新建。</Empty>}
    {dialog?.kind === 'rename' && <Dialog title="重命名项目" onClose={close} onSubmit={form => {
      const name = valueOf(form, 'name')
      return name ? update(dialog.project, { name }, '项目名称已更新') : '请输入项目名称。'
    }}><Field label="项目名称" name="name" defaultValue={dialog.project.name} maxLength={80} required autoFocus /></Dialog>}
    {dialog?.kind === 'folder' && <Dialog title="关联项目目录" onClose={close} onSubmit={addFolder} submitDisabled={live && !dialog.choices.length}>
      {live ? dialog.choices.length ? <label>当前用户目录<select name="folder" autoFocus>
        {dialog.choices.map(folder => <option key={folder.path} value={folder.path}>{folder.name}</option>)}
      </select></label> : <p>当前用户的目录已全部关联。</p> : <>
        <Field label="演示目录路径" name="folder" placeholder="例如 ~/Projects/brand-studio/assets" required autoFocus />
        <small>原型只记录演示路径。</small>
      </>}
    </Dialog>}
    {dialog?.kind === 'remove' && <Confirm title={'移除「' + dialog.project.name + '」？'} submit="移除项目" onClose={close}
      onConfirm={async () => {
        if (live) {
          const error = await gatewayChange('projects.delete', { id: dialog.project.id }, '项目已移除')
          if (!error) onSelectItem(null)
          return error
        }
        const error = commit(() => api.removeProject(dialog.project.id), '项目已移除')
        if (!error) {
          const folders = { ...management.projectFolders }
          delete folders[dialog.project.id]
          persist({ projectFolders: folders })
          onSelectItem(null)
        }
        return error
      }}>项目会话将移到未分组列表，磁盘文件会保留。</Confirm>}
  </Frame>
}

const toolsets = [['file', '文件'], ['browser', '浏览器'], ['terminal', '终端'], ['web', '网络检索'], ['memory', '记忆']]
const sampleMcp = [['workspace-files', '工作区文件'], ['docs-search', '文档检索']]
const modelKey = ({ provider, id }) => provider + ':' + id
const modelSelection = bot => models.find(model => model.id === bot?.model && model.provider === bot?.provider)
const initialBotModel = bot => modelSelection(bot) ? modelKey(modelSelection(bot)) : bot?.model ? 'custom' : ''
const botEditorTabs = [['basic', '基本信息'], ['avatar', '头像'], ['capabilities', '模型与能力']]
const avatarModeLabels = { character: '几何角色', portrait: '人物头像', peeking: '探头头像', photo: '上传图片' }

function BotEditor({ item, bots, management, onClose, onSave, live, details: initialDetails, embedded, onDirtyChange, onBusyChange, onOpenProfileSection, onOpenNativeSettings, report }) {

  const [draftId] = useState(() => item?.id ?? newId())
  const [source, setSource] = useState(item)
  const [details, setDetails] = useState(initialDetails)
  const [choice, setChoice] = useState(live ? (item?.model ? 'existing' : '') : initialBotModel(item))
  const [loadingSource, setLoadingSource] = useState(false)
  const [sourceError, setSourceError] = useState('')
  const [confirmModel, setConfirmModel] = useState(null)
  const [avatar, setAvatar] = useState(item?.avatar ?? '')
  const [appearance, setAppearance] = useState(() => getBotAppearance(item ?? { id: draftId }))
  const [avatarPending, setAvatarPending] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [previewState, setPreviewState] = useState('idle')
  const [page, setPage] = useState('basic')
  const [avatarExpanded, setAvatarExpanded] = useState(false)
  const tabs = embedded ? [['basic', '基本信息'], ['capabilities', '能力'], ['memory', '记忆'], ['automation', '自动化'], ['advanced', '高级']] : botEditorTabs
  const EditorShell = embedded ? InlineSettingsForm : Dialog
  const editorId = useId()
  const panelBody = useRef(null)
  const avatarVersion = useRef(0)
  const sourceVersion = useRef(0)
  const sourceSkills = live ? (details?.skills ?? []).map(skill => ({ id: skill.name, name: skill.name, installed: true, enabled: skill.enabled, locked: skill.locked }))
    : getProfileSkills(management, source?.id ?? defaultProfile)
  const toolChoices = live ? (details?.toolsets ?? []).map(tool => [tool.name, tool.label || tool.name, tool.enabled]) : toolsets
  const mcpChoices = live ? (details?.mcp_servers ?? []).map(server => [server.name, server.name, server.enabled]) : sampleMcp
  const draftBot = { id: draftId, avatar, appearance }
  const sourceKey = source?.id ?? 'fresh'

  function showPage(next) {
    if (next === page) return
    setPage(next)
    if (panelBody.current) panelBody.current.scrollTop = 0
  }

  function fieldProblem(section, field, message) {
    showPage(section)
    requestAnimationFrame(() => panelBody.current?.querySelector(`[name="${field}"]`)?.focus())
    return message
  }

  const panelProps = key => ({
    role: 'tabpanel', hidden: page !== key, id: `${editorId}-panel-${key}`, 'aria-labelledby': `${editorId}-tab-${key}`,
  })

  async function selectSource(id) {
    let next = bots.find(bot => bot.id === id)
    if (live) {
      const version = ++sourceVersion.current
      setLoadingSource(true)
      setSourceError('')
      try {
        const loaded = next ? await live.botDetails(next.profile) : initialDetails
        if (version !== sourceVersion.current) return
        setDetails(loaded)
        if (next) next = { ...next, soul: loaded.soul, model: loaded.model.default, provider: loaded.model.provider }
      } catch (error) {
        if (version === sourceVersion.current) setSourceError(error.message)
        return
      } finally { if (version === sourceVersion.current) setLoadingSource(false) }
    }
    setSource(next)
    setChoice(live ? (next?.model ? 'existing' : '') : initialBotModel(next))
    setAvatar(next?.avatar ?? '')
    setAppearance(getBotAppearance(next ?? { id: draftId }))
    setAvatarPending(false)
    setAvatarError('')
    avatarVersion.current += 1
    setConfirmModel(null)
  }

  function pickAvatar(event) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024) {
      setAvatarError('请选择不超过 256 KB 的 PNG、JPEG 或 WebP 图片。')
      return
    }
    const version = ++avatarVersion.current
    const reader = new FileReader()
    setAvatarError('')
    setAvatarPending(true)
    reader.onload = () => {
      if (version !== avatarVersion.current) return
      setAvatar(String(reader.result))
      setAppearance(current => ({ ...current, mode: 'photo' }))
      setAvatarPending(false)
    }
    reader.onerror = () => {
      if (version !== avatarVersion.current) return
      setAvatarError('无法读取头像，请换一张图片。')
      setAvatarPending(false)
    }
    reader.readAsDataURL(file)
  }

  return <EditorShell className="bot-editor-dialog" title={item ? "编辑 Bot" : "新建 Bot"} onClose={onClose}
    onDirtyChange={onDirtyChange} onBusyChange={onBusyChange} dirtyToken={JSON.stringify([avatar, appearance])}
    showActions={!embedded || ['basic', 'capabilities'].includes(page)}
    afterForm={embedded && <div className="bot-settings-sections">
      <section {...panelProps('memory')}><h3>{"全局长期记忆"}</h3><p>查看和维护 {item.name} 自己的长期记忆。此入口不包含项目专属记忆。</p><p className="bot-settings-note">新增记忆前先明确存放范围；没有说清楚时，先向你确认。</p>
        <button type="button" className="secondary" onClick={() => onOpenProfileSection?.('memory', item.id)}>{"管理长期记忆"}</button></section>
      <section {...panelProps('automation')}><h3>{"定时任务与消息连接"}</h3><p>仅管理 {item.name} 的任务和连接。</p><div className="bot-settings-actions">
        <button type="button" className="secondary" onClick={() => onOpenProfileSection?.('tasks', item.id)}>{"管理定时任务"}</button>
        <button type="button" className="secondary" onClick={() => onOpenProfileSection?.('connectors', item.id)}>{"管理消息连接器"}</button></div></section>
      <section {...panelProps('advanced')}><h3>{"高级配置"}</h3><p>Profile ID：<code>{item.profile ?? item.id}</code></p><p>这些配置属于 {item.name}；当前会话的模型和审批仍在聊天中调整。</p>
        {live?.native && onOpenNativeSettings ? <div className="bot-settings-actions">
          <button type="button" className="secondary" onClick={() => onOpenNativeSettings('capabilities', item)}>{"完整技能、工具与 MCP 配置"}</button>
          <button type="button" className="secondary" onClick={() => onOpenNativeSettings('settings', item)}>{"模型授权与高级设置"}</button>
        </div> : <NativeBotControls live={live} bot={item} report={report} />}
        {!live && <small>{"本地演示；原生模型授权与高级配置在桌面连接后可用。"}</small>}
      </section>
    </div>}
    submitDisabled={avatarPending || loadingSource} onSubmit={async form => {
    if (avatarPending || loadingSource) return '请等待档案与头像加载。'
    const id = draftId
    const name = valueOf(form, 'name')
    const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|-+$/g, '').slice(0, 64)
    const autoProfile = canUseProfileId(slug, bots) ? slug : 'bot-' + id.slice(0, 12)
    const profile = item ? (item.profile ?? item.id) : valueOf(form, 'profile').toLowerCase() || autoProfile
    const selected = live ? catalogBotModel(choice) : models.find(model => modelKey(model) === choice)
    const provider = selected?.provider ?? (choice === 'custom' ? valueOf(form, 'provider') : '')
    const model = selected?.model ?? selected?.id ?? (choice === 'custom' ? valueOf(form, 'model') : '')
    if (!name) return fieldProblem('basic', 'name', '请输入显示名称。')
    if (!canUseProfileId(profile, bots, item?.id)) return fieldProblem('capabilities', 'profile', '请输入可用的 Profile ID，使用小写字母、数字、下划线或短横线。')
    if (choice === 'custom' && (!provider || !model)) return fieldProblem('capabilities', provider ? 'model' : 'provider', '请同时填写模型提供方与模型 ID。')
    const activeSkills = new Set([...form.getAll('skills'), ...sourceSkills.filter(skill => skill.locked && skill.enabled).map(skill => skill.id)])
    const skills = Object.fromEntries(sourceSkills.map(skill => [skill.id, {
      installed: Boolean(skill.installed), locked: Boolean(skill.locked),
      enabled: skill.installed && !skill.locked ? activeSkills.has(skill.id) : Boolean(skill.enabled),
    }]))
    const settings = {
      ...item, id, profile, name, avatar, appearance,
      description: valueOf(form, 'description'), soul: valueOf(form, 'soul'),
      provider, model, toolsets: form.getAll('toolsets'), mcpServers: form.getAll('mcp'),
    }
    if (!live) return onSave(settings, { skills })
    const selectionKey = JSON.stringify([profile, provider, model])
    const changes = (available, enabled) => available.some(entry => Boolean(entry.enabled) !== enabled.includes(entry.name))
    const options = {
      ...(item ? { revision: item.revision, desktopRevision: item.desktopRevision, originalSoul: item.soul, originalDescription: item.description } : { createId: draftId, cloneFrom: source?.profile }),
      ...(confirmModel?.key === selectionKey ? { confirmedModel: true } : {}),
      ...(changes(details?.skills ?? [], [...activeSkills]) ? { disabled_skills: sourceSkills.filter(skill => !activeSkills.has(skill.id)).map(skill => skill.id) } : {}),
      ...(changes(details?.toolsets ?? [], settings.toolsets) ? { enabled_toolsets: settings.toolsets } : {}),
      ...(changes(details?.mcp_servers ?? [], settings.mcpServers) ? { enabled_mcp_servers: settings.mcpServers } : {}),
    }
    const result = await onSave(settings, options)
    if (result?.confirmRequired) {
      setConfirmModel({ key: selectionKey })
      showPage('capabilities')
      return result.message || '请确认模型选择后再保存。'
    }
    return result
  }} submit={confirmModel ? "确认模型并保存" : item ? "保存" : "创建"}>
    <div className="bot-editor-tabs" role="tablist" aria-label={"Bot 设置分类"}>
      {tabs.map(([key, label], index) => <button key={key} type="button" role="tab" id={`${editorId}-tab-${key}`}
        aria-selected={key === page} aria-controls={`${editorId}-panel-${key}`} tabIndex={key === page ? 0 : -1} onClick={() => showPage(key)}
        onKeyDown={event => {
          const count = tabs.length
          const next = { ArrowLeft: (index + count - 1) % count, ArrowRight: (index + 1) % count, Home: 0, End: count - 1 }[event.key]
          if (next === undefined) return
          event.preventDefault()
          showPage(tabs[next][0])
          event.currentTarget.parentElement.children[next].focus()
        }}>{label}</button>)}
    </div>
    <div className="bot-editor-body" ref={panelBody}>
      <section className="bot-editor-panel" {...panelProps('basic')}>
        {!item && <label>{"配置来源"}<select value={source?.id ?? ''} onChange={event => selectSource(event.target.value)}>
          <option value="">{"新建独立配置"}</option>
          {bots.map(bot => <option key={bot.id} value={bot.id}>{"复制"} {bot.name} 的配置</option>)}
        </select></label>}
        {sourceError && <p className="management-error" role="alert">{sourceError}</p>}
        <div className="bot-editor-identity">
          <button type="button" className="bot-editor-avatar-link" onClick={() => {
            if (embedded) setAvatarExpanded(value => !value)
            else { showPage('avatar'); document.getElementById(`${editorId}-tab-avatar`)?.focus() }
          }}>
            <BotFace bot={draftBot} size="activity" still />
            <span><strong>{"编辑头像"}</strong><small>{avatarModeLabels[appearance.mode]}</small></span>
            <Icon name="right" size={/* @ai-token sys.icon.size.14 */ 14} />
          </button>
          <Field label={"显示名称"} name="name" defaultValue={item?.name} placeholder={"例如 编辑助理"} maxLength={80} aria-required="true" autoFocus />
        </div>
        <div className="bot-editor-fields" key={sourceKey}>
          <Field label={"简介"} name="description" defaultValue={source?.description} placeholder={"简述这个 Bot 的职责"} maxLength={200} />
          <Text label={"角色指令（SOUL.md）"} name="soul" defaultValue={source?.soul} rows={5} placeholder={"设定角色、工作方式与表达风格"} />
        </div>
      </section>
      <section className="bot-editor-panel bot-settings-avatar" onChange={event => event.stopPropagation()} {...(embedded ? { hidden: page !== 'basic' || !avatarExpanded, 'aria-label': '头像设置' } : panelProps('avatar'))}>
        <BotAvatarPicker key={sourceKey} bot={draftBot} onChange={setAppearance}
          previewState={previewState} onPreviewState={setPreviewState} onUpload={pickAvatar} pending={avatarPending} error={avatarError}
          onRemovePhoto={() => {
            avatarVersion.current += 1
            setAvatar('')
            setAvatarPending(false)
            setAvatarError('')
            setAppearance(current => ({ ...current, mode: 'character' }))
          }} />
      </section>
      <section className="bot-editor-panel" {...panelProps('capabilities')}>
        <div className="bot-editor-fields" key={sourceKey}>
          <div className="management-field-pair">
            {live ? <NativeBotModelField live={live} profile={source?.profile ?? 'default'} choice={choice} currentModel={source?.model}
              onChange={value => { setChoice(value); setConfirmModel(null) }} /> : <>            <label>{"模型"}<select value={choice} onChange={event => { setChoice(event.target.value); setConfirmModel(null) }}>
              <option value="" disabled={live && Boolean(source?.model)}>{"工作区默认模型"}</option>
              {live && source?.model && <option value="existing">{source.model}{"· 当前配置"}</option>}
              {!live && models.map(model => <option key={modelKey(model)} value={modelKey(model)}>{model.label} · {model.description}</option>)}
              <option value="custom">{"自定义模型"}</option>
            </select></label>
</>}
            {embedded ? <input type="hidden" name="profile" value={item.profile ?? item.id} /> : <Field label="Profile ID" name="profile" readOnly={Boolean(item)} defaultValue={item?.profile ?? item?.id} placeholder={"留空自动生成"} maxLength={64} onChange={() => setConfirmModel(null)} />}
          </div>
          {choice === 'custom' && <div className="management-field-pair">
            <Field label={"模型提供方"} name="provider" defaultValue={source?.provider} onChange={() => setConfirmModel(null)} />
            <Field label={"模型 ID"} name="model" defaultValue={source?.model} onChange={() => setConfirmModel(null)} />
          </div>}
          {embedded && <><p className="bot-settings-note">{"默认模型与启用的能力属于这个 Bot。共享技能库的维护与这里的启用选择分别管理。"}</p><button type="button" className="secondary" onClick={() => onOpenProfileSection?.('skills', item.id)}>{"查看技能库"}</button></>}
          <h3 className="bot-editor-capabilities-title">{"可用能力"}</h3>
          <div className="bot-editor-capabilities">
            <fieldset className="management-members"><legend>{"已安装技能"}</legend>
              {sourceSkills.filter(skill => skill.installed).map(skill => <label key={skill.id} className="management-check">
                <input type="checkbox" name="skills" value={skill.id} defaultChecked={skill.enabled} disabled={skill.locked} />{skill.name}{skill.locked ? '（已锁定）' : ''}
              </label>)}
              {!sourceSkills.some(skill => skill.installed) && <small>{"暂无已安装技能。"}</small>}
            </fieldset>
            <fieldset className="management-members"><legend>{"工具组"}</legend>
              <small>{"不勾选时继承默认工具组。"}</small>
              {toolChoices.map(([id, label, enabled]) => <label key={id} className="management-check">
                <input type="checkbox" name="toolsets" value={id} defaultChecked={live ? enabled : source?.toolsets?.includes(id)} />{label}
              </label>)}
            </fieldset>
            <fieldset className="management-members"><legend>{live ? 'MCP' : 'MCP（演示配置）'}</legend>
              {mcpChoices.map(([id, label, enabled]) => <label key={id} className="management-check">
                <input type="checkbox" name="mcp" value={id} defaultChecked={live ? enabled : source?.mcpServers?.includes(id)} />{label}
              </label>)}
              {live && !mcpChoices.length && <small>{"此 Profile 没有配置 MCP 服务器。"}</small>}
            </fieldset>
          </div>
        </div>
      </section>
    </div>
  </EditorShell>
}

function GroupEditor({ item, bots, onClose, onSave, live, embedded, onDirtyChange, onBusyChange }) {

  const [id] = useState(() => item?.id ?? newId())
  const [members, setMembers] = useState(() => resolveGroupMembers(item, bots))
  const [routing, setRouting] = useState(item?.routing ?? 'everyone')
  const EditorShell = embedded ? InlineSettingsForm : Dialog
  return <EditorShell onDirtyChange={onDirtyChange} onBusyChange={onBusyChange} title={item ? "编辑群聊" : "新建群聊"} onClose={onClose} onSubmit={form => {
    const name = valueOf(form, 'name')
    const lead = valueOf(form, 'lead')
    const notes = valueOf(form, 'notes')
    if (!name) return '请输入群聊名称。'
    if (!item && (members.length < 2 || members.length > 6)) return '请选择 2 至 6 位 Bot 成员。'
    if (routing === 'lead' && !members.includes(lead)) return '请选择主导 Bot。'
    if (new TextEncoder().encode(notes).length > 4096) return '协作说明不能超过 4096 字节。'
    return onSave({
      ...item, id, name, members, routing, lead: routing === 'lead' ? lead : null,
      purpose: valueOf(form, 'purpose'), notes,
      description: bots.filter(bot => members.includes(bot.id)).map(bot => bot.name).join(' · '),
    })
  }} submit={item ? "保存" : "创建"}>
    <Field label={"群聊名称"} name="name" defaultValue={item?.name} placeholder={"例如 发布协作群"} maxLength={80} required autoFocus />
    {item ? <fieldset className="management-members"><legend>{"Bot 成员"}</legend>
      <div className="management-tags">{bots.filter(bot => members.includes(bot.id)).map(bot => <Badge key={bot.id}>{bot.name}</Badge>)}</div>
      <small>{"托管群的成员在创建时确定。"}</small>
    </fieldset> : <fieldset className="management-members"><legend>{"Bot 成员（2 至 6 位）"}</legend>
      {bots.length ? bots.map(bot => <label key={bot.id} className="management-check">
        <input type="checkbox" checked={members.includes(bot.id)} onChange={event => setMembers(previous => event.target.checked
          ? [...previous, bot.id] : previous.filter(id => id !== bot.id))} />{bot.name}
      </label>) : <small>{"请先创建 Bot。"}</small>}
    </fieldset>}
    <label>{"响应方式"}<select aria-label={"响应方式"} value={routing} onChange={event => setRouting(event.target.value)}>
      {Object.entries(groupRouting).filter(([value]) => !live || (item?.routingModes ?? ['everyone', 'lead']).includes(value))
        .map(([value, label]) => <option value={value} key={value}>{label}</option>)}
    </select></label>
    {routing === 'lead' && <label>{"主导 Bot"}<select aria-label={"主导 Bot"} name="lead" defaultValue={item?.lead ?? ''} required>
      <option value="">{"选择成员"}</option>
      {bots.filter(bot => members.includes(bot.id)).map(bot => <option value={bot.id} key={bot.id}>{bot.name}</option>)}
    </select></label>}
    <Field label={"群聊用途"} name="purpose" defaultValue={item?.purpose} maxLength={500} />
    <Text label={"协作说明"} name="notes" defaultValue={item?.notes} />
  </EditorShell>
}

function BotSettings({ selected, embedded, onDirtyChange, onBusyChange, onManageBot, onOpenNativeSettings, onSelectItem, search, onPageChange, record, account, createRequest, onConsumeCreate, management, commit, api, onOpenChat, onNavigate, onOpenProfileSection, live, refresh, report }) {

  const [dialog, setDialog] = useState(null)
  const [opening, setOpening] = useState(false)
  const [filter, setFilter] = useState('all')
  const query = (search ?? '').trim().toLocaleLowerCase()
  const [candidates,setCandidates]=useState(null)
  const [candidateError,setCandidateError]=useState('')
  const [peerStatus,setPeerStatus]=useState({})
  const consumedCreation = useRef(null)
  useEffect(() => {
    if (!createRequest || consumedCreation.current === createRequest.id) return
    consumedCreation.current = createRequest.id
    onConsumeCreate?.()
    if (createRequest.kind === 'group') void openGroup()
    else void openEditor()
  }, [createRequest])
  const groupBots=dialog?.item ? [...record.bots,...(dialog.item.memberDetails??[]).filter(m=>!record.bots.some(bot=>bot.id===m.id))] : candidates??record.bots
  useEffect(()=>{
    if(dialog?.kind!=='group'||dialog.item||!live?.groupCandidates)return
    let current=true;setCandidates(null);setCandidateError('')
    void live.groupCandidates(record.bots).then(rows=>{if(current)setCandidates(rows)}).catch(error=>{if(current)setCandidateError(error.message)})
    return()=>{current=false}
  },[dialog?.kind,dialog?.item,live])
  const close = () => setDialog(null)
  const save = (kind, item, message = '设置已保存', options) => commit(() => api.saveBotEntity(kind, item, options), message)
  const matches = item => !query || [item.name, item.description, item.purpose, item.model].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)
  const bots = selected ? record.bots.filter(item => item.id === selected) : record.bots.filter(matches)
  const groups = selected ? record.groups.filter(item => item.id === selected) : record.groups.filter(matches)
  const selectedItem = selected && (bots[0] ?? groups[0])
  const references = dialog?.type === 'bot'
    ? record.groups.filter(group => resolveGroupMembers(group, record.bots).includes(dialog.item.id)).map(group => group.name)
    : []
  const chatButton = item => onOpenChat && <button className="secondary" onClick={() => onOpenChat(item.id)}>{"打开会话"}</button>

  async function openEditor(item) {
    if (!live) { setDialog({ kind: 'bot', item }); return }
    if (opening) return
    setOpening(true)
    try {
      const details = await live.botDetails(item?.profile ?? defaultProfile)
      if (api.current() !== record) return
      setDialog({ kind: 'bot', details, item: item && { ...item, soul: details.soul, description: details.description,
        model: details.model.default, provider: details.model.provider } })
    } catch (error) { if (api.current() === record) report(error.message, true) }
    finally { setOpening(false) }
  }

  async function saveBot(settings, options, editorItem = dialog?.item ?? selectedItem) {
    const message = editorItem ? 'Bot 设置已保存' : 'Bot 已创建'
    if (!live) return save('bot', settings, message, options)
    const { profile, name, description, soul, model, provider, appearance, avatar } = settings
    const result = await live.saveBot({ profile, name, description, soul, model, provider, appearance, ...options,
      ...(avatar !== (editorItem?.avatar ?? '') ? { avatar } : {}),
    })
    if (result.confirmRequired) return result
    const inventory = await live.bots()
    if (api.current() === record) {
      api.syncGatewayBots(inventory.bots)
      refresh()
      report(message)
      if (result.created && live.queueBotIntroduction) {
        live.queueBotIntroduction(profile, options.createId)
        setDialog(null)
        onOpenChat?.('bot:' + profile)
      }
    }
  }

  async function openGroup(item) {
    if (!live || !item) { setDialog({ kind: 'group', item }); return }
    if (opening) return
    setOpening(true)
    try {
      const state = await live.room('groups.state', { room_id: item.id })
      if (api.current() !== record) return
      setDialog({ kind: 'group', item: { ...item, ...gatewayGroup(state.room, state.context, state.driver_status, item) } })
    } catch (error) { if (api.current() === record) report(error.message, true) }
    finally { setOpening(false) }
  }

  async function saveGroup(settings, _options, editorItem = dialog?.item ?? selectedItem) {
    const editing = Boolean(editorItem)
    const message = editing ? '群聊设置已保存' : '群聊已创建'
    if (!live) return save('group', settings, message)
    const room_id = settings.id
    if (!editing) {
      const members = settings.members.map(id => groupBots.find(bot => bot.id === id))
      if (members.some(bot => !bot)) return '有成员不可用，请重新选择。'
      const created=await live.room('groups.create', { room_id, name: settings.name, members: members.map(bot=>({...bot})) })
      if(created?.unjoined?.length)setPeerStatus(previous=>({...previous,[room_id]:created.unjoined.map(item=>item.error).join('；')}))
    } else if (settings.name !== editorItem.name) {
      await live.room('groups.rename', { room_id, name: settings.name, event_id: newId() })
    }
    const currentState = await live.room('groups.state', { room_id })
    const selectedLead=editing ? groupMember(editorItem, record.bots, settings.lead) : groupBots.find(bot=>bot.id===settings.lead)
    const lead_member_id=currentState.room.members.find(member=>member.profile===selectedLead?.profile &&
      (selectedLead?.target?.kind==='peer' ? member.target?.installation_id===selectedLead.target.installation_id :
        selectedLead?.connectionId && selectedLead.connectionId!==live.route?.connectionId ? member.target?.kind==='peer' &&
          (!selectedLead.installId || member.target.installation_id==='install:'+selectedLead.installId) : member.target?.kind!=='peer'))?.member_id ?? ''
    const { purpose, notes, routing } = settings
    if (purpose !== (currentState.context?.purpose ?? '') || notes !== (currentState.context?.notes ?? '') ||
        routing !== (currentState.context?.routing ?? 'everyone') || lead_member_id !== (currentState.context?.lead_member_id ?? '')) {
      await live.room('groups.context', { room_id, event_id: newId(), purpose, notes, routing, lead_member_id })
    }
    const [rooms, snapshot] = await Promise.all([live.rooms(), live.room('groups.state', { room_id })])
    if (api.current() === record) {
      api.syncGatewayRooms(rooms)
      api.updateGatewayRoomSettings(snapshot)
      refresh()
      report(message)
    }
  }

  async function reconnectPeers(group) {
    setOpening(true)
    try {
      const state=await live.room('groups.state',{room_id:group.id})
      const roster=await live.groupCandidates(record.bots)
      const result=await live.retryGroupPeers(state.room,roster)
      if(api.current()!==record)return
      setPeerStatus(previous=>({...previous,[group.id]:result.unjoined.map(item=>item.error).join('；')}))
      report(result.unjoined.length?'仍有成员未连接，请检查对应网关。':'远端成员连接已确认。',result.unjoined.length>0)
    }catch(error){if(api.current()===record)report(error.message,true)}
    finally{setOpening(false)}
  }

  async function disbandGroup(item) {
    await live.room('groups.disband', { room_id: item.id, cancel_id: newId() })
    const rooms = await live.rooms()
    if (api.current() === record) {
      api.syncGatewayRooms(rooms)
      if (selected === item.id) onNavigate('bots')
      refresh()
      report('群聊已解散')
    }
  }

  async function removeBot(bot) {
    const result = await live.deleteBot(bot.profile, bot.identity)
    if (api.current() !== record) return
    const removed = record.bots.find(item => item.id === bot.id && item.identity === bot.identity)
    if (removed) {
      api.syncGatewayBots(record.bots.filter(item => item !== removed))
      if (selected === bot.id) onNavigate('bots')
    }
    refresh()
    report(result.settlementPending || result.registrationPending ? 'Bot 已删除，AIWATA 仍需清理部分旧路由。' : 'Bot 已删除')
  }

  const detail = selectedItem && <BotSettingsContent key={selectedItem.id} item={selectedItem} kind={bots.length ? 'bot' : 'group'} record={record}
    management={management} live={live} Editor={BotEditor} GroupEditor={GroupEditor} report={report}
    onSave={bots.length ? saveBot : saveGroup} onDirtyChange={onDirtyChange} onBusyChange={onBusyChange}
    onOpenProfileSection={onOpenProfileSection} onOpenNativeSettings={onOpenNativeSettings} />
  if (embedded) return detail ?? <Empty>{"该 Bot 或群聊已移除。"}</Empty>
  return <Frame live={live} icon="botChat" title={selectedItem ? selectedItem.name + (bots.length ? ' · Bot 设置' : ' · 群聊设置') : "全部 Bot 管理"}
    description={selectedItem ? '设置仅作用于当前选中的 Bot 或群聊。' : '集中查找、创建和整理 Bot；具体能力在各自设置中调整。'}
    back={onNavigate && { label: '返回 Bot 与群聊', onClick: () => onNavigate('bots') }}
    actions={!selected && <>
      <button className="secondary" onClick={() => void openGroup()}><Icon name="group" size={/* @ai-token sys.icon.size.15 */ 15} />{"新建群聊"}</button>
      <button className="primary" disabled={opening} onClick={() => void openEditor()}><Icon name="add" size={/* @ai-token sys.icon.size.15 */ 15} />{"新建 Bot"}</button>
    </>}>
    {selected ? detail ?? <Empty>{"该 Bot 或群聊已移除。"}</Empty> : <>
      <div className="bot-manager-toolbar">
        <input type="search" aria-label={"搜索 Bot 与群聊"} placeholder={"搜索名称、职责或模型"} value={search ?? ''} onChange={event => onPageChange?.({mainSearch: event.target.value})} />
        <div className="bot-manager-filters" aria-label={"管理列表筛选"}>{[['all', '全部'], ['bots', 'Bot'], ['groups', '群聊']].map(([value, label]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      </div>
      {filter !== 'groups' && <Panel title={'Bot · ' + bots.length}>
        {bots.length ? bots.map(bot => <Entry key={bot.id} face={<BotFace bot={bot} state={botPresence(record.chats[bot.id])} size="activity" still />} title={bot.name}
          subtitle={[bot.description, modelSelection(bot)?.label ?? (bot.model || '工作区默认模型')].filter(Boolean).join(' · ')}>
          {chatButton(bot)}
          <button className="secondary" aria-label={'设置 Bot · ' + bot.name} onClick={() => (onManageBot ?? onSelectItem)?.(bot.id)}>{"设置"}</button>
          <IconButton icon="trash" label={'删除 Bot · ' + bot.name} disabled={Boolean(bot.isDefault || (live && !bot.identity))} title={bot.isDefault ? "默认 Bot 使用工作区 Profile，不能删除" : undefined}
            onClick={() => setDialog({ kind: 'remove', type: 'bot', item: bot })} />
        </Entry>) : <Empty>{query ? '没有匹配的 Bot。' : '暂无 Bot。'}</Empty>}
      </Panel>}
      {filter !== 'bots' && <Panel title={'群聊 · ' + groups.length}>
        {groups.length ? groups.map(group => <div key={group.id}>
          <Entry face={<GroupFace account={account} members={resolveGroupMembers(group, record.bots).map(id => groupMember(group,record.bots,id))} large />}
            title={group.name} subtitle={group.purpose || '协作群聊'}>
            {chatButton(group)}
            <button className="secondary" aria-label={'设置群聊 · ' + group.name} onClick={() => (onManageBot ?? onSelectItem)?.(group.id)}>{"设置"}</button>
            {live?.retryGroupPeers && group.memberDetails?.some(m => m.peer) && <button className="secondary" disabled={opening} onClick={() => void reconnectPeers(group)}>{"重连成员"}</button>}
            <IconButton icon="trash" label={'解散群聊 · ' + group.name} onClick={() => setDialog({ kind: 'remove', type: 'group', item: group })} />
          </Entry>
          {peerStatus[group.id] && <p role="alert" className="management-error">{"群聊已保留，部分成员未连接："}{peerStatus[group.id]}</p>}
        </div>) : <Empty>{query ? '没有匹配的群聊。' : '暂无群聊。'}</Empty>}
      </Panel>}
    </>}
    {dialog?.kind === 'bot' && <BotEditor item={dialog.item} bots={record.bots} management={management} onClose={close}
      live={live} details={dialog.details} onSave={saveBot} />}
    {dialog?.kind === 'group' && (live?.groupCandidates && !dialog.item && !candidates ? <Dialog title={"新建群聊"} onClose={close} submit={null}>
      {candidateError ? <p role="alert">{candidateError}</p> : <p role="status">{"正在读取各连接的 Bot…"}</p>}
    </Dialog> : <GroupEditor item={dialog.item} bots={groupBots} onClose={close} live={live} onSave={saveGroup} />)}
    {dialog?.kind === 'remove' && <Confirm title={dialog.type === 'group' ? "解散群聊？" : '删除 ' + dialog.item.name + '？'} onClose={close}
      submit={dialog.type === 'group' ? "解散" : "删除"}
      onConfirm={() => references.length ? '请先移除此 Bot 的群聊成员关系。'
        : live ? dialog.type === 'group' ? disbandGroup(dialog.item) : removeBot(dialog.item)
          : commit(() => api.removeBotEntity(dialog.type, dialog.item.id), '已移除 ' + dialog.item.name)}>
      {references.length ? '此 Bot 仍在「' + references.join('」「') + '」中。托管群不支持移除成员，请先解散相关群聊。'
        : dialog.type === 'group' ? (live ? '解散将停止群聊工作，并从工作台移除此群。' : '此操作将移除演示群聊及其会话记录。')
          : live ? '将永久删除此 Bot 的专属会话、记忆、技能、连接器凭据和定时任务。'
            : '此操作将移除演示 Bot 及其专属会话记录。'}
    </Confirm>}
  </Frame>
}

function TaskEditor({ item, record, taskProfile, roomDeliveries, onClose, onSave, onBlueprintCreated, live }) {
  const requestId = useRef(null)
  const [profile, setProfile] = useState(item?.profile ?? taskProfile ?? defaultProfile)
  const [delivery, setDelivery] = useState(item?.deliver ?? 'local')
  const [inventory, setInventory] = useState(null)
  const [templates, setTemplates] = useState(null)
  const [templateKey, setTemplateKey] = useState('')
  const scriptOnly = scriptOnlyTask(item)
  const nativeProfile = item?.gatewayProfile ?? (profile === defaultProfile ? 'default' : record.bots.find(bot => bot.id === profile)?.profile)
  const targets = inventory?.profile === nativeProfile ? inventory?.targets ?? [] : []
  const missingRoom = delivery.startsWith('room:') && !roomDeliveries.some(room => room.value === delivery)
  const missingPlatform = live && gatewayTaskPlatform(delivery) && !targets.some(target => target.id === delivery)
  const unsupported = live && delivery !== 'local' && !delivery.startsWith('room:') && !gatewayTaskPlatform(delivery)

  useEffect(() => {
    if (!live || !nativeProfile) return
    let current = true
    live.task('targets', { profile: nativeProfile }).then(rows => {
      if (current) setInventory({ profile: nativeProfile, targets: rows })
    }, error => {
      if (current) setInventory({ profile: nativeProfile, error: error.message })
    })
    return () => { current = false }
  }, [live, nativeProfile])

  useEffect(() => {
    if (!live?.native || item || !nativeProfile) return
    let current = true
    setTemplates(null)
    live.task('blueprints', { profile: nativeProfile }).then(result => {
      if (current) setTemplates({ profile: nativeProfile, items: result.blueprints || [] })
    }, error => { if (current) setTemplates({ profile: nativeProfile, error: error.message, items: [] }) })
    return () => { current = false }
  }, [live, nativeProfile, item])
  const blueprint = templates?.profile === nativeProfile && templates.items.find(row => row.key === templateKey)
  if (blueprint) return <NativeTaskBlueprintDialog key={nativeProfile + ':' + blueprint.key} live={live} profile={nativeProfile} blueprint={blueprint}
    targets={targets} rooms={roomDeliveries} onClose={() => setTemplateKey('')} onCreated={async () => { await onBlueprintCreated(); onClose() }} />

  return <Dialog title={item ? '编辑定时任务' : '新建定时任务'} onClose={onClose} onSubmit={form => {
    const name = valueOf(form, 'name')
    const schedule = valueOf(form, 'schedule')
    const prompt = valueOf(form, 'prompt')
    const timezone = valueOf(form, 'timezone')
    const repeat = valueOf(form, 'repeat')
    if (!name || !scriptOnly && !prompt) return '请输入任务名称和执行指令。'
    if (!schedule) return '请输入执行时间。'
    if (!live && !isScheduleInput(schedule)) return '请输入 Cron 表达式、间隔、延时或日期时间。'
    if (timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone })
      } catch {
        return '请输入有效的时区，如 Asia/Shanghai。'
      }
    }
    const deliver = delivery
    if (deliver.startsWith('room:') && !roomDeliveries.some(room => room.value === deliver)) return '请选择仍可用的投递群聊。'
    if (unsupported || (live && gatewayTaskPlatform(deliver) && !targets.some(target => target.id === deliver && target.configured))) {
      return '请选择当前 Profile 的可用投递目标。'
    }
    let advanced = {}
    if (live?.native) {
      if (!scriptOnly) {
        const choice = valueOf(form, 'modelChoice')
        const pair = choice ? JSON.parse(choice) : ['', '']
        advanced = { model: pair[1], provider: pair[0] }
      }
      const policy = valueOf(form, 'catchUp')
      const catchUp = policy === 'once' ? true : policy === 'skip' ? false : null
      advanced = { ...advanced, catchUp, catchUpChanged: Boolean(item && catchUp !== item.catchUp) }
    }
    return onSave({
      history: [], enabled: true, ...item, id: item?.id ?? (requestId.current ??= newId()), name, schedule, prompt, timezone, repeat,
      profile: live && item ? item.profile : valueOf(form, 'profile'), deliver, workdir: valueOf(form, 'workdir'),
      ...advanced,
    })
  }} submit={item ? '保存' : '创建'}>
    {live?.native && !item && <label>从模板开始<select value={templateKey} onChange={event => setTemplateKey(event.target.value)}>
      <option value="">自定义任务</option>{(templates?.profile === nativeProfile ? templates.items : []).map(row => <option key={row.key} value={row.key}>{row.title}</option>)}
    </select>{templates?.error && <small role="alert">模板读取失败：{templates.error}</small>}</label>}
    <Field label="任务名称" name="name" defaultValue={item?.name} placeholder="例如 每周项目摘要" maxLength={100} required autoFocus />
    {scriptOnly ? <><p>此任务只运行已保存脚本，不调用模型。编辑计划会保留脚本与原执行方式。</p><pre>{item.script}</pre></>
      : <Text label="执行指令" name="prompt" defaultValue={item?.prompt} placeholder="到时间后，交给 Agent 做什么？" required />}
    {live?.native && !scriptOnly && <NativeCronModelField key={nativeProfile} live={live} profile={nativeProfile} model={item?.model} provider={item?.provider} />}
    {live?.native && <label>错过计划后的处理<select name="catchUp" defaultValue={item?.catchUp === true ? 'once' : item?.catchUp === false ? 'skip' : 'default'}>
      <option value="default">使用调度器默认策略</option><option value="once">恢复后补跑一次</option><option value="skip">跳过错过的执行</option>
    </select></label>}
    <div className="management-field-pair">
      <Field label="执行时间" name="schedule" defaultValue={item?.schedule} placeholder="例如 0 9 * * 1" required />
      <Field label="时区（可选）" name="timezone" defaultValue={item?.timezone} placeholder="例如 Asia/Shanghai" />
    </div>
    <small>支持 0 9 * * 1、every 2h、in 30m 或 ISO 日期时间。</small>
    <div className="management-field-pair">
      {live && item ? <Field label="所属 Profile" value={record.bots.find(bot => bot.id === item.profile)?.name ?? '默认 Profile'} readOnly />
        : <Profiles bots={record.bots} name="profile" value={profile} onChange={event => {
          setProfile(event.target.value)
          setInventory(null)
          if (live && gatewayTaskPlatform(delivery)) setDelivery('local')
        }} />}
      <Field label="重复次数（可选）" name="repeat" type="number" min="1" step="1" defaultValue={item?.repeat} placeholder="不限" />
    </div>
    <div className="management-field-pair">
      <label>投递方式<select aria-label="投递方式" name="deliver" value={delivery} onChange={event => setDelivery(event.target.value)}>
        <option value="local">仅保存到本地</option>
        {!live && <>
          <option value="origin">来源会话或默认频道</option>
          <option value="all">所有配置了默认频道的平台</option>
        </>}
        {missingRoom && <option value={delivery}>群聊已移除</option>}
        {missingPlatform && <option value={delivery}>{taskPlatformName(delivery)} · 默认频道不可用</option>}
        {unsupported && <option value={delivery}>由 AIWATA 管理的投递目标</option>}
        {!!roomDeliveries.length && <optgroup label="投递到群聊">
          {roomDeliveries.map(room => <option key={room.value} value={room.value}>{room.name}</option>)}
        </optgroup>}
        {!!targets.length && <optgroup label="投递到平台默认频道">
          {targets.map(target => <option key={target.id} value={target.id} disabled={!target.configured}>
            {taskPlatformName(target.id, target.name)}{target.configured ? '' : ' · 未设置默认频道'}
          </option>)}
        </optgroup>}
      </select></label>
      <label>工作目录<select aria-label="工作目录" name="workdir" defaultValue={item?.workdir ?? ''}>
        <option value="">{live ? '当前账号工作区' : '使用默认目录'}</option>
        {item?.workdir && !record.projects.some(project => project.folder === item.workdir) && <option value={item.workdir}>{item.workdir}</option>}
        {record.projects.filter(project => project.folder).map(project => <option value={project.folder} key={project.id}>{project.name}</option>)}
      </select></label>
    </div>
    {live && inventory?.profile === nativeProfile && inventory?.error && <small role="status">{inventory.error}</small>}
  </Dialog>
}

const deliveryLabels = { local: '仅保存到本地', origin: '来源会话或默认频道', all: '所有配置了默认频道的平台' }
const deliveryOutcomes = {
  delivered: '已投递', queued: '等待投递', failed: '投递失败', unverified: '投递结果待确认',
  not_configured: '未找到投递目标', suppressed: '已跳过投递', suppressed_acked: '已跳过投递',
}
function taskPlatformName(platform, fallback) {
  return platforms[platform]?.name ?? fallback ?? platform.replace(/(^|[_-])([a-z])/g, (_, prefix, letter) => (prefix ? ' ' : '') + letter.toUpperCase())
}

function LiveTaskHistory({ live, task, onOpenTaskSession }) {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState('')
  const { gatewayId, gatewayProfile, running, lastRun } = task
  useEffect(() => {
    let current = true
    void live.task('history', { id: gatewayId, profile: gatewayProfile }).then(({ runs }) => {
      if (!current) return
      setHistory(runs)
      setError('')
    }).catch(problem => { if (current) setError(problem.message) })
    return () => { current = false }
  }, [live, gatewayId, gatewayProfile, running, lastRun])
  if (error) return <Empty>{error}</Empty>
  if (!history) return <Empty>正在读取运行记录…</Empty>
  if (!history.length) return <Empty>暂无运行记录。</Empty>
  return history.map(row => {
    const status = {
      running: ['运行中', 'positive'],
      cron_complete: ['成功', 'positive'],
      cron_incomplete_no_output: ['执行未完成', 'warning'],
      cancelled: ['已停止', ''],
      failed: ['执行异常', 'warning'],
    }[row.status] ?? ['已结束', '']
    return <div key={row.id}>
      <Entry title={dateLabel(row.started_at * 1000)} subtitle={row.title}>
        <Badge tone={status[1]}>{status[0]}</Badge>
        {cronRunRoute(row, live.route, gatewayProfile) && <button className="secondary" disabled={!onOpenTaskSession}
          title={!onOpenTaskSession ? '尚未接入运行会话路由' : undefined} onClick={() => onOpenTaskSession(cronRunRoute(row, live.route, gatewayProfile))}>打开完整会话</button>}
      </Entry>
      {row.result && <p className="management-task-result">{row.result}</p>}
    </div>
  })
}

function Tasks({ record, selected, management, persist, api, report, openGroups, onGroupOpenChange, taskProfile, onPageChange, onSelectItem, onOpenTaskSession, live, refresh }) {
  const [dialog, setDialog] = useState(null)
  const [loadState, setLoadState] = useState(null)
  const [busy, setBusy] = useState({})
  const inventorySequence = useRef(0)
  const close = () => setDialog(null)
  const tasks = selected && selected !== 'all' ? management.tasks.filter(item => item.id === selected)
    : management.tasks.filter(item => !taskProfile || item.profile === taskProfile)
  const save = (task, message) => persist({ tasks: replaceEntry(management.tasks, task) }, message)
  const roomDeliveries = record.groups.flatMap(({ id, name, gatewayRoom }) => {
    const value = 'room:' + id + (live ? '@default' : '')
    return !live || (gatewayRoom && gatewayTaskRoomId(value)) ? [{ id, name, value }] : []
  })
  const groupFor = task => roomDeliveries.find(room => room.value === task.deliver)
  const deliveryLabel = task => task.deliver?.startsWith('room:')
    ? (groupFor(task) ? '投递到 ' + groupFor(task).name : '投递群聊已移除')
    : gatewayTaskPlatform(task.deliver) ? taskPlatformName(task.deliver) + ' 默认频道' : deliveryLabels[task.deliver]

  async function readTasks() {
    const request = ++inventorySequence.current
    try {
      const jobs = await live.task('list')
      if (request !== inventorySequence.current || api.current() !== record) return
      api.updateManagement({ tasks: jobs.map(gatewayTask) })
      setLoadState('')
      refresh()
    } catch (error) {
      if (request === inventorySequence.current && api.current() === record) setLoadState(error.message)
    }
  }

  useEffect(() => {
    if (!live) return
    let timer
    let disposed = false
    async function poll() {
      await readTasks()
      if (!disposed) timer = setTimeout(poll, 4000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer); inventorySequence.current++ }
  }, [live, api, record, refresh])

  async function saveLive(task) {
    const profile = task.gatewayProfile ?? (task.profile === defaultProfile ? 'default' : record.bots.find(bot => bot.id === task.profile)?.profile)
    const data = live.native ? nativeCronPayload(task) : Object.fromEntries(['name','prompt','schedule','timezone','repeat','workdir','deliver'].map(key => [key,task[key]]))
    await live.task('save', { id: task.gatewayId, requestId: task.id, profile, data })
    if (api.current() !== record) return
    await readTasks()
    report('定时任务已保存')
  }

  async function changeLive(task, action, message) {
    const operation = task.id + ':' + action
    if (busy[operation]) return
    setBusy(current => ({ ...current, [operation]: true }))
    try {
      await live.task(action, { id: task.gatewayId, profile: task.gatewayProfile })
      if (api.current() !== record) return
      if (action === 'remove' && selected === task.id) onSelectItem('all')
      await readTasks()
      if (message) report(message)
    } finally {
      setBusy(current => ({ ...current, [operation]: false }))
    }
  }
  const act = (task, action, message) => void changeLive(task, action, message).catch(error => {
    if (api.current() === record) report(error.message, true)
  })

  function run(task) {
    const destination = groupFor(task)
    if (task.deliver?.startsWith('room:') && !destination) { report('投递群聊已移除，请先更新任务。', true); return }
    const id = newId()
    const result = api.charge({ id, kind: '托管定时任务 · ' + task.name, source: 'managed', amount: 8 })
    if (result.ok && destination) api.postGroupTaskResult(destination.id, {
      id, name: task.name, text: '模拟执行完成\n\n' + task.prompt,
    })
    const row = { id, time: Date.now(), status: result.ok ? '成功' : '失败',
      detail: result.ok ? '模拟执行完成 · ' + deliveryLabel(task) : '积分不足，本次未执行' }
    const error = save({ ...task, enabled: result.ok || task.enabled, history: [row, ...task.history] },
      result.ok ? task.enabled ? '已模拟运行 · 8 积分' : '已恢复并模拟运行 · 8 积分' : undefined)
    if (error || !result.ok) report(error || row.detail, true)
  }

  return <Frame live={live} icon="clock" title="定时任务" description="配置执行计划、工作目录和投递方式，查看每次运行的结果。"
    actions={<>
      <label className="management-select">按 Profile 筛选<select value={taskProfile ?? ''} onChange={event => {
        onPageChange({ taskProfile: event.target.value || null })
        if (selected && selected !== 'all') onSelectItem('all')
      }}>
        <option value="">所有 Profile</option><option value={defaultProfile}>默认 Profile</option>
        {record.bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
      </select></label>
      <button className="primary" onClick={() => setDialog({ kind: 'edit' })}><Icon name="add" size={/* @ai-token sys.icon.size.15 */ 15} />新建任务</button>
    </>}>
    {loadState && live && <p role="alert" className="management-error">{loadState}</p>}
    {tasks.length ? tasks.map(task => {
      const profile = record.bots.find(bot => bot.id === task.profile)
      const hasProfile = task.profile === defaultProfile || !!profile
      const historyOpen = openGroups?.[task.id] ?? (selected === task.id)
      const running = live && Boolean(task.running || busy[task.id + ':run'])
      const completed = live && task.state === 'completed'
      const badge = running ? '运行中' : completed ? '已完成' : task.enabled ? '已启用' : '已暂停'
      return <Panel key={task.id} title={task.name}
        description={[task.schedule, task.timezone, profile?.name ?? (hasProfile ? '默认 Profile' : 'Profile 已移除'), deliveryLabel(task)].filter(Boolean).join(' · ')}
        actions={<>
          <Badge tone={task.enabled || running ? 'positive' : ''}>{badge}</Badge>
          <button className="secondary" onClick={() => setDialog({ kind: 'edit', item: task })}>编辑</button>
          <IconButton icon="trash" label={'删除任务 · ' + task.name} onClick={() => setDialog({ kind: 'remove', item: task })} />
        </>}>
        <div className="management-task-content">
          <p>{task.prompt || (scriptOnlyTask(task) ? '脚本任务 · ' + task.script : '未填写执行指令')}</p>
          {live && task.model && <small>任务模型 · {task.provider} / {task.model}</small>}
          {task.workdir && <small>工作目录 · {task.workdir}</small>}
          {live && task.enabled && task.nextRun && <small>下次运行 · {dateLabel(task.nextRun)}</small>}
          {live && task.lastError && <small className="management-error">上次运行 · {task.lastError}</small>}
          {live && task.lastDeliveryError && <small className="management-error">上次投递 · {task.lastDeliveryError}</small>}
          {live && task.deliver !== 'local' && !task.lastDeliveryError && deliveryOutcomes[task.deliveryOutcome] &&
            <small>上次投递 · {deliveryOutcomes[task.deliveryOutcome]}</small>}
          <div className="management-actions">
            <button className="secondary" disabled={completed || busy[task.id + ':pause'] || busy[task.id + ':resume']} onClick={() => {
              const message = task.enabled ? '任务已暂停' : '任务已恢复'
              if (live) act(task, task.enabled ? 'pause' : 'resume', message)
              else save({ ...task, enabled: !task.enabled }, message)
            }}>
              {task.enabled ? '暂停任务' : '恢复任务'}
            </button>
            {running ? <button className="secondary" disabled={!task.running || busy[task.id + ':stop']} onClick={() => act(task, 'stop')}>
              停止运行
            </button> : <button className="primary" disabled={completed || !hasProfile || (task.deliver?.startsWith('room:') && !groupFor(task))}
              onClick={() => live ? act(task, 'run') : run(task)}>
              {live ? task.enabled ? '立即运行' : '恢复并运行' : task.enabled ? '模拟运行 · 8 积分' : '恢复并模拟运行 · 8 积分'}
            </button>}
          </div>
        </div>
        <details className="management-history" open={historyOpen}>
          <summary onClick={event => {
            event.preventDefault()
            onGroupOpenChange(task.id, !historyOpen)
          }}>运行历史 {!live && <span>{task.history.length}</span>}</summary>
          {live ? historyOpen && <LiveTaskHistory live={live} task={task} onOpenTaskSession={onOpenTaskSession} /> : <>
            {task.runs > 0 && <Empty>旧版模拟运行 {task.runs} 次，无明细记录。</Empty>}
            {task.history.length ? task.history.map(row => <Entry key={row.id} title={dateLabel(row.time)} subtitle={row.detail}>
            <Badge tone={row.status === '成功' ? 'positive' : 'warning'}>{row.status}</Badge>
            </Entry>) : !task.runs && <Empty>暂无运行记录。</Empty>}
          </>}
        </details>
      </Panel>
    }) : !live ? <Empty>暂无任务。新建任务后，可手动模拟运行并查看历史。</Empty>
      : loadState === null ? <Empty>正在读取定时任务…</Empty> : !loadState && <Empty>暂无任务。</Empty>}
    {dialog?.kind === 'edit' && <TaskEditor item={dialog.item} record={record} taskProfile={taskProfile} roomDeliveries={roomDeliveries} onClose={close}
      onBlueprintCreated={async () => { await readTasks(); report('模板任务已创建') }}
      live={live} onSave={live ? saveLive : item => save(item, '定时任务已保存')} />}
    {dialog?.kind === 'remove' && <Confirm title={'删除 ' + dialog.item.name + '？'} onClose={close}
      onConfirm={() => live ? changeLive(dialog.item, 'remove', '定时任务已删除')
        : persist({ tasks: management.tasks.filter(task => task.id !== dialog.item.id) }, '定时任务已删除')}>
      {live ? '删除后，此任务将停止调度，并从任务列表移除。' : '此操作将同时移除演示运行历史。'}
    </Confirm>}
  </Frame>
}

function ConnectorEditor({ item, onSave, onClose }) {
  const platform = platforms[item.id]
  return <Dialog title={'配置 ' + item.name} onClose={onClose} onSubmit={form => onSave({
    ...item, enabled: form.has('enabled'), configured: form.has('configured'),
    fields: Object.fromEntries(platform.fields.map(([id]) => [id, valueOf(form, id)])),
  })}>
    <label className="management-check"><input name="enabled" type="checkbox" defaultChecked={item.enabled} />启用连接器</label>
    {platform.fields.map(([id, label]) => <Field key={id} name={id} label={label} defaultValue={item.fields[id]} placeholder="填写演示值" />)}
    <label className="management-check"><input name="configured" type="checkbox" defaultChecked={item.configured} />
      {'已准备' + platform.credential}
    </label>
    <small>此处使用演示值。真实凭据由 Hermes 的 Profile 配置保存。</small>
  </Dialog>
}

function Connectors({ record, management, selected, persist, report, profile, setProfile, openGroups, onGroupOpenChange }) {
  const [editing, setEditing] = useState(null)
  const saved = management.connectorProfiles?.[profile] ?? {}
  const scoped = profile === defaultProfile ? management.connectors : management.connectors.map(item => ({
    id: item.id, name: item.name, enabled: false, configured: false, fields: {}, logs: [], ...saved[item.id],
  }))
  const items = selected && selected !== 'all' ? scoped.filter(item => item.id === selected) : scoped
  function save(item, message) {
    if (profile === defaultProfile) return persist({ connectors: replaceEntry(scoped, item) }, message)
    return persist({ connectorProfiles: { ...management.connectorProfiles, [profile]: { ...saved, [item.id]: item } } }, message)
  }
  function test(item) {
    const ok = item.enabled && item.configured
    const message = !item.enabled ? '连接器已停用，请先启用。' : !item.configured ? '请先完成演示凭据配置。' : '模拟网关连接检查通过。'
    const error = save({ ...item, logs: [{ id: newId(), time: Date.now(), ok, message }, ...item.logs].slice(0, 30) })
    report(error || message, !!error || !ok)
  }

  return <Frame icon="link" title="消息连接器" description="按 Profile 配置消息平台，检查连接状态并查看测试日志。"
    actions={<Profiles bots={record.bots} label="管理 Profile" value={profile} onChange={event => setProfile(event.target.value)} />}>
    <Panel title="消息平台" description="测试模拟网关对当前配置的检查结果。">
      {items.length ? items.map(item => {
        const group = JSON.stringify([profile, item.id])
        const logOpen = openGroups?.[group] ?? (selected === item.id)
        return <div className="management-connector" key={item.id}>
          <Entry icon={platforms[item.id].icon} title={item.name} subtitle={item.fields.account || '消息网关'}>
            <Badge tone={item.enabled && item.configured ? 'positive' : ''}>{item.enabled ? item.configured ? '配置就绪' : '待配置' : '已停用'}</Badge>
            <button className="secondary" onClick={() => setEditing(item)}>配置</button>
            <button className="secondary" onClick={() => test(item)}>测试连接</button>
          </Entry>
          <details className="management-history" open={logOpen}>
            <summary onClick={event => {
              event.preventDefault()
              onGroupOpenChange(group, !logOpen)
            }}>连接日志 <span>{item.logs.length}</span></summary>
            {item.legacyRuns > 0 && <Empty>旧版模拟触发 {item.legacyRuns} 次，无明细记录。</Empty>}
            {item.logs.length ? item.logs.map(row => <Entry key={row.id} title={row.message} subtitle={dateLabel(row.time)}>
              <Badge tone={row.ok ? 'positive' : 'warning'}>{row.ok ? '通过' : '待处理'}</Badge>
            </Entry>) : !item.legacyRuns && <Empty>暂无测试日志。</Empty>}
          </details>
        </div>
      }) : <Empty>请选择一个消息平台。</Empty>}
    </Panel>
    {editing && <ConnectorEditor item={editing} onClose={() => setEditing(null)} onSave={item => save(item, '连接配置已保存')} />}
  </Frame>
}

const skillSources = { agent: '本 Profile', bundled: 'AIWATA 内置', hub: '目录安装' }

function Skills({ record, management, selected, persist, onSelectItem, profile, setProfile, search, onPageChange, live, report }) {
  const [dialog, setDialog] = useState(null)
  const [view, setView] = useState('installed')
  const [remote, setRemote] = useState(null)
  const [revision, refreshSkills] = useState(0)
  const [opening, setOpening] = useState(false)
  const current = onSelectItem ? selected || view : view
  useEffect(() => { if (selected) setView(selected) }, [selected])
  const close = () => setDialog(null)
  const installed = current === 'installed'
  const nativeProfile = profile === defaultProfile ? defaultProfile : record.bots.find(bot => bot.id === profile)?.profile
  const remoteKey = nativeProfile + ':' + current
  const currentKey = useRef(remoteKey)
  currentKey.current = remoteKey
  const rows = remote?.key === remoteKey ? remote : null

  useEffect(() => {
    if (!live) return
    let active = true
    const action = installed ? 'list' : 'catalog'
    void live.skill(action, nativeProfile).then(result => {
      if (active) setRemote({ key: remoteKey, result })
    }).catch(error => { if (active) setRemote({ key: remoteKey, error: error.message }) })
    return () => { active = false }
  }, [live, nativeProfile, remoteKey, installed, revision])

  const inventory = live ? (rows?.result ?? []).map(skill => installed
    ? { ...skill, id: skill.name, source: skillSources[skill.provenance] ?? '技能目录', installed: true }
    : { ...skill, id: skill.identifier, source: 'AIWATA 官方目录' })
    : getProfileSkills(management, profile)
  const query = search.trim().toLowerCase()
  const skills = inventory.filter(skill =>
    (!installed || skill.installed) && [skill.name, skill.id, skill.category, skill.description].some(value => value?.toLowerCase().includes(query)))

  async function mutate(action, params, message) {
    await live.skill(action, nativeProfile, params)
    refreshSkills(value => value + 1)
    if (message) report(message)
  }

  async function openContent(skill) {
    if (opening) return
    setOpening(true)
    try {
      const detail = await live.skill('content', nativeProfile, { id: skill.id })
      if (currentKey.current === remoteKey) setDialog({ kind: 'content', skill, detail })
    } catch (error) { if (currentKey.current === remoteKey) report(error.message, true) }
    finally { setOpening(false) }
  }

  async function saveLiveSettings(skill, form) {
    const enabled = form.has('enabled')
    const locked = form.has('locked')
    if (enabled !== skill.enabled) await mutate('toggle', { id: skill.id, value: enabled })
    if (locked !== skill.locked) await mutate('lock', { id: skill.id, value: locked })
    report('技能设置已保存')
  }

  function save(skill, patch, message) {
    const overrides = management.skills[profile] ?? {}
    return persist({ skills: { ...management.skills, [profile]: {
      ...overrides, [skill.id]: { ...overrides[skill.id], ...patch },
    } } }, message)
  }

  return <Frame live={live} icon="spark" title="技能工具" description="按 Profile 浏览技能目录、安装技能和管理加载状态。"
    actions={<>
      <Profiles bots={record.bots} label="管理 Profile" value={profile} onChange={event => { close(); setProfile(event.target.value) }} />
      {live && installed && <button className="primary" onClick={() => setDialog({ kind: 'create' })}><Icon name="add" size={/* @ai-token sys.icon.size.15 */ 15} />新建技能</button>}
    </>}>
    <div className="management-toolbar">
      <div className="management-tabs" aria-label="技能列表">
        {[['installed', '已安装'], ['available', '技能目录']].map(([id, label]) =>
          <button type="button" key={id} aria-pressed={current === id} onClick={() => { setView(id); onSelectItem?.(id) }}>{label}</button>)}
      </div>
      <label className="search-box"><Icon name="search" /><input aria-label="搜索技能" placeholder="搜索技能" value={search}
        onChange={event => onPageChange({ mainSearch: event.target.value })} /></label>
    </div>
    <div className="management-skill-grid">
      {skills.map(skill => <article className="management-skill" key={skill.id}>
        <div className="management-skill-title"><span className="entry-icon"><Icon name="spark" size={/* @ai-token sys.icon.size.18 */ 18} /></span>
          <div><h3>{skill.name}</h3><small>{[skill.category, skill.source].filter(Boolean).join(' · ')}</small></div>
          <Badge tone={skill.installed && skill.enabled ? 'positive' : ''}>
            {skill.installed ? live && !installed ? '已安装' : skill.enabled ? '已启用' : '已停用' : '可安装'}
          </Badge>
        </div>
        <p>{skill.description}</p>
        <div className="management-actions">
          {skill.installed ? live && !installed
            ? <button className="secondary" onClick={() => { setView('installed'); onSelectItem?.('installed') }}>查看已安装</button>
            : <>
              <button className="secondary" onClick={() => setDialog({ kind: 'settings', skill })}>
                <Icon name="settings" size={/* @ai-token sys.icon.size.15 */ 15} />技能设置
              </button>
              {live && <button className="secondary" disabled={opening} onClick={() => void openContent(skill)}>查看内容</button>}
            </> : <button className="primary" onClick={() => setDialog({ kind: 'install', skill })}>
              <Icon name="add" size={/* @ai-token sys.icon.size.15 */ 15} />安装
            </button>}
        </div>
      </article>)}
    </div>
    {rows?.error && <p role="alert" className="management-error">{rows.error}</p>}
    {!skills.length && !rows?.error && <Empty>{live && !rows ? '正在读取技能…'
      : query ? '没有匹配的技能。' : installed ? '此 Profile 暂无已安装技能。' : '技能目录暂无条目。'}</Empty>}
    {dialog?.kind === 'install' && <Dialog title={'安装 ' + dialog.skill.name} onClose={close} submit={live ? '安装' : '模拟安装'}
      onSubmit={() => live ? mutate('install', { id: dialog.skill.id }, '技能已安装')
        : save(dialog.skill, { installed: true, enabled: true }, '技能已模拟安装')}>
      <p>{dialog.skill.description}</p><small>来源 · {dialog.skill.source}</small>
    </Dialog>}
    {dialog?.kind === 'settings' && <Dialog title={dialog.skill.name + ' 设置'} onClose={close} onSubmit={form => live
      ? saveLiveSettings(dialog.skill, form)
      : save(dialog.skill, { enabled: form.has('enabled'), locked: form.has('locked') }, '技能设置已保存')}>
      <label className="management-check"><input name="enabled" type="checkbox" defaultChecked={dialog.skill.enabled} />启用此技能</label>
      <label className="management-check"><input name="locked" type="checkbox" defaultChecked={dialog.skill.locked} />锁定以保护技能内容</label>
      <small>锁定后，自动整理会保留这项技能的内容。启停设置应用于新会话。</small>
      {(!live || ['hub', 'agent'].includes(dialog.skill.provenance)) && <button className="secondary management-inline-action"
        type="button" onClick={() => setDialog({ kind: 'remove', skill: dialog.skill })}
        disabled={dialog.skill.locked}>{dialog.skill.provenance === 'agent' ? '移除技能' : '卸载技能'}</button>}
    </Dialog>}
    {dialog?.kind === 'remove' && <Confirm title={'移除 ' + dialog.skill.name + '？'} onClose={close} submit={dialog.skill.provenance === 'agent' ? '移除' : '卸载'}
      onConfirm={() => live ? mutate('remove', { id: dialog.skill.id }, '技能已移除')
        : save(dialog.skill, { installed: false, enabled: false, locked: false }, '技能已模拟卸载')}>
      {live ? '将删除此 Profile 中该技能的本地文件。' : '此 Profile 将从已安装列表中移除该演示技能。'}
    </Confirm>}
    {dialog?.kind === 'create' && <Dialog title="新建技能" onClose={close} submit="创建" onSubmit={form => {
      const id = valueOf(form, 'name')
      const description = valueOf(form, 'description')
      const body = valueOf(form, 'body')
      if (!id || !description || !body) return '请输入技能名称、说明和指令。'
      const content = ['---', 'name: ' + JSON.stringify(id), 'description: ' + JSON.stringify(description), '---', '', body].join('\n')
      return mutate('create', { id, content }, '技能已创建')
    }}>
      <Field label="技能名称" name="name" maxLength={64} pattern="[a-z0-9][a-z0-9._\\-]*" placeholder="例如 meeting-summary" required autoFocus />
      <Field label="说明" name="description" maxLength={160} placeholder="描述 Agent 在什么情况下使用此技能" required />
      <Text label="技能指令" name="body" rows={7} required />
    </Dialog>}
    {dialog?.kind === 'content' && <Dialog title={dialog.skill.name} onClose={close}
      submit={dialog.skill.provenance === 'agent' ? '保存' : '完成'} onSubmit={form => {
        if (dialog.skill.provenance !== 'agent') return
        const content = String(form.get('content') ?? '')
        if (content === dialog.detail.content) return
        return mutate('edit', { id: dialog.skill.id, content, revision: dialog.detail.revision }, '技能内容已保存')
      }}>
      <Text label="SKILL.md" name="content" rows={12} defaultValue={dialog.detail.content} readOnly={dialog.skill.provenance !== 'agent'} required />
    </Dialog>}
  </Frame>
}

function Memory({ record, management, selected, persist, account, profile, setProfile }) {
  const [dialog, setDialog] = useState(null)
  const memory = getProfileMemory(account.id, management, profile)
  const close = () => setDialog(null)
  const nodes = selected && selected !== 'all' ? memory.nodes.filter(node => node.type === selected) : memory.nodes
  const save = (patch, message) => persist({ memory: { ...management.memory, [profile]: { ...memory, ...patch } } }, message)

  return <Frame icon="book" title="记忆与学习" description="检查 Agent 记住了什么，管理记忆写入和技能整理。"
    actions={<Profiles bots={record.bots} label="管理 Profile" value={profile} onChange={event => setProfile(event.target.value)} />}>
    <Panel title="记忆设置">
      {memorySettings.map(([id, label, description]) => <Entry key={id} title={label} subtitle={description}>
        <label className="management-switch"><input type="checkbox" role="switch" aria-label={label} checked={memory[id]}
          onChange={event => save({ [id]: event.target.checked }, '记忆设置已保存')} /><span /></label>
      </Entry>)}
    </Panel>
    <Panel title="学习记录" description="按 Profile 查看并维护记忆、偏好和学到的技能。">
      {nodes.length ? nodes.map(node => <Entry key={node.id} icon={memoryTypes[node.type].icon} title={node.title} subtitle={memoryTypes[node.type].source}>
        <button className="secondary" onClick={() => setDialog({ kind: 'edit', node })}>查看与编辑</button>
        <IconButton icon="trash" label={'移除 · ' + node.title} onClick={() => setDialog({ kind: 'remove', node })} />
      </Entry>) : <Empty>暂无此类学习记录。</Empty>}
    </Panel>
    <Panel title="技能整理" description={memory.lastReview ? '上次模拟整理 · ' + dateLabel(memory.lastReview) : '整理器会定期审查学习技能。'}
      actions={<>
        <Badge tone={memory.curatorPaused ? '' : 'positive'}>{memory.curatorPaused ? '已暂停' : '自动整理已启用'}</Badge>
        <button className="secondary" onClick={() => save({ curatorPaused: !memory.curatorPaused }, memory.curatorPaused ? '已恢复整理' : '已暂停整理')}>
          {memory.curatorPaused ? '恢复整理' : '暂停整理'}
        </button>
        <button className="primary" onClick={() => save({ lastReview: Date.now() }, '已完成模拟整理')}>模拟整理</button>
      </>} />
    {dialog?.kind === 'edit' && <Dialog title={dialog.node.title} onClose={close} onSubmit={form => {
      const content = valueOf(form, 'content')
      return content ? save({ nodes: replaceEntry(memory.nodes, { ...dialog.node, content }) }, '学习记录已保存') : '请输入内容。'
    }}><Text label={memoryTypes[dialog.node.type].source} name="content" rows={8} defaultValue={dialog.node.content} required autoFocus /></Dialog>}
    {dialog?.kind === 'remove' && <Confirm title={'移除 ' + dialog.node.title + '？'} onClose={close} submit="移除"
      onConfirm={() => save({ nodes: memory.nodes.filter(node => node.id !== dialog.node.id) }, '已移除学习记录')}>此记录将从当前 Profile 的演示列表移除。</Confirm>}
  </Frame>
}

const views = {
  'project-settings': ProjectSettings, 'bot-settings': BotSettings, tasks: Tasks, connectors: Connectors, skills: Skills, memory: Memory,
}
const liveViews = { memory: LiveMemory, connectors: LiveConnectors }

export function Management({ section, record, api, refresh, report, pageState, onPageChange, ...props }) {
  const management = getManagement(record)
  const savedProfile = pageState?.profile
  const profile = record.bots.some(bot => bot.id === savedProfile) ? savedProfile : defaultProfile
  const taskProfile = pageState?.taskProfile
  const validTaskProfile = taskProfile === defaultProfile || record.bots.some(bot => bot.id === taskProfile)
  function commit(operation, message) {
    const result = operation()
    if (result === false || result?.ok === false) return '保存失败，请重试。'
    refresh()
    if (message) report(message)
    return undefined
  }
  function persist(patch, message) {
    return commit(() => api.updateManagement(patch), message)
  }

  const View = (props.live && liveViews[section]) || views[section]
  return <Suspense fallback={<Empty>正在载入…</Empty>}><View {...props} record={record} management={management} api={api} commit={commit} persist={persist} report={report} refresh={refresh}
    profile={profile} setProfile={profile => onPageChange({ profile })} openGroups={pageState?.openGroups}
    taskProfile={validTaskProfile ? taskProfile : null}
    search={pageState?.mainSearch ?? ''} onPageChange={onPageChange} /></Suspense>
}
