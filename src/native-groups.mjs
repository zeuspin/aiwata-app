const key=route=>JSON.stringify([route.connectionId,route.profile])
const targetRoute=member=>({connectionId:member.connectionId,profile:member.targetProfile || member.profile})
const peer=member=>member.target?.kind==='peer'

// Original canonical policies decide identities and capability support; this
// adapter only carries their requests across the host-owned connections.
export function createNativeGroups({owner,rpc,peerRpc,policy,host,check}) {
  const intents=new Map(),seatedAt=new Map(),renewing=new Map(),peerRevisions=new Map()
  let renewalEpoch=0
  const seatKey=(room,member)=>JSON.stringify([room.room_id,member.member_id])
  const freshFor=20*60*60*1000,retryAfter=5*60*1000
  async function targets(members,partial=false) {
    const result=new Map()
    const reads=members.filter(m=>m.connectionId!==owner.connectionId).map(async member=>{
      const route=targetRoute(member),answer=await peerRpc(route,'groups.capabilities',{})
      check();const state=policy.peerTargetState(answer,route.profile)
      if(!state.ready)throw new Error(`${member.name}：${state.reason}`)
      if(member.installId && state.installationId!==`install:${member.installId}`)throw new Error('成员网关身份已变化。')
      result.set(key(route),state)
    })
    if(partial)await Promise.allSettled(reads)
    else await Promise.all(reads)
    return result
  }
  async function seat(room,member,selection,target,cacheCurrent=()=>true) {
    const pin=member.target,route=targetRoute(selection),revision=peerRevisions.get(selection.connectionId)??0
    const current=()=>{check();if((peerRevisions.get(route.connectionId)??0)!==revision)throw new Error('成员连接已变化，请重试。')}
    if(!target?.ready || pin.installation_id!==target.installationId || pin.capability_digest!==target.catalogDigest || pin.profile!==route.profile)throw new Error('成员网关身份或策略已变化。')
    const invitation=await peerRpc(route,'groups.peer.invite',{room_id:room.room_id,member_id:member.member_id,
      home_install_id:room.authority_gateway_id,authority_gateway_id:room.authority_gateway_id,authority_epoch:room.authority_epoch,
      ttl_seconds:86400,...(target.renewal?{status_ttl_seconds:2592000}:{})})
    current()
    const catalog=invitation?.catalog,url=catalog?.endpoint?.url
    if(!invitation?.grant || catalog?.installation_id!==pin.installation_id || catalog.catalog_digest!==pin.capability_digest ||
      typeof url!=='string' || invitation.endpoint?.url!==url || invitation.target_profile!==pin.profile)throw new Error('成员邀请与群聊固定的网关不一致。')
    try{
      const result=await rpc('groups.peer.register',{room_id:room.room_id,member_id:member.member_id,target_url:url,
        target_profile:invitation.target_profile,grant:invitation.grant,catalog})
      current()
      if(result?.registered!==true || result.target_install_id!==pin.installation_id)throw new Error('成员加入未确认，请重试连接成员。')
    }catch(error){
      const state=await rpc('groups.state',{room_id:room.room_id,include_disbanded:true}).catch(()=>null)
      current()
      const same=state?.room?.room_id===room.room_id&&state.room.authority_gateway_id===room.authority_gateway_id&&state.room.authority_epoch===room.authority_epoch
      if(same&&state.room.disbanded_at!=null)await peerRpc(route,'groups.peer.revoke',{grant:invitation.grant})
      throw error
    }
    if(cacheCurrent())seatedAt.set(seatKey(room,member),Date.now())
  }
  async function join(room,members,states) {
    if(!room?.authority_gateway_id || !Number.isSafeInteger(room.authority_epoch))throw new Error('群聊网关身份未确认。')
    const results=await Promise.allSettled(room.members.filter(peer).map(async member=>{
      const selection=members.find(m=>m.connectionId!==owner.connectionId && targetRoute(m).profile===member.target.profile && states.get(key(targetRoute(m)))?.installationId===member.target.installation_id)
      if(!selection)throw new Error('未找到此成员所属连接。')
      await seat(room,member,selection,states.get(key(targetRoute(selection))))
    }))
    check()
    return {room,unjoined:results.flatMap((r,i)=>r.status==='rejected'?[{memberId:room.members.filter(peer)[i].member_id,error:r.reason.message}]:[])}
  }
  function observe(snapshot) {
    check()
    const room=snapshot?.room
    if(!room || room.disbanded_at!=null || renewing.has(room.room_id))return
    const statuses=new Map((snapshot.driver_status?.peer_routes??[]).map(route=>[route.member_id,route.status]))
    const due=room.members.filter(member=>peer(member)&&['ready','needs_reauthorization'].includes(statuses.get(member.member_id))&&Date.now()-(seatedAt.get(seatKey(room,member))??0)>=freshFor)
    if(!due.length)return
    const epoch=renewalEpoch
    const current=()=>epoch===renewalEpoch
    const pending=(async()=>{
      const roster=await service.candidates([]);check();if(!current())return
      // A roster that has not loaded the pinned connection is not a failed
      // invitation; a later refresh may then retry as soon as it appears.
      const peers=roster.filter(member=>member.connectionId!==owner.connectionId)
      if(!peers.length)return
      const states=await targets(peers,true);check();if(!current())return
      await Promise.allSettled(due.map(async member=>{
        const selection=peers.find(row=>row.profile===member.target.profile&&states.get(key(targetRoute(row)))?.installationId===member.target.installation_id)
        if(!selection)return
        try{await seat(room,member,selection,states.get(key(targetRoute(selection))),current)}
        catch{if(current())seatedAt.set(seatKey(room,member),Date.now()-freshFor+retryAfter)}
      }))
    })().catch(()=>undefined).finally(()=>{if(renewing.get(room.room_id)===pending)renewing.delete(room.room_id)})
    renewing.set(room.room_id,pending)
  }
  const service={
    observe,
    invalidatePeers(connectionId){
      peerRevisions.set(connectionId,(peerRevisions.get(connectionId)??0)+1)
      renewalEpoch++;seatedAt.clear();renewing.clear()
    },
    async beforeSend(roomId){
      const state=await rpc('groups.state',{room_id:roomId});check();observe(state)
      const pending=renewing.get(roomId)
      if(!pending)return
      let timer
      try{await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(resolve,45000)})])}
      finally{clearTimeout(timer)}
      check()
    },
    async candidates(localBots) {
      check()
      const [snapshot,capabilities]=await Promise.all([host.getAgentRoster(),rpc('groups.capabilities')]);check()
      const sources=new Map((snapshot.sources??[]).map(s=>[s.connectionId,s]))
      const ownerBot=localBots.some(bot=>bot.profile===owner.profile)?[]:[{id:'bot:'+owner.profile,profile:owner.profile,name:owner.profile==='default'?'AIWATA':owner.profile}]
      const locals=[...ownerBot,...localBots].filter(bot=>!Array.isArray(capabilities.seatable_profiles)||capabilities.seatable_profiles.includes(bot.profile))
        .map(bot=>({...bot,connectionId:owner.connectionId,handle:bot.profile}))
      const remote=(snapshot.agents??[]).filter(a=>a.connectionId!==owner.connectionId).flatMap(a=>{
        const source=sources.get(a.connectionId)
        if(source?.status==='unreachable'||source?.reachable===false||source?.needsSignIn)return []
        const profile=a.targetProfile||a.profile
        return [{id:'candidate:'+key({connectionId:a.connectionId,profile}),profile,targetProfile:profile,
          name:(a.profileMetadata?.title||a.profile)+' · '+(a.connectionLabel||a.connectionId),
          connectionId:a.connectionId,connectionLabel:a.connectionLabel,installId:source?.installId,handle:a.handle}]
      })
      return [...locals,...remote]
    },
    async create(params) {
      check()
      const members=params.members.map(m=>({...m,connectionId:m.connectionId||owner.connectionId}))
      if(!members.some(m=>m.connectionId===owner.connectionId))throw new Error('请包含当前所在连接的 Bot，或切换到成员所在连接创建群聊。')
      const capability=await rpc('groups.capabilities');check()
      if(capability.driver!==true)throw new Error('此网关版本尚未支持托管群聊。')
      const mixed=members.some(m=>m.connectionId!==owner.connectionId)
      if(mixed && (capability.persistent_process!==true||!capability.methods?.includes('groups.peer.register')))throw new Error('此网关暂不能接纳其他电脑的成员。')
      if(Array.isArray(capability.seatable_profiles)&&members.some(m=>m.connectionId===owner.connectionId&&!capability.seatable_profiles.includes(m.profile)))throw new Error('所选本机成员不可加入此群聊。')
      const states=await targets(members);check()
      const nativeMembers=members.map(m=>({...m,name:m.profile,title:m.name,targetProfile:m.targetProfile||m.profile}))
      const checked=policy.canonicalGroupRoster(owner,nativeMembers,m=>states.get(key(targetRoute(m))))
      if(checked.problem)throw new Error('群聊成员无效：'+checked.problem)
      // Preserve the exact first payload for an uncertain groups.create reply.
      const identity=JSON.stringify([params.name,members.map(m=>[m.connectionId,m.profile])])
      let intent=intents.get(params.room_id)
      if(intent&&intent.identity!==identity)throw new Error('群聊创建结果尚未确认，请先重试原来的成员。')
      if(!intent){intent={identity,payload:{room_id:params.room_id,name:params.name,members:checked.roster}};intents.set(params.room_id,intent)}
      const {room}=await rpc('groups.create',intent.payload);check()
      if(room?.room_id!==params.room_id)throw new Error('群聊创建身份未确认。')
      if(!mixed)return {room,unjoined:[]}
      return join(room,members,states)
    },
    async retry(room,members) {
      check()
      const current=await rpc('groups.state',{room_id:room.room_id,include_disbanded:true});check()
      if(current.room?.disbanded_at!=null || current.room?.authority_gateway_id!==room.authority_gateway_id || current.room?.authority_epoch!==room.authority_epoch)throw new Error('群聊归属已变化。')
      return join(current.room,members,await targets(members))
    },
  }
  return service
}
