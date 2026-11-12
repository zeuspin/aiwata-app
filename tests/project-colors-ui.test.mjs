import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { React, act } from './helpers/native-react-harness.mjs'
import { createRoot } from 'react-dom/client'
import { createWorkspace } from '../src/workspace.mjs'
const require=createRequire(import.meta.url)
const component=build({entryPoints:['src/navigation.jsx','src/conversation-meta.jsx'],outdir:'out',bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','@tabler/icons-react']}).then(result=>Object.assign({},...result.outputFiles.map(file=>{const module={exports:{}};new Function('require','module','exports',file.text)(require,module,module.exports);return module.exports})))
test('sidebar marks project conversations and separates ungrouped conversations, picker offers colors only',async t=>{
 const {ContextList,ProjectMarkerPicker}=await component
 const api=createWorkspace();api.login('lin');const record=api.current()
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el)
 t.after(async()=>{await act(async()=>root.unmount());el.remove()})
 await act(async()=>root.render(React.createElement(ContextList,{record,section:'projects',visible:true,onListScroll(){}})))
 assert.ok(el.textContent.includes('无项目'))
 for(const project of record.projects){
   const row=[...el.querySelectorAll('.project-group')].find(row=>row.textContent.includes(project.name))
   assert.ok(row.querySelector('.chat-row .color-marker'))
 }
 await act(async()=>root.render(React.createElement(ProjectMarkerPicker,{title:'测试',marker:{kind:'color',value:'blue'},onSave(){return true}})))
 assert.ok(el.querySelector('input[type=color]'))
 assert.ok(!el.textContent.includes('Emoji'))
 assert.ok(!el.querySelector('.emoji-marker'))
})
