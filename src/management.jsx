import React, { useEffect, useId, useRef, useState } from 'react'
import { Icon, IconButton } from './icons.jsx'
import {
  canUseProfileId, defaultProfile, getManagement, getProfileMemory, getProfileSkills,
  groupRouting, isScheduleInput, platforms, replaceEntry, resolveGroupMembers,
} from './management.mjs'
import './management.css'

const dateLabel = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
const newId = () => crypto.randomUUID()
const valueOf = (form, name) => String(form.get(name) ?? '').trim()

function Frame({ icon, title, description, children, actions, back }) {
  return <div className="management-content">
    {back && <button className="management-back" onClick={back.onClick}><Icon name="back" size={15} />{back.label}</button>}
    <header className="management-header">
      <div className="management-heading">
        <span className="management-icon"><Icon name={icon} size={20} /></span>
        <div><h2>{title}</h2><p>{description}</p></div>
      </div>
      <div className="management-actions">{actions}</div>
    </header>
    <div className="management-preview"><span />本地演示</div>
    {children}
  </div>
}

function Panel({ title, description, actions, children }) {
  return <section className="management-panel">
    <div className="management-panel-heading">
      <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
      {actions && <div className="management-actions">{actions}</div>}
    </div>
    {children}
  </section>
}

function Entry({ icon, title, subtitle, children }) {
  return <div className="management-entry">
    {icon && <span className="entry-icon"><Icon name={icon} size={17} /></span>}
    <div className="entry-text"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
    {children && <div className="management-actions">{children}</div>}
  </div>
}

function Badge({ children, tone }) {
  return <span className={['management-badge', tone].filter(Boolean).join(' ')}>{children}</span>
}

function Empty({ children }) {
  return <p className="management-empty">{children}</p>
}

function Dialog({ title, onClose, onSubmit, submit = '保存', danger = false, children }) {
  const ref = useRef(null)
  const titleId = useId()
  const [error, setError] = useState('')
  useEffect(() => {
    ref.current.showModal()
  }, [])
  return <dialog ref={ref} className="project-dialog management-dialog" aria-labelledby={titleId} onCancel={onClose}>
    <header><h2 id={titleId}>{title}</h2><IconButton icon="close" label="关闭" onClick={onClose} /></header>
    <form onSubmit={event => {
      event.preventDefault()
      const problem = onSubmit(new FormData(event.currentTarget))
      if (problem) setError(problem)
      else onClose()
    }}>
      {children}
      {error && <p role="alert" className="management-error">{error}</p>}
      <footer>
        <button type="button" className="secondary" onClick={onClose}>取消</button>
        <button className={danger ? 'primary danger-action' : 'primary'}>{submit}</button>
      </footer>
    </form>
  </dialog>
}

function Confirm({ title, children, onClose, onConfirm, submit = '删除' }) {
  return <Dialog title={title} onClose={onClose} onSubmit={onConfirm} submit={submit} danger>
    <p>{children}</p>
  </Dialog>
}

function Field({ label, ...props }) {
  return <label>{label}<input {...props} /></label>
}

function Text({ label, ...props }) {
  return <label>{label}<textarea rows={3} {...props} /></label>
}

function Profiles({ bots, label = '所属 Profile', name, value, onChange, defaultValue }) {
  return <label className="management-select">{label}
    <select aria-label={label} name={name} value={value} defaultValue={defaultValue} onChange={onChange}>
      <option value={defaultProfile}>默认 Profile</option>
      {bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name} · {bot.profile ?? bot.id}</option>)}
    </select>
  </label>
}

