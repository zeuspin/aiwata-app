import React, { useEffect, useState } from 'react'
import { Dialog, Field } from './management-ui.jsx'

function RemoteFolderSelection({ controller, state }) {
  const [path, setPath] = useState(state.path)
  const [folder, setFolder] = useState('')
  useEffect(() => setPath(state.path), [state.path])
  const parent = state.path?.replace(/\/+$/, '').split('/').slice(0,-1).join('/') || '/'
  return <Dialog title={state.title} onClose={() => controller.cancel()} submit="选择此目录"
    submitDisabled={state.loading || !state.verified || Boolean(state.error)} className="live-capability-dialog"
    onSubmit={() => { controller.select(); return false }}>
    <p>浏览当前连接和 Profile 的远端目录。此处不会使用 Mac 的本地目录选择器。</p>
    <Field label="远端绝对路径" value={path} onChange={event=>setPath(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();void controller.open(path)}}} />
    <div className="capability-actions"><button type="button" className="secondary" disabled={state.loading} onClick={()=>void controller.open(path)}>前往</button>
      <button type="button" className="secondary" disabled={state.loading || state.path === '/'} onClick={()=>{setPath(parent);void controller.open(parent)}}>上级目录</button></div>
    <p>当前目录：{state.path}</p>
    {state.loading && <p role="status">正在读取远端目录…</p>}
    {state.error && <p role="alert" className="management-error">{state.error}</p>}
    <div className="management-panel" style={{maxHeight:240,overflow:'auto'}}>
      {state.entries?.map(entry=><button key={entry.path} type="button" className="management-back" onClick={()=>{setPath(entry.path);void controller.open(entry.path)}}>{entry.name}/</button>)}
      {!state.loading && !state.entries?.length && <p>没有子目录。</p>}
    </div>
    <Field label="在当前远端目录新建文件夹" value={folder} onChange={event=>setFolder(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();void controller.create(folder)}}} />
    <button type="button" className="secondary" disabled={state.loading || state.creating || !folder.trim()} onClick={()=>void controller.create(folder)}>新建文件夹</button>
  </Dialog>
}
export function NativeRemoteFolderDialog({ controller }) {
  const state = controller?.snapshot()
  return state?.open ? <RemoteFolderSelection key={state.id} controller={controller} state={state} /> : null
}
