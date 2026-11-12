import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace } from '../src/workspace.mjs'
import { createNativePrimaryWorkbench, observeSystemTheme } from '../src/native-primary-workbench.mjs'
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(t) {
  const api=createWorkspace(null,null,{live:true,accounts:[{id:'native'}]});api.login('native')
  const events=new Map(), calls=[], gaps=[]
  const listen=name=>callback=>{events.set(name,callback);return()=>events.delete(name)}
  const host={quickEntry:{onSubmit:listen('submit'),pushState:value=>calls.push(['push',value]),ackSubmit:(...args)=>calls.push(['ack',...args])},
    onFocusSession:listen('focus'),onOpenFolderRequested:listen('folder'),onDeepLink:listen('deep'),signalDeepLinkReady:()=>calls.push(['ready']),
    setNativeTheme:value=>calls.push(['theme',value]),setTitleBarTheme:value=>calls.push(['titlebar',value])}
  const live={native:true,route:{connectionId:'local',profile:'default'},pickFolders:async()=>({paths:['/project']}),rpc:async(method,params)=>{calls.push([method,params]);if(method==='projects.list')return{projects:[{id:'p1',name:'Project',primary_path:'/project',folders:[{path:'/project'}]}]}}}
  let current
  const controller=createNativePrimaryWorkbench({host,api,live,accountId:'native',getCurrentChat:()=>current,getStatus:()=> 'connected',getAppearance:()=>({mode:'dark'}),getSystemDark:()=>false,
    getTitleBarTheme:()=>({background:'#191b19',foreground:'#e9e9e8'}),send:async(chat,_folder,input)=>{calls.push(['send',chat,input]);return{ok:true,runtimeSessionId:'runtime-a',sessionId:chat.gatewayStoredId??'new-stored'}},
    openChat:id=>calls.push(['open',id]),openDraft:projectId=>calls.push(['draft',projectId]),refresh:()=>{},onGap:gap=>gaps.push(gap)})
  t?.after(() => controller.dispose())
  return{host,api,events,calls,gaps,live,controller,setCurrent:value=>{current=value}}
}

test('Quick Entry targets expose durable IDs and send explicit text without touching the selected draft',async t=>{
  const f=fixture(t),chat=f.api.newChat();f.api.changeChat(chat.id,{gatewayStoredId:'durable-a',gatewayId:'runtime-a',draft:'keep'})
  f.setCurrent(chat);f.controller.publish()
  assert.deepEqual(f.calls.filter(row=>row[0]==='push').at(-1)[1].sessions,[{id:'durable-a',title:'新聊天'}])
  f.events.get('submit')({correlationId:'q',target:'durable-a',text:'captured'});await tick()
  const sent=f.calls.find(row=>row[0]==='send')
  assert.equal(sent[1],chat);assert.equal(sent[2].text,'captured');assert.equal(sent[2].expectedStoredId,'durable-a');assert.equal(chat.draft,'keep')
  assert.equal(f.calls.find(row=>row[0]==='ack')[2].sessionId,'durable-a')
  f.controller.dispose()
})

test('Quick Entry new uses a separate pending capture and missing targets never fall through to current',async t=>{
  const f=fixture(t),draft=f.api.openChatDraft();f.api.changeChat(draft.id,{draft:'preserve'});f.setCurrent(draft)
  f.events.get('submit')({correlationId:'new',target:'new',text:'capture'});await tick()
  assert.notEqual(f.calls.find(row=>row[0]==='send')[1],draft)
  assert.equal(draft.draft,'preserve');assert.equal(f.api.current().newChatDraft,draft)
  f.events.get('submit')({correlationId:'missing',target:'no-such-durable-id',text:'capture'});await tick()
  assert.equal(f.calls.filter(row=>row[0]==='send').length,1)
  assert.equal(f.calls.filter(row=>row[0]==='ack').at(-1)[2].ok,false)
  f.controller.dispose()
})

