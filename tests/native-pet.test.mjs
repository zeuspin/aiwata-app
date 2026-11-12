import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativePetController } from '../src/native-pet-controller.mjs'
const tick = () => new Promise(resolve => setImmediate(resolve))
const sheet = { enabled:true,slug:'boba',displayName:'Boba',mime:'image/png',spritesheetBase64:'real-fixture-sheet',spritesheetRevision:'1:8',frameW:192,frameH:208,scale:.33 }
const deferred = () => { let resolve; const promise=new Promise(done=>{resolve=done});return{promise,resolve} }
function fixture(options={}) {
  let owner={connectionId:'local',profile:'default',sessionId:'chat-a'},current=true
  const values=new Map(),calls=[]
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
  const live={native:true,route:{connectionId:'local',profile:'default'},rpc:async(method,params,profile)=>{calls.push([method,params,profile]);return method==='pet.info'?{...sheet}:{ok:true,scale:params.scale}}}
  const host={petOverlay:{open:async request=>{calls.push(['open',request]);return{ok:true,bounds:{...request.bounds,x:25,y:35}}},close:async()=>{calls.push(['close']);return{ok:true}}}}
  let submitted,opened
  const controller=createNativePetController({host,live,storage,storageNamespace:'account-one',getContext:()=>owner,isCurrent:()=>current,
    onChange:options.onChange,onSubmit:async(text,context)=>{submitted={text,context};return{ok:true,sessionId:context.owner.sessionId}},onOpenApp:context=>{opened=context}})
  return{controller,live,host,calls,values,setOwner:value=>{owner=value},retire:()=>{current=false},submitted:()=>submitted,opened:()=>opened}
}

test('native pet mirrors real RPC sprite and all original overlay signals without persisting sprite bytes',async()=>{
  const f=fixture();await f.controller.refresh()
  const pluginMessages=[{key:'plugin:one',pluginId:'plugin',pluginName:'Plugin',text:'Working',tone:'wait',seq:2}]
  f.controller.publish({activity:{busy:true,awaitingInput:true,toolRunning:true,reasoning:false,error:false,justCompleted:true,celebrate:false},busy:true,awaiting:true,unread:true,reaction:{id:7,kind:'vibe'},pluginMessages})
  const payload=f.controller.snapshot().payload
  assert.equal(payload.info.spritesheetBase64,sheet.spritesheetBase64)
  assert.deepEqual(payload.activity,{busy:true,awaitingInput:true,toolRunning:true,reasoning:false,error:false,justCompleted:true,celebrate:false})
  assert.equal(payload.busy,true);assert.equal(payload.awaiting,true);assert.equal(payload.unread,true)
  assert.deepEqual(payload.reaction,{id:7,kind:'vibe'});assert.deepEqual(payload.pluginMessages,pluginMessages)
  await f.controller.refresh();assert.equal(f.calls.at(-1)[1].knownRevision,'1:8')
  assert.equal(f.calls.at(-1)[2],'default');assert.equal(f.calls.at(-1)[1].profile,'default')
  assert.equal([...f.values.values()].some(value=>value.includes('real-fixture-sheet')),false)
  f.controller.dispose()
})

test('pet metadata-only refresh retains the held sheet and stale Profile results cannot replace the selected pet',async()=>{
  const f=fixture();await f.controller.refresh()
  f.live.rpc=async()=>({...sheet,spritesheetBase64:undefined,spritesheetUnchanged:true,scale:.5})
  await f.controller.refresh();assert.equal(f.controller.snapshot().payload.info.spritesheetBase64,sheet.spritesheetBase64)
  const pending=deferred();f.live.rpc=()=>pending.promise
  const old=f.controller.refresh()
  f.setOwner({connectionId:'local',profile:'writer',sessionId:'chat-b'});f.controller.publish({busy:false})
  pending.resolve({...sheet,slug:'old'});await old
  assert.deepEqual(f.controller.snapshot().payload.info,{enabled:false})
  f.live.rpc=async()=>({...sheet,slug:'writer'});await f.controller.refresh()
  assert.equal(f.controller.snapshot().payload.info.slug,'writer');f.controller.dispose()
})

