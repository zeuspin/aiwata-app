import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {React,act,click} from './helpers/native-react-harness.mjs'
import {createRoot} from 'react-dom/client'
const require=createRequire(import.meta.url)
const component=build({entryPoints:['src/local-user-login.jsx'],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','@tabler/icons-react']}).then(result=>{const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports.LocalUserLogin})
async function mount(t,service,onSelected=()=>{}){const C=await component,element=document.createElement('div');document.body.append(element);const root=createRoot(element);t.after(async()=>{await act(async()=>root.unmount());element.remove()});await act(async()=>root.render(React.createElement(C,{service,onSelected})));return element}
test('user selection is explicit and creation reloads registered users without automatic activation',async t=>{
 let users=[{id:'one',name:'用户一'},{id:'two',name:'用户二'}],selected=[]
 const service={list:async()=>({users,currentUserId:null}),create:async name=>{users=[...users,{id:'new',name}];return{users}},activate:async id=>{selected.push(id);return{ok:true,opening:false}}}
 const element=await mount(t,service)
 assert.equal(selected.length,0);assert.match(element.textContent,/用户一/);assert.match(element.textContent,/用户二/)
 const input=element.querySelector('input[name="username"]')
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'新增用户');input.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(async()=>element.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.match(element.textContent,/新增用户/);assert.equal(selected.length,0)
 await click(element.querySelector('[aria-label="进入用户一"]'));assert.deepEqual(selected,['one'])
})
test('delete explicitly confirms data cleanup and errors do not remove another user',async t=>{
 let removed=[];const users=[{id:'one',name:'用户一'},{id:'two',name:'用户二'}]
 const element=await mount(t,{list:async()=>({users}),remove:async id=>{removed.push(id);throw Error('用户仍在运行')}})
 await click(element.querySelector('[aria-label="删除用户一"]'));assert.equal(removed.length,0)
 const dialog=element.querySelector('dialog');assert.match(dialog.textContent,/数据/)
 await act(async()=>dialog.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.deepEqual(removed,['one']);assert.match(dialog.textContent,/用户仍在运行/);assert.match(element.textContent,/用户二/)
})
test('failed registry read shows retry without fabricated defaults or activation',async t=>{
 const element=await mount(t,{list:async()=>{throw Error('登记损坏')}})
 assert.match(element.textContent,/登记损坏/);assert.ok(element.querySelector('[role="alert"]'))
 assert.equal(element.querySelectorAll('[aria-label^="进入"]').length,0)
})
test('deleting a user blocks focus refresh until its cleanup transaction has settled',async t=>{
 let resolveRemove,reads=0,users=[{id:'one',name:'用户一'}]
 const removing=new Promise(resolve=>resolveRemove=resolve)
 const element=await mount(t,{list:async()=>{reads++;return{users}},remove:async()=>{await removing;users=[]}})
 await click(element.querySelector('[aria-label="删除用户一"]'))
 await act(async()=>element.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 await act(async()=>window.dispatchEvent(new Event('focus')))
 assert.equal(reads,1)
 await act(async()=>resolveRemove())
 assert.match(element.textContent,/暂无本机用户/)
})
test('parent selector surfaces an asynchronously forwarded user deletion failure',async t=>{
 let changed,problem=''
 const element=await mount(t,{list:async()=>({users:[{id:'a',name:'用户一'}],error:problem}),onChanged:callback=>{changed=callback;return()=>{}}})
 problem='该用户网关尚未停止，测试数据保留'
 await act(async()=>changed())
 assert.match(element.querySelector('[role="alert"]').textContent,/测试数据保留/)
 assert.ok(element.querySelector('[aria-label="进入用户一"]'))
})
test('self deletion accepted by the parent shows closing progress instead of premature success',async t=>{
 const users=[{id:'one',name:'用户一'}]
 const element=await mount(t,{list:async()=>({users,currentUserId:'one'}),remove:async()=>({users,currentUserId:'one',notice:'正在关闭此用户应用并删除测试数据'})})
 await click(element.querySelector('[aria-label="删除用户一"]'))
 await act(async()=>element.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.match(element.textContent,/正在关闭此用户应用/)
 assert.ok(!element.textContent.includes('已删除'))
 assert.equal(element.querySelector('[aria-label="进入用户一"]').disabled,true)
})
