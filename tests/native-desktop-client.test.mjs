import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createNativeDesktopClient } from '../src/native-desktop-client.mjs'
import { createWorkspace } from '../src/workspace.mjs'

function fixture() {
  const calls = [], sockets = []
  class Gateway {
    events = []; requests = []; states = []
    constructor() { sockets.push(this) }
    async connect(url) { calls.push(['connect', url]) }
    async request(method, params) {
      calls.push([method, params])
      if (method === 'profiles.list') return { profiles: [{ name: 'writer', canonical_session_id: 'canonical-writer' }] }
      if (method === 'session.resume') return { session_id: params.session_id, messages: [], info: { cwd: '/project' } }
      if (method === 'client.capabilities') return { server_requests: true }
      return { ok: true }
    }
    onEvent(fn) { this.events.push(fn); return () => {} }
    onRequest(fn) { this.requests.push(fn); return () => {} }
    onState(fn) { this.states.push(fn); return () => {} }
    close() { calls.push(['close']) }
  }
  const host = {
    async getGatewayWsUrlFor(route) { calls.push(['ticket', route]); return { wsUrl: 'ws://native/' + route.profile } },
    async api(req) { calls.push(['api', req]); return { sessions: [], total: 0 } },
    async selectPaths(options) { calls.push(['selectPaths', options]); return ['/project'] },
  }
  return { calls, sockets, host, Gateway }
}

test('native transport pins original connection and profile; Bot opening resumes canonical identity', async () => {
  const f = fixture()
  const client = await createNativeDesktopClient({ ...f, route: { connectionId: 'local', profile: 'default' } })
  await client.openBot('writer')
  assert.ok(f.calls.some(([m,p]) => m === 'session.resume' && p.session_id === 'canonical-writer'))
  assert.ok(!f.calls.some(([m]) => m === 'session.create'))
  assert.deepEqual(f.calls.find(([m,p]) => m === 'ticket' && p.profile === 'writer')[1], { connectionId: 'local', profile: 'writer' })
  await client.forProfile('writer').files('list', 'canonical-writer', undefined, [])
  const req = f.calls.filter(([m]) => m === 'api').at(-1)[1]
  assert.equal(req.profile, 'writer'); assert.equal(req.connectionId, 'local')
  await client.close()
  await assert.rejects(client.rpc('projects.list'), /关闭|退出/)
})

test('native events and server request replies retain owner while another profile is active', async () => {
  const f = fixture(), frames = []
  const client = await createNativeDesktopClient({ ...f, route: { connectionId: 'remote-work', profile: 'default' } })
  client.watch(frame => frames.push(frame), () => {})
  await client.rpc('session.resume', { session_id: 'sid' }, 'writer')
  const bot = f.sockets.at(-1)
  bot.events[0]({ type: 'message.complete', session_id: 'sid', payload: { text: 'done' } })
  let reply
  bot.requests[0]({ id: 'request-1', method: 'preview.read', params: { session_id: 'sid' }, respond: v => { reply=v }, fail() {} })
  assert.equal(frames[0].profile, 'writer'); assert.equal(frames[1].profile, 'writer')
  await assert.rejects(client.desktopReply('request-1', 'sid', {}, '', undefined), /对象|归属/)
  await client.desktopReply('request-1', 'sid', { text: 'page' }, 'writer')
  assert.deepEqual(reply, { text: 'page' })
  await client.close()
})

test('native account presentation is injected and cannot log into fixture accounts', () => {
  const values = new Map(), storage = { getItem:k=>values.get(k), setItem:(k,v)=>values.set(k,v) }
  const workspace = createWorkspace(storage, null, { live:true, accounts:[{ id:'native:local:default' }], storageNamespace:'native-test' })
  assert.equal(workspace.login('lin'), false)
  assert.equal(workspace.login('native:local:default'), true)
  assert.equal(values.has('native-test'), true)
})

test('directory picker uses the original host directory contract', async () => {
  const f=fixture(), client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
  assert.deepEqual(await client.pickFolders(), {available:true,paths:['/project']})
  assert.deepEqual(f.calls.find(([m])=>m==='selectPaths')[1], {directories:true,multiple:true,profile:'default'})
  await client.close()
})

test('first Bot open checks exact native registry, creates one hidden canonical chat and retains it', async () => {
  const f=fixture(); let id=null, creates=0
  const original=f.Gateway.prototype.request
  f.Gateway.prototype.request=async function(method,params) {
    if(method==='profiles.list')return {profiles:[{name:'new-bot',canonical_session:id?{id}:null}]}
    if(method==='session.list')return {sessions:[]}
    if(method==='session.create'){creates++;return {session_id:'new-canonical',stored_session_id:'new-canonical'}}
    if(method==='session.title'){id=params.session_id;return {ok:true}}
    return original.call(this,method,params)
  }
  const client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
  const [a,b]=await Promise.all([client.openBot('new-bot'),client.openBot('new-bot')])
  assert.equal(a.session_id,'new-canonical'); assert.equal(b.session_id,'new-canonical'); assert.equal(creates,1)
  await client.openBot('new-bot'); assert.equal(creates,1)
  await client.close()
})

