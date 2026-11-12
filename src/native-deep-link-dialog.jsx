import React from 'react'
import { Dialog, Field } from './management-ui.jsx'

export function NativeDeepLinkDialog({ controller, onOpenNativeSurface }) {
  const item = controller?.snapshot()
  if (!item) return null
  const canConfirm = item.status === 'review' && !item.busy
  const labels = { mcp:'MCP 连接', skill:'技能', plugin:'插件', unsupported:'原生链接' }
  return <Dialog key={item.id} title={item.status === 'done' ? '原生操作结果' : '审查' + labels[item.type]}
    onClose={() => controller.dismiss()} submit={canConfirm ? item.type === 'unsupported' ? null : '确认安装' : null}
    submitDisabled={!canConfirm} className="live-capability-dialog" onSubmit={async form => {
      await controller.confirm({ name:form.get('name'), enable:form.get('enable') === 'on', force:form.get('force') === 'on' })
      return false
    }}>
    <p>目标：{item.owner.connectionId} · {item.owner.profile || 'default'}。链接不会自动安装内容。</p>
    {item.queued > 0 && <p>后面还有 {item.queued} 个原生链接等待处理。</p>}
    {item.status === 'loading' && <p role="status">正在使用原生接口审查来源…</p>}
    {item.type === 'mcp' && <>
      <Field name="name" label="MCP 名称" defaultValue={item.request.name} required maxLength={64} disabled={item.busy || item.status === 'done'} />
      {item.request.transport === 'stdio' && <p role="alert" className="management-error">这是本地 stdio 服务。确认保存后，原生 Agent 可以启动下列命令，请核对命令、参数及环境配置。</p>}
      <p>将保存的完整服务器配置：</p>
      <pre style={{maxHeight:260,overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(item.request.config,null,2)}</pre>
    </>}
    {item.type === 'skill' && <><p>来源：{item.identifier}</p><p>安装保留原生安全扫描。扫描拒绝时不会跳过检查。</p></>}
    {item.type === 'plugin' && <>
      <p>来源：{item.repo}</p>{item.catalogName && <p>原生目录条目：{item.catalogName}</p>}
      {item.summary && <p>{item.summary}</p>}
      {item.sha && <p style={{overflowWrap:'anywhere'}}>审查提交：{item.sha}</p>}
      {item.probe && <p>包含：{item.probe.agent ? 'Agent 插件 ' : ''}{item.probe.desktop ? '桌面插件' : ''}</p>}
      {item.probe?.warnings?.map((warning,index)=><p key={index} role="alert">{warning}</p>)}
      {item.probe?.insecure && <p role="alert" className="management-error">原生审查标记此来源存在风险，请核对来源和警告。</p>}
      {canConfirm && <>{item.probe?.agent && <label><input type="checkbox" name="enable" defaultChecked={item.enable} /> 安装后启用 Agent 部分</label>}
        <label><input type="checkbox" name="force" defaultChecked={item.force} /> 允许替换已经安装的版本</label></>}
      {['stale','blocked'].includes(item.status) && !item.agentInstalled && <button type="button" className="secondary" onClick={()=>void controller.recheck()}>重新审查来源</button>}
    </>}
    {item.detail && <p role="alert">{item.detail}</p>}
    {(item.path || item.desktopInstalled) && onOpenNativeSurface && <>
      <button type="button" className="secondary" onClick={() => onOpenNativeSurface('capabilities')}>打开原生插件管理</button>
      <p>此入口打开原生能力管理，不会自动跳到链接指向的具体插件页面。</p>
    </>}
    {item.error && <p role="alert" className="management-error">{item.error}</p>}
    {item.notice && <p role="alert">{item.notice}</p>}
    {item.busy && <p role="status">原生操作正在进行，请等待确认结果…</p>}
    {item.status === 'unknown' && <p role="alert">安装结果未知，不能把重试当成未安装。请先在原生插件列表核对。</p>}
    {item.status === 'done' && <p role="status">原生接口已确认操作完成。已有会话的工具集保持原生规则，后续会话读取新配置。</p>}
    {item.lines?.length > 0 && <details open={Boolean(item.error)}><summary>原生操作日志</summary><pre style={{maxHeight:200,overflow:'auto',whiteSpace:'pre-wrap'}}>{item.lines.join('\n')}</pre></details>}
  </Dialog>
}
