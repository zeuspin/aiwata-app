import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {React,act,click} from './helpers/native-react-harness.mjs'
import {createRoot} from 'react-dom/client'
import {gatewayGroup} from '../src/live-room-state.mjs'

const require=createRequire(import.meta.url)
const bundle=build({stdin:{contents:"export {ContextList} from './src/navigation.jsx'",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','@tabler/icons-react']}).then(result=>{
 const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports
})
function fixture({localWriter=false}={}){
 const members=[{member_id:'owner',profile:'default',display_name:'AIWATA',target:{kind:'local',profile:'default'}},{member_id:'peer-writer',profile:'writer',display_name:'Remote writer',target:{kind:'peer',installation_id:'install:remote',profile:'writer'}}]
 if(localWriter)members.splice(1,0,{member_id:'local-writer',profile:'writer',display_name:'Local writer',target:{kind:'local',profile:'writer'}})
 const group=gatewayGroup({room_id:'native-room',name:'跨机群聊',members},null,null)
 return {group,record:{projects:[],tasks:[],connectors:[],navigation:{},groups:[group],bots:localWriter?[{id:'bot:writer',profile:'writer',name:'Local writer',appearance:{mode:'character',bodyColor:'#ff0000'}}]:[],chats:{'native-room':{id:'native-room',title:'跨机群聊',messages:[]}}}}
}
async function render(t,props){
 const {ContextList}=await bundle,element=document.createElement('div');document.body.append(element);const root=createRoot(element)
 t.after(async()=>{await act(async()=>root.unmount());element.remove()})
 await act(async()=>root.render(React.createElement(ContextList,{visible:true,select(){},selectItem(){},...props})))
 return element
}

test('the group conversation list renders owner default and a remote member absent from local Bots, and opens the durable room',async t=>{
 const {record}=fixture(),selected=[]
 const element=await render(t,{section:'bots',record,select:id=>selected.push(id)})
 const row=[...element.querySelectorAll('.context-row')].find(button=>button.textContent.includes('跨机群聊'))
 assert.ok(row);assert.equal(row.querySelectorAll('.group-face .bot-avatar').length,2)
 await click(row);assert.deepEqual(selected,['native-room'])
})

test('group management navigation preserves distinct local and remote members with the same profile',async t=>{
 const {record}=fixture({localWriter:true}),selected=[]
 const element=await render(t,{section:'bot-settings',record,selectItem:id=>selected.push(id)})
 const row=[...element.querySelectorAll('.context-row')].find(button=>button.textContent.includes('跨机群聊'))
 assert.ok(row);const faces=[...row.querySelectorAll('.group-face .bot-avatar')]
 assert.equal(faces.length,3);assert.equal(faces[1].style.getPropertyValue('--bot-base'),'#ff0000');assert.notEqual(faces[2].style.getPropertyValue('--bot-base'),'#ff0000')
 await click(row);assert.deepEqual(selected,['native-room'])
})
