// Renderer adapter only. The original host owns connection discovery, processes,
// credentials and OS capabilities; its HermesGateway owns the wire protocol.
import { createNativeGroups } from './native-groups.mjs'
import { nativeFiles } from './native-desktop-files.mjs'
import { createBotBirths } from './native-bot-birth.mjs'
import { nativeSettings } from './native-desktop-settings.mjs'
import { nativeTerminal } from './native-desktop-terminal.mjs'
const normal = value => value && value !== 'default' ? value : ''
const encoded = encodeURIComponent

export async function createNativeDesktopClient({ host, Gateway, route, ownerProfile = () => undefined, groupPolicy }) {
  const base = Object.freeze({ connectionId: route.connectionId || 'local', profile: route.profile || 'default' })
  let stopped = false, closing, subscriber, stateSubscriber
  const lifecycleUnsubs=[],peerRevisions=new Map()
  const botBirths = createBotBirths()
  const profileClients = new Map(), peerClients=new Map(), peerInstances=new Set()
  const connections = new Map(), pendingRequests = new Map(), receipts = new Map(), stops = new Set(), botOpens = new Map()
  const check = () => { if (stopped) throw new Error('当前工作区连接已关闭。') }
  const profileName = profile => !profile || profile === 'default' ? base.profile : profile
  const frameProfile = profile => profile === base.profile ? '' : normal(profile)
  const emit = frame => { if (!stopped) subscriber?.(frame) }
  const api = async (path, { profile, method = 'GET', body, ...options } = {}) => {
    check()
    const result = await host.api({ path, method, ...(body === undefined ? {} : { body }),
      ...options, connectionId: base.connectionId, profile: profileName(profile) })
    check(); return result
  }
  async function connect(profile) {
    check()
    const name = profileName(profile)
    if (connections.has(name)) return connections.get(name).promise
    const entry = { gateway: new Gateway(), ready: false, retry: null, attempts: 0 }
    connections.set(name, entry)
    const dialectProfile = frameProfile(name)
    entry.gateway.onEvent(event => emit({ method: 'event', params: event, profile: dialectProfile }))
    entry.gateway.onRequest(request => {
      if(stopped)return
      const owner = ownerProfile(request) || name
      pendingRequests.set(request.id, { request, profile: frameProfile(owner), session: request.params?.session_id })
      emit({ id: request.id, method: request.method, params: request.params, profile: frameProfile(owner) })
    })
    const dial = async () => {
      check()
      const ticket = host.getGatewayWsUrlFor ? await host.getGatewayWsUrlFor({ ...base, profile: name }) : await host.getGatewayWsUrl(name)
      check()
      if (ticket?.ok === false) throw new Error(ticket.error)
      const url = typeof ticket === 'string' ? ticket : ticket.wsUrl
      await entry.gateway.connect(url)
      check()
      const capabilities = await entry.gateway.request('client.capabilities', { server_requests: true })
      check()
      entry.capabilities = capabilities
      entry.ready = true; entry.attempts = 0
      stateSubscriber?.('connected')
      return entry.gateway
    }
    entry.gateway.onState(state => {
      if (stopped || !entry.ready || !['closed', 'error'].includes(state)) return
      stateSubscriber?.('reconnecting')
      entry.ready = false
      const retry = () => {
        if (stopped) return
        entry.retry = setTimeout(() => {
          entry.promise = dial().catch(error => {
            entry.attempts++
            retry()
            throw error
          })
          void entry.promise.catch(() => {})
        }, Math.min(400 * 2 ** entry.attempts, 5000))
      }
      retry()
    })
    entry.promise = dial().catch(error => { if (!entry.ready) { entry.gateway.close(); connections.delete(name) }; throw error })
    return entry.promise
  }
  async function rpc(method, params = {}, profile, timeoutMs) {
    const gateway = await connect(profile)
    check()
    if (['session.create','session.resume'].includes(method)) params={...params,source:'desktop'}
    if (method === 'prompt.submit') params = client.prepareUploads(params, profile)
    const result = await gateway.request(method, params, timeoutMs ?? (method === 'prompt.submit' ? 1800000 : 60000))
    check()
    if (method === 'prompt.submit' && result?.admission_id) receipts.set(JSON.stringify([profileName(profile), params.session_id, params.submission_id]), result)
    return result
  }
  async function answer(id, session, result, profile, error) {
    check()
    const owned = pendingRequests.get(id)
    if (!owned || owned.profile !== frameProfile(profileName(profile)) || session && owned.session !== session) throw new Error('桌面请求对象或归属已变化。')
    if (error) owned.request.fail(error.code, error.message)
    else owned.request.respond(result)
    pendingRequests.delete(id)
    return { ok: true }
  }
  const botIdentity = row => JSON.stringify([base.connectionId, base.profile, row.name, row.path ?? null,
    Object.entries(row.ui_meta_revisions ?? {}).sort(([a],[b])=>a.localeCompare(b)),
    row.canonical_session_id ?? row.canonical_session?.id ?? null])
  const client = {
    native: true, queueBotIntroduction: botBirths.queue, afterBotHydrated: botBirths.afterHydrate, route: base, executionMode: 'native-desktop', capabilities: {}, rpc, api,
    async openNativeSurface(surface,profile) {
      check()
      const allowed=['settings','artifacts','capabilities','cron','messaging','webhooks','session-import']
      if(!allowed.includes(surface))throw new Error('此原生页面尚未登记。')
      const result=await host.openWindow({...base,profile:profileName(profile),nativeSurface:surface})
      check()
      if(result?.ok===false)throw new Error(result.error||'原生页面无法打开。')
      return result
    },
    async sessions() {
      const rows = [], limit = 100
      let offset = 0, complete = false
      while (!complete && rows.length < 10000) {
        const page = await api(`/api/sessions?archived=include&min_messages=0&order=recent&limit=${limit}&offset=${offset}`)
        const list = page.sessions ?? []
        rows.push(...list)
        complete = list.length < limit || Number.isFinite(page.total) && rows.length >= page.total
        if (!list.length) break
        offset += list.length
      }
      return { sessions: rows, complete }
    },
    async bots() {
      const { profiles = [] } = await rpc('profiles.list', { include_sessions: true })
      return { bots: await Promise.all(profiles.filter(row => row.name !== 'default' || base.profile === 'default').map(async row => {
        const asset = row.has_avatar ? await rpc('profiles.get_asset', { name: row.name, asset: 'avatar' }) : null
        return { profile: row.name, isDefault: row.name === base.profile, identity: botIdentity(row),
          profileIdentity: JSON.stringify([base.connectionId, base.profile, row.name, row.path ?? null]), name: row.ui_meta?.['hermes-bots']?.title || row.display_name || (row.name === base.profile ? 'AIWATA' : row.name),
          description: row.description, model: row.model, provider: row.provider,
          appearance: row.ui_meta?.['aiwata-app']?.appearance, avatar: asset?.found ? asset.data : '',
          canonicalId: row.canonical_session?.resolved_id ?? row.canonical_session_id ?? row.canonical_session?.id,
          canonicalIds: [...new Set([row.canonical_session_id, row.canonical_session?.id, row.canonical_session?.resolved_id].filter(Boolean))],
          revision: row.ui_meta_revisions?.['aiwata-app'] ?? 0, desktopRevision: row.ui_meta_revisions?.['hermes-bots'] ?? 0 }
      })) }
    },
    botDetails: profile => rpc('profiles.describe', { name: profile }),
    openBot(profile) {
      if (botOpens.has(profile)) return botOpens.get(profile)
      const opening = (async () => {
        const { profiles = [] } = await rpc('profiles.list', { include_sessions: true })
        const row = profiles.find(row => row.name === profile)
        if (!row) throw new Error('此 Bot 已不存在。')
        let canonicalCreated = false
        let id = row.canonical_session_id ?? row.canonical_session?.resolved_id ?? row.canonical_session?.id
        if (!id) {
          // Same adopt-before-mint rule as the original canonical-chat.ts.
          // A registry failure is never interpreted as an empty registry.
          const history = await rpc('session.list', { title:'Bot Chat', include_hidden:true, limit:100 }, profile)
          const existing = history.sessions?.find(item => item.title === 'Bot Chat' && item.hidden && !item.archived)
          id = existing?.resolved_id ?? existing?.id
          if (!id) {
            const created = await rpc('session.create', { title:'Bot Chat', hidden:true, follow_profile_config:true }, profile)
            id = created.stored_session_id ?? created.session_id
            canonicalCreated = true
            if (!id) throw new Error('原 AIWATA 未返回 Bot 会话身份。')
            try { await rpc('session.title', { session_id:created.session_id, title:'Bot Chat' }, profile) }
            catch (error) {
              const adopted = await rpc('profiles.list', { include_sessions:true })
              const owner = adopted.profiles?.find(item=>item.name===profile)?.canonical_session
              if (!owner?.id) throw error
              id=owner.resolved_id ?? owner.id
              canonicalCreated = false
            }
          }
        }
        if (canonicalCreated && profile === base.profile) botBirths.queue(profile, 'welcome:' + id)
        const snapshot = await rpc('session.resume', { session_id:id }, profile)
        return { ...snapshot, botCanonicalCreated: canonicalCreated }
      })().finally(()=>botOpens.delete(profile))
      botOpens.set(profile,opening);return opening
    },
    async deleteBot(profile, expectedIdentity) {
      if (!profile || profile === 'default' || profile === base.profile || !expectedIdentity) throw new Error('不能删除当前工作区或缺少身份的 Bot。')
      const { profiles = [] } = await rpc('profiles.list', { include_sessions: true })
      const row = profiles.find(item => item.name === profile)
      if (!row || botIdentity(row) !== expectedIdentity) throw new Error('Bot 已变化，请刷新后重新确认删除。')
      const result = await api('/api/profiles/' + encoded(profile), { method: 'DELETE' })
      if (result.ok !== true) throw new Error('原生后端未确认 Bot 删除。')
      const entry = connections.get(profile)
      if (entry) { entry.ready = false; clearTimeout(entry.retry); entry.gateway.close(); connections.delete(profile) }
      profileClients.delete(profile); botOpens.delete(profile)
      return { ...result, settlementPending: result.settlement_pending === true }
    },
    async room(method,params={}) {
      if(method==='groups.create'&&groups)return groups.create(params)
      if(groups&&['groups.send','groups.retry','groups.continue'].includes(method))await groups.beforeSend(params.room_id)
      const response=await rpc(method,method==='groups.create'?{...params,members:params.members.map(member=>({
        member_id:member.profile,profile:member.profile,handle:member.profile,display_name:member.name,
        target:{kind:'local',profile:member.profile}}))}:params)
      if(method==='groups.disband' && (response?.tombstone?.room_id!==params.room_id || !Number.isFinite(response.tombstone.disbanded_at)))throw new Error('原生群聊解散尚未确认。')
      if(groups&&method==='groups.state')groups.observe(response)
      return response
    },
    groupCandidates: bots => groups ? groups.candidates(bots) : Promise.resolve(bots),
    retryGroupPeers: (room,members) => groups ? groups.retry(room,members) : Promise.reject(new Error('原生群聊连接尚未就绪。')),
    async rooms() {
      const rows = []; let offset = 0
      for (;;) {
        const page = await rpc('groups.list', { limit:100, offset }); rows.push(...page.rooms)
        if (page.next_offset == null) return rows
        if (page.next_offset <= offset) throw new Error('群聊列表游标无效。')
        offset = page.next_offset
      }
    },
    async submission(session_id, submission_id, profile, originalSubmission) {
      if (originalSubmission && (originalSubmission.session_id !== session_id || originalSubmission.submission_id !== submission_id)) throw new Error('发送记录身份或归属不一致。')
      const cached = receipts.get(JSON.stringify([profileName(profile), session_id, submission_id]))
      if (cached) return rpc('prompt.receipt', { session_id, admission_id: cached.admission_id }, profile)
      const snapshot = await rpc('session.resume', { session_id }, profile)
      const pending = (snapshot.pending ?? snapshot.info?.pending_submissions ?? []).find(row => row.input_id === submission_id)
      if (pending?.admission_id) return rpc('prompt.receipt', { session_id, admission_id: pending.admission_id }, profile)
      // Native admission is idempotent by input/submission identity. Retain the
      // exact serialized request before sending; replay recovers a completed
      // receipt as well as an in-flight one, without admitting a second turn.
      return originalSubmission ? rpc('prompt.submit', originalSubmission, profile) : null
    },
    async folders() {
      const { projects = [] } = await rpc('projects.list')
      const paths = [...new Set(projects.flatMap(project => (project.folders ?? []).map(folder => folder.path)))]
      return paths.map(path => ({name:path.split('/').at(-1),path}))
    },
    async pickFolders(signal, options={}) {
      check()
      const descriptor=host.getConnectionFor ? await host.getConnectionFor(base) : {mode:base.connectionId==='local'?'local':'remote'}
      check();signal?.throwIfAborted()
      const request={directories:true,multiple:true,...options,profile:base.profile,signal}
      if(descriptor.mode==='remote' && !client.pickRemoteFolders)throw new Error('远端目录选择器尚未就绪，请重新打开此工作区。')
      const paths=descriptor.mode==='remote' ? await client.pickRemoteFolders(request) : await host.selectPaths({directories:request.directories,multiple:request.multiple,profile:base.profile})
      signal?.throwIfAborted();check()
      return {available:true,paths:Array.isArray(paths)?paths:paths?.paths??[]}
    },
    createFolder: () => Promise.reject(new Error('请使用系统目录选择器选择或创建文件夹。')),
    reply: (id, result, profile) => answer(id, undefined, result, profile),
    previewReply: (id, session, result, profile) => answer(id, session, result, profile),
    desktopReply: answer,
    computerStatus: profile => api('/api/tools/computer-use/status', { profile }),
    computerPermissions: profile => api('/api/tools/computer-use/permissions/grant', { profile, method:'POST' }),
    computerPermissionStatus: profile => api('/api/actions/computer-use-grant/status', { profile }),
    watch(onFrame, onStatus) {
      check()
      subscriber = onFrame; stateSubscriber = onStatus
      onStatus('connected')
      return () => { if (subscriber === onFrame) { subscriber = null; stateSubscriber = null } }
    },
    retire() {
      fence()
      if(!closing)closing=cleanup().catch(()=>undefined)
      return closing
    },
    async close() {
      if(closing)return closing
      closing=(async()=>{
        try{await client.closeNativeAuthorizations?.()}
        finally{fence();await cleanup(false)}
      })()
      return closing
    },
  }
  function fence() {
    if(stopped)return
    stopped=true
    botBirths.clear()
    const notify=stateSubscriber
    subscriber=null;stateSubscriber=null
    for(const off of lifecycleUnsubs.splice(0))off()
    for(const entry of connections.values()){clearTimeout(entry.retry);entry.gateway.close()}
    for(const peer of peerInstances)void peer.retire()
    peerInstances.clear()
    pendingRequests.clear();receipts.clear();botOpens.clear()
    groups?.invalidatePeers?.()
    notify?.('retired')
  }
  async function cleanup(authorizations=true) {
    const closingPeers=[...peerClients.values()];peerClients.clear()
    const closingStops=[...stops];stops.clear()
    await Promise.allSettled([
      ...(authorizations?[Promise.resolve().then(()=>client.closeNativeAuthorizations?.())]:[]),
      ...closingPeers.map(async pending=>(await pending).retire()),
      ...closingStops.map(stop=>Promise.resolve().then(stop)),
    ])
  }
  function invalidatePeer(connectionId) {
    peerRevisions.set(connectionId,(peerRevisions.get(connectionId)??0)+1)
    groups?.invalidatePeers?.(connectionId)
    for(const [key,pending] of peerClients)if(JSON.parse(key)[0]===connectionId){
      peerClients.delete(key)
      void pending.then(peer=>peer.retire(),()=>{})
    }
  }
  const groups=groupPolicy ? createNativeGroups({owner:base,rpc,host,policy:groupPolicy,check,
    peerRpc:async(route,method,params)=>{
      check();const key=JSON.stringify([route.connectionId,route.profile]),version=peerRevisions.get(route.connectionId)??0
      if(!peerClients.has(key)){
        const pending=createNativeDesktopClient({host,Gateway,route,ownerProfile,groupPolicy}).then(peer=>{if(stopped)void peer.retire();else peerInstances.add(peer);return peer}).catch(error=>{if(peerClients.get(key)===pending)peerClients.delete(key);throw error})
        peerClients.set(key,pending)
      }
      const peer=await peerClients.get(key)
      const current=()=>!stopped && version===(peerRevisions.get(route.connectionId)??0)
      if(!current()){void peer.retire();check();throw new Error('群聊成员连接已变化。')}
      const result=await peer.rpc(method,params)
      check();if(!current())throw new Error('群聊成员连接已变化。')
      return result
    },
  }) : null
  Object.assign(client, nativeFiles({ rpc, api,host,route:base,check }), nativeSettings({ rpc, api, host, stops, check, route:base }), nativeTerminal({ rpc, host, route:base, stops, check }))
  client.forProfile = (profile = '') => {
    if (profileName(profile) === base.profile) return client
    profile = profileName(profile)
    if (!profileClients.has(profile)) profileClients.set(profile, { ...client,
      ...nativeFiles({ rpc:(method, params)=>rpc(method, params, profile), api:(path, options)=>api(path, { ...options, profile }),host,route:{...base,profile},check }),
      ...nativeTerminal({ rpc:(method, params)=>rpc(method, params, profile), host, route:{ ...base, profile }, stops, check }),
    })
    return profileClients.get(profile)
  }
  const offRegistry=host.connections?.onChanged?.(payload=>{
    if(!payload || !['updated','removed'].includes(payload.reason))return
    if(payload.connectionId===base.connectionId)void client.retire()
    else invalidatePeer(payload.connectionId)
  })
  const offApplied=host.onConnectionApplied?.(()=>{void client.retire()})
  if(typeof offRegistry==='function')lifecycleUnsubs.push(offRegistry)
  if(typeof offApplied==='function')lifecycleUnsubs.push(offApplied)
  try{await connect()}catch(error){await client.retire();throw error}
  client.capabilities = { ...connections.get(base.profile)?.capabilities, ...(connections.get(base.profile)?.gateway.sessionWire === 'canonical' ? {declines_not_shown:false} : {}) }
  return client
}
