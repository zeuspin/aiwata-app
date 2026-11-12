import React, { useEffect, useRef, useState } from 'react'
import { Dialog, Empty, Field } from './management-ui.jsx'
import { CapabilityProfile } from './live-provider-manager.jsx'

const states = { connected: '已连接', disabled: '已停用', connecting: '连接中', failed: '连接失败', lazy: '按需连接', configured: '已配置' }
export default function LiveMcpManager({ live, bots, initialProfile = 'default', onClose }) {
  const [profile, setProfile] = useState(initialProfile || 'default')
  return <McpScope key={profile} live={live} profile={profile} onClose={onClose}
    profileControl={<CapabilityProfile bots={bots} value={profile} onChange={setProfile} />} />
}

function McpScope({ live, profile, profileControl, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [test, setTest] = useState(null)
  const [query, setQuery] = useState('')
  const mounted = useRef(true)
  const revision = useRef(0)
  const call = (method, params = {}) => live.capability(method, profile, params)
  async function read() {
    const current = ++revision.current
    try {
      const [list, status, catalog] = await Promise.all(['mcp.servers.list', 'mcp.servers.status', 'mcp.catalog'].map(method => call(method)))
      if (mounted.current && current === revision.current) { setData({ list: list.servers, status: status.servers, catalog: catalog.servers }); setError('') }
    } catch (problem) { if (mounted.current && current === revision.current) setError(problem.message) }
  }
  useEffect(() => { mounted.current = true; void read(); return () => { mounted.current = false; revision.current++ } }, [])
  async function action(method, params, after) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await call(method, params)
      if (!mounted.current) return
      after?.(result)
      await read()
    } catch (problem) { if (mounted.current) setError(problem.message) }
    finally { if (mounted.current) setBusy(false) }
  }
  if (dialog?.type === 'add') return <McpAdd call={call} catalog={data?.catalog ?? []}
    onClose={() => { setDialog(null); void read() }} />
  if (dialog?.type === 'oauth') return <McpAuthorization key={dialog.server.name} live={live} profile={profile} name={dialog.server.name}
    onClose={() => { setDialog(null); void read() }} />
  if (dialog?.type === 'key') return <Dialog title={'连接凭据 · ' + dialog.server.name} onClose={() => setDialog(null)} submit="保存凭据" onSubmit={async form => {
    const env_var = String(form.get('env_var') || '')
    await call('mcp.servers.set_api_key', { name: dialog.server.name, value: String(form.get('value') || ''), ...(env_var ? { env_var } : {}) })
    void read()
  }}>
    <p>凭据只保存到当前配置档，已保存的内容不可回读。</p>
    <label>凭据字段<select name="env_var"><option value="">此连接默认 API 密钥</option>
      {(dialog.server.env ?? []).map(key => <option key={key}>{key}</option>)}
    </select></label>
    <Field label="API 密钥或令牌" name="value" type="password" autoComplete="new-password" required maxLength={8192} autoFocus />
  </Dialog>
  if (dialog?.type === 'remove') return <Dialog title={'移除 ' + dialog.server.name} onClose={() => setDialog(null)} submit="移除连接" danger onSubmit={async () => {
    await call('mcp.servers.remove', { name: dialog.server.name }); setTest(null); void read()
  }}><p>将从此配置档移除连接配置。插件提供的连接需通过插件管理。</p></Dialog>
  const list = (data?.list ?? []).filter(server => (server.name + ' ' + (server.url || server.command || '')).toLowerCase().includes(query.toLowerCase()))
  return <Dialog title="MCP 管理" onClose={onClose} submit={null} className="live-capability-dialog">
    {profileControl}
    <p>管理此配置档可用的工具连接。添加或授权后先测试连接，再新建会话使用这些工具。</p>
    <Field label="搜索 MCP 连接" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="capability-actions">
      <button type="button" className="primary" disabled={busy} onClick={() => setDialog({ type: 'add' })}>添加 MCP 连接</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => void read()}>刷新连接状态</button>
    </div>
    {error && <p role="alert" className="management-error">{error}</p>}
    {!data && !error && <p role="status">正在读取 MCP 连接…</p>}
    {busy && <p role="status">正在处理连接…</p>}
    <div className="capability-list">
      {list.map(server => {
        const status = data.status.find(item => item.name === server.name)
        const plugin = server.source === 'plugin'
        return <section className="capability-card" key={server.name}>
          <div><strong>{server.name}</strong><small>{server.url || server.command || server.transport}</small>
            <small>{states[status?.status] || (server.enabled ? '已配置' : '已停用')}{status?.tools ? ' · ' + status.tools + ' 个工具' : ''}{plugin ? ' · 来自插件' : ''}</small></div>
          <div className="capability-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => void action('mcp.servers.test', { name: server.name }, result => setTest({ name: server.name, ...result }))}>测试连接</button>
            <button type="button" className="secondary" disabled={busy || plugin} onClick={() => void action('mcp.toggle', { name: server.name, enabled: !server.enabled })}>{server.enabled ? '停用' : '启用'}</button>
            {!plugin && <><button type="button" className="secondary" disabled={busy} onClick={() => setDialog({ type: 'key', server })}>配置凭据</button>
              {server.transport === 'http' && server.auth !== 'header' && <button type="button" className="secondary" disabled={busy} onClick={() => setDialog({ type: 'oauth', server })}>网页授权</button>}
              <button type="button" className="secondary" disabled={busy} onClick={() => setDialog({ type: 'remove', server })}>移除</button></>}
          </div>
          {test?.name === server.name && <div className="capability-tool-list" role="status">
            <p>{test.ok ? '连接测试通过 · ' + test.tools.length + ' 个工具' : test.error}{!test.ok && test.oauth_needed ? ' 请完成网页授权。' : ''}</p>
            {test.tools.map(tool => <p key={tool.name}><strong>{tool.name}</strong> {tool.description}</p>)}
          </div>}
        </section>
      })}
      {data && !list.length && <Empty>{query ? '没有匹配的连接。' : '此配置档还没有 MCP 连接。'}</Empty>}
    </div>
  </Dialog>
}