test('pet open uses native geometry and scoped original active/bounds persistence; stale open echoes are ignored',async()=>{
  const f=fixture();await f.controller.refresh()
  assert.equal(await f.controller.popOut({x:100,y:200,width:64,height:69}),true)
  const request=f.calls.find(row=>row[0]==='open')[1]
  assert.deepEqual(request,{bounds:{x:12,y:85,width:240,height:300},screen:false})
  assert.equal(f.controller.snapshot().active,true)
  assert.ok([...f.values.keys()].some(key=>key.endsWith('hermes.desktop.pet-overlay-active.v1')))
  f.controller.popIn();assert.equal(f.controller.snapshot().active,false)
  await f.controller.popOut({x:1,y:1,width:10,height:10})
  assert.equal(f.calls.filter(row=>row[0]==='open').at(-1)[1].screen,true)
  const pending=deferred();f.host.petOverlay.open=()=>pending.promise
  f.controller.popIn();const opening=f.controller.popOut({x:1,y:1,width:10,height:10})
  f.setOwner({connectionId:'local',profile:'writer',sessionId:'chat-b'});f.controller.publish({})
  const before=[...f.values.entries()]
  pending.resolve({ok:true,bounds:{x:999,y:999,width:240,height:300}});assert.equal(await opening,false)
  assert.deepEqual([...f.values.entries()],before);assert.equal(f.controller.snapshot().active,false)
  f.controller.dispose()
})

test('scale uses the original clamp and debounced profile RPC, and cancels queued writes on session switches',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture();await f.controller.refresh()
  f.controller.setScale(9);f.controller.setScale(.7)
  assert.equal(f.controller.snapshot().payload.info.scale,.7)
  t.mock.timers.tick(200);await tick()
  assert.deepEqual(f.calls.filter(row=>row[0]==='pet.scale'),[['pet.scale',{scale:.7,profile:'default'},'default']])
  f.controller.setScale(.8);f.setOwner({connectionId:'local',profile:'default',sessionId:'chat-c'});f.controller.publish({})
  t.mock.timers.tick(200);await tick()
  assert.equal(f.calls.filter(row=>row[0]==='pet.scale').length,1);f.controller.dispose()
})

test('pet submit captures its exact owner and invalidates old asynchronous callbacks; open-app clears real unread',async()=>{
  const f=fixture();await f.controller.refresh()
  f.controller.publish({unread:true});await f.controller.openApp()
  assert.equal(f.opened().owner.sessionId,'chat-a');assert.equal(f.controller.snapshot().payload.unread,false)
  await f.controller.submit(' hello ');const accepted=f.submitted()
  assert.equal(accepted.text,'hello');assert.equal(accepted.context.owner.sessionId,'chat-a')
  f.setOwner({connectionId:'local',profile:'writer',sessionId:'chat-b'})
  assert.equal(accepted.context.isCurrent(),false)
  f.controller.publish({});assert.equal(accepted.context.signal.aborted,true)
  f.retire();assert.equal((await f.controller.submit('do not send')).ok,false);f.controller.dispose()
})

test('a late scale RPC cannot overwrite a newer size and a failed write rolls back visibly',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  const f=fixture();await f.controller.refresh();const old=deferred()
  f.live.rpc=(method,params)=>method==='pet.scale'?old.promise:Promise.resolve({...sheet})
  f.controller.setScale(.5);t.mock.timers.tick(200)
  f.controller.setScale(.8);old.resolve({ok:true,scale:.5});await tick()
  assert.equal(f.controller.snapshot().payload.info.scale,.8)
  f.live.rpc=async()=>{throw new Error('offline')};t.mock.timers.tick(200);await tick()
  assert.equal(f.controller.snapshot().payload.info.scale,.33);assert.equal(f.controller.snapshot().error,'offline')
  f.controller.dispose()
})


test('publishing equivalent live signals does not create a render feedback loop',()=>{
  let changes=0;const f=fixture({onChange:()=>{changes++}})
  f.controller.publish({activity:{busy:false},busy:false,pluginMessages:[],reaction:null})
  const initial=changes
  f.controller.publish({activity:{busy:false},busy:false,pluginMessages:[],reaction:null})
  assert.equal(changes,initial);f.controller.dispose()
})
