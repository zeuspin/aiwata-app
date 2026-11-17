import test from 'node:test'
import assert from 'node:assert/strict'
import {React,act,harness} from './helpers/native-react-harness.mjs'
import {createWorkspace} from '../src/workspace.mjs'
import {createNativeDesktopClient} from '../src/native-desktop-client.mjs'
import {desktopEventPatch} from '../src/desktop-events.mjs'

const entry=`import {useLiveWorkbench} from './src/live-workbench.jsx';export {Transcript} from './src/agent-transcript.jsx';export function WorkbenchHarness(props){const state=useLiveWorkbench(props);props.inspect(state);return null}`
async function fixture(t,extra={}){
 const h=await harness(t,entry),api=createWorkspace(null,null,{live:true});api.login('lin');const chat=api.newChat()
 let gateway,state,render,projects=[],sessions=[]
 class Gateway{
  async connect(){} async request(method,params){
   if(method==='session.resume')return{session_id:'s',stored_session_id:'stored',execution_generation:1,messages:[],info:{cwd:'/work'}}
   if(method==='projects.list')return{projects};if(method==='profiles.list')return{profiles:[]};return{}
  }
  onEvent(fn){this.event=fn;return()=>{}}onRequest(fn){this.incoming=fn;return()=>{}}onState(){return()=>{}}close(){}
  constructor(){gateway=this}
 }
 const live=await createNativeDesktopClient({Gateway,host:{getGatewayWsUrlFor:async()=>({wsUrl:'ws://fixture'}),api:async()=>({sessions,total:sessions.length})},route:{connectionId:'local',profile:'default'},...extra})
 api.hydrateGatewayChat(chat.id,{session_id:'s',stored_session_id:'stored',execution_generation:1,messages:[]})
 function View(){const[,update]=React.useState(0);const refresh=React.useCallback(()=>update(n=>n+1),[]);return React.createElement(h.WorkbenchHarness,{live,api,accountId:api.accountId,chatId:chat.id,refresh,report(){},inspect:value=>{state=value}})}
 await h.render(React.createElement(View));t.after(()=>live.close())
 await act(async()=>{api.acceptGatewayPrompt(chat.id,{runId:'turn',text:'synthetic'},{admission_id:'a',execution_generation:1})})
 return{h,api,chat,live,get gateway(){return gateway},get state(){return state},inventory(p,s){projects=p;sessions=s}}
}

test('a one-question server card returns the selected answer through its original native request',async t=>{
 const f=await fixture(t);let answer
 await act(async()=>f.gateway.incoming({id:'srq-single',method:'clarify',params:{session_id:'s',questions:[{qid:'q0',question:'颜色？',choices:['蓝色','绿色']}]},respond:value=>{answer=value},fail(){}}))
 const request=f.api.getChat(f.chat.id).agentRun.request
 await act(async()=>f.state.respond(f.chat,request,{answers:{q0:'绿色'},outcome:'submitted'}))
 assert.deepEqual(answer,{answers:{q0:'绿色'},outcome:'submitted'})
 assert.equal(f.api.getChat(f.chat.id).agentRun.request,null)
})

test('a completed Agent project operation refreshes the sidebar and chat membership without replacing its draft',async t=>{
 const f=await fixture(t);f.api.changeChat(f.chat.id,{draft:'keep this draft'})
 f.inventory([{id:'p1',name:'审计项目',primary_path:'/work',folders:[{path:'/work'}]}],[{id:'stored',cwd:'/work',message_count:2,title:'Synthetic'}])
 await act(async()=>f.gateway.event({type:'message.complete',session_id:'s',execution_generation:1,payload:{text:'created'}}))
 assert.equal(f.api.current().projects[0]?.name,'审计项目')
 assert.equal(f.api.getChat(f.chat.id).projectId,'p1');assert.equal(f.api.getChat(f.chat.id).draft,'keep this draft')
})

