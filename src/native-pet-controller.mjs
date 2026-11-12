const ACTIVE = 'hermes.desktop.pet-overlay-active.v1'
const BOUNDS = 'hermes.desktop.pet-overlay-bounds.v1'
const POSITION = 'hermes.desktop.pet-position.v2'
const infoFields = ['enabled','slug','displayName','mime','spritesheetBase64','spritesheetRevision','frameW','frameH','framesPerState','framesByState','framesByRow','loopMs','scale','stateRows']
const activityFields = ['busy','awaitingInput','toolRunning','reasoning','error','justCompleted','celebrate']
const blank = () => ({ info:{enabled:false},activity:{},busy:false,awaiting:false,unread:false,reaction:null,pluginMessages:[] })
const validBounds = value => value && ['x','y','width','height'].every(key=>Number.isFinite(value[key])) && value.width>0 && value.height>0
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const rejected = () => ({ok:false,code:'owner-retired',retryable:true,message:'Pet 的会话归属已变化。'})
const normalize = value => ({connectionId:value?.connectionId,profile:value?.profile || 'default',sessionId:value?.sessionId ?? null})
const signature = value => JSON.stringify([value.connectionId,value.profile,value.sessionId])

/** Feature state only: the primary native bridge owns its single onControl
 * listener and IPC mirror. Every asynchronous operation captures the selected
 * connection/Profile/session, and uses the already-connected native client.
 * Sprite bytes and activity never enter browser persistence. */
