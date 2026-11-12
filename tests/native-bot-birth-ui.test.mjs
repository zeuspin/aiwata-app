import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {React,act} from './helpers/native-react-harness.mjs'
import {createRoot} from 'react-dom/client'
import {createWorkspace} from '../src/workspace.mjs'
import {createBotBirths} from '../src/native-bot-birth.mjs'
const require=createRequire(import.meta.url)
const compiled=build({stdin:{contents:`import React,{useReducer} from 'react';import {useLiveWorkbench} from './src/live-workbench.jsx';export function Harness({api,live}){const [,refresh]=useReducer(x=>x+1,0);useLiveWorkbench({api,live,chatId:'bot:writer',accountId:'native',refresh,report(...args){live.reports.push(args)},onAccepted(){}});return <output>{api.getChat('bot:writer').gatewayStoredId||'loading'}</output>}`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','@tabler/icons-react'],loader:{'.css':'empty'}}).then(result=>{const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports.Harness})
test('new Bot mounts and hydrates before its one intro uses normal native prompt admission; reopen stays silent',async t=>{
 const Harness=await compiled,element=document.createElement('div');document.body.append(element);let root=createRoot(element)
 t.after(async()=>{await act(async()=>root.unmount());element.remove()})
 const api=createWorkspace(null,null,{live:true,accounts:[{id:'native'}]});api.login('native');api.syncGatewayBots([{profile:'writer',name:'Writer'}]);api.changeChat('bot:writer',{draft:'unsent owner text'})
 let minted=false;const submitted=[];const births=createBotBirths({nextPaint:async()=>{await new Promise(resolve=>setImmediate(resolve));assert.equal(element.textContent,'stored')}});births.queue('writer','creation')
 const snapshot={session_id:'runtime',stored_session_id:'stored',messages:[],info:{},last_sequence:0}
 const live={reports:[],native:true,watch(_frames,status){status('connected');return()=>{}},openBot:async()=>({...snapshot,botCanonicalCreated:!minted&&(minted=true)}),afterBotHydrated:births.afterHydrate,
  prepareUploads:params=>params,rpc:async(method,params)=>{
   if(method==='setup.runtime_check')return {ok:true}
   if(method==='session.resume')return snapshot
   if(method==='session.events.since')return {events:[]}
   if(method==='prompt.submit'){assert.equal(element.textContent,'stored');submitted.push(params);return {admission_id:'admit',submission_id:params.submission_id,session_id:'runtime',stored_session_id:'stored',status:'started'}}
   return {}
  }}
 await act(async()=>root.render(React.createElement(Harness,{api,live})))
 for(let i=0;i<5;i++)await act(async()=>new Promise(resolve=>setImmediate(resolve)))
 assert.equal(submitted.length,1,JSON.stringify(live.reports));assert.equal(submitted[0].text,'你好，介绍一下你自己吧！');assert.equal(api.getChat('bot:writer').draft,'unsent owner text')
 await act(async()=>root.unmount());api.changeChat('bot:writer',{pending:null,gatewaySubmission:null});root=createRoot(element)
 await act(async()=>root.render(React.createElement(Harness,{api,live})))
 for(let i=0;i<3;i++)await act(async()=>new Promise(resolve=>setImmediate(resolve)))
 assert.equal(submitted.length,1)
})