test('focus uses only known owned native runtime/durable bindings and deep links remain pending',t=>{
  const f=fixture(t),chat=f.api.newChat();f.api.changeChat(chat.id,{gatewayStoredId:'stored-a',gatewayId:'runtime-a'})
  f.events.get('focus')('runtime-a');f.events.get('focus')('unmapped-runtime')
  assert.deepEqual(f.calls.filter(row=>row[0]==='open'),[['open',chat.id]])
  assert.equal(f.calls.some(row=>row[0]==='ready'),false)
  assert.ok(f.gaps.some(row=>row.feature==='focusSession'))
  f.controller.dispose()
})

test('native folder menu reuses an owned project from the host picker without duplicating it',async t=>{
  const f=fixture(t);f.events.get('folder')();await tick()
  assert.equal(f.calls.some(row=>row[0]==='projects.create'),false)
  assert.deepEqual(f.calls.filter(row=>row[0]==='draft'),[['draft','p1']])
  assert.equal(f.api.current().projects[0].folder,'/project')
  f.controller.dispose()
})

test('system theme observer follows OS changes and releases its listener',t=>{
  let listener,removed;const media={matches:false,addEventListener:(event,fn)=>{assert.equal(event,'change');listener=fn},removeEventListener:(event,fn)=>{removed=fn}}
  const values=[],off=observeSystemTheme({matchMedia:()=>media},value=>values.push(value))
  media.matches=true;listener();off()
  assert.deepEqual(values,[false,true]);assert.equal(removed,listener)
})

test('title bar colors use the rendered workbench and logout removes native listeners',t=>{
  const f=fixture(t)
  assert.deepEqual(f.calls.find(row=>row[0]==='titlebar'),['titlebar',{background:'#191b19',foreground:'#e9e9e8'}])
  f.api.logout();f.controller.publish()
  assert.equal(f.events.size,0)
})

test('connection-return links query the owned native operation instead of trusting link status', async t => {
  const { resumeNativeConnectionDone } = await import('../src/native-primary-workbench.mjs')
  const f = fixture(t), chat = f.api.newChat(), selected = [], calls = []
  const request = { op_id:'owned-op', seq:1, deadline_at:9999999999, targets:[], settled:false }
  f.api.changeChat(chat.id,{gatewayStoredId:'durable-chat',gatewayId:'runtime-chat',connectionRequest:request})
  const record=f.api.current(),live={rpc:async(method,params,profile)=>{calls.push([method,params,profile]);return{...request,seq:2}}}
  const handled=await resumeNativeConnectionDone({api:f.api,record,live,action:{op:'owned-op',status:'connected'},select:id=>selected.push(id),refresh:()=>{}})
  assert.equal(handled,true);assert.equal(chat.connectionRequest.settled,false);assert.equal(chat.connectionRequest.seq,2)
  assert.deepEqual(calls.map(row=>row[0]),['connectors.operation.wake','connectors.operation.status'])
  assert.deepEqual(calls[0][1].owner,{type:'session',session_id:'durable-chat'});assert.deepEqual(selected,[chat.id]);f.controller.dispose()
})

test('connection-return links cannot wake a guessed operation or continue across logout', async t => {
  const { resumeNativeConnectionDone } = await import('../src/native-primary-workbench.mjs')
  const f=fixture(t),chat=f.api.newChat(),calls=[],record=f.api.current()
  f.api.changeChat(chat.id,{gatewayStoredId:'durable-chat',connectionRequest:{op_id:'owned-op',seq:1,deadline_at:9999999999,targets:[],settled:false}})
  const live={rpc:async method=>{calls.push(method);f.api.logout();return{}}},params={api:f.api,record,live,select:()=>{},refresh:()=>{}}
  assert.equal(await resumeNativeConnectionDone({...params,action:{op:'guessed'}}),false);assert.equal(calls.length,0)
  assert.equal(await resumeNativeConnectionDone({...params,action:{op:'owned-op'}}),false);assert.deepEqual(calls,['connectors.operation.wake']);f.controller.dispose()
})

