import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Badge, Dialog, Empty, Entry, Field, Panel } from './management-ui.jsx'
import { createNativeConnectionsController } from './native-connections.mjs'
import './native-connections.css'

const initialState = { registry: null, loading: true, busy: null, draft: null, confirmation: null, error: '', notice: '', sshHosts: [], updateResults: [] }
const noSubscription = () => () => {}
const emptySnapshot = () => initialState
const kindName = { local: '本机', ssh: 'SSH', remote: 'URL', cloud: '历史远程连接' }

function ConnectionEditor({ controller, state, host }) {
  const draft = state.draft, listId = useId(), disabled = Boolean(state.busy || state.confirmation)
  const patch = value => controller.patchDraft(value)
  const changeHeader = (index, value) => patch({ headers: draft.headers.map((row, i) => i === index ? { ...row, ...value } : row) })
  return <Panel title={draft.persisted ? '编辑连接' : '添加连接'} description="保存连接不会切换当前工作区。">
    <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 14, display: 'grid', gap: 11 }}>
      <label>连接方式<select value={draft.kind} disabled={draft.persisted} onChange={event => controller.create(event.target.value)}>
        <option value="local" disabled={!draft.persisted && state.registry?.connections.some(row => row.kind === 'local')}>本机</option>
        <option value="ssh">SSH</option><option value="remote">URL</option>
      </select></label>
      <Field label="连接名称" value={draft.label} maxLength={120} onChange={event => patch({ label: event.target.value })} autoComplete="off" />
      {draft.kind === 'remote' && <>
        <Field label="网关 URL" placeholder="https://gateway.example" value={draft.url} onChange={event => patch({ url: event.target.value })} autoComplete="off" />
        <label>认证方式<select value={draft.authMode} onChange={event => patch({ authMode: event.target.value })}>
          <option value="token">访问令牌</option><option value="oauth">网页登录</option>
        </select></label>
        {draft.authMode === 'token'
          ? <Field label={draft.tokenSet ? '访问令牌（已保存；留空保持）' : '访问令牌'} type="password" value={draft.token} placeholder={draft.tokenSet ? '保持已保存的令牌' : '输入访问令牌'} autoComplete="new-password" onChange={event => patch({ token: event.target.value })} />
          : <div className="management-actions">
            <button type="button" className="secondary" disabled={!host?.oauthLoginConnectionConfig || !draft.url.trim() || !draft.label.trim()} onClick={() => void controller.signIn()}>网页登录</button>
            <button type="button" className="secondary" disabled={!host?.oauthLogoutConnectionConfig || !draft.url.trim()} onClick={() => void controller.signOut()}>退出网页登录</button>
            {draft.oauthConnected && <Badge tone="positive">已登录</Badge>}
          </div>}
        <div className="management-actions">
          <button type="button" className="secondary" disabled={!host?.probeConnectionConfig || !draft.url.trim()} onClick={() => void controller.probe()}>探测网关</button>
          {state.probe && <small>{state.probe.authMode === 'oauth' ? '网关支持网页登录' : state.probe.authMode === 'token' ? '网关使用令牌' : '网关认证方式未知'}{state.probe.version ? ` · ${state.probe.version}` : ''}</small>}
        </div>
        <p className="management-empty" style={{ padding: 0 }}>令牌和请求头交给原生宿主保存，不写入工作区或浏览器存储。留空的已存请求头保持原值；移除行后保存会删除该请求头。</p>
        {draft.headers.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', alignItems: 'end', gap: 7 }}>
          <Field label={`请求头 ${index + 1} 名称`} value={row.name} placeholder="CF-Access-Client-Id" autoComplete="off" onChange={event => changeHeader(index, { name: event.target.value })} />
          <Field label={`请求头 ${index + 1} 值`} type="password" value={row.value} placeholder={row.stored ? '已保存；留空保持' : '输入值'} autoComplete="new-password" onChange={event => changeHeader(index, { value: event.target.value })} />
          <button type="button" className="secondary" aria-label={`移除请求头 ${index + 1}`} onClick={() => patch({ headers: draft.headers.filter((_, i) => i !== index) })}>移除</button>
        </div>)}
        <div><button type="button" className="secondary" onClick={() => patch({ headers: [...draft.headers, { name: '', value: '', stored: false }] })}>添加请求头</button></div>
      </>}
      {draft.kind === 'ssh' && <>
        <Field label="SSH 主机" list={listId} placeholder="user@host:22 或 SSH 配置别名" value={draft.host} onChange={event => patch({ host: event.target.value })} autoComplete="off" />
        <datalist id={listId}>{state.sshHosts.map(hostname => <option key={hostname} value={hostname} />)}</datalist>
        <div className="management-actions">
          <button type="button" className="secondary" disabled={!host?.sshConfigHosts} onClick={() => void controller.loadSshHosts()}>读取 SSH 配置别名</button>
          <button type="button" className="secondary" disabled={!host?.sshResolveHost || !draft.host.trim()} onClick={() => void controller.resolveSsh()}>解析主机配置</button>
        </div>
        {state.sshResolution && <p className="management-empty" style={{ padding: 0 }}>解析到 {state.sshResolution.hostname || draft.host}{state.sshResolution.user ? ` · ${state.sshResolution.user}` : ''}{state.sshResolution.port ? `:${state.sshResolution.port}` : ''}；连接仍使用填写的主机别名。</p>}
        <Field label="私钥文件路径（可选）" value={draft.keyPath} onChange={event => patch({ keyPath: event.target.value })} autoComplete="off" />
        <Field label="远程 AIWATA 路径（可选）" value={draft.remoteHermesPath} placeholder="留空使用原生自动发现" onChange={event => patch({ remoteHermesPath: event.target.value })} autoComplete="off" />
        <Field label="远程 Profile（可选）" value={draft.remoteProfile} onChange={event => patch({ remoteProfile: event.target.value })} autoComplete="off" />
      </>}
      <p className="management-empty" style={{ padding: 0 }}>保存后可在列表测试完整连接，再选择「打开」。认证、主机确认和运行服务仍由原生宿主管理。</p>
      <div className="management-actions" style={{ justifyContent: 'end' }}>
        <button type="button" className="secondary" onClick={() => controller.cancelDraft()}>放弃编辑</button>
        <button type="button" className="primary" disabled={!draft.label.trim()} onClick={() => void controller.save()}>保存连接</button>
      </div>
    </fieldset>
  </Panel>
}

