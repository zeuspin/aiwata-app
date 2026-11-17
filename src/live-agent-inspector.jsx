import React, { useEffect, useRef, useState } from 'react'
import { Dialog, Empty } from './management-ui.jsx'
import { Icon } from './icons.jsx'
import './live-agent-inspector.css'

// Snapshots come from the native session authority, not the front-end tool menu.
export function LiveAgentInspector({ live, chat, connected }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="agent-inspector-trigger" disabled={!connected || !chat?.gatewayStoredId}
      onClick={() => setOpen(true)}><Icon name="settings" size={/* @ai-token sys.icon.size.13 */ 13} />Agent 能力与任务</button>
    {open && <Inspector key={chat.id + ':' + (chat.gatewayProfile ?? '')} live={live} chat={chat} onClose={() => setOpen(false)} />}
  </>
}

function Inspector({ live, chat, onClose }) {
  const [tab, setTab] = useState('tools')
  const [data, setData] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [steer, setSteer] = useState({})
  const [tails, setTails] = useState({})
  const alive = useRef(true)
  const epoch = useRef(0)
  const call = (method, params = {}) => live.rpc(method, { session_id: chat.gatewayStoredId, ...params }, chat.gatewayProfile)
  async function load() {
    const request = ++epoch.current
    try {
      const result = tab === 'tools' ? await call('tools.show') : tab === 'computer'
        ? await live.computerStatus(chat.gatewayProfile) : Object.fromEntries(await Promise.all([
          call('process.list').then(result => ['processes', result.processes ?? []]),
          call('subagent.list').then(result => ['subagents', result.subagents ?? []]),
        ]))
      if (alive.current && epoch.current === request) { setData(result); setError('') }
    } catch (problem) { if (alive.current && epoch.current === request) setError(problem.message) }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++ } }, [])
  useEffect(() => {
    setData({}); setError(''); void load()
    if (tab !== 'work') return
    const timer = setInterval(() => void load(), 3000)
    return () => { clearInterval(timer); epoch.current++ }
  }, [tab])
  async function act(method, params) {
    if (busy) return
    setBusy(true)
    const actionEpoch = epoch.current
    try {
      const result = method === 'computer.permissions' ? await live.computerPermissions(chat.gatewayProfile) : await call(method, params)
      if (result?.ok === false || result?.error || result?.status === 'error' || result?.status === 'rejected') throw new Error(result.error || '操作未被原生 Agent 接受。')
      if (method === 'computer.permissions') {
        for (let attempt = 0; attempt < 150 && alive.current && epoch.current === actionEpoch; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1500))
          if (!alive.current || epoch.current !== actionEpoch) return
          const progress = await live.computerPermissionStatus(chat.gatewayProfile)
          if (!progress.running) {
            if (progress.exit_code !== 0) throw new Error('原生系统授权尚未完成，请在系统设置中检查。')
            break
          }
        }
      }
      if (!alive.current || epoch.current !== actionEpoch) return
      if (method === 'subagent.tail') setTails(previous => ({ ...previous, [params.subagent_id]: result }))
      if (method === 'subagent.steer') setSteer(previous => ({ ...previous, [params.subagent_id]: '' }))
      await load()
    } catch (problem) { if (alive.current) setError(problem.message) }
    finally { if (alive.current) setBusy(false) }
  }
  return <Dialog title="Agent 能力与任务" submit={null} onClose={onClose} className="agent-inspector">
    <p className="agent-inspector-scope">{chat.title} · {chat.gatewayProfile || '默认 Profile'}</p>
    <div className="agent-inspector-tabs" role="tablist" aria-label="Agent 检查范围">
      {[['tools', '实际工具'], ['work', '后台任务'], ['computer', '电脑操作']].map(([id, label]) =>
        <button type="button" role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {error && <p role="alert" className="management-error">{error}</p>}
    <div className="agent-inspector-content">
      {tab === 'tools' && (data.sections?.length ? <>
        <p>此会话原生工具目录：{data.total} 项。部分工具通过工具搜索按需加载。</p>
        {data.sections.map(section => <details key={section.name} open><summary>{section.name} · {section.tools.length}</summary>
          {section.tools.map(tool => <div className="agent-inspector-tool" key={tool.name}><strong>{tool.name}</strong><small>{tool.description}</small></div>)}
        </details>)}
      </> : <Empty>正在读取会话工具目录…</Empty>)}
      {tab === 'work' && <>
        <h3>后台进程</h3>
        {!data.processes?.length && <Empty>当前会话没有后台进程。</Empty>}
        {data.processes?.map(process => <section key={process.session_id}>
          <div className="agent-inspector-actions"><strong>{process.session_id} · {process.status}</strong>
            {process.status === 'running' && <button type="button" className="secondary" disabled={busy}
              onClick={() => act('process.kill', { process_id: process.session_id })}>停止进程</button>}</div>
          <pre>{process.command}</pre><pre>{process.output_tail || process.output_preview}</pre>
        </section>)}
        <h3>子 Agent</h3>
        {!data.subagents?.length && <Empty>当前会话没有子 Agent。</Empty>}
        {data.subagents?.map(child => <section key={child.subagent_id}>
          <strong>{child.name || child.subagent_id} · {child.status}</strong><p>{child.task || child.goal}</p>
          <div className="agent-inspector-actions"><button type="button" className="secondary" disabled={busy}
            onClick={() => act('subagent.tail', { subagent_id: child.subagent_id })}>查看输出</button>
            <button type="button" className="secondary" disabled={busy || ['completed', 'failed', 'interrupted'].includes(child.status)}
              onClick={() => act('subagent.interrupt', { subagent_id: child.subagent_id })}>停止</button></div>
          {tails[child.subagent_id] && <pre>{tails[child.subagent_id].text || JSON.stringify(tails[child.subagent_id], null, 2)}</pre>}
          {child.accepting_steer && <div className="agent-inspector-actions"><input aria-label={'指导 ' + (child.name || child.subagent_id)}
            value={steer[child.subagent_id] || ''} onChange={event => setSteer(previous => ({ ...previous, [child.subagent_id]: event.target.value }))} />
            <button type="button" className="secondary" disabled={busy || !steer[child.subagent_id]?.trim()}
              onClick={() => act('subagent.steer', { subagent_id: child.subagent_id, text: steer[child.subagent_id].trim() })}>发送指导</button></div>}
        </section>)}
      </>}
      {tab === 'computer' && <>
        <h3>本机桌面 · 原生 Computer Use</h3>
        <p>使用 AIWATA 原生驱动和审批。桌面由本机用户共享，工作区文件和模型凭据仍按账号隔离。</p>
        <dl><dt>驱动</dt><dd>{data.installed ? '已安装' : data.installed === false ? '未安装' : '正在检查…'}</dd>
          <dt>辅助功能</dt><dd>{permission(data.accessibility)}</dd><dt>屏幕录制</dt><dd>{permission(data.screen_recording)}</dd>
          <dt>原生服务</dt><dd>{data.platform ? '已连接' : '未就绪'}</dd></dl>
        {data.error && <p role="alert">{data.error}</p>}
        <div className="agent-inspector-actions"><button type="button" className="secondary" onClick={() => void load()}>重新检查</button>
          {data.can_grant && data.installed && <button type="button" className="secondary" disabled={busy}
            onClick={() => act('computer.permissions')}>打开原生系统授权</button>}</div>
      </>}
    </div>
  </Dialog>
}

const permission = value => value === true ? '已授权' : value === false ? '未授权' : '未知'