test('Pet mirrors real cross-session work and unread completion without replaying previously read mail', async t => {
  const { nativePetSignals } = await import('../src/native-primary-workbench.mjs')
  const foreground={id:'front',pending:null,messages:[],activity:{}},background={id:'back',pending:'run',activity:{needsInput:true},unread:true,messages:[{role:'agent',status:'complete'}]}
  const record={chats:{front:foreground,back:background}},readThrough=new Map([['back',1]])
  assert.deepEqual(nativePetSignals(record,foreground,readThrough),{activity:{busy:true,awaitingInput:true,toolRunning:false,error:false},busy:false,awaiting:false,unread:false})
  background.pending=null;background.activity.needsInput=false;background.messages.push({role:'agent',status:'complete'})
  assert.equal(nativePetSignals(record,foreground,readThrough).unread,true)
})

test('native pet.changed refreshes only the Pet owning that event profile without a second watch', async t => {
  const f=fixture(t);await tick()
  const initial=f.calls.filter(row=>row[0]==='pet.info').length
  await f.controller.observe({method:'event',profile:'other',params:{type:'pet.changed'}})
  assert.equal(f.calls.filter(row=>row[0]==='pet.info').length,initial)
  await f.controller.observe({method:'event',profile:'',params:{type:'pet.changed'}})
  assert.equal(f.calls.filter(row=>row[0]==='pet.info').length,initial+1)
  f.controller.dispose()
})

test('a peer window on the same native owner never claims primary submit or overlay channels', async t => {
  const first=fixture(t), sent=[];t.after(()=>first.controller.dispose())
  const peer=createNativePrimaryWorkbench({host:first.host,api:first.api,live:first.live,accountId:'native',primary:false,
    getAppearance:()=>({mode:'light'}),getSystemDark:()=>false,getTitleBarTheme:()=>({background:'#efedee',foreground:'#191a19'}),
    getStatus:()=> 'connected',getCurrentChat:()=>null,send:()=>sent.push('peer'),openChat:()=>{},openDraft:()=>{},refresh:()=>{}})
  t.after(()=>peer.dispose());peer.publish()
  first.events.get('submit')({correlationId:'one-key',target:'new',text:'capture'});await tick()
  assert.equal(first.calls.filter(row=>row[0]==='ack').length,1);assert.deepEqual(sent,[])
  assert.equal(first.events.size,4)
})

test('task session links retain their exact owning route and spectator flag', async t => {
  const { openNativeTaskSession } = await import('../src/native-primary-workbench.mjs')
  const calls=[],host={openSessionWindow:async(...args)=>{calls.push(args);return{ok:true}}},route={connectionId:'work',profile:'default'}
  await openNativeTaskSession({host,route,descriptor:{connectionId:'work',profile:'writer',sessionId:'cron-run',readOnly:true}})
  assert.deepEqual(calls,[['cron-run',{connectionId:'work',profile:'writer',watch:true}]])
  await assert.rejects(()=>openNativeTaskSession({host,route,descriptor:{connectionId:'other',profile:'writer',sessionId:'cron-run'}}),/归属/)
  assert.equal(calls.length,1)
})


test('real native Pet reaction/plugin signals survive unrelated workbench renders', async t => {
  const f=fixture(t);t.after(()=>f.controller.dispose())
  const messages=[{key:'p:1',pluginId:'p',pluginName:'Plugin',text:'Native message',tone:'info',seq:1}]
  f.controller.pet.publish({reaction:{id:1,kind:'vibe'},pluginMessages:messages})
  f.controller.publish()
  assert.deepEqual(f.controller.pet.snapshot().payload.reaction,{id:1,kind:'vibe'})
  assert.deepEqual(f.controller.pet.snapshot().payload.pluginMessages,messages)
})

test('Pet failure feedback follows a fresh terminal event and expires instead of replaying history', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture(t);t.after(()=>f.controller.dispose())
  const chat=f.api.newChat();f.api.changeChat(chat.id,{gatewayStoredId:'stored',gatewayId:'runtime',messages:[{role:'agent',status:'error'}]});f.setCurrent(chat);f.controller.publish()
  assert.equal(f.controller.pet.snapshot().payload.activity.error,false)
  f.controller.observe({method:'event',profile:'',params:{type:'message.complete',session_id:'runtime',payload:{status:'error'}}})
  assert.equal(f.controller.pet.snapshot().payload.activity.error,true)
  t.mock.timers.tick(1600)
  assert.equal(f.controller.pet.snapshot().payload.activity.error,false)
})
