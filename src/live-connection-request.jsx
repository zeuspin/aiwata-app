import React, { useEffect, useRef, useState } from 'react'
import { connectionRequestSnapshot, mergeConnectionRequest, connectionTargetAnswer, sendConnectionTarget, safeConnectionURL } from './connection-request.mjs'

const liveKeys = new WeakMap()
let liveSequence = 0
function liveKey(live) { if (!liveKeys.has(live)) liveKeys.set(live, ++liveSequence); return liveKeys.get(live) }

const stateLabels = { pending: '等待确认', initiated: '处理中', connected: '已连接', skipped: '已跳过', failed: '失败', expired: '已过期', not_connected: '未连接' }
const actionLabels = { authorize: '授权', connect: '连接', enable: '启用', install: '安装', reconnect: '重新连接' }
const phaseLabels = { downloading: '正在下载', python_packages: '正在安装 Python 依赖', loading_tools: '正在加载工具' }
const tierLabels = { official: '官方', verified: '已验证来源', community: '社区' }
const scanLabels = { passed: '通过', warnings: '有警告', failed: '未通过' }
const appLabels = { present: '应用已就绪', missing_app: '尚未安装应用', app_not_running: '应用尚未运行', unknown: '应用状态未知' }

export function LiveConnectionRequest({ live, chat, request, onUpdate, report }) {
  const snapshot = connectionRequestSnapshot(request)
  if (!live || !chat?.gatewayStoredId || !snapshot) return null
  return <ConnectionCard key={`${liveKey(live)}:${chat.id}:${chat.gatewayStoredId}:${chat.gatewayProfile ?? ''}:${snapshot.op_id}`} live={live} chat={chat}
    request={snapshot} onUpdate={onUpdate} report={report} />
}