test('preview start returns native partition string and stale StrictMode release preserves the new lease', async () => {
  const { createNativePreviewSession } = await import('../src/native-preview-session.mjs')
  let closed=0
  const session=createNativePreviewSession('persist:hermes-preview',()=>{closed++})
  const first=session.start(),second=session.start()
  assert.equal(await first,'persist:hermes-preview');assert.equal(await second,'persist:hermes-preview')
  await session.stop();assert.equal(session.active,true);assert.equal(closed,0)
  await session.stop();assert.equal(session.active,false);assert.equal(closed,1)
})

test('profile tool clients remain stable and a hidden terminal can be explicitly closed', async () => {
  const f=fixture(); const disposed=[]
  f.host.terminal={start:async()=>({id:'pty-1',cwd:'/project'}),onData:()=>()=>{},onExit:()=>()=>{},attach:async()=>true,dispose:async id=>{disposed.push(id);return true}}
  const client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
  assert.equal(client.forProfile('writer'),client.forProfile('writer'))
  const response=await client.terminalOpen('session',80,24,new AbortController().signal,'tool-1')
  await response.body.cancel()
  await client.terminalControl({action:'close',session_id:'session',instance_id:'tool-1'})
  assert.deepEqual(disposed,['pty-1'])
  await client.close()
})

test('native terminal presentation retains output while its panel is unmounted', async () => {
  const f=fixture();let onData
  f.host.terminal={start:async()=>({id:'pty',cwd:'/project'}),onData:(_id,fn)=>{onData=fn;return()=>{}},onExit:()=>()=>{},attach:async()=>true,dispose:async()=>true}
  const client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
  const first=await client.terminalOpen('s',80,24,new AbortController().signal,'one')
  onData('before\n');await first.body.cancel();onData('while-hidden\n')
  const second=await client.terminalOpen('s',80,24,new AbortController().signal,'one')
  const reader=second.body.getReader();let text=''
  for(let i=0;i<4;i++) {
    const {value}=await reader.read();text+=new TextDecoder().decode(value)
    if(text.includes('replay-end'))break
  }
  const frames=text.trim().split('\n').map(JSON.parse)
  const output=frames.filter(f=>f.type==='output').map(f=>Buffer.from(f.data,'base64').toString()).join('')
  assert.equal(output,'before\nwhile-hidden\n')
  await reader.cancel();await client.close()
})

test('native crop includes viewport for correct Retina bitmap mapping', async () => {
  const {captureNativePreview}=await import('../src/native-preview-capture.mjs')
  let payload
  const view={getZoomFactor:()=>1,getWebContentsId:()=>12}
  const data=await captureNativePreview({capturePreview:async value=>{payload=value;return 'data:image/png;base64,ok'}},view,async()=>({width:500,height:800}),{x:10,y:20,width:200,height:60})
  assert.equal(data,'data:image/png;base64,ok')
  assert.deepEqual(payload,{webContentsId:12,rect:{x:10,y:20,width:200,height:60},viewport:{width:500,height:800}})
})

test('native receipt recovery matches input_id and retries settled submissions with the exact original identity', async () => {
  const f=fixture(),original=f.Gateway.prototype.request
  f.Gateway.prototype.request=async function(method,params) {
    if(method==='session.resume')return {session_id:params.session_id,pending:[{input_id:'pending-input',admission_id:'admission-live'}]}
    if(method==='prompt.receipt')return {admission_id:params.admission_id}
    if(method==='prompt.submit')return {admission_id:'admission-settled',status:'terminal'}
    return original.call(this,method,params)
  }
  const client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
  assert.equal((await client.submission('s','pending-input')).admission_id,'admission-live')
  const exact={session_id:'s',submission_id:'settled-input',text:'same exact prompt',attachments:[]}
  assert.equal((await client.submission('s','settled-input','',exact)).admission_id,'admission-settled')
  await assert.rejects(client.submission('another','settled-input','',exact),/归属|身份/)
  await client.close()
})

test('native connection keeps recovering beyond five failed dials and stops retrying on close', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture();let dials=0,healthy=false
  f.Gateway.prototype.connect=async()=>{dials++;if(dials>1&&!healthy)throw new Error('offline')}
  const client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
  f.sockets[0].states[0]('closed')
  for(let i=0;i<7;i++){t.mock.timers.tick(5000);await new Promise(setImmediate)}
  assert.ok(dials>6)
  healthy=true;t.mock.timers.tick(5000);await new Promise(setImmediate)
  assert.deepEqual(await client.rpc('projects.list'),{ok:true})
  await client.close();const count=dials;t.mock.timers.tick(60000);await new Promise(setImmediate);assert.equal(dials,count)
})

test('UI default scope stays on the native selected profile, not an implicit root profile', async () => {
  const f=fixture(),client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'owner-profile'}})
  assert.equal(client.forProfile('default'),client)
  await client.memory('read','default')
  const requests=f.calls.filter(([m])=>m==='api').map(([,r])=>r)
  assert.ok(requests.length>0&&requests.every(r=>r.profile==='owner-profile'))
  await client.close()
})

