import React, { useEffect, useRef, useState } from 'react'
import { Icon, IconButton } from './icons.jsx'
import { defaultProfile, memorySettings, memoryTypes } from './management.mjs'
import { Badge, Confirm, Dialog, Empty, Entry, Frame, Panel, Profiles, Text, dateLabel, valueOf } from './management-ui.jsx'

export default function LiveMemory({ record, selected, profile, setProfile, live, report }) {
  const [dialog, setDialog] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [revision, reload] = useState(0)
  const [busy, setBusy] = useState('')
  const nativeProfile = profile === defaultProfile ? profile : record.bots.find(bot => bot.id === profile)?.profile
  const currentProfile = useRef(nativeProfile)
  currentProfile.current = nativeProfile
  const data = snapshot?.profile === nativeProfile ? snapshot.data : null
  const error = snapshot?.profile === nativeProfile ? snapshot.error : null
  const refresh = () => reload(value => value + 1)
  const close = () => setDialog(null)

  useEffect(() => {
    let active = true
    void live.memory('read', nativeProfile).then(data => {
      if (active) setSnapshot({ profile: nativeProfile, data })
    }).catch(error => { if (active) setSnapshot({ profile: nativeProfile, error: error.message }) })
    return () => { active = false }
  }, [live, nativeProfile, revision])

  async function change(action, params, message) {
    const result = await live.memory(action, nativeProfile, params)
    if (nativeProfile === currentProfile.current) {
      refresh()
      if (message) report(message)
    }
    return result
  }

  async function act(action, params, message) {
    if (busy) return
    setBusy(action)
    try { return await change(action, params, message) }
    catch (error) { if (nativeProfile === currentProfile.current) report(error.message, true) }
    finally { setBusy('') }
  }

  async function openNode(kind, node) {
    const detail = await act('detail', { id: node.id })
    if (detail && nativeProfile === currentProfile.current) setDialog({ kind, node, detail })
  }

  const nodes = data?.nodes.filter(node => !selected || selected === 'all' || selected === node.type) ?? []
  const curator = data?.curator
  const nextApproval = row => ({ id: row.id, revision: row.revision })
  const countsText = ({ checked, marked_stale, archived, reactivated }) =>
    '检查 ' + checked + ' 项，标记待整理 ' + marked_stale + ' 项，归档 ' + archived + ' 项，恢复 ' + reactivated + ' 项。'

  return <Frame live icon="book" title="记忆与学习" description="查看 Agent 在此 Profile 学到的内容，审阅记忆写入。"
    actions={<>
      <Profiles bots={record.bots} label="管理 Profile" value={profile} onChange={event => { close(); setProfile(event.target.value) }} />
      <button className="secondary" disabled={Boolean(busy)} onClick={refresh}>刷新</button>
    </>}>
    {error && <p role="alert" className="management-error">{error}</p>}
    {!data && !error && <Empty>正在读取 Profile 的记忆和学习记录…</Empty>}
    {data && <>
      <Panel title="记忆设置">
        {memorySettings.map(([id, label, description]) => <Entry key={id} title={label} subtitle={description}>
          <label className="management-switch">
            <input type="checkbox" role="switch" aria-label={label} checked={data.settings[id]} disabled={Boolean(busy)}
              onChange={event => void act('setting', { key: id, value: event.target.checked }, '记忆设置已保存')} /><span />
          </label>
        </Entry>)}
      </Panel>
      {(data.settings.writeApproval || data.pending.length > 0) && <Panel title="待审批的记忆写入">
        {data.pendingAvailable === false ? <Empty>此原生接口尚未提供待审批写入列表；不能据此判断没有待审批内容。</Empty> : data.pending.length ? data.pending.map(row => <Entry key={row.id}
          title={row.target === 'user' ? '用户偏好' : '工作记忆'} subtitle={row.summary}>
          <button className="secondary" onClick={() => setDialog({ kind: 'approval', row })}>审阅写入</button>
        </Entry>) : <Empty>暂无待审批的写入。</Empty>}
      </Panel>}
      <Panel title="学习记录" description="按 Profile 查看工作记忆、用户偏好和学到的技能。"
        actions={selected !== 'skill' && <button disabled={data.manualAddAvailable === false} title={data.manualAddAvailable === false ? '此原生接口尚未提供手动添加记忆' : undefined} className="secondary" onClick={() => setDialog({ kind: 'add' })}>
          <Icon name="add" size={/* @ai-token sys.icon.size.15 */ 15} />添加记忆
        </button>}>
        {nodes.length ? nodes.map(node => <Entry key={node.id} icon={memoryTypes[node.type].icon}
          title={node.title} subtitle={memoryTypes[node.type].source}>
          <button className="secondary" disabled={Boolean(busy)} onClick={() => void openNode('edit', node)}>查看与编辑</button>
          <IconButton icon="trash" label={'移除 · ' + node.title} disabled={node.pinned || Boolean(busy)}
            onClick={() => void openNode('remove', node)} />
        </Entry>) : <Empty>暂无此类学习记录。</Empty>}
      </Panel>
      <Panel title="技能整理" description={curator.last_run_at ? '上次运行 · ' + dateLabel(curator.last_run_at) : '按此 Profile 的规则检查学习技能。'}
        actions={<>
          <Badge tone={curator.enabled && !curator.paused ? 'positive' : ''}>
            {!curator.enabled ? '已禁用' : curator.paused ? '已暂停' : '自动整理已启用'}
          </Badge>
          <button className="secondary" disabled={!curator.enabled || Boolean(busy)}
            onClick={() => void act('pause', { value: !curator.paused }, curator.paused ? '已恢复自动整理' : '已暂停自动整理')}>
            {curator.paused ? '恢复整理' : '暂停整理'}
          </button>
          <button className="secondary" disabled={Boolean(busy) || data.reviewPreviewAvailable === false} title={data.reviewPreviewAvailable === false ? '原生整理接口只支持实际运行' : undefined} onClick={async () => {
            const result = await act('review', { preview: true })
            if (result && nativeProfile === currentProfile.current) setDialog({ kind: 'reviewed', message: '预览检查了 ' + result.auto_transitions.checked + ' 项技能。' })
          }}>预览检查</button>
          <button className="primary" disabled={!curator.enabled || Boolean(busy)} onClick={() => setDialog({ kind: 'review' })}>立即整理</button>
        </>} />
    </>}
    {dialog?.kind === 'add' && <Dialog title="添加记忆" onClose={close} submit="添加" onSubmit={async form => {
      const content = valueOf(form, 'content')
      if (!content) return '请输入内容。'
      await change('add', { target: valueOf(form, 'target'), content }, '记忆已添加')
    }}>
      <label>保存到<select name="target" defaultValue={selected === 'user' ? 'user' : 'memory'}>
        <option value="memory">工作记忆 · MEMORY.md</option><option value="user">用户偏好 · USER.md</option>
      </select></label>
      <Text label="记忆内容" name="content" rows={7} required autoFocus />
    </Dialog>}
    {dialog?.kind === 'edit' && <Dialog title={dialog.node.title} onClose={close} onSubmit={async form => {
      const content = String(form.get('content') ?? '')
      if (!content.trim()) return '请输入内容。'
      if (content !== dialog.detail.content) await change('edit', {
        id: dialog.node.id, revision: dialog.detail.revision, content,
      }, '学习记录已保存')
    }}>
      <Text label={memoryTypes[dialog.node.type].source} name="content" rows={9} defaultValue={dialog.detail.content} required autoFocus />
    </Dialog>}
    {dialog?.kind === 'remove' && <Confirm title={'移除 ' + dialog.node.title + '？'} onClose={close} submit="移除"
      onConfirm={async () => { await change('remove', { id: dialog.node.id, revision: dialog.detail.revision }, '已移除学习记录') }}>
      {dialog.node.type === 'skill' ? '将把学习技能移到此 Profile 的原生归档。' : '将从此 Profile 的记忆文件移除此条记录。'}
    </Confirm>}
    {dialog?.kind === 'approval' && <Dialog title="审阅记忆写入" onClose={close} submit="批准写入" secondarySubmit="拒绝写入"
      submitDisabled={!dialog.row.operations.length} onSubmit={async form => {
      const rejected = valueOf(form, 'submitAction') === 'secondary'
      await change(rejected ? 'reject' : 'approve', nextApproval(dialog.row), rejected ? '已拒绝此次写入' : '已批准并保存记忆')
    }}>
      {dialog.row.operations.map((op, index) => <div key={index} className="memory-operation">
        <strong>{{ add: '添加', replace: '替换', patch: '修改', remove: '移除' }[op.action] ?? op.action}</strong>
        {op.matched_entry && <><small>原条目</small><p>{op.matched_entry}</p></>}
        {op.action === 'patch' && op.old_text && <><small>修改片段</small><p>{op.old_text}</p></>}
        {op.content && <><small>写入内容</small><p>{op.content}</p></>}
      </div>)}
    </Dialog>}
    {dialog?.kind === 'review' && <Dialog title="立即整理此 Profile？" onClose={close} submit="开始整理" onSubmit={async () => {
      const result = await change('review', { preview: false })
      report(result.background ? '已交给 AIWATA 后台整理，可刷新查看状态。' : countsText(result.auto_transitions))
    }}><p>AIWATA 会按当前 Profile 的整理规则更新技能状态，并可能归档闲置技能。</p></Dialog>}
    {dialog?.kind === 'reviewed' && <Dialog title="技能整理预览" onClose={close} submit="完成" onSubmit={() => {}}><p>{dialog.message}</p></Dialog>}
  </Frame>
}

