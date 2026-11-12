import test from 'node:test'
import assert from 'node:assert/strict'
import { markerDetails } from '../src/conversation-meta.mjs'
import { gatewayProject } from '../src/live-aiwata.mjs'
import { createNativeDesktopClient } from '../src/native-desktop-client.mjs'

test('project colors accept a custom palette value and old empty or emoji projects always have stable colors', () => {
  assert.deepEqual(markerDetails({kind:'color',value:'#123abc'}), ['#123abc','自定义颜色 #123abc','#123abc'])
  assert.equal(markerDetails({kind:'emoji',value:'⭐'}), undefined)
  for (const row of [{id:'one'}, {id:'two',icon:'⭐'}, {id:'three',color:'#123abc'}]) {
    const project = gatewayProject(row)
    assert.equal(project.marker.kind, 'color')
    assert.ok(markerDetails(project.marker))
    assert.deepEqual(gatewayProject(row).marker, project.marker)
  }
})

test('fresh default Profile is the full native AIWATA bot and creates only one canonical chat', async () => {
  const calls=[]; let canonical
  class Gateway {
    onEvent(){} onRequest(){} onState(){} close(){} async connect(){}
    async request(method,params){
      calls.push([method,params])
      if(method==='profiles.list')return {profiles:[{name:'default',canonical_session:canonical}]}
      if(method==='session.list')return {sessions:[]}
      if(method==='session.create'){canonical={id:'welcome'};return {session_id:'welcome',stored_session_id:'welcome'}}
      if(method==='session.resume')return {session_id:'welcome',messages:[]}
      return {ok:true}
    }
  }
  const client=await createNativeDesktopClient({host:{getGatewayWsUrlFor:async()=>({wsUrl:'ws://fixture'})},Gateway,route:{connectionId:'local',profile:'default'}})
  try {
    assert.equal((await client.bots()).bots[0].name,'AIWATA')
    assert.equal((await client.bots()).bots[0].profile,'default')
    assert.equal((await client.openBot('default')).botCanonicalCreated,true)
    const originalPaint=globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame=callback=>setImmediate(callback)
    let introductions=0
    const hydrated={chat:{gatewayProfile:'default',gatewayStoredId:'welcome',messages:[],draft:'保留草稿'},created:true,isCurrent:()=>true,probe:async()=>({ok:true}),send:async(chat,input)=>{introductions++;assert.equal(input.expectedStoredId,'welcome');assert.equal(chat.draft,'保留草稿')}}
    try { await client.afterBotHydrated(hydrated);await client.afterBotHydrated(hydrated) }
    finally { globalThis.requestAnimationFrame=originalPaint }
    assert.equal(introductions,1)
    assert.equal((await client.openBot('default')).botCanonicalCreated,false)
    assert.equal(calls.filter(([method])=>method==='session.create').length,1)
    assert.equal(calls.find(([method])=>method==='session.create')[1].follow_profile_config,true)
    assert.ok(!calls.some(([method])=>['profiles.create','profiles.configure'].includes(method)))
  } finally { await client.close() }
})

test('default Bot settings can edit the existing Profile without allowing creation of a reserved Profile', async () => {
  const {canUseProfileId}=await import('../src/management.mjs')
  assert.equal(canUseProfileId('default',[{id:'bot:default',profile:'default'}],'bot:default'),true)
  assert.equal(canUseProfileId('default',[]),false)
})