test('scope selection remains a pure operation while a client is closing', async () => {
  const f=fixture(),client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
  const bot=client.forProfile('writer');await client.close()
  assert.equal(client.forProfile('writer'),bot)
  await assert.rejects(bot.files('list','s',undefined,[]),/关闭/)
})

test('native session creation and resume preserve desktop surface policy for ordinary and Bot requests',async()=>{
  const f=fixture(),client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
  await client.rpc('session.create',{title:'native'})
  await client.openBot('writer')
  const requests=f.calls.filter(([m])=>['session.create','session.resume'].includes(m))
  assert.ok(requests.length>=2)
  assert.ok(requests.every(([,p])=>p.source==='desktop'))
  await client.close()
})

test('remote directory selection uses the owning gateway picker, never the Mac folder panel',async()=>{
 const f=fixture();f.host.getConnectionFor=async route=>({...route,mode:'remote'})
 const client=await createNativeDesktopClient({...f,route:{connectionId:'ssh',profile:'writer'}})
 await assert.rejects(client.pickFolders(),/远端/)
 let options;client.pickRemoteFolders=async o=>{options=o;return ['/remote/project']}
 assert.deepEqual(await client.pickFolders(),{available:true,paths:['/remote/project']})
 assert.equal(f.calls.some(([m])=>m==='selectPaths'),false)
 assert.equal(options.multiple,true)
 await client.close()
})

test('closing still releases native sockets when authorization cancellation fails',async()=>{
 const f=fixture(),client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
 client.closeNativeAuthorizations=async()=>{throw new Error('cancel-offline')}
 await assert.rejects(client.close(),/cancel-offline/)
 assert.equal(f.calls.filter(([m])=>m==='close').length,1)
 await assert.rejects(client.rpc('projects.list'),/关闭/)
})
test('native room disband requires its matching durable tombstone',async()=>{const f=fixture(),client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}});await assert.rejects(client.room('groups.disband',{room_id:'room',cancel_id:'cancel'}),/解散|确认/);await client.close()})

test('roster refresh after a reply preserves the resolved canonical transcript',async()=>{
 const f=fixture(),original=f.Gateway.prototype.request
 f.Gateway.prototype.request=async function(method,params){
  if(method==='profiles.list')return{profiles:[{name:'writer',canonical_session_id:'registry-root',canonical_session:{id:'registry-root',resolved_id:'stored-tip'}}]}
  if(method==='session.resume')return{session_id:'runtime',stored_session_id:'stored-tip',messages:[{role:'user',content:'hello'},{role:'assistant',content:'answer'}],info:{},last_sequence:2}
  return original.call(this,method,params)
 }
 const client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
 const api=createWorkspace(null,null,{live:true,accounts:[{id:'native'}]});api.login('native')
 api.syncGatewayBots((await client.bots()).bots)
 api.hydrateGatewayChat('bot:writer',await client.openBot('writer'))
 const chat=api.getChat('bot:writer'),messages=chat.messages
 assert.equal(messages.length,2)
 api.syncGatewayBots((await client.bots()).bots)
 assert.equal(chat.gatewayStoredId,'stored-tip')
 assert.equal(chat.gatewayId,'runtime')
 assert.equal(chat.messages,messages,'metadata refresh must not clear completed replies')
 await client.close()
})


test('first canonical publication and metadata revisions do not recreate the Bot chat',async()=>{
 const f=fixture(),original=f.Gateway.prototype.request;let known=false,revision=0
 f.Gateway.prototype.request=async function(method,params){
  if(method==='profiles.list')return{profiles:[{name:'writer',path:'/owned/profiles/writer',ui_meta_revisions:{'hermes-bots':revision},...(known?{canonical_session_id:'stored-writer',canonical_session:{id:'stored-writer',resolved_id:'stored-writer'}}:{})}]}
  if(method==='session.list')return{sessions:[]}
  if(method==='session.create'){known=true;return{session_id:'runtime-writer',stored_session_id:'stored-writer'}}
  if(method==='session.resume')return{session_id:'runtime-writer',stored_session_id:'stored-writer',messages:[],info:{}}
  return original.call(this,method,params)
 }
 const client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}})
 const api=createWorkspace(null,null,{live:true,accounts:[{id:'native'}]});api.login('native')
 api.syncGatewayBots((await client.bots()).bots)
 api.hydrateGatewayChat('bot:writer',await client.openBot('writer'))
 const chat=api.getChat('bot:writer');api.changeChat(chat.id,{messages:[{role:'user',text:'hello'},{role:'agent',text:'answer'}],draft:'next draft'})
 for(revision=0;revision<2;revision++){
  api.syncGatewayBots((await client.bots()).bots)
  assert.equal(api.getChat(chat.id),chat,'metadata token is not Bot incarnation identity')
  assert.equal(chat.messages.length,2);assert.equal(chat.draft,'next draft')
 }
 await client.close()
})