test('an Agent reaction binds its optimistic message, survives resume and is rendered on that message',async t=>{
 const h=await harness(t,entry),api=createWorkspace(null,null,{live:true});api.login('lin');const chat=api.newChat()
 api.hydrateGatewayChat(chat.id,{session_id:'s',stored_session_id:'stored',execution_generation:1,messages:[]})
 api.acceptGatewayPrompt(chat.id,{runId:'turn',text:'请点赞'},{admission_id:'a',execution_generation:1})
 const reactions=[{emoji:'👍',author:'agent',at:1}]
 const patch=desktopEventPatch(chat,'message.reaction',{row_id:49,role:'user',reactions},true);api.changeChat(chat.id,patch)
 assert.equal(chat.messages.at(-1).id,'49');assert.deepEqual(chat.messages.at(-1).reactions,reactions)
 api.hydrateGatewayChat(chat.id,{session_id:'s',stored_session_id:'stored',execution_generation:1,messages:[{role:'user',row_id:49,content:'请点赞'}]})
 await h.render(React.createElement(h.Transcript,{chat,visible:false}))
 assert.equal(h.element.querySelector('[aria-label="消息表情"]')?.textContent,'👍')
 const cold=api.newChat();api.hydrateGatewayChat(cold.id,{session_id:'cold',stored_session_id:'cold',messages:[{role:'user',row_id:7,content:'历史消息',display_metadata:JSON.stringify({reactions})}]})
 await h.render(React.createElement(h.Transcript,{chat:cold,visible:false}))
 assert.equal(h.element.querySelector('[aria-label="消息表情"]')?.textContent,'👍')
})

test('project refresh drops a late result after changing the owning account',async()=>{
 const {createProjectInventorySync}=await import('../src/project-inventory-sync.mjs')
 const api=createWorkspace(null,null,{live:true});api.login('lin');let finish
 const sync=createProjectInventorySync({live:{rpc:()=>new Promise(r=>{finish=r}),sessions:async()=>({sessions:[]})},api,active:()=>true,refresh(){},report(){}})
 const pending=sync();assert.equal(api.login('qiao'),true);finish({projects:[{id:'foreign',name:'旧账号项目',folders:[]}]});await pending
 assert.deepEqual(api.current().projects,[])
})

test('retracting a durable reaction leaves the optimistic message untouched and cannot leak into a new session',()=>{
 const api=createWorkspace(null,null,{live:true});api.login('lin');const chat=api.newChat(),reactions=[{emoji:'👍',author:'agent'}]
 api.hydrateGatewayChat(chat.id,{session_id:'s',stored_session_id:'s',messages:[{role:'user',row_id:7,content:'older',display_metadata:{reactions}}]})
 api.changeChat(chat.id,{messages:[...chat.messages,{role:'user',text:'newer'}]})
 api.changeChat(chat.id,desktopEventPatch(chat,'message.reaction',{row_id:7,reactions:[],role:'user'},true))
 assert.deepEqual(chat.messages[0].reactions,[]);assert.equal(chat.messages[1].id,undefined)
 api.hydrateGatewayChat(chat.id,{session_id:'other',stored_session_id:'other',messages:[{role:'user',row_id:7,content:'different owner',display_metadata:{reactions}}]})
 assert.deepEqual(chat.messages[0].reactions,reactions);assert.deepEqual(chat.gatewayReactions,{})
})


test('canonical prompt replies use the native SDK answer envelope without changing server-card replies',async t=>{
 const canonical=new WeakSet(),f=await fixture(t,{ownerProfile:request=>canonical.has(request)?'default':undefined});let answer
 const frame={id:'canonical-prompt',method:'clarify',params:{session_id:'s',questions:[{qid:'canonical-prompt',question:'颜色？',choices:['蓝色','绿色']}]},respond:value=>{answer=value.answer},fail(){}}
 canonical.add(frame);await act(async()=>f.gateway.incoming(frame))
 await act(async()=>f.state.respond(f.chat,f.chat.agentRun.request,{answers:{'canonical-prompt':'绿色'},outcome:'submitted'}))
 assert.equal(answer,'绿色')
})

test('the native main Profile Bot also refreshes its account project inventory',async t=>{
 const f=await fixture(t);f.api.changeChat(f.chat.id,{gatewayProfile:'default'})
 f.inventory([{id:'main-project',name:'主Bot创建',folders:[]}],[])
 await act(async()=>f.gateway.event({type:'message.complete',session_id:'s',execution_generation:1,payload:{text:'created'}}))
 assert.equal(f.api.current().projects[0]?.name,'主Bot创建')
 assert.equal(f.chat.projectId,null,'Bot chat keeps its canonical Bot identity')
})

