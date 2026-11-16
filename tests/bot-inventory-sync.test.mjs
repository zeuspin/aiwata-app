import test from 'node:test'
import assert from 'node:assert/strict'
import {ensureBotManagementSkill,createBotInventorySync} from '../src/bot-inventory-sync.mjs'
test('main Bot receives creation skill on its own Profile without overwriting an existing skill',async()=>{
 const calls=[],live={native:true,route:{profile:'owner'},skill:async(...args)=>{calls.push(args);return []}}
 await ensureBotManagementSkill(live,()=>true)
 assert.deepEqual(calls.map(c=>c.slice(0,2)),[['list','owner'],['create','owner']])
 assert.equal(calls[1][2].id,'aiwata-bot-management')
 calls.length=0;live.skill=async(...args)=>{calls.push(args);return [{name:'aiwata-bot-management'}]}
 await ensureBotManagementSkill(live,()=>true);assert.equal(calls.length,2);assert.equal(calls[1][0],'content')
})
test('skill preparation stops after its account retires',async()=>{
 let active=true,finish;const calls=[];const live={native:true,skill:async(...args)=>{calls.push(args);return new Promise(r=>finish=r)}}
 const work=ensureBotManagementSkill(live,()=>active);active=false;finish([]);await work;assert.equal(calls.length,1)
})
test('turn inventory refresh coalesces reads and rechecks after changes without switching chat',async()=>{
 let finish;const record={},calls=[],api={current:()=>record,syncGatewayBots:rows=>calls.push(rows)}
 let reads=0;const live={bots:async()=>{reads++;return reads===1?new Promise(r=>finish=r):{bots:[{profile:'created'}]}}}
 const sync=createBotInventorySync({live,api,active:()=>true,refresh(){},report(){}})
 const pending=sync();sync();finish({bots:[]});await pending
 assert.equal(reads,2);assert.deepEqual(calls.at(-1),[{profile:'created'}])
})
test('retired account never receives another account inventory',async()=>{
 let finish,current={};const original=current,calls=[]
 const sync=createBotInventorySync({live:{bots:()=>new Promise(r=>finish=r)},api:{current:()=>current,syncGatewayBots:rows=>calls.push(rows)},active:()=>true,refresh(){},report(){}})
 const pending=sync();current={};finish({bots:[{profile:'old'}]});await pending;assert.equal(calls.length,0);assert.notEqual(current,original)
})

test('only untouched release skill is upgraded; edited skill stays intact',async()=>{
 const {legacyBotManagementSkillContent,botManagementSkillContent}=await import('../src/bot-management-skill.mjs')
 for(const edited of [false,true]){
  const calls=[],live={native:true,skill:async(action,...args)=>{calls.push([action,...args]);return action==='list'?[{name:'aiwata-bot-management'}]:{content:edited?'user customized workflow':legacyBotManagementSkillContent}}}
  await ensureBotManagementSkill(live,()=>true)
  assert.equal(calls.some(([action])=>action==='save'),!edited)
  if(!edited)assert.equal(calls.at(-1)[2].content,botManagementSkillContent)
 }
})


test('legacy saved metadata token migrates without confusing revisions with ownership',async()=>{
 const {sameBotOwner}=await import('../src/bot-owner-identity.mjs')
 const owner=['local','default','writer','/owned/profiles/writer']
 assert.equal(sameBotOwner({identity:JSON.stringify([...owner,[['ui',0]],null])},{identity:'new-delete-token',profileIdentity:JSON.stringify(owner)}),true)
 assert.equal(sameBotOwner({identity:JSON.stringify([...owner,[['ui',0]],null])},{identity:'new-delete-token',profileIdentity:JSON.stringify(['remote','default','writer','/elsewhere'])}),false)
})