function McpAdd({ call, catalog, onClose }) {
  const [preset, setPreset] = useState('')
  const [transport, setTransport] = useState('http')
  return <Dialog title="添加 MCP 连接" onClose={onClose} submit="添加连接" onSubmit={async form => {
    const name = String(form.get('name') || '').trim()
    let params = { name }
    if (preset) params.preset = preset
    else if (transport === 'http') {
      const url = String(form.get('url') || '').trim()
      params.config = { url, ...(form.get('oauth') ? { auth: 'oauth' } : {}) }
      const token = String(form.get('token') || '').trim()
      if (token) params.bearer_token = token
    } else {
      let args
      try { args = JSON.parse(String(form.get('args') || '[]')) } catch { return '参数请输入 JSON 字符串数组，例如 ["-m", "my_server"]。' }
      params.config = { command: String(form.get('command') || '').trim(), args }
    }
    await call('mcp.servers.add', params)
  }}>
    <label>连接来源<select aria-label="连接来源" value={preset} onChange={event => setPreset(event.target.value)}>
      <option value="">自定义连接</option>{catalog.filter(row => !row.installed).map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
    </select></label>
    <Field key={preset} label="连接名称" name="name" defaultValue={preset} required pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]*" maxLength={80} />
    {preset ? <p>{catalog.find(row => row.name === preset)?.description} 添加后可在连接卡片配置所需凭据。</p> : <>
      <label>连接方式<select aria-label="连接方式" value={transport} onChange={event => setTransport(event.target.value)}>
        <option value="http">远程 HTTPS</option><option value="stdio">本机命令 · stdio</option>
      </select></label>
      {transport === 'http' ? <>
        <Field label="服务器地址" name="url" type="url" placeholder="https://example.com/mcp" required maxLength={2048} />
        <label className="management-check"><input type="checkbox" name="oauth" />使用网页 OAuth 授权</label>
        <Field label="Bearer 令牌（可选）" name="token" type="password" autoComplete="new-password" maxLength={8192} />
      </> : <>
        <Field label="启动命令" name="command" placeholder="python3" required maxLength={1000} />
        <Field label="命令参数（JSON 数组）" name="args" defaultValue="[]" required />
        <p>程序在此账号的工作区权限内运行。请使用可信的 MCP 服务程序。</p>
      </>}
    </>}
  </Dialog>
}

function McpAuthorization({ live, profile, name, onClose }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [pollRevision, setPollRevision] = useState(0)
  const current = useRef(null)
  const mounted = useRef(true)
  const call = (method, params) => live.capability(method, profile, { name, ...params })
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false
    if (current.current) void call('mcp.servers.oauth.cancel', { handle: current.current }).catch(() => {})
  } }, [])
  useEffect(() => {
    if (!state?.handle || state.status === 'approved' || state.status === 'error') return
    let canceled = false
    let timer
    let failures = 0
    const poll = async () => {
      try {
        const result = await call('mcp.servers.oauth.poll', { handle: state.handle })
        if (canceled) return
        failures = 0; setError('')
        setState(previous => ({ ...previous, ...result }))
        if (result.status !== 'pending') current.current = null
        else timer = setTimeout(poll, 1800)
      } catch (problem) {
        if (!canceled) { setError(problem.message); if (++failures < 3) timer = setTimeout(poll, 1800 * failures) }
      }
    }
    timer = setTimeout(poll, 1000)
    return () => { canceled = true; clearTimeout(timer) }
  }, [state?.handle, state?.status, pollRevision])
  return <Dialog title={'网页授权 · ' + name} onClose={onClose} submit={null}>
    <p>授权将绑定到当前账号和配置档。在授权网页完成后返回这里查看结果。</p>
    {!state && <button type="button" className="primary" disabled={starting} onClick={async () => {
      setStarting(true); setError('')
      try {
        const result = await call('mcp.servers.oauth.start', {})
        if (!mounted.current) { void call('mcp.servers.oauth.cancel', { handle: result.handle }); return }
        current.current = result.handle
        setState({ ...result, status: 'pending' })
      } catch (problem) { if (mounted.current) setError(problem.message) }
      finally { if (mounted.current) setStarting(false) }
    }}>{starting ? '正在准备授权…' : '开始网页授权'}</button>}
    {state?.status === 'pending' && <><a className="secondary" href={state.auth_url} onClick={event => {
        if (!window.aiwataPreview?.openExternal) return
        event.preventDefault()
        void window.aiwataPreview.openExternal(state.auth_url).catch(problem => setError(problem.message))
      }} target="_blank" rel="noopener noreferrer">打开授权网页</a><p role="status">等待授权完成…</p></>}
    {state?.status === 'approved' && <p role="status">授权已完成，可以返回测试连接。</p>}
    {error && state?.status === 'pending' && <button type="button" className="secondary" onClick={() => { setError(''); setPollRevision(value => value + 1) }}>重新检查授权</button>}
    {(error || state?.error_message) && <p role="alert" className="management-error">{error || state.error_message}</p>}
  </Dialog>
}