function ConnectionConfirmation({ controller, state }) {
  const confirmation = state.confirmation
  const copy = {
    remove: ['删除连接', `删除「${confirmation.label || ''}」？不会删除远程文件。当前工作区使用的连接需要先切换后再删除。`],
    plaintext: ['确认明文保存凭据', '此设备当前无法使用原生安全存储。继续会将本次填写的令牌或请求头以明文保存在原生配置中。'],
    update: ['更新 SSH 托管安装', `更新「${confirmation.label || ''}」会由原宿主排空任务、运行更新并尝试恢复服务。请确认可暂时中断此连接。`],
    updateAll: ['更新已注册连接', '由原宿主逐项更新可更新的安装，可能暂时中断服务。无法更新或被拒绝的连接将分别列出结果。'],
  }[confirmation.kind]
  return <Panel title={copy[0]}>
    <div className="management-task-content"><p>{copy[1]}</p>
      <div className="management-actions" style={{ justifyContent: 'end' }}>
        <button type="button" className="secondary" disabled={Boolean(state.busy)} onClick={() => controller.cancelConfirmation()}>取消</button>
        <button type="button" className="primary danger-action" disabled={Boolean(state.busy)} onClick={() => void controller.confirm()}>确认继续</button>
      </div>
    </div>
  </Panel>
}

