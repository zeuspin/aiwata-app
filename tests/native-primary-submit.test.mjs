import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace } from '../src/workspace.mjs'
import { submitLivePrompt } from '../src/submit-live-prompt.mjs'

function fixture() {
  const values = new Map(), api = createWorkspace({ getItem:key=>values.get(key), setItem:(key,value)=>values.set(key,value) }, null, { live:true, accounts:[{id:'native'}] })
  api.login('native')
  const calls = [], receipt = { admission_id:'admission-a', execution_generation:1, status:'started' }
  const live = { native:true, prepareUploads: value=>value, rpc: async (method, params) => {
    calls.push([method, params]); if (method === 'session.create') return { session_id:'runtime-a', stored_session_id:'stored-a', messages:[], info:{} }
    if (method === 'session.resume') return { session_id:'runtime-a', stored_session_id:'stored-a', messages:[], info:{} }
    if (method === 'prompt.submit') return { ...receipt, submission_id:params.submission_id, session_id:params.session_id }
  } }
  const options = { api, live, active:()=>true, operations:new Map(), onAccepted:()=>{}, refresh:()=>{}, recoverSubmission:async()=>false, restoreReceipt:async()=>false, replay:async()=>{}, resume:chat=>live.rpc('session.resume',{session_id:chat.gatewayStoredId}) }
  return {api,live,calls,receipt,options,values}
}

test('capture drafts remain separate from the composer and promote only on real native admission', async () => {
  const f=fixture(), composer=f.api.openChatDraft()
  f.api.changeChat(composer.id,{draft:'unfinished composer'})
  const chat=f.api.openGatewayCaptureDraft('quick-1')
  assert.equal(f.api.current().newChatDraft,composer)
  assert.equal(f.api.current().chats[chat.id],undefined)
  const result=await submitLivePrompt({...f.options,chat,externalInput:{text:'captured prompt',runId:'quick-1'}})
  assert.deepEqual(result,{ok:true,runtimeSessionId:'runtime-a',sessionId:'stored-a'})
  assert.equal(f.api.current().newChatDraft,composer)
  assert.equal(composer.draft,'unfinished composer')
  assert.equal(f.api.current().chats[chat.id],chat)
  assert.equal(f.api.current().gatewayCaptureDrafts?.['quick-1'],undefined)
  assert.equal(chat.messages.at(-1).text,'captured prompt')
  assert.equal(f.calls.find(([method])=>method==='prompt.submit')[1].submission_id,'quick-1')
  assert.equal(f.calls.find(([method])=>method==='session.create')[1].source,'desktop')
})

test('external submit preserves an existing conversation draft and attachments even when text matches', async () => {
  const f=fixture(), chat=f.api.newChat()
  const attachments=[]
  f.api.changeChat(chat.id,{gatewayStoredId:'stored-a',gatewayId:'runtime-a',draft:'same prompt',attachments})
  const result=await submitLivePrompt({...f.options,chat,externalInput:{text:'same prompt',runId:'quick-2',expectedStoredId:'stored-a'}})
  assert.equal(result.ok,true);assert.equal(chat.draft,'same prompt');assert.equal(chat.attachments,attachments)
  assert.equal(chat.messages.at(-1).text,'same prompt')
})

test('picked stored targets are proven before dispatch and cannot silently submit to a resumed sibling', async () => {
  const f=fixture(), chat=f.api.newChat()
  f.api.changeChat(chat.id,{gatewayStoredId:'stored-other',gatewayId:'runtime-other',draft:'keep'})
  const result=await submitLivePrompt({...f.options,chat,externalInput:{text:'capture',runId:'q',expectedStoredId:'stored-other'}})
  assert.equal(result.ok,false);assert.equal(result.code,'submit-identity-mismatch')
  assert.equal(f.calls.some(([method])=>method==='prompt.submit'),false)
  assert.equal(chat.draft,'keep')
})

test('unknown native delivery retains exact request for recovery and never promotes a new capture', async () => {
  const f=fixture(), chat=f.api.openGatewayCaptureDraft('unknown')
  const rpc=f.live.rpc
  f.live.rpc=async(method,params)=>{if(method==='prompt.submit'){f.calls.push([method,params]);throw new Error('lost')}return rpc(method,params)}
  const result=await submitLivePrompt({...f.options,chat,externalInput:{text:'do once',runId:'unknown'}})
  assert.equal(result.ok,false);assert.equal(result.retryable,false);assert.equal(result.code,'timeout')
  assert.equal(f.api.current().chats[chat.id],undefined)
  assert.equal(chat.gatewaySubmission.wireSubmission.submission_id,'unknown')
  assert.equal(chat.gatewaySubmission.input.text,'do once')
  const restored=createWorkspace({getItem:key=>f.values.get(key),setItem:()=>{}},null,{live:true,accounts:[{id:'native'}]})
  restored.login('native')
  assert.equal(restored.getChat(chat.id).gatewaySubmission.id,'unknown')
})

test('regular composer still clears its accepted draft through the shared native operation', async () => {
  const f=fixture(), chat=f.api.openChatDraft()
  f.api.changeChat(chat.id,{draft:'normal prompt'})
  const result=await submitLivePrompt({...f.options,chat})
  assert.equal(result.ok,true);assert.equal(chat.draft,'');assert.equal(f.api.current().chats[chat.id],chat)
})


test('native admission for another submission never acknowledges or promotes this capture', async () => {
  const f=fixture(),chat=f.api.openGatewayCaptureDraft('receipt-owner'),rpc=f.live.rpc
  f.live.rpc=async(method,params)=>method==='prompt.submit'?{admission_id:'admitted-elsewhere',submission_id:'another-input',session_id:'runtime-a',status:'started'}:rpc(method,params)
  const result=await submitLivePrompt({...f.options,chat,externalInput:{text:'capture',runId:'receipt-owner'}})
  assert.equal(result.ok,false);assert.equal(result.retryable,false)
  assert.equal(f.api.current().chats[chat.id],undefined)
  assert.equal(chat.gatewaySubmission.id,'receipt-owner')
})

test('a navigation or replay failure does not turn proven native admission into failed delivery', async () => {
  const f=fixture(),chat=f.api.openGatewayCaptureDraft('accepted'),errors=[]
  const result=await submitLivePrompt({...f.options,chat,externalInput:{text:'capture',runId:'accepted'},
    onAccepted:()=>{throw new Error('view changed')},onReconcileError:error=>errors.push(error.message)})
  assert.equal(result.ok,true);assert.equal(chat.gatewayAdmission,'admission-a');assert.deepEqual(errors,['view changed'])
})

test('inventory refresh cannot duplicate a pending capture under its durable ID', () => {
  const f=fixture(),chat=f.api.openGatewayCaptureDraft('pending-capture')
  f.api.changeChat(chat.id,{gatewayStoredId:'stored-capture',gatewayId:'runtime-capture'})
  f.api.syncGatewayInventory([],[{id:'stored-capture',title:'Captured',message_count:1,running:true}],{complete:true})
  assert.equal(Object.values(f.api.current().chats).filter(row=>row.gatewayStoredId==='stored-capture').length,0)
  assert.equal(f.api.getChat(chat.id),chat)
})