function ConnectionCard({ live, chat, request, onUpdate, report }) {
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [clock, setClock] = useState(() => Date.now() / 1000)
  const alive = useRef(false), acting = useRef(false), current = useRef(request), callbacks = useRef({ onUpdate, report })
  current.current = mergeConnectionRequest(current.current, request)
  callbacks.current = { onUpdate, report }
  const owner = { type: 'session', session_id: chat.gatewayStoredId }
  const pending = !request.settled && clock < request.deadline_at
  const call = (method, params = {}) => live.rpc(method, { owner, op_id: request.op_id, ...params }, chat.gatewayProfile)
  const receive = value => {
    if (!alive.current) return
    const previous = current.current, next = mergeConnectionRequest(previous, value)
    if (next !== previous) { current.current = next; callbacks.current.onUpdate?.(next) }
  }
  const load = async () => { const snapshot = await call('connectors.operation.status'); receive(snapshot) }
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; acting.current = false }
  }, [live])
  useEffect(() => {
    setValues({})
  }, [live, request.op_id, chat.gatewayStoredId, chat.gatewayProfile])
  useEffect(() => {
    if (request.settled) { setValues({}); return }
    let cancelled = false, timer, attempts = 0
    const tick = async () => {
      if (cancelled) return
      const now = Date.now() / 1000
      setClock(now)
      if (now >= request.deadline_at || attempts++ >= 200) return
      if (!acting.current) {
        try { await load() }
        catch (problem) { if (!cancelled && alive.current) setError(problem.message || '无法读取连接状态。') }
      }
      if (!cancelled) timer = setTimeout(tick, 3000)
    }
    timer = setTimeout(tick, 1000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [live, request.op_id, request.deadline_at, request.settled, chat.gatewayStoredId, chat.gatewayProfile])

  async function act(key, action) {
    if (acting.current || !pending) return
    acting.current = true; setBusy(key); setError('')
    try {
      const result = await action()
      // connection.respond closes a settled operation immediately; its final connection.update
      // supplies the target snapshot. Polling its now-closed id would report a spurious failure.
      if (alive.current && !result?.settled && !current.current.settled) await load()
    } catch (problem) {
      if (alive.current) { setError(problem.message || '原生连接操作失败。'); callbacks.current.report?.(problem.message || '原生连接操作失败。', true) }
    } finally { if (alive.current) { acting.current = false; setBusy('') } }
  }
  function targetValues(target) {
    return Object.fromEntries((target.required_env ?? []).map(field => [field.name,
      values[target.name]?.[field.name] ?? (field.secret ? '' : field.default ?? '')]))
  }
  const answerTarget = (target, status) => act(target.name, () => sendConnectionTarget({ request: current.current,
    name: target.name, status, values: targetValues(target),
    clear: () => setValues(previous => ({ ...previous, [target.name]: {} })),
    send: result => call('connection.respond', { result }),
  }))
  const retry = target => act(target.name, () => {
    const params = { owner, connectors: [target.name], reconnect: true,
      ...(target.connection_id ? { connection_id: target.connection_id } : target.alias ? { alias: target.alias } : {}) }
    return live.rpc('connectors.connect', params, chat.gatewayProfile).then(receive)
  })
  async function openAuthorization(event, url) {
    if (!window.aiwataPreview?.openExternal) return
    event.preventDefault()
    try { await window.aiwataPreview.openExternal(url) }
    catch (problem) { if (alive.current) { setError(problem.message); callbacks.current.report?.(problem.message, true) } }
  }
  return <section className="agent-request" aria-label="Agent 连接与安装请求">
    <h3>连接与安装确认</h3>
    <small>{chat.title} · {chat.gatewayProfile || '默认 Profile'} · {request.settled ? '操作已结束' : pending ? '等待你的选择' : '已到服务端期限，请刷新确认状态'}</small>
    {error && <p className="agent-error" role="alert">{error}</p>}
    <div className="agent-request-content">
      {request.display && <p>建议连接：{request.display.suggested.length ? request.display.suggested.join('、') : '没有指定项目'}。可前往 Connectors 查看连接目录。</p>}
      {request.targets.map(target => {
        const url = safeConnectionURL(target.connect_url)
        const approvable = target.kind !== 'connector' && ['pending', 'failed', 'expired'].includes(target.state)
        const skippable = !['connected', 'skipped', 'not_connected'].includes(target.state) && !target.resolved
        const canApprove = connectionTargetAnswer(request, target.name, 'approved', targetValues(target), clock)
        const retryable = ['failed', 'expired'].includes(target.state) && !target.required_env?.length
        return <section className="agent-detail" key={target.name} style={{ marginTop: 7 }}>
          <strong>{target.display || target.name}{target.alias ? ` · ${target.alias}` : ''} · {stateLabels[target.state]}</strong>
          <small> · {target.kind} / {actionLabels[target.action]}</small>
          {target.description && <p>{target.description}</p>}
          {target.detail && <p>{target.detail}</p>}
          {target.instructions && <p>{target.instructions}</p>}
          {target.discovery_error && <p className="agent-error">{target.discovery_error}</p>}
          {(target.tier || target.repo || target.sha) && <p>来源：{tierLabels[target.tier] || '未标注'}{target.repo ? ` · ${target.repo}` : ''}{target.sha ? ` · ${target.sha}` : ''}{target.subdir ? ` / ${target.subdir}` : ''}</p>}
          {target.scan && <p>固定版本安全扫描：{scanLabels[target.scan.status]} · {target.scan.summary}</p>}
          {target.requires_hermes && <p>运行版本要求：{target.requires_hermes}</p>}
          {target.target_profile && <p>安装到 Profile：{target.target_profile}</p>}
          {target.app_state && <p>{appLabels[target.app_state]}</p>}
          {target.has_desktop_half && <p>包含桌面扩展</p>}
          {target.launch && <><p>{target.launch.kind === 'stdio' ? '将启动本机命令' : '将访问远程服务'}：</p><pre>{target.launch.target}</pre>
            {target.launch.cwd && <p>工作目录：{target.launch.cwd}</p>}
            {target.launch.env?.length > 0 && <p>环境变量：{target.launch.env.join('、')}</p>}</>}
          {target.phase && <p role="status">{phaseLabels[target.phase]}</p>}
          {target.missing_env?.length > 0 && <p>缺少环境变量：{target.missing_env.join('、')}</p>}
          {target.server_errors?.map(row => <p className="agent-error" key={row.name}>{row.name}：{row.error}</p>)}
          {pending && approvable && target.required_env?.map(field => <label key={field.name}>
            {field.prompt || field.name}{field.required ? '（必填）' : '（可选）'}
            <input type={field.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} name={`${request.op_id}-${field.name}`}
              value={targetValues(target)[field.name]} disabled={Boolean(busy)} maxLength={65536}
              onChange={event => setValues(previous => ({ ...previous, [target.name]: { ...previous[target.name], [field.name]: event.target.value } }))} />
          </label>)}
          {pending && <div className="agent-card-actions">
            {url && <a className="secondary" href={url} target="_blank" rel="noopener noreferrer" onClick={event => openAuthorization(event, url)}>打开授权页面</a>}
            {approvable && <button type="button" className="secondary" disabled={Boolean(busy) || !canApprove}
              onClick={() => answerTarget(target, 'approved')}>{actionLabels[target.action]}并允许继续</button>}
            {retryable && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => retry(target)}>重试</button>}
            {skippable && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => answerTarget(target, 'skipped')}>跳过此项</button>}
          </div>}
        </section>
      })}
    </div>
    {!request.settled && <div className="agent-card-actions">
      <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => {
        if (!pending) { void load().catch(problem => { if (alive.current) setError(problem.message) }); return }
        void act('refresh', () => call('connectors.operation.wake'))
      }}>我已完成授权，刷新状态</button>
      <button type="button" className="secondary" disabled={Boolean(busy) || !pending}
        onClick={() => act('continue', () => call('connection.respond', { result: { settled_by: 'continue' } }))}>继续对话</button>
      {busy && <small role="status">正在等待原生服务确认…</small>}
    </div>}
  </section>
}
