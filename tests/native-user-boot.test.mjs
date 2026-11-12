import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {React,act} from './helpers/native-react-harness.mjs'
const require=createRequire(import.meta.url)
async function boot(t,{service,fail=false}){
 let root,starts=0
 window.hermesDesktop=service?{localUsers:service}:{}
 delete window.aiwataNativeRuntime;delete window.aiwataLocalUser
 window.__qaInitialize=()=>{starts++;if(fail)throw Error('模拟网关不可用');window.aiwataNativeRuntime={}}
 const container=document.createElement('div');container.id='root';document.body.append(container)
 const output=await build({entryPoints:['src/primary-main.jsx'],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},define:{__AIWATA_NATIVE__:'true',__AIWATA_LIVE__:'false'},external:['react','react-dom/client','@tabler/icons-react'],plugins:[{name:'controlled-native-entry',setup(build){
 build.onResolve({filter:/^#native-/},a=>({path:a.path,namespace:'qa'}))
 build.onResolve({filter:/^\.\/App\.jsx$/},()=>({path:'app',namespace:'qa'}))
 build.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:a.path==='#native-preferences'?'export const bootRenderer=async f=>f()':a.path==='#native-desktop'?'export const initializeNativeDesktop=async()=>window.__qaInitialize()':"import React from 'react';export const App=()=>React.createElement('h1',null,'Owned workspace')",loader:'js'}))
 }}]})
 const module={exports:{}},req=name=>name==='react-dom/client'?{createRoot:element=>{root=require('react-dom/client').createRoot(element);return root}}:require(name)
 await act(async()=>{new Function('require','module','exports',output.outputFiles[0].text)(req,module,module.exports);await new Promise(resolve=>setImmediate(resolve))})
 t.after(async()=>{await act(async()=>root?.unmount());container.remove();delete window.hermesDesktop;delete window.aiwataNativeRuntime;delete window.aiwataLocalUser;delete window.__qaInitialize})
 return{container,starts:()=>starts}
}
test('native parent selection never initializes a default backend',async t=>{
 const f=await boot(t,{service:{list:async()=>({users:[{id:'a',name:'用户一'},{id:'b',name:'用户二'}],currentUserId:null})}})
 assert.equal(f.starts(),0);assert.match(f.container.textContent,/用户一/);assert.match(f.container.textContent,/用户二/)
})
test('older host cannot silently fall back to the shared default workspace',async t=>{
 const f=await boot(t,{})
 assert.equal(f.starts(),0);assert.match(f.container.textContent,/宿主.*多用户/)
})
test('selected child initializes only its owner and exposes a recovery screen on gateway failure',async t=>{
 const f=await boot(t,{fail:true,service:{list:async()=>({users:[{id:'a',name:'用户一'}],currentUserId:'a'})}})
 assert.equal(f.starts(),1);assert.equal(window.aiwataLocalUser.id,'a');assert.match(f.container.textContent,/模拟网关不可用/)
 assert.ok(f.container.querySelector('[role="alert"]'))
})
test('failed explicit re-entry cannot leave the unmounted login page stuck on connecting',async t=>{
 const f=await boot(t,{fail:true,service:{list:async()=>({users:[{id:'a',name:'用户一'}],currentUserId:null}),activate:async()=>({ok:true,opening:false})}})
 await act(async()=>{f.container.querySelector('[aria-label="进入用户一"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(resolve=>setImmediate(resolve))})
 assert.equal(f.starts(),1);assert.match(f.container.textContent,/模拟网关不可用/);assert.ok(f.container.querySelector('[role="alert"]'))
})