function ProjectSettings({ selected, record, management, api, persist, commit, onCreateProject, onNavigate }) {
  const [dialog, setDialog] = useState(null)
  const projects = selected ? record.projects.filter(project => project.id === selected) : record.projects
  const otherFolders = id => management.projectFolders[id] ?? []
  const close = () => setDialog(null)

  function update(project, patch, message) {
    return commit(() => api.updateProject(project.id, { name: project.name, folder: project.folder, ...patch }), message)
  }

  function addFolder(form) {
    const project = dialog.project
    const folder = valueOf(form, 'folder')
    if (!folder) return '请输入目录路径。'
    if ([project.folder, ...otherFolders(project.id)].includes(folder)) return '该目录已关联到此项目。'
    return persist({ projectFolders: { ...management.projectFolders, [project.id]: [...otherFolders(project.id), folder] } }, '已关联演示目录')
  }

  return <Frame icon="folder" title="项目目录" description="管理项目名称、主目录和附加目录。"
    actions={onCreateProject && <button className="primary" onClick={onCreateProject}><Icon name="add" size={15} />新建项目</button>}
    back={onNavigate && { label: '返回项目会话', onClick: () => onNavigate('projects') }}>
    {projects.length ? projects.map(project => <Panel key={project.id} title={project.name}
      description={Object.values(record.chats).filter(chat => chat.projectId === project.id).length + ' 条会话'}
      actions={<>
        <button className="secondary" onClick={() => setDialog({ kind: 'rename', project })}>重命名</button>
        <button className="secondary" onClick={() => setDialog({ kind: 'folder', project })}><Icon name="add" size={15} />关联目录</button>
        <IconButton icon="trash" label={'删除项目 · ' + project.name} onClick={() => setDialog({ kind: 'remove', project })} />
      </>}>
      <Entry icon="openFolder" title={project.folder || '未设置主目录'} subtitle="主目录 · 新会话的工作目录">
        <Badge tone={project.trusted ? 'positive' : 'warning'}>{project.trusted ? '已信任' : '待信任'}</Badge>
        <button className="secondary" disabled={!project.folder} onClick={() => setDialog({ kind: 'trust', project })}>
          {project.trusted ? '撤销信任' : '信任目录'}
        </button>
      </Entry>
      {otherFolders(project.id).map(folder => <Entry key={folder} icon="folder" title={folder} subtitle="附加目录">
        <button className="secondary" onClick={() => {
          const oldFolder = project.folder
          const error = update(project, { folder, trusted: false }, '主目录已更新，请确认新目录的信任状态')
          if (!error) {
            const folders = otherFolders(project.id).filter(item => item !== folder)
            if (oldFolder) folders.unshift(oldFolder)
            persist({ projectFolders: { ...management.projectFolders, [project.id]: folders } })
          }
        }}>设为主目录</button>
        <IconButton icon="close" label={'解除关联 · ' + folder} onClick={() => persist({
          projectFolders: { ...management.projectFolders, [project.id]: otherFolders(project.id).filter(item => item !== folder) },
        }, '已解除目录关联')} />
      </Entry>)}
    </Panel>) : <Empty>暂无项目。创建项目后可关联演示目录。</Empty>}
    {dialog?.kind === 'rename' && <Dialog title="重命名项目" onClose={close} onSubmit={form => {
      const name = valueOf(form, 'name')
      return name ? update(dialog.project, { name }, '项目名称已更新') : '请输入项目名称。'
    }}><Field label="项目名称" name="name" defaultValue={dialog.project.name} maxLength={80} required autoFocus /></Dialog>}
    {dialog?.kind === 'folder' && <Dialog title="关联项目目录" onClose={close} onSubmit={addFolder}>
      <Field label="演示目录路径" name="folder" placeholder="例如 ~/Projects/brand-studio/assets" required autoFocus />
      <small>路径用于演示。实际访问由宿主校验目录并确认授权。</small>
    </Dialog>}
    {dialog?.kind === 'trust' && <Dialog title={dialog.project.trusted ? '撤销主目录信任？' : '信任此项目目录？'} onClose={close}
      submit={dialog.project.trusted ? '撤销信任' : '信任目录'} danger={dialog.project.trusted}
      onSubmit={() => update(dialog.project, { trusted: !dialog.project.trusted },
        dialog.project.trusted ? '已撤销目录信任' : '目录已标记为信任')}>
      <p>{dialog.project.folder}</p>
      <small>此操作只修改演示项目的信任状态。</small>
    </Dialog>}
    {dialog?.kind === 'remove' && <Confirm title={'删除 ' + dialog.project.name + '？'} onClose={close}
      onConfirm={() => {
        const error = commit(() => api.removeProject(dialog.project.id), '项目已删除')
        if (!error) {
          const folders = { ...management.projectFolders }
          delete folders[dialog.project.id]
          persist({ projectFolders: folders })
        }
        return error
      }}>项目会话将移到未分组列表，磁盘文件会保留。</Confirm>}
  </Frame>
}

