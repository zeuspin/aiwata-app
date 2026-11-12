import { localUserAppearance } from './local-users.mjs'
const normalize = route => Object.freeze({connectionId:route.connectionId || 'local',profile:route.profile || 'default'})
const same = (a,b) => a.connectionId===b.connectionId && a.profile===b.profile
const expired = () => new Error('原生连接归属已失效，请重新选择连接。')
const retire = client => {void Promise.resolve(client.retire?.() ?? client.close?.()).catch(()=>{})}
function publicTarget(descriptor) {
  if(descriptor.mode==='local')return 'local'
  // The SSH URL is a transient loopback tunnel, not the backend identity.
  if(descriptor.remoteKind==='ssh')return JSON.stringify(['ssh',descriptor.remoteIdentity ?? '',descriptor.remoteHost ?? ''])
  try {const url=new URL(descriptor.baseUrl);return JSON.stringify([url.origin,url.pathname,descriptor.remoteKind ?? '',descriptor.remoteHost ?? '',descriptor.remoteIdentity ?? ''])}
  catch{return JSON.stringify(['unknown',descriptor.remoteKind ?? '',descriptor.remoteHost ?? '',descriptor.remoteIdentity ?? ''])}
}

// Registry events fence leases before any asynchronous native confirmation. A
// snapshot never acquires authority to dial after its workspace is replaced.
export async function createNativeRuntime({host,connect,search='',user,onPublish=()=>{}}) {
  const params=new URLSearchParams(search),explicitProfile=params.get('profile'),pinned=!!explicitProfile||params.get('peer')==='1'
  const startupEvents=[]
  let dispatch=(kind,event)=>startupEvents.push([kind,event])
  const startupOff=[host.connections?.onChanged?.(event=>dispatch('registry',event)),host.onConnectionApplied?.(()=>dispatch('applied'))].filter(off=>typeof off==='function')
  let initial
  try {
  const requested=explicitProfile ? {profile:explicitProfile,connectionId:params.get('connectionId')} : await host.profile.getDefault()
  initial=requested?.connectionId ? await host.getConnectionFor(requested) : await host.getConnection(requested?.profile ?? undefined)
  }catch(error){for(const off of startupOff)off();throw error}
  let selectionRevision=0,rehomeRevision=0,epoch=0,snapshot,disposed=false,selectionRoute
  const listeners=new Set(),leases=new Set(),unsubs=startupOff
  async function identity(descriptor) {
    const route=normalize(descriptor)
    let installId
    try {const status=await host.api?.({path:'/api/status',...route});installId=status?.install_id}
    catch{throw new Error('暂时无法确认工作区归属，请重试连接。')}
    return JSON.stringify([publicTarget(descriptor),typeof installId==='string'&&installId ? installId : 'unverified:'+globalThis.crypto.randomUUID()])
  }
  function fence() {for(const client of leases)retire(client);leases.clear()}
  function publish(descriptor,{status='ready',scopeIdentity=snapshot?.scopeIdentity,error}={}) {
    const route=normalize(descriptor),scopeKey=JSON.stringify([...(user ? [user.id] : []),route.connectionId,route.profile,scopeIdentity]),storageNamespace='aiwata-app-native:v2:'+scopeKey
    const next={route,descriptor,epoch:++epoch,status,error,scopeIdentity,
      accounts:[{...(user ? localUserAppearance(user) : {name:'AIWATA',initial:'A',color:'#c86935'}),id:'native:'+scopeKey}],storageNamespace,
      async connect(){
        if(disposed||snapshot!==next||status!=='ready')throw expired()
        const client=await connect(route)
        if(disposed||snapshot!==next||status!=='ready'){retire(client);throw expired()}
        client.scopeIdentity=scopeIdentity;client.storageNamespace=storageNamespace;leases.add(client)
        return client
      }}
    snapshot=Object.freeze(next)
    if(status==='ready')host.setActiveConnectionRoute?.({...route,registryScoped:descriptor.registryScoped===true})
    onPublish(snapshot)
    for(const listener of listeners)listener(snapshot)
  }
  async function rehome({removed=false,applied=false}={}) {
    const attempt=++rehomeRevision,previous=snapshot
    ++selectionRevision;selectionRoute=undefined
    fence()
    publish(previous.descriptor,{status:removed?'removed':'reconnecting',error:removed?'当前原生连接已删除，请选择其他连接。':undefined})
    if(removed)return
    try {
      const descriptor=applied&&!pinned&&host.getConnection ? await host.getConnection() : await host.getConnectionFor(previous.route)
      if((!applied||pinned)&&!same(normalize(descriptor),previous.route))throw expired()
      const scopeIdentity=await identity(descriptor)
      if(disposed||attempt!==rehomeRevision)return
      publish(descriptor,{scopeIdentity})
    }catch(error){if(!disposed&&attempt===rehomeRevision)publish(previous.descriptor,{status:'error',error:error.message})}
  }
  let initialIdentity
  try{initialIdentity=await identity(initial)}catch(error){for(const off of unsubs)off();throw error}
  publish(initial,{scopeIdentity:initialIdentity})
  dispatch=(kind,event)=>{
    if(kind==='applied')void rehome({applied:true})
    else if(['updated','removed'].includes(event?.reason)){
      if(event.connectionId===snapshot.route.connectionId)void rehome({removed:event.reason==='removed'})
      else if(selectionRoute?.route.connectionId===event.connectionId)++selectionRevision
    }
  }
  for(const [kind,event] of startupEvents)dispatch(kind,event)
  return {
    get route(){return snapshot.route},get snapshot(){return snapshot},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)},
    dispose(){if(disposed)return;disposed=true;++selectionRevision;++rehomeRevision;selectionRoute=undefined;fence();for(const off of unsubs)off();listeners.clear()},
    async selectRoute(selection) {
      if(disposed)throw expired()
      const route=normalize(selection),attempt=++selectionRevision
      selectionRoute={route,attempt}
      try {
      if(same(route,snapshot.route)&&snapshot.status==='ready')return true
      const descriptor=await host.getConnectionFor(route)
      if(disposed||attempt!==selectionRevision)return false
      if(!same(normalize(descriptor),route))throw new Error('原生连接返回的归属与选择不一致。')
      const probe=await connect(route)
      await probe.close?.()
      if(disposed||attempt!==selectionRevision)return false
      const scopeIdentity=await identity(descriptor)
      if(disposed||attempt!==selectionRevision)return false
      ++rehomeRevision;fence();publish(descriptor,{scopeIdentity})
      if(selectionRoute?.attempt===attempt)selectionRoute=undefined
      await host.profile.rememberConnection(route.connectionId,route.profile)
      if(disposed||attempt!==selectionRevision)return true
      await host.connections.setLastUsed(route.connectionId)
      return true
      }finally{if(selectionRoute?.attempt===attempt)selectionRoute=undefined}
    },
  }
}