test('a delayed Agent inventory read cannot erase a newer manual project result',async()=>{
 const {createProjectInventorySync}=await import('../src/project-inventory-sync.mjs')
 const api=createWorkspace(null,null,{live:true});api.login('lin');let finish,reads=0
 const project={id:'new-project',name:'Newer project',folders:[]}
 const sync=createProjectInventorySync({live:{rpc:async()=>({projects:++reads===1?[]:[project]}),sessions:()=>reads===1?new Promise(r=>{finish=r}):Promise.resolve({sessions:[]})},api,active:()=>true,refresh(){},report(){}})
 const pending=sync();api.syncGatewayInventory([project]);finish({sessions:[]});await pending
 assert.equal(api.current().projects[0]?.id,'new-project');assert.equal(reads,2)
})

test('authoritative workspace info after turn completion updates membership and outranks an older list read',async()=>{
 const {createProjectInventorySync}=await import('../src/project-inventory-sync.mjs')
 const api=createWorkspace(null,null,{live:true});api.login('lin');const chat=api.newChat()
 const project={id:'moved',name:'Moved',primary_path:'/new',folders:[{path:'/new'}]}
 api.syncGatewayInventory([project])
 api.hydrateGatewayChat(chat.id,{session_id:'s',stored_session_id:'s',execution_generation:1,messages:[],info:{cwd:'/old'}})
 api.acceptGatewayPrompt(chat.id,{runId:'turn',text:'move'},{admission_id:'a',execution_generation:1})
 api.applyGatewayFrame(chat.id,{method:'event',params:{type:'message.complete',execution_generation:1,payload:{text:'done'}}},true)
 assert.equal(chat.pending,null)
 let finish,reads=0
 const sync=createProjectInventorySync({live:{rpc:async()=>({projects:[project]}),sessions:()=>++reads===1?new Promise(r=>{finish=r}):Promise.resolve({sessions:[{id:'s',cwd:'/new',message_count:2}]})},api,active:()=>true,refresh(){},report(){}})
 const pending=sync()
 assert.equal(api.applyGatewayFrame(chat.id,{method:'event',params:{type:'session.info',execution_generation:1,payload:{cwd:'/new'}}},true),true)
 assert.equal(chat.projectId,'moved')
 finish({sessions:[{id:'s',cwd:'/old',message_count:2}]});await pending
 assert.equal(chat.projectId,'moved');assert.equal(reads,2)
 api.syncGatewayInventory([project],[{id:'s',cwd:'/elsewhere',message_count:2}])
 assert.equal(chat.projectId,null,'a genuinely newer inventory may move an unwatched session')
})

test('a newer reconnect snapshot invalidates an inventory read begun before its cwd was restored',async()=>{
 const {createProjectInventorySync}=await import('../src/project-inventory-sync.mjs')
 const api=createWorkspace(null,null,{live:true});api.login('lin');const chat=api.newChat()
 const project={id:'restored',name:'Restored',primary_path:'/new',folders:[{path:'/new'}]}
 api.syncGatewayInventory([project])
 api.hydrateGatewayChat(chat.id,{session_id:'s',stored_session_id:'s',messages:[],info:{cwd:'/old'}})
 let finish,reads=0
 const sync=createProjectInventorySync({live:{rpc:async()=>({projects:[project]}),sessions:()=>++reads===1?new Promise(r=>{finish=r}):Promise.resolve({sessions:[{id:'s',cwd:'/new',message_count:2}]})},api,active:()=>true,refresh(){},report(){}})
 const pending=sync()
 api.hydrateGatewayChat(chat.id,{session_id:'s',stored_session_id:'s',messages:[],info:{cwd:'/new'}})
 assert.equal(chat.projectId,'restored')
 finish({sessions:[{id:'s',cwd:'/old',message_count:2}]});await pending
 assert.equal(chat.gatewayCwd,'/new');assert.equal(chat.projectId,'restored');assert.equal(reads,2)
})
