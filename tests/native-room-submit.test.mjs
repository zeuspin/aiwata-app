import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorkspace} from '../src/workspace.mjs'
import {gatewayDraftFingerprint} from '../src/live-aiwata.mjs'

function fixture(){
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},options={live:true,accounts:[{id:'native'}]}
 const api=createWorkspace(storage,null,options);api.login('native')
 const room={room_id:'room',name:'Room',authority_gateway_id:'install:home',authority_epoch:1,members:[]}
 api.syncGatewayRooms([room]);api.changeChat('room',{draft:'original prompt',attachments:['original.txt'],attachmentDetails:{'original.txt':{name:'original.txt',blobId:'blob-original'}},groupReply:{messageId:'reply-original',threadId:'thread-original'}})
 return {api,storage,options,room,reload(){const next=createWorkspace(storage,null,options);next.login('native');return next}}
}
function attemptFor(chat){return{id:'durable-send',wireId:'user:durable-wire',fingerprint:gatewayDraftFingerprint(chat.draft,chat.attachments,chat.attachmentDetails),replyId:chat.groupReply?.messageId,payload:{text:chat.draft,thread_id:chat.groupReply?.threadId}}}

test('a native room receipt clears its matching composer without requiring the single-session input contract',()=>{
 const f=fixture(),chat=f.api.getChat('room'),attempt=attemptFor(chat)
 assert.equal('input' in attempt,false);f.api.changeChat('room',{gatewayRoomSubmission:attempt})
 assert.equal(f.api.acceptGatewayRoomSend('room',attempt),true)
 assert.equal(chat.gatewayRoomSubmission,null);assert.equal(chat.draft,'');assert.deepEqual(chat.attachments,[]);assert.deepEqual(chat.attachmentDetails,{});assert.equal(chat.groupReply,null)
 assert.equal(f.api.acceptGatewayRoomSend('room',attempt),false)
})

test('durable room retry survives reload and accepts the exact restored attempt while ignoring stale pre-reload objects',()=>{
 const f=fixture(),attempt=attemptFor(f.api.getChat('room'));f.api.changeChat('room',{gatewayRoomSubmission:attempt})
 const restored=f.reload(),chat=restored.getChat('room'),pending=chat.gatewayRoomSubmission
 assert.deepEqual(pending,attempt);assert.notEqual(pending,attempt)
 assert.equal(restored.acceptGatewayRoomSend('room',attempt),false);assert.equal(chat.draft,'original prompt')
 assert.equal(restored.acceptGatewayRoomSend('room',pending),true);assert.equal(chat.draft,'');assert.equal(chat.gatewayRoomSubmission,null)
 const twice=createWorkspace(f.storage,null,f.options);twice.login('native');assert.equal(twice.getChat('room').gatewayRoomSubmission,null)
})

for(const changed of ['draft','attachments','reply'])test(`a late room receipt preserves a newer ${changed} while retiring only the accepted attempt`,()=>{
 const f=fixture(),chat=f.api.getChat('room'),attempt=attemptFor(chat);f.api.changeChat('room',{gatewayRoomSubmission:attempt})
 const patch=changed==='draft'?{draft:'new unsent draft'}:changed==='attachments'?{attachmentDetails:{'original.txt':{name:'original.txt',blobId:'blob-new'}}}:{groupReply:{messageId:'new-reply',threadId:'new-thread'}}
 f.api.changeChat('room',patch);const before=JSON.stringify([chat.draft,chat.attachments,chat.attachmentDetails,chat.groupReply])
 assert.equal(f.api.acceptGatewayRoomSend('room',attempt),true);assert.equal(chat.gatewayRoomSubmission,null)
 assert.equal(JSON.stringify([chat.draft,chat.attachments,chat.attachmentDetails,chat.groupReply]),before)
})

