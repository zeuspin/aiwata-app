import React,{useMemo,useState} from 'react'
import {Dialog} from './management-ui.jsx'
import {inspectLegacyNativeCache} from './native-legacy-cache.mjs'

export function NativeLegacyCacheNotice({route,storage,enabled=true}) {
  const key=JSON.stringify([route.connectionId,route.profile]),[dismissed,setDismissed]=useState(new Set())
  const acknowledgementKey='aiwata-app-native:legacy-cache-notice:'+key
  const acknowledged=useMemo(()=>{try{return storage.getItem(acknowledgementKey)==='true'}catch{return false}},[acknowledgementKey,storage])
  function dismiss(){
    try{storage.setItem(acknowledgementKey,'true')}catch{/* Retain dismissal for this renderer if storage is unavailable. */}
    setDismissed(previous=>new Set([...previous,key]))
  }
  const summary=useMemo(()=>inspectLegacyNativeCache(storage,route),[key,storage])
  if(!enabled||!summary||acknowledged||dismissed.has(key))return null
  return <Dialog submit="" title="旧工作区缓存仍已保留" onClose={dismiss}>
    <p>真实会话会从当前原生后端恢复。旧版本保存在本机的布局、未发送草稿和附件引用仍在旧缓存中，确认所属目标后才能恢复；当前不会自动合并或发送。</p>
    <p role="status">检测到 {summary.accounts} 个账号缓存、{summary.sessions} 个会话、{summary.drafts} 份未发送草稿、{summary.attachments} 个附件引用及 {summary.pending} 项待确认操作。</p>
    <button type="button" className="primary" onClick={dismiss}>知道了，保留旧缓存</button>
  </Dialog>
}