function BotEditor({ item, bots, onClose, onSave }) {
  return <Dialog title={item ? '编辑 Bot' : '新建 Bot'} onClose={onClose} onSubmit={form => {
    const profile = valueOf(form, 'profile').toLowerCase()
    const name = valueOf(form, 'name')
    const provider = valueOf(form, 'provider')
    const model = valueOf(form, 'model')
    if (!name) return '请输入显示名称。'
    if (!canUseProfileId(profile, bots, item?.id)) return '请输入可用的 Profile ID，使用小写字母、数字、下划线或短横线。'
    if (Boolean(provider) !== Boolean(model)) return '请同时填写模型提供方与模型 ID，或同时留空。'
    return onSave({
      ...item, id: item?.id ?? newId(), profile, name,
      description: valueOf(form, 'description'), soul: valueOf(form, 'soul'),
      provider, model,
    })
  }} submit={item ? '保存' : '创建'}>
    <Field label="显示名称" name="name" defaultValue={item?.name} placeholder="例如 编辑助理" maxLength={80} required autoFocus />
    <Field label="Profile ID" name="profile" defaultValue={item?.profile ?? item?.id} placeholder="例如 copy-editor" maxLength={64} required />
    <Field label="简介" name="description" defaultValue={item?.description} placeholder="简述这个 Bot 的职责" maxLength={200} />
    <Text label="角色指令（SOUL.md）" name="soul" defaultValue={item?.soul} placeholder="设定角色、工作方式与表达风格" />
    <div className="management-field-pair">
      <Field label="模型提供方（可选）" name="provider" defaultValue={item?.provider} placeholder="使用工作区默认值" />
      <Field label="模型 ID（可选）" name="model" defaultValue={item?.model} placeholder="使用工作区默认值" />
    </div>
  </Dialog>
}

