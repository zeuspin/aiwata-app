import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {React,act,click} from './helpers/native-react-harness.mjs'
import {createRoot} from 'react-dom/client'
import {createWorkspace} from '../src/workspace.mjs'
const require=createRequire(import.meta.url)
const compiled=build({entryPoints:['src/management.jsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react','@tabler/icons-react'],loader:{'.css':'empty'}}).then(result=>{const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports.Management})
async function mount(t,extra={}){const Management=await compiled;const api=extra.api??createWorkspace();if(!extra.api)api.login('lin');const record=api.current();const element=document.createElement('div');document.body.append(element);const root=createRoot(element);t.after(async()=>{await act(async()=>root.unmount());element.remove()});const props={section:'bot-settings',record,api,refresh(){},report(){},account:{id:'lin'},...extra};await act(async()=>root.render(React.createElement(Management,props)));return {element,api,record,props,render:patch=>act(async()=>root.render(React.createElement(Management,{...props,...patch})))}}
test('selected Bot settings immediately edit only that Bot and keep capability drafts across tabs',async t=>{
 const dirty=[];const h=await mount(t,{selected:'editor',embedded:true,onDirtyChange:value=>dirty.push(value)});
 assert.equal(h.element.querySelectorAll('dialog').length,0);
 const name=h.element.querySelector('[name="name"]');assert.ok(name,'direct editable name');
 const original=h.record.bots.find(bot=>bot.id==='editor');assert.equal(name.value,original.name);
 assert.deepEqual([...h.element.querySelectorAll('[role="tab"]')].map(tab=>tab.textContent),['基本信息','能力','记忆','自动化','高级']);
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(name,'新的文案助手');name.dispatchEvent(new Event('input',{bubbles:true}))});
 await click([...h.element.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent==='能力'));
 assert.equal(name.value,'新的文案助手');assert.equal(dirty.at(-1),true);
 await act(async()=>h.element.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(h.api.current().bots.find(bot=>bot.id==='editor').name,'新的文案助手');assert.equal(dirty.at(-1),false);
});
test('global manager shows compact rows with settings entry and profile links are scoped to selected Bot',async t=>{
 const calls=[];const h=await mount(t,{onManageBot:id=>calls.push(id)});
 assert.equal(h.element.querySelectorAll('[name="name"]').length,0);
 assert.ok(!h.element.textContent.includes('完整技能、工具与 MCP 配置'));
 await click(h.element.querySelector('[aria-label="设置 Bot · 文案助手"]'));assert.deepEqual(calls,['editor']);
 await h.render({selected:'editor',embedded:true,onOpenProfileSection:(...args)=>calls.push(args)});
 await click([...h.element.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent==='记忆'));
 await click([...h.element.querySelectorAll('button')].find(button=>button.textContent==='管理长期记忆'));
 assert.deepEqual(calls.at(-1),['memory','editor']);assert.ok(h.element.textContent.includes('全局长期记忆'));
});