// Exercise the production hook too: the room sender never creates attempt.input.
const {React,act}=await import('./helpers/native-react-harness.mjs')
const {createRoot}=await import('react-dom/client')
const {createRequire}=await import('node:module'),{build}=await import('esbuild')
const require=createRequire(import.meta.url)
const hookBundle=build({stdin:{contents:"export {useLiveRooms} from './src/live-rooms.jsx'",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',external:['react']}).then(result=>{
 const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports
})
async function mounted(t,api,live){
 const {useLiveRooms}=await hookBundle,reports=[],element=document.createElement('div'),root=createRoot(element);document.body.append(element);let controller,closed=false
 const refresh=()=>{},report=message=>reports.push(message)
 function App(){controller=useLiveRooms({live,api,accountId:'native',roomId:'room',connected:true,refresh,report});return null}
 async function close(){if(closed)return;closed=true;await act(async()=>root.unmount());element.remove()}
 t.after(close);await act(async()=>root.render(React.createElement(App)))
 return {get controller(){return controller},reports,close}
}
function wireFixture(f,{loseFirst=false,firstAdmitted=false}={}){
 const calls=[],events=[],effects=new Set();let first=true
 return {calls,events,effects,live:{room:async(method,params)=>{
  if(method==='groups.state')return{room:{...f.room,latest_seq:events.length,revision:1},driver_status:{}}
  if(method==='groups.log')return{events:events.filter(event=>event.seq>params.since_seq),has_more:false}
  if(method==='groups.send'){
   calls.push(structuredClone(params));const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(params.event_id)),wireId='user:'+Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')
   const lost=first&&loseFirst;first=false
   if(!lost||firstAdmitted){if(!effects.has(params.event_id)){effects.add(params.event_id);events.push({seq:events.length+1,kind:'message.user',event_id:wireId,payload:params.payload})}}
   if(lost)throw new Error('native response lost')
   return{accepted:true,event:{event_id:wireId}}
  }
  throw new Error('Unexpected method '+method)
 }}}
}

test('the real room sender accepts a native receipt without input, retires its marker and clears only its matching draft',async t=>{
 const f=fixture();f.api.changeChat('room',{attachments:[],attachmentDetails:{},groupReply:null})
 const wire=wireFixture(f),view=await mounted(t,f.api,wire.live),chat=f.api.getChat('room')
 await act(async()=>view.controller.send(chat,[]))
 assert.deepEqual(view.reports,[]);assert.equal(wire.calls.length,1);assert.equal(wire.effects.size,1);assert.equal(chat.gatewayRoomSubmission,null);assert.equal(chat.draft,'')
})

test('a lost native room receipt is reconciled from the durable log after renderer reload without resending',async t=>{
 const f=fixture();f.api.changeChat('room',{attachments:[],attachmentDetails:{},groupReply:null})
 const wire=wireFixture(f,{loseFirst:true,firstAdmitted:true}),first=await mounted(t,f.api,wire.live)
 await act(async()=>first.controller.send(f.api.getChat('room'),[]));assert.ok(f.api.getChat('room').gatewayRoomSubmission);await first.close()
 const restored=f.reload(),second=await mounted(t,restored,wire.live),chat=restored.getChat('room')
 assert.deepEqual(second.reports,[]);assert.equal(chat.gatewayRoomSubmission,null);assert.equal(chat.draft,'');assert.equal(wire.calls.length,1);assert.equal(wire.effects.size,1)
})

test('an uncertain room send retries the persisted event and payload after reload while preserving a newer draft',async t=>{
 const f=fixture();f.api.changeChat('room',{attachments:[],attachmentDetails:{},groupReply:null})
 const wire=wireFixture(f,{loseFirst:true}),first=await mounted(t,f.api,wire.live)
 await act(async()=>first.controller.send(f.api.getChat('room'),[]));await first.close()
 const restored=f.reload();restored.changeChat('room',{draft:'new draft while awaiting old send'})
 const second=await mounted(t,restored,wire.live),chat=restored.getChat('room')
 await act(async()=>second.controller.send(chat,[]))
 assert.deepEqual(second.reports,[]);assert.equal(wire.calls.length,2);assert.deepEqual(wire.calls[1],wire.calls[0]);assert.equal(wire.effects.size,1)
 assert.equal(chat.gatewayRoomSubmission,null);assert.equal(chat.draft,'new draft while awaiting old send')
})

for(const external of [false,true])test(`single-session receipt recovery after reload ${external?'preserves an external Quick Entry draft':'clears its matching ordinary draft'}`,()=>{
 const f=fixture(),chat=f.api.newChat();f.api.changeChat(chat.id,{draft:'same prompt',gatewayId:'runtime-single',gatewayStoredId:'stored-single',attachments:['same.txt'],attachmentDetails:{'same.txt':{blobId:'same-blob'}}})
 const input={text:chat.draft,attachments:chat.attachments,attachmentDetails:chat.attachmentDetails,...(external?{preserveDraft:true}:{})},attempt={id:'single-submit',input}
 f.api.changeChat(chat.id,{gatewaySubmission:attempt});const restored=f.reload(),current=restored.getChat(chat.id)
 assert.equal(restored.recoverGatewayPrompt(chat.id,current.gatewaySubmission,{admission_id:'admitted-single'},{session_id:'runtime-single',stored_session_id:'stored-single',info:{},messages:[]}),true)
 assert.equal(current.draft,external?'same prompt':'');assert.deepEqual(current.attachments,external?['same.txt']:[]);assert.equal(current.gatewaySubmission,null)
})