function GroupEditor({ item, bots, onClose, onSave }) {
  const [members, setMembers] = useState(() => resolveGroupMembers(item, bots))
  const [routing, setRouting] = useState(item?.routing ?? 'everyone')
  return <Dialog title={item ? '编辑群聊' : '新建群聊'} onClose={onClose} onSubmit={form => {
    const name = valueOf(form, 'name')
    const lead = valueOf(form, 'lead')
    const notes = valueOf(form, 'notes')
    if (!name) return '请输入群聊名称。'
    if (members.length < 2 || members.length > 6) return '请选择 2 至 6 位 Bot 成员。'
    if (routing === 'lead' && !members.includes(lead)) return '请选择主导 Bot。'
    if (new TextEncoder().encode(notes).length > 4096) return '协作说明不能超过 4096 字节。'
    return onSave({
      ...item, id: item?.id ?? newId(), name, members, routing, lead: routing === 'lead' ? lead : null,
      purpose: valueOf(form, 'purpose'), notes,
      description: bots.filter(bot => members.includes(bot.id)).map(bot => bot.name).join(' · '),
    })
  }} submit={item ? '保存' : '创建'}>
    <Field label="群聊名称" name="name" defaultValue={item?.name} placeholder="例如 发布协作群" maxLength={80} required autoFocus />
    <fieldset className="management-members"><legend>Bot 成员（2 至 6 位）</legend>
      {bots.length ? bots.map(bot => <label key={bot.id} className="management-check">
        <input type="checkbox" checked={members.includes(bot.id)} onChange={event => setMembers(previous => event.target.checked
          ? [...previous, bot.id] : previous.filter(id => id !== bot.id))} />{bot.name}
      </label>) : <small>请先创建 Bot。</small>}
    </fieldset>
    <label>响应方式<select aria-label="响应方式" value={routing} onChange={event => setRouting(event.target.value)}>
      {Object.entries(groupRouting).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
    </select></label>
    {routing === 'lead' && <label>主导 Bot<select aria-label="主导 Bot" name="lead" defaultValue={item?.lead ?? ''} required>
      <option value="">选择成员</option>
      {bots.filter(bot => members.includes(bot.id)).map(bot => <option value={bot.id} key={bot.id}>{bot.name}</option>)}
    </select></label>}
    <Field label="群聊用途" name="purpose" defaultValue={item?.purpose} maxLength={500} />
    <Text label="协作说明" name="notes" defaultValue={item?.notes} />
  </Dialog>
}

function BotSettings({ selected, record, commit, api, onOpenChat, onNavigate }) {
  const [dialog, setDialog] = useState(null)
  const close = () => setDialog(null)
  const save = (kind, item, message = '设置已保存') => commit(() => api.saveBotEntity(kind, item), message)
  const bots = selected ? record.bots.filter(item => item.id === selected) : record.bots
  const groups = selected ? record.groups.filter(item => item.id === selected) : record.groups
  const references = dialog?.type === 'bot'
    ? record.groups.filter(group => resolveGroupMembers(group, record.bots).includes(dialog.item.id)).map(group => group.name)
    : []
  const chatButton = item => onOpenChat && <button className="secondary" onClick={() => onOpenChat(item.id)}>打开会话</button>

  return <Frame icon="bot" title="Bot 与群聊管理" description="为 Bot 配置独立 Profile，为群聊配置成员与响应方式。"
    back={onNavigate && { label: '返回 Bot 与群聊', onClick: () => onNavigate('bots') }}
    actions={<>
      <button className="secondary" onClick={() => setDialog({ kind: 'group' })}><Icon name="group" size={15} />新建群聊</button>
      <button className="primary" onClick={() => setDialog({ kind: 'bot' })}><Icon name="add" size={15} />新建 Bot</button>
    </>}>
    {(!selected || bots.length > 0) && <Panel title="Bot" description="Profile 保存 Bot 的角色、模型和独立配置。">
      {bots.length ? bots.map(bot => <Entry key={bot.id} icon="bot" title={bot.name}
        subtitle={[bot.profile ?? bot.id, bot.description, bot.model].filter(Boolean).join(' · ')}>
        {chatButton(bot)}
        <button className="secondary" onClick={() => setDialog({ kind: 'bot', item: bot })}>编辑</button>
        <IconButton icon="trash" label={'删除 Bot · ' + bot.name} onClick={() => setDialog({ kind: 'remove', type: 'bot', item: bot })} />
      </Entry>) : <Empty>暂无 Bot。</Empty>}
    </Panel>}
    {(!selected || groups.length > 0) && <Panel title="群聊" description="响应方式控制一条新消息由哪些成员处理。">
      {groups.length ? groups.map(group => {
        const members = resolveGroupMembers(group, record.bots)
        const lead = record.bots.find(bot => members.includes(bot.id) && bot.id === group.lead)
        const routing = group.routing === 'lead' && !lead ? 'everyone' : group.routing ?? 'everyone'
        const running = group.demoRun === 'running'
        const capped = group.demoRun === 'capped'
        return <div className="management-group" key={group.id}>
          <Entry icon="group" title={group.name} subtitle={group.purpose || '协作群聊'}>
            {chatButton(group)}
            <button className="secondary" onClick={() => setDialog({ kind: 'group', item: group })}>编辑成员与协作</button>
            <IconButton icon="trash" label={'解散群聊 · ' + group.name} onClick={() => setDialog({ kind: 'remove', type: 'group', item: group })} />
          </Entry>
          <div className="management-group-details">
            <div className="management-tags">
              <Badge>{groupRouting[routing]}{lead ? ' · ' + lead.name : ''}</Badge>
              {record.bots.filter(bot => members.includes(bot.id)).map(bot => <Badge key={bot.id}>{bot.name}</Badge>)}
              {!members.length && <small>暂无成员</small>}
            </div>
            <div className="management-run">
              <small>{running ? '模拟讨论进行中' : capped ? '模拟讨论达到轮次上限' : '协作待命'}</small>
              <div className="management-actions">
                {running && <button className="secondary" onClick={() => save('group', { ...group, demoRun: 'capped' }, '模拟讨论达到轮次上限')}>模拟达到上限</button>}
                <button className="secondary" disabled={!running && members.length < 2} onClick={() => {
                  save('group', { ...group, demoRun: running ? 'stopped' : 'running' },
                    running ? '已模拟停止讨论' : capped ? '已模拟继续讨论' : '已开始模拟讨论')
                }}>{running ? '停止讨论' : capped ? '继续讨论' : '模拟讨论'}</button>
              </div>
            </div>
          </div>
        </div>
      }) : <Empty>暂无群聊。</Empty>}
    </Panel>}
    {selected && !bots.length && !groups.length && <Empty>该 Bot 或群聊已移除。</Empty>}
    {dialog?.kind === 'bot' && <BotEditor item={dialog.item} bots={record.bots} onClose={close}
      onSave={item => save('bot', item, dialog.item ? 'Bot 设置已保存' : 'Bot 已创建')} />}
    {dialog?.kind === 'group' && <GroupEditor item={dialog.item} bots={record.bots} onClose={close}
      onSave={item => save('group', item, dialog.item ? '群聊设置已保存' : '群聊已创建')} />}
    {dialog?.kind === 'remove' && <Confirm title={dialog.type === 'group' ? '解散群聊？' : '删除 Bot？'} onClose={close}
      submit={dialog.type === 'group' ? '解散' : '删除'}
      onConfirm={() => references.length ? '请先移除此 Bot 的群聊成员关系。' : commit(() => api.removeBotEntity(dialog.type, dialog.item.id), '已移除 ' + dialog.item.name)}>
      {references.length ? '此 Bot 仍在「' + references.join('」「') + '」中。请先在群聊设置中更新成员。'
        : dialog.type === 'group' ? '此操作将移除演示群聊及其会话记录。' : '此操作将移除演示 Bot 及其专属会话记录。'}
    </Confirm>}
  </Frame>
}

function TaskEditor({ item, record, onClose, onSave }) {
  return <Dialog title={item ? '编辑定时任务' : '新建定时任务'} onClose={onClose} onSubmit={form => {
    const name = valueOf(form, 'name')
    const schedule = valueOf(form, 'schedule')
    const prompt = valueOf(form, 'prompt')
    const timezone = valueOf(form, 'timezone')
    const repeat = valueOf(form, 'repeat')
    if (!name || !prompt) return '请输入任务名称和执行指令。'
    if (!isScheduleInput(schedule)) return '请输入 Cron 表达式、间隔、延时或日期时间。'
    if (timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone })
      } catch {
        return '请输入有效的时区，如 Asia/Shanghai。'
      }
    }
    return onSave({
      history: [], enabled: true, ...item, id: item?.id ?? newId(), name, schedule, prompt, timezone, repeat,
      profile: valueOf(form, 'profile'), deliver: valueOf(form, 'deliver'), workdir: valueOf(form, 'workdir'),
    })
  }} submit={item ? '保存' : '创建'}>
    <Field label="任务名称" name="name" defaultValue={item?.name} placeholder="例如 每周项目摘要" maxLength={100} required autoFocus />
    <Text label="执行指令" name="prompt" defaultValue={item?.prompt} placeholder="到时间后，交给 Agent 做什么？" required />
    <div className="management-field-pair">
      <Field label="执行时间" name="schedule" defaultValue={item?.schedule} placeholder="例如 0 9 * * 1" required />
      <Field label="时区（可选）" name="timezone" defaultValue={item?.timezone} placeholder="例如 Asia/Shanghai" />
    </div>
    <small>支持 0 9 * * 1、every 2h、in 30m 或 ISO 日期时间。</small>
    <div className="management-field-pair">
      <Profiles bots={record.bots} name="profile" defaultValue={item?.profile ?? defaultProfile} />
      <Field label="重复次数（可选）" name="repeat" type="number" min="1" step="1" defaultValue={item?.repeat} placeholder="不限" />
    </div>
    <div className="management-field-pair">
      <label>投递方式<select aria-label="投递方式" name="deliver" defaultValue={item?.deliver ?? 'local'}>
        <option value="local">仅保存到本地</option>
        <option value="origin">来源会话或默认频道</option>
        <option value="all">所有配置了默认频道的平台</option>
      </select></label>
      <label>工作目录<select aria-label="工作目录" name="workdir" defaultValue={item?.workdir ?? ''}>
        <option value="">使用默认目录</option>
        {item?.workdir && !record.projects.some(project => project.folder === item.workdir) && <option value={item.workdir}>{item.workdir}</option>}
        {record.projects.filter(project => project.folder).map(project => <option value={project.folder} key={project.id}>{project.name}</option>)}
      </select></label>
    </div>
  </Dialog>
}

