import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeDesktopClient} from '../src/native-desktop-client.mjs'
function fixture(){const calls=[];let row={name:'writer',path:'/owned/profiles/writer',ui_meta_revisions:{'aiwata-app':3},canonical_session:{id:'forever'}};class Gateway{onEvent(){}onRequest(){}onState(){}close(){}async connect(){}async request(method,params){calls.push([method,params]);return method==='profiles.list'?{profiles:[row]}:{ok:true}}}const host={getGatewayWsUrlFor:async()=>({wsUrl:'ws://fixture'}),api:async options=>{calls.push(['api',options]);return {ok:true}},openWindow:async options=>{calls.push(['openWindow',options]);return {ok:true}}};return {calls,host,Gateway,setRow:value=>row=value}}
test('native Bot delete requires the same roster snapshot and uses original owned REST teardown',async()=>{const f=fixture();const client=await createNativeDesktopClient({...f,route:{connectionId:'local',profile:'default'}});const {bots:[bot]}=await client.bots();assert.ok(bot.identity);f.setRow({name:'writer',path:'/owned/profiles/writer',ui_meta_revisions:{'aiwata-app':4},canonical_session:{id:'forever'}});await assert.rejects(client.deleteBot(bot.profile,bot.identity),/变化|重新/);assert.ok(!f.calls.some(([method])=>method==='api'));const {bots:[fresh]}=await client.bots();await client.deleteBot(fresh.profile,fresh.identity);assert.deepEqual(f.calls.find(([method])=>method==='api')[1],{path:'/api/profiles/writer',method:'DELETE',connectionId:'local',profile:'default'});await client.close()})
test('full Bot capability and settings windows retain the selected Bot native owner',async()=>{const f=fixture();const client=await createNativeDesktopClient({...f,route:{connectionId:'other-machine',profile:'owner'}});await client.openNativeSurface('capabilities','writer');assert.deepEqual(f.calls.find(([method])=>method==='openWindow')[1],{connectionId:'other-machine',profile:'writer',nativeSurface:'capabilities'});await client.close()})

test('saving Bot appearance does not rewrite unchanged SOUL or description from a stale editor',async()=>{
 const {nativeSettings}=await import('../src/native-desktop-settings.mjs')
 const calls=[]
 const settings=nativeSettings({rpc:async(method,params)=>{calls.push([method,params]);return method==='profiles.list'?{profiles:[{name:'writer',ui_meta_revisions:{},ui_meta:{}}]}:{ok:true}}})
 await settings.saveBot({profile:'writer',name:'Writer',revision:0,desktopRevision:0,soul:'old soul',originalSoul:'old soul',description:'old description',originalDescription:'old description'})
 const payload=calls.find(([method])=>method==='profiles.configure')[1]
 assert.ok(!Object.hasOwn(payload,'soul'))
 assert.ok(!Object.hasOwn(payload,'description'))
})

test('only the save operation that actually minted the Profile reports a new Bot birth',async()=>{
 const {nativeSettings}=await import('../src/native-desktop-settings.mjs')
 let rows=[]
 const settings=nativeSettings({rpc:async(method,params)=>{
  if(method==='profiles.list')return {profiles:rows}
  if(method==='profiles.create'){rows=[{name:params.name,ui_meta_revisions:{},ui_meta:{}}];return {ok:true}}
  if(method==='profiles.configure'){rows[0].ui_meta=params.ui_meta??rows[0].ui_meta;return {ok:true}}
 }})
 const input={profile:'writer',name:'Writer',description:'',soul:'',createId:'new-profile-operation'}
 assert.equal((await settings.saveBot(input)).created,true)
 assert.equal((await settings.saveBot(input)).created,false)
})
