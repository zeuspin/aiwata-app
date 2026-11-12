import React, { useEffect, useState } from 'react'
import { nativeUpdatePresentation } from './native-update-controller.mjs'
import { Dialog } from './management-ui.jsx'

export function NativeUpdateDialog({ controller }) {
  const state = controller?.snapshot()
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { if (!state?.open) setConfirming(false) }, [state?.open])
  if (!state?.open) return null
  const { status, apply, checking, progress, version } = state
  const view = nativeUpdatePresentation(state)
  const terminal = ['done', 'restart', 'manual', 'guiSkew'].includes(apply.stage)
  const available = status?.supported && !status.retirement && !status.error && (status.updateAvailable || status.behind > 0) && !terminal
  const busy = checking || apply.applying
  return <Dialog title="客户端更新" onClose={() => controller.close()} submit={available && !busy ? confirming ? '确认更新并重新启动' : '更新客户端' : null}
    submitDisabled={busy} onSubmit={async () => {
      if (!confirming) { setConfirming(true); return false }
      await controller.apply(true); setConfirming(false); return false
    }} className="live-capability-dialog">
    <p>更新当前 macOS 客户端。安装和重新启动由原 AIWATA 桌面宿主处理。</p>
    {version?.desktopVersion && <p>当前版本：{version.desktopVersion}</p>}
    {view.status && <p role="status">{view.status}</p>}
    {view.error && <p role="alert" className="management-error">{view.error}</p>}
    {confirming && <p role="alert">确认后将按原生更新流程修改客户端，并可能关闭、重新启动应用。请先处理尚未完成的工作。</p>}
    {view.progress && <p role="status">{view.progress}</p>}
    {apply.applying && Number.isFinite(progress?.percent ?? apply.percent) && <progress max="100" value={progress?.percent ?? apply.percent} />}
    {state.notice && <p role="status">{{ copied:'诊断信息已复制。', empty:'暂无可复制的诊断信息。', copyFailed:'未能复制诊断信息。' }[state.notice]}</p>}
    <button type="button" className="secondary" disabled={busy} onClick={() => { setConfirming(false); void controller.check() }}>重新检查</button>
  </Dialog>
}
