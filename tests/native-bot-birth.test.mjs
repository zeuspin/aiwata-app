import test from 'node:test'
import assert from 'node:assert/strict'
import {createBotBirths} from '../src/native-bot-birth.mjs'
const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('only newly created native Bot gets one intro after mounted hydration, preserving user draft',async()=>{
 const order=[],chat={gatewayProfile:'writer',gatewayStoredId:'stored',draft:'keep me',messages:[]}
 let paint;const births=createBotBirths({nextPaint:()=>new Promise(resolve=>paint=resolve)})
 births.queue('writer','creation-id')
 order.push('hydrate')
 const running=births.afterHydrate({chat,created:true,isCurrent:()=>true,probe:async()=>{order.push('probe');return {ok:true}},send:async(target,input)=>{assert.equal(target,chat);assert.equal(input.expectedStoredId,'stored');order.push('send');return {ok:true}}})
 await tick();assert.deepEqual(order,['hydrate','probe']);paint();await running
 assert.deepEqual(order,['hydrate','probe','send']);assert.equal(chat.draft,'keep me')
 await births.afterHydrate({chat,created:false,isCurrent:()=>true,probe:()=>assert.fail('repeat'),send:()=>assert.fail('repeat')})
})
test('existing canonical adoption, needs-model and retired owner never trigger an intro',async()=>{
 for(const condition of ['adopted','needs-model','retired']){
  let current=true,paint
  const births=createBotBirths({nextPaint:()=>new Promise(resolve=>paint=resolve)})
  births.queue('writer','creation-id')
  const run=births.afterHydrate({chat:{gatewayProfile:'writer',messages:[]},created:condition!=='adopted',isCurrent:()=>current,probe:async()=>({ok:condition!=='needs-model'}),send:()=>assert.fail(condition)})
  await tick();if(condition==='retired'){current=false;paint()}await run
 }
})