const deliveryLabels = { local: '仅保存到本地', origin: '来源会话或默认频道', all: '所有配置了默认频道的平台' }

function Tasks({ record, selected, management, persist, api, report, openGroups, onGroupOpenChange }) {
  const [dialog, setDialog] = useState(null)
  const close = () => setDialog(null)
  const tasks = selected && selected !== 'all' ? management.tasks.filter(item => item.id === selected) : management.tasks
  const save = (task, message) => persist({ tasks: replaceEntry(management.tasks, task) }, message)

  function run(task) {
    const id = newId()
    const result = api.charge({ id, kind: '托管定时任务 · ' + task.name, source: 'managed', amount: 8 })
    const row = { id, time: Date.now(), status: result.ok ? '成功' : '失败',
      detail: result.ok ? '模拟执行完成 · ' + deliveryLabels[task.deliver] : '积分不足，本次未执行' }
    const error = save({ ...task, enabled: result.ok || task.enabled, history: [row, ...task.history] },
      result.ok ? task.enabled ? '已模拟运行 · 8 积分' : '已恢复并模拟运行 · 8 积分' : undefined)
    if (error || !result.ok) report(error || row.detail, true)
  }

  return <Frame icon="clock" title="定时任务" description="配置执行计划、工作目录和投递方式，查看每次运行的结果。"
    actions={<button className="primary" onClick={() => setDialog({ kind: 'edit' })}><Icon name="add" size={15} />新建任务</button>}>
    {tasks.length ? tasks.map(task => {
      const profile = record.bots.find(bot => bot.id === task.profile)
      const hasProfile = task.profile === defaultProfile || !!profile
      const historyOpen = openGroups?.[task.id] ?? (selected === task.id)
      return <Panel key={task.id} title={task.name}
        description={[task.schedule, task.timezone, profile?.name ?? (hasProfile ? '默认 Profile' : 'Profile 已移除'), deliveryLabels[task.deliver]].filter(Boolean).join(' · ')}
        actions={<>
          <Badge tone={task.enabled ? 'positive' : ''}>{task.enabled ? '已启用' : '已暂停'}</Badge>
          <button className="secondary" onClick={() => setDialog({ kind: 'edit', item: task })}>编辑</button>
          <IconButton icon="trash" label={'删除任务 · ' + task.name} onClick={() => setDialog({ kind: 'remove', item: task })} />
        </>}>
        <div className="management-task-content">
          <p>{task.prompt || '未填写执行指令'}</p>
          {task.workdir && <small>工作目录 · {task.workdir}</small>}
          <div className="management-actions">
            <button className="secondary" onClick={() => save({ ...task, enabled: !task.enabled }, task.enabled ? '任务已暂停' : '任务已恢复')}>
              {task.enabled ? '暂停任务' : '恢复任务'}
            </button>
            <button className="primary" disabled={!hasProfile} onClick={() => run(task)}>
              {task.enabled ? '模拟运行 · 8 积分' : '恢复并模拟运行 · 8 积分'}
            </button>
          </div>
        </div>
        <details className="management-history" open={historyOpen}>
          <summary onClick={event => {
            event.preventDefault()
            onGroupOpenChange(task.id, !historyOpen)
          }}>运行历史 <span>{task.history.length}</span></summary>
          {task.runs > 0 && <Empty>旧版模拟运行 {task.runs} 次，无明细记录。</Empty>}
          {task.history.length ? task.history.map(row => <Entry key={row.id} title={dateLabel(row.time)} subtitle={row.detail}>
            <Badge tone={row.status === '成功' ? 'positive' : 'warning'}>{row.status}</Badge>
          </Entry>) : !task.runs && <Empty>暂无运行记录。</Empty>}
        </details>
      </Panel>
    }) : <Empty>暂无任务。新建任务后，可手动模拟运行并查看历史。</Empty>}
    {dialog?.kind === 'edit' && <TaskEditor item={dialog.item} record={record} onClose={close} onSave={item => save(item, '定时任务已保存')} />}
    {dialog?.kind === 'remove' && <Confirm title={'删除 ' + dialog.item.name + '？'} onClose={close}
      onConfirm={() => persist({ tasks: management.tasks.filter(task => task.id !== dialog.item.id) }, '定时任务已删除')}>此操作将同时移除演示运行历史。</Confirm>}
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

function Skills({ record, management, selected, persist, onSelectItem, profile, setProfile, search, onPageChange }) {
  const [dialog, setDialog] = useState(null)
  const [view, setView] = useState('installed')
  const current = onSelectItem ? selected || view : view
  useEffect(() => { if (selected) setView(selected) }, [selected])
  const close = () => setDialog(null)
  const installed = current === 'installed'
  const skills = getProfileSkills(management, profile).filter(skill =>
    (!installed || skill.installed) && [skill.name, skill.id, skill.category].some(value => value.toLowerCase().includes(search.trim().toLowerCase())))
  function save(skill, patch, message) {
    const overrides = management.skills[profile] ?? {}
    return persist({ skills: { ...management.skills, [profile]: {
      ...overrides, [skill.id]: { ...overrides[skill.id], ...patch },
    } } }, message)
  }

  return <Frame icon="spark" title="技能工具" description="按 Profile 浏览技能目录、安装技能和管理加载状态。"
    actions={<Profiles bots={record.bots} label="管理 Profile" value={profile} onChange={event => setProfile(event.target.value)} />}>
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
        <div className="management-skill-title"><span className="entry-icon"><Icon name="spark" size={18} /></span>
          <div><h3>{skill.name}</h3><small>{skill.category} · {skill.source}</small></div>
          <Badge tone={skill.installed && skill.enabled ? 'positive' : ''}>{skill.installed ? skill.enabled ? '已启用' : '已停用' : '可安装'}</Badge>
        </div>
        <p>{skill.description}</p>
        <div className="management-actions">
          {skill.installed ? <button className="secondary" onClick={() => setDialog({ kind: 'settings', skill })}>
            <Icon name="settings" size={15} />技能设置
          </button> : <button className="primary" onClick={() => setDialog({ kind: 'install', skill })}>
            <Icon name="add" size={15} />安装
          </button>}
        </div>
      </article>)}
    </div>
    {!skills.length && <Empty>{search ? '没有匹配的技能。' : '此 Profile 暂无已安装技能。'}</Empty>}
    {dialog?.kind === 'install' && <Dialog title={'安装 ' + dialog.skill.name} onClose={close} submit="模拟安装"
      onSubmit={() => save(dialog.skill, { installed: true, enabled: true }, '技能已模拟安装')}>
      <p>{dialog.skill.description}</p><small>来源 · {dialog.skill.source}</small>
    </Dialog>}
    {dialog?.kind === 'settings' && <Dialog title={dialog.skill.name + ' 设置'} onClose={close} onSubmit={form => save(dialog.skill, {
      enabled: form.has('enabled'), locked: form.has('locked'),
    }, '技能设置已保存')}>
      <label className="management-check"><input name="enabled" type="checkbox" defaultChecked={dialog.skill.enabled} />启用此技能</label>
      <label className="management-check"><input name="locked" type="checkbox" defaultChecked={dialog.skill.locked} />锁定以保护技能内容</label>
      <small>锁定后，自动整理会保留这项技能的内容。启停设置应用于新会话。</small>
      <button className="secondary management-inline-action" type="button" onClick={() => setDialog({ kind: 'remove', skill: dialog.skill })}
        disabled={dialog.skill.locked}>卸载技能</button>
    </Dialog>}
    {dialog?.kind === 'remove' && <Confirm title={'卸载 ' + dialog.skill.name + '？'} onClose={close} submit="卸载"
      onConfirm={() => save(dialog.skill, { installed: false, enabled: false, locked: false }, '技能已模拟卸载')}>此 Profile 将从已安装列表中移除该演示技能。</Confirm>}
  </Frame>
}

