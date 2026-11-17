import React, { useEffect, useRef, useState } from 'react'
import { PetSprite } from '@/components/pet/pet-sprite'
import { derivePetState } from '@/store/pet'

// Imported by the native-only original-surface facade. PetSprite is the original
// canvas renderer; stateOverride keeps it independent of the old gateway stores.
export function NativePetSurface({ controller, snapshot, hidden = false }) {
  const initial = () => controller.loadPosition() ?? { x:24, y:Math.max(0, window.innerHeight-220) }
  const [position, setPosition] = useState(initial)
  const drag = useRef(null)
  const { payload, active, owner } = snapshot
  const scope = JSON.stringify([owner?.connectionId, owner?.profile])
  useEffect(() => { setPosition(initial()); drag.current=null }, [controller, scope])
  if(hidden || active || !payload.info.enabled || !payload.info.spritesheetBase64)return null
  const activity=payload.activity,busy=activity.busy??payload.busy
  const state=derivePetState({...activity,busy,toolRunning:busy&&activity.toolRunning,reasoning:busy&&activity.reasoning})
  const info=payload.info,width=(info.frameW??192)*(info.scale??.33),height=(info.frameH??208)*(info.scale??.33)
  const clamp=point=>({x:Math.max(0,Math.min(point.x,window.innerWidth-width)),y:Math.max(0,Math.min(point.y,window.innerHeight-height))})
  const plugin=payload.pluginMessages.reduce((latest,item)=>!latest||item.seq>latest.seq?item:latest,null)
  const point=clamp(position)
  return <aside aria-label="原生 Pet" style={{position:'fixed',left:point.x,top:point.y,zIndex:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-zindex)",width,height}}>
    {plugin && <div role="status" style={{position:'absolute',bottom:'100%',left:0,minWidth:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-minwidth)",maxWidth:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-maxwidth)",padding:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-padding)",borderRadius:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-borderradius)",background:'var(--surface)',color:'var(--text)',boxShadow:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-boxshadow)",fontSize:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-fontsize)"}}>
      <small>{plugin.pluginName}</small><div>{plugin.text}</div>
    </div>}
    <button type="button" aria-label={(info.displayName||info.slug||'Pet')+'：Shift 点击浮出桌面，Alt 滚轮缩放'}
      title="拖动移动 · Shift 点击浮出桌面 · Alt 滚轮缩放"
      style={{display:'block',padding:0,border:0,background:'transparent',cursor:'grab',touchAction:'none',width,height}}
      onPointerDown={event=>{
        if(event.button!==0)return
        if(event.shiftKey){const r=event.currentTarget.getBoundingClientRect();void controller.popOut({x:r.x,y:r.y,width:r.width,height:r.height});return}
        drag.current={x:event.clientX-point.x,y:event.clientY-point.y,scope};event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event=>{if(drag.current?.scope===scope){const next=clamp({x:event.clientX-drag.current.x,y:event.clientY-drag.current.y});drag.current.point=next;setPosition(next)}}}
      onPointerUp={()=>{if(drag.current?.scope===scope)controller.savePosition(drag.current.point??clamp(position));drag.current=null}}
      onPointerCancel={()=>{drag.current=null}}
      onWheel={event=>{if(event.altKey){event.preventDefault();controller.setScale((info.scale??.33)*Math.exp(-event.deltaY*.0015))}}}>
      <PetSprite info={info} stateOverride={state} />
    </button>
    {payload.unread && <button type="button" aria-label="打开有新消息的会话" title="查看新消息"
      onClick={()=>void controller.openApp()} style={{position:'absolute',right:0,bottom:0,borderRadius:'50%',width:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-width)",height:"var(--ai-comp-workbench-native-pet-surface-nativepetsurface-height)"}}>✉</button>}
  </aside>
}