export function createNativePetController({host,live,storage,storageNamespace,getContext,isCurrent,onChange=()=>{},onSubmit,onOpenApp}) {
  if (!live?.native || !live.route?.connectionId || !storageNamespace || typeof getContext!=='function' || typeof isCurrent!=='function') throw new TypeError('Pet requires an explicit native owner and storage scope.')
  let disposed=false, context=null, aborter=new AbortController(), payload=blank(), active=false, error=null
  let revision=0, pending=null, scaleTimer, pollTimer, polling=false, committedScale=.33, scaleRevision=0
  let snapshot=Object.freeze({active,payload,error,owner:context})
  function emit() { snapshot=Object.freeze({active,payload,error,owner:context});if(!disposed)onChange(snapshot) }
  function key(name) { return storageNamespace+':pet:'+JSON.stringify([context.connectionId,context.profile])+':'+name }
  function read(name) { return storage?.getItem(key(name)) ?? null }
  function write(name,value) { storage?.setItem(key(name),value) }
  function readBounds() {
    const raw=read(BOUNDS)
    if(!raw)return null
    try { const value=JSON.parse(raw);return validBounds(value)?value:null } catch { return null }
  }
  function closeWindow() {
    const result=host?.petOverlay?.close?.()
    if(result?.catch)void result.catch(failure=>{if(!disposed){error=failure.message;emit()}})
  }
  function syncContext() {
    if(disposed)return false
    const next=normalize(getContext())
    if(!isCurrent() || next.connectionId!==live.route.connectionId) { dispose();return false }
    if(context && signature(context)===signature(next))return true
    const changedProfile=context && (context.profile!==next.profile || context.connectionId!==next.connectionId)
    aborter.abort();aborter=new AbortController();revision++;pending=null
    clearTimeout(scaleTimer);clearTimeout(pollTimer);scaleTimer=pollTimer=undefined;scaleRevision++
    if(changedProfile && active) {active=false;closeWindow()}
    context=Object.freeze(next)
    payload={...blank(),info:changedProfile?{enabled:false}:payload.info.enabled?{...payload.info,scale:committedScale}:payload.info}
    committedScale=payload.info.scale??.33;error=null;emit()
    if(polling)queueMicrotask(()=>{if(!disposed)void refresh()})
    return true
  }
  function capture() {
    if(!syncContext())return null
    const owner=context,version=revision,signal=aborter.signal
    return Object.freeze({owner,signal,isCurrent:()=>!disposed && !signal.aborted && version===revision && isCurrent() && signature(normalize(getContext()))===signature(owner)})
  }
  function replaceInfo(info,commitScale=true) {
    const projected={enabled:info?.enabled===true}
    if(projected.enabled)for(const field of infoFields)if(info[field]!==undefined)projected[field]=info[field]
    payload={...payload,info:projected};if(commitScale)committedScale=projected.scale??.33;error=null;emit()
  }
  function publish(signals={}) {
    if(!syncContext())return snapshot
    const next={...payload}
    if(signals.activity)next.activity=Object.fromEntries(activityFields.filter(field=>typeof signals.activity[field]==='boolean').map(field=>[field,signals.activity[field]]))
    for(const field of ['busy','awaiting','unread'])if(typeof signals[field]==='boolean')next[field]=signals[field]
    if(Object.hasOwn(signals,'reaction'))next.reaction=signals.reaction?{id:signals.reaction.id,kind:signals.reaction.kind}:null
    if(Array.isArray(signals.pluginMessages))next.pluginMessages=signals.pluginMessages.map(message=>Object.fromEntries(['key','pluginId','pluginName','text','tone','seq'].map(field=>[field,message[field]])))
    // Compare only small live signals, never stringify the multi-MB sprite.
    if(Object.keys(next).some(field=>field!=='info' && !same(next[field],payload[field]))) {payload=next;emit()}
    return snapshot
  }
  function schedulePoll() {
    clearTimeout(pollTimer)
    if(polling && !disposed)pollTimer=setTimeout(()=>{void refresh()},payload.info.enabled?15000:3000)
  }
  async function refresh() {
    const token=capture();if(!token)return false
    if(pending)return pending
    const held=payload.info,requestedScaleVersion=scaleRevision
    const operation=(async()=>{
      try {
        const next=await live.rpc('pet.info',{profile:token.owner.profile,...(held.enabled&&held.spritesheetBase64&&held.spritesheetRevision?{knownRevision:held.spritesheetRevision}:{})},token.owner.profile)
        if(!token.isCurrent())return false
        const info={...next}
        if(info.enabled && info.spritesheetUnchanged && info.slug===held.slug && info.spritesheetRevision===held.spritesheetRevision)info.spritesheetBase64=held.spritesheetBase64
        if(scaleRevision!==requestedScaleVersion)info.scale=payload.info.scale
        replaceInfo(info,scaleRevision===requestedScaleVersion)
        if(read(ACTIVE)==='true' && !active)await restore()
        return true
      } catch(failure) {
        if(token.isCurrent()){error=failure.message;emit()}
        return false
      } finally { if(token.isCurrent()){pending=null;schedulePoll()} }
    })()
    pending=operation;return operation
  }
  async function open(request) {
    const token=capture();if(!token || active || !payload.info.enabled || !payload.info.spritesheetBase64)return false
    if(typeof host?.petOverlay?.open!=='function'){error='原生 Pet 窗口不可用。';emit();return false}
    active=true;write(ACTIVE,'true');emit()
    try {
      const result=await host.petOverlay.open(request)
      if(!token.isCurrent())return false
      if(result?.ok===false)throw new Error(result.error || 'Pet 窗口未打开。')
      if(validBounds(result?.bounds))saveBounds(result.bounds)
      emit();return true
    } catch(failure) {
      if(token.isCurrent()){active=false;write(ACTIVE,'false');error=failure.message;emit()}
      return false
    }
  }
  function popOut(rect) {
    if(!syncContext() || !validBounds(rect))return Promise.resolve(false)
    const saved=readBounds()
    if(saved)return open({bounds:saved,screen:true})
    const info=payload.info,scale=info.scale??.33
    const width=Math.max(240,Math.round((info.frameW??192)*scale+100)),height=Math.max(300,Math.round((info.frameH??208)*scale+200))
    return open({bounds:{x:Math.round(rect.x-(width-rect.width)/2),y:Math.round(rect.y-(height-rect.height)/2),width,height},screen:false})
  }
  function restore() {
    if(!syncContext() || read(ACTIVE)!=='true')return Promise.resolve(false)
    const bounds=readBounds()
    if(!bounds){write(ACTIVE,'false');return Promise.resolve(false)}
    return open({bounds,screen:true})
  }
  function popIn() {
    if(!syncContext())return
    active=false;write(ACTIVE,'false');closeWindow();emit()
  }
  function saveBounds(bounds) {
    if(!syncContext() || !validBounds(bounds))return
    write(BOUNDS,JSON.stringify({x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}))
  }
  function setScale(scale) {
    const token=capture();if(!token || !Number.isFinite(scale) || !payload.info.enabled)return false
    const next=Math.max(.1,Math.min(3,scale)),version=++scaleRevision
    payload={...payload,info:{...payload.info,scale:next}};emit();clearTimeout(scaleTimer)
    scaleTimer=setTimeout(async()=>{
      if(!token.isCurrent())return
      try {
        const result=await live.rpc('pet.scale',{scale:next,profile:token.owner.profile},token.owner.profile)
        if(!token.isCurrent() || version!==scaleRevision)return
        if(result?.ok===false)throw new Error(result.error || 'Pet 缩放未保存。')
        committedScale=typeof result?.scale==='number'?result.scale:next
        payload={...payload,info:{...payload.info,scale:committedScale}};error=null;emit()
      } catch(failure) {
        if(token.isCurrent() && version===scaleRevision){payload={...payload,info:{...payload.info,scale:committedScale}};error=failure.message;emit()}
      }
    },200)
    return true
  }
  async function submit(text) {
    const token=capture(),clean=typeof text==='string'?text.trim():''
    if(!token || !clean || typeof onSubmit!=='function')return rejected()
    return onSubmit(clean,token)
  }
  async function openApp() {
    const token=capture();if(!token)return
    try {
      await onOpenApp?.(token)
      if(token.isCurrent()){payload={...payload,unread:false};emit()}
    } catch(failure) { if(token.isCurrent()){error=failure.message;emit()} }
  }
  function loadPosition() {
    if(!syncContext())return null
    try {const position=JSON.parse(read(POSITION)??'null');return Number.isFinite(position?.x)&&Number.isFinite(position?.y)?position:null} catch{return null}
  }
  function savePosition(position) {
    if(syncContext() && Number.isFinite(position?.x)&&Number.isFinite(position?.y))write(POSITION,JSON.stringify({x:position.x,y:position.y}))
  }
  function dispose() {
    if(disposed)return
    disposed=true;aborter.abort();clearTimeout(scaleTimer);clearTimeout(pollTimer)
    if(active){active=false;closeWindow()}
    payload=blank();snapshot=Object.freeze({active:false,payload,error:null})
  }
  syncContext()
  return {snapshot:()=>snapshot,publish,refresh,popOut,restore,popIn,saveBounds,setScale,submit,openApp,loadPosition,savePosition,
    start(){polling=true;return refresh()},dispose}
}