const memoryTypes = {
  memory: { icon: 'book', name: '工作记忆', source: 'MEMORY.md' },
  user: { icon: 'file', name: '用户偏好', source: 'USER.md' },
  skill: { icon: 'spark', name: '学习技能', source: 'SKILL.md' },
}

function Memory({ record, management, selected, persist, account, profile, setProfile }) {
  const [dialog, setDialog] = useState(null)
  const memory = getProfileMemory(account.id, management, profile)
  const close = () => setDialog(null)
  const nodes = selected && selected !== 'all' ? memory.nodes.filter(node => node.type === selected) : memory.nodes
  const save = (patch, message) => persist({ memory: { ...management.memory, [profile]: { ...memory, ...patch } } }, message)
  const settings = [
    ['memoryEnabled', '长期工作记忆', '在新会话中提供 MEMORY.md 里的工作上下文。'],
    ['userProfileEnabled', '用户偏好', '在新会话中提供 USER.md 里的偏好和背景。'],
    ['writeApproval', '记忆写入需批准', '在 Agent 写入记忆前请求确认。'],
  ]

  return <Frame icon="book" title="记忆与学习" description="检查 Agent 记住了什么，管理记忆写入和技能整理。"
    actions={<Profiles bots={record.bots} label="管理 Profile" value={profile} onChange={event => setProfile(event.target.value)} />}>
    <Panel title="记忆设置">
      {settings.map(([id, label, description]) => <Entry key={id} title={label} subtitle={description}>
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

export function Management({ section, record, api, refresh, report, pageState, onPageChange, ...props }) {
  const management = getManagement(record)
  const savedProfile = pageState?.profile
  const profile = record.bots.some(bot => bot.id === savedProfile) ? savedProfile : defaultProfile
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

  const View = views[section]
  return <View {...props} record={record} management={management} api={api} commit={commit} persist={persist} report={report}
    profile={profile} setProfile={profile => onPageChange({ profile })} openGroups={pageState?.openGroups}
    search={pageState?.mainSearch ?? ''} onPageChange={onPageChange} />
}