function nativeApi(){const api=createWorkspace(null,null,{live:true,accounts:[{id:'native'}]});api.login('native');api.syncGatewayBots([{profile:'writer',name:'Writer',identity:'writer-identity',revision:1,desktopRevision:10},{profile:'designer',name:'Designer',identity:'designer-identity',revision:2,desktopRevision:20}]);return api}
const details=(description='Native description')=>({soul:'Native soul',description,model:{default:'native-model',provider:'native-provider'},skills:[{name:'writing',enabled:true}],toolsets:[{name:'web',enabled:true}],mcp_servers:[]})
async function changeInput(input,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
test('native selected saves retain profile/revision and reload before the next edit',async t=>{
 const api=nativeApi(),reads=[],saves=[],busy=[];let version=1,name='Writer';
 const live={native:true,capability:async()=>({providers:[]}),botDetails:async profile=>{reads.push(profile);return details('description '+version)},saveBot:async settings=>{saves.push(settings);version++;name=settings.name;return{}},bots:async()=>({bots:[{profile:'writer',name,identity:'writer-identity',revision:version,desktopRevision:version*10}]})};
 const h=await mount(t,{api,live,selected:'bot:writer',embedded:true,onBusyChange:value=>busy.push(value)});
 await changeInput(h.element.querySelector('[name="name"]'),'Writer 2');
 await act(async()=>h.element.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(saves[0].profile,'writer');assert.equal(saves[0].revision,1);assert.equal(saves[0].desktopRevision,10);assert.equal(saves[0].originalDescription,'description 1');assert.equal(saves[0].originalSoul,'Native soul');
 assert.equal(h.element.querySelector('[name="description"]').value,'description 2');
 await changeInput(h.element.querySelector('[name="name"]'),'Writer 3');
 await act(async()=>h.element.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(saves[1].revision,2);assert.equal(saves[1].desktopRevision,20);assert.equal(saves[1].originalDescription,'description 2');assert.ok(reads.every(profile=>profile==='writer'));assert.equal(busy.at(-1),false);
});
test('native pending details cannot replace another selected Bot or leave removed settings busy',async t=>{
 const api=nativeApi(),busy=[];let resolveWriter;
 const live={native:true,capability:async()=>({providers:[]}),botDetails:profile=>profile==='writer'?new Promise(resolve=>resolveWriter=resolve):Promise.resolve(details('Designer details'))};
 const h=await mount(t,{api,live,selected:'bot:writer',embedded:true,onBusyChange:value=>busy.push(value)});
 assert.ok(!busy.includes(true),'read-only load must remain cancellable');
 await h.render({selected:'bot:designer'});
 await act(async()=>resolveWriter(details('stale writer')));
 assert.equal(h.element.querySelector('[name="name"]').value,'Designer');assert.equal(h.element.querySelector('[name="description"]').value,'Designer details');
 await h.render({selected:'bot:writer'});api.syncGatewayBots([]);await h.render({selected:'bot:writer'});
 await act(async()=>resolveWriter(details('removed writer')));
 assert.ok(h.element.textContent.includes('已移除'));assert.equal(busy.at(-1),false);
});


test('group settings retain a peer lead distinct from a local Bot with the same Profile',async t=>{
 const api=nativeApi(),calls=[];
 const room={room_id:'team',name:'Team',members:[
  {member_id:'local-writer',profile:'writer',target:{kind:'local',profile:'writer'}},
  {member_id:'peer-writer',profile:'writer',display_name:'Peer Writer',target:{kind:'peer',installation_id:'install:peer',profile:'writer'}}]};
 const state={room,context:{purpose:'Before',notes:'',routing:'lead',lead_member_id:'peer-writer'},driver_status:{routing_modes:['everyone','lead']}};
 api.syncGatewayRooms([room]);api.updateGatewayRoomSettings(state);
 const peerId=api.current().groups[0].lead;
 const live={native:true,room:async(method,payload)=>{calls.push([method,payload]);if(method==='groups.context')Object.assign(state.context,payload);return state},rooms:async()=>[room]};
 const h=await mount(t,{api,live,selected:'team',embedded:true});
 assert.equal(h.element.querySelector('[name="lead"]').value,peerId);
 await changeInput(h.element.querySelector('[name="purpose"]'),'After');
 await act(async()=>h.element.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const update=calls.find(([method])=>method==='groups.context');assert.ok(update);
 assert.equal(update[1].lead_member_id,'peer-writer');assert.equal(update[1].purpose,'After');
 assert.equal(api.current().groups[0].lead,peerId);
});


test('avatar animation preview alone does not mark Bot configuration dirty', async t=>{
 const dirty=[];const h=await mount(t,{selected:'editor',embedded:true,onDirtyChange:value=>dirty.push(value)});
 await click(h.element.querySelector('.bot-editor-avatar-link'));
 const preview=h.element.querySelector('.bot-look-state select');
 await act(async()=>{preview.value='thinking';preview.dispatchEvent(new Event('change',{bubbles:true}))});
 assert.equal(dirty.at(-1),false);
 assert.equal(h.element.querySelector('.bot-settings-save button').disabled,true);
});