/** currentRoute must follow login/route changes; onActivate owns all connection lifecycle. */
export function NativeConnectionsDialog({ host, currentRoute, onActivate, onClose }) {
  const routeRef = useRef(currentRoute), activateRef = useRef(onActivate)
  routeRef.current = currentRoute; activateRef.current = onActivate
  const key = JSON.stringify([currentRoute?.connectionId || 'local', currentRoute?.profile || 'default'])
  const [controller, setController] = useState(null)
  useEffect(() => {
    const manager = createNativeConnectionsController({ host, currentRoute: routeRef.current,
      getCurrentRoute: () => routeRef.current, onActivate: route => {
        if (!activateRef.current) throw new Error('尚未接入工作区连接切换。')
        return activateRef.current(route)
      } })
    setController(manager); void manager.load()
    return () => manager.dispose()
  }, [host, key])
  const state = useSyncExternalStore(controller?.subscribe || noSubscription, controller?.getSnapshot || emptySnapshot, emptySnapshot)
  const disabled = !controller || Boolean(state.busy || state.confirmation || state.draft)
  const activeId = currentRoute?.connectionId || 'local'
  return <Dialog title="连接管理" className="native-connections-dialog" onClose={onClose} submit={null} onSubmit={() => false}>
    <p className="management-empty" style={{ padding: 0 }}>连接列表与认证由原生 AIWATA 管理。设置默认连接只影响启动策略；「打开」交给工作区切换连接。</p>
    {state.error && <p role="alert" className="management-error">{state.error} <button type="button" className="secondary" onClick={() => controller?.clearError()}>收起错误</button></p>}
    {state.notice && <p role="status" className="management-empty" style={{ padding: 0 }}>{state.notice}</p>}
    {state.busy && <p role="status">原生操作进行中…</p>}
    <Panel title="已保存的连接" actions={<>
      <button type="button" className="secondary" disabled={disabled || state.loading} onClick={() => void controller.load()}>刷新</button>
      <button type="button" className="secondary" disabled={disabled || !host?.connections?.save} onClick={() => controller.create()}>添加连接</button>
    </>}>
      {state.loading && <Empty>正在读取原生连接…</Empty>}
      {!state.loading && !state.registry?.connections.length && <Empty>没有可显示的连接。</Empty>}
      {state.registry?.connections.map(row => <Entry key={row.id} title={row.label} subtitle={row.kind === 'ssh'
        ? `${kindName[row.kind]} · ${row.user ? `${row.user}@` : ''}${row.host || ''}${row.port ? `:${row.port}` : ''}`
        : `${kindName[row.kind] || '连接'}${row.url ? ` · ${row.url}` : ''}`}>
        {activeId === row.id && <Badge tone="positive">当前</Badge>}
        {state.registry.primary === row.id && <Badge>默认</Badge>}
        <button type="button" className="secondary" disabled={disabled || !onActivate} onClick={async () => { if (await controller.activate(row.id)) onClose() }}>打开</button>
        <button type="button" className="secondary" disabled={disabled} onClick={() => void controller.test(row.id)}>测试</button>
        {state.registry.primary !== row.id && <button type="button" className="secondary" disabled={disabled} onClick={() => void controller.makePrimary(row.id)}>设为默认</button>}
        {row.kind !== 'cloud' && <button type="button" className="secondary" disabled={disabled} onClick={() => controller.edit(row.id)}>编辑</button>}
        {row.kind !== 'local' && <button type="button" className="secondary" disabled={disabled || activeId === row.id} title={activeId === row.id ? '请先切换到其他连接' : undefined} onClick={() => controller.requestRemove(row.id)}>删除</button>}
        {row.kind === 'ssh' && host?.connections?.updateManaged && <button type="button" className="secondary" disabled={disabled} onClick={() => controller.requestUpdate(row.id)}>更新托管安装</button>}
      </Entry>)}
    </Panel>
    {state.registry && <label>启动连接策略<select value={state.registry.launchMode || 'primary'} disabled={disabled || !host?.connections?.setLaunchMode} onChange={event => void controller.setLaunchMode(event.target.value)}>
      <option value="primary">使用默认连接</option><option value="last-used">恢复上次使用的连接</option>
    </select></label>}
    {host?.connections?.updateAll && <div><button type="button" className="secondary" disabled={disabled} onClick={() => controller.requestUpdateAll()}>更新已注册连接…</button></div>}
    {state.draft && <ConnectionEditor controller={controller} state={state} host={host} />}
    {state.confirmation && <ConnectionConfirmation controller={controller} state={state} />}
    {state.updateResults.length > 0 && <Panel title="逐项更新结果">{state.updateResults.map((row, index) => <Entry key={row.connectionId || index} title={row.label || row.connectionId} subtitle={row.error || row.detail || row.reason || (row.ok ? '更新完成' : '未完成')}>
      <Badge tone={row.ok ? 'positive' : 'warning'}>{row.ok ? '完成' : row.skipped ? '跳过' : '未完成'}</Badge>
    </Entry>)}</Panel>}
  </Dialog>
}
