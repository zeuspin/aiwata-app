import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { React, act, click } from './helpers/native-react-harness.mjs'
import { createRoot } from 'react-dom/client'
const require=createRequire(import.meta.url)
const component=build({entryPoints:['src/navigation.jsx'],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','@tabler/icons-react']}).then(result=>{const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports})
async function mount(t){const element=document.createElement('div');document.body.append(element);const root=createRoot(element);t.after(async()=>{await act(async()=>root.unmount());element.remove()});const {ArchiveList}=await component;return {element,render:live=>act(async()=>root.render(React.createElement(ArchiveList,{record:{chats:{}},live})))}}

test('archive shows effective retention, disabled policy, errors and ignores a retired owner response',async t=>{
 const {element,render}=await mount(t)
 let resolveOld
 await render({api:()=>new Promise(resolve=>resolveOld=resolve)})
 assert.match(element.textContent,/正在读取.*清理/)
 let calls=0
 await render({api:async path=>{assert.equal(path,'/api/config');calls++;return {config:{sessions:{auto_prune:true,retention_days:14,min_interval_hours:12}}}}})
 assert.match(element.textContent,/14 天/)
 assert.match(element.textContent,/12 小时/)
 assert.match(element.textContent,/已结束/)
 await act(async()=>resolveOld({config:{sessions:{auto_prune:true,retention_days:999}}}))
 assert.ok(!element.textContent.includes('999'))
 assert.equal(calls,1)
 await render({api:async()=>({config:{sessions:{auto_archive:true,auto_archive_days:3,auto_prune:false}}})})
 assert.match(element.textContent,/未启用自动清理/)
 await render({api:async()=>{throw Error('连接失效')}})
 assert.match(element.textContent,/无法读取.*清理/)
 assert.ok(!element.textContent.includes('未启用自动清理'))
})

test('account archive action invokes the existing panel opening with the original event',async t=>{
 const {Rail}=await component
 const element=document.createElement('div');const root=createRoot(element);t.after(async()=>act(async()=>root.unmount()))
 let invocation
 await act(async()=>root.render(React.createElement(Rail,{account:{name:'A'},menu:'account',onOpenPanel:(...args)=>invocation=args})))
 const entry=[...element.querySelectorAll('button')].find(button=>button.textContent==='归档记录')
 await click(entry)
 assert.deepEqual(invocation.slice(1),['archive',true])
})
