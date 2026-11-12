import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {React,act,click} from './helpers/native-react-harness.mjs'
import {createRoot} from 'react-dom/client'
import {nativeSettings} from '../src/native-desktop-settings.mjs'
const require=createRequire(import.meta.url)
const component=build({entryPoints:['src/live-connectors.jsx'],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','@tabler/icons-react','qrcode']}).then(result=>{const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports.default})
const ids=['telegram','discord','slack','email','weixin','whatsapp','matrix','mattermost','signal','dingtalk','feishu','zulip','imessage','sms','webhook','native_extension']
const rawPlatform=(id,fields=[])=>({id,name:'Native '+id,description:'Original gateway description '+id,enabled:true,configured:true,gateway_running:true,state:'connected',env_vars:fields})
async function normalized(raw){return nativeSettings({api:async path=>path==='/api/messaging/platforms'?{platforms:raw}:{pending:[],approved:[]},rpc:async()=>({}),host:{},route:{connectionId:'remote',profile:'writer'},stops:new Set(),check(){}}).connector('read','writer')}
async function render(t,{items,profile='bot:writer',surface}={}){
 const View=await component,calls=[],reports=[],element=document.createElement('div');document.body.append(element);const root=createRoot(element)
 const live={native:true,openNativeSurface:async(...args)=>{calls.push(['surface',...args]);return surface?.(...args)},connector:async(action,p,params)=>{calls.push([action,p,params]);if(action==='read')return{platforms:items};if(action==='relayRead')return{accounts:[],managedBy:'connector'};if(action==='apply-plan')return{sharedProfiles:['default','writer'],confirmationKey:'reviewed'};return{ok:true}}}
 const props={record:{bots:[{id:'bot:writer',profile:'writer',name:'Writer'}]},selected:'all',profile,setProfile(){},live,report:(...args)=>reports.push(args),onGroupOpenChange(){}}
 const rerender=async patch=>act(async()=>root.render(React.createElement(View,{...props,...patch})))
 t.after(async()=>{await act(async()=>root.unmount());element.remove()});await rerender()
 return{element,calls,reports,rerender,live}
}
const row=(view,id)=>[...view.element.querySelectorAll('.management-connector')].find(element=>element.querySelector('strong')?.textContent==='Native '+id)
const button=(element,label)=>[...element.querySelectorAll('button')].find(button=>button.textContent===label)
const item=(id,extra={})=>({id,name:'Native '+id,description:'Original '+id,state:'connected',configured:true,enabled:true,running:true,fields:[],pending:[],approved:[],logs:[],...extra})

test('native connector projection preserves gateway platform metadata beyond the local inline catalog',async()=>{
 const result=await normalized(ids.map(id=>rawPlatform(id)))
 assert.equal(result.platforms.length,ids.length)
 for(const platform of result.platforms){assert.equal(platform.name,'Native '+platform.id);assert.equal(platform.description,'Original gateway description '+platform.id)}
})

test('the real connector page renders every gateway platform including WhatsApp and unknown extensions and offers original messaging for a platform without an inline schema',async t=>{
 const result=await normalized(ids.map(id=>rawPlatform(id))),view=await render(t,{items:result.platforms})
 assert.equal(view.element.querySelectorAll('.management-connector').length,ids.length)
 for(const id of ids)assert.ok(row(view,id),'missing visible native platform '+id)
 const unknown=row(view,'native_extension');assert.match(unknown.textContent,/原生消息连接器/)
 await click(button(unknown,'打开原生消息连接器'))
 assert.deepEqual(view.calls.find(call=>call[0]==='surface'),['surface','messaging','writer'])
 assert.equal(view.calls.some(call=>call[0]==='save'),false)
})

test('a native platform outside the inline catalog uses its actual env schema for configuration and its original platform id for pairing',async t=>{
 const view=await render(t,{items:[item('native_extension',{fields:[{key:'NATIVE_ALLOWED_USERS',label:'Allowed users',value:'kept',isSet:true}],pending:[{request_id:'pair-1',user_id:'user-1'}]})]})
 await click(button(row(view,'native_extension'),'配置'));assert.match(view.element.querySelector('dialog h2').textContent,/Native native_extension/)
 const input=view.element.querySelector('dialog input[name="NATIVE_ALLOWED_USERS"]');assert.equal(input.value,'kept');input.value='new user'
 await act(async()=>view.element.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.deepEqual(view.calls.find(call=>call[0]==='save'),['save','writer',{platform:'native_extension',enabled:true,env:{NATIVE_ALLOWED_USERS:'new user'},clear:[]}])
 await click(button(row(view,'native_extension'),'批准配对'));assert.match(view.element.querySelector('dialog').textContent,/Native native_extension/)
 await act(async()=>view.element.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.deepEqual(view.calls.find(call=>call[0]==='approve'),['approve','writer',{platform:'native_extension',id:'pair-1'}])
})

test('an uncatalogued relay platform opens its existing native relay controller using gateway metadata',async t=>{
 const view=await render(t,{items:[item('native_extension',{relay:true,relayFronted:true})]})
 await click(button(row(view,'native_extension'),'管理共享 Bot 绑定'))
 assert.match(view.element.querySelector('dialog h2').textContent,/Native native_extension · Team Gateway/)
 assert.deepEqual(view.calls.find(call=>call[0]==='relayRead'),['relayRead','writer',{platform:'native_extension'}])
})

test('Telegram and WhatsApp QR entry points and native apply confirmation remain available alongside uncatalogued platforms',async t=>{
 const view=await render(t,{items:[item('telegram'),item('whatsapp'),item('native_extension')]})
 for(const id of ['telegram','whatsapp']){await click(button(row(view,id),'扫码配置'));assert.match(view.element.querySelector('dialog h2').textContent,new RegExp(id==='telegram'?'Telegram':'WhatsApp'));await click(view.element.querySelector('dialog [aria-label="关闭"]'))}
 await click(button(view.element,'应用网关配置'));assert.match(view.element.querySelector('dialog').textContent,/default、writer/)
 assert.equal(view.calls.some(call=>call[0]==='apply'),false)
})

test('a late native messaging open failure stays bound to its original profile and is not reported in another profile',async t=>{
 let reject;const waiting=new Promise((_,fail)=>{reject=fail}),view=await render(t,{items:[item('native_extension')],surface:()=>waiting})
 await click(button(row(view,'native_extension'),'打开原生消息连接器'))
 await view.rerender({profile:'default'});await act(async()=>{reject(new Error('old owner failure'));await Promise.resolve()})
 assert.deepEqual(view.calls.find(call=>call[0]==='surface'),['surface','messaging','writer']);assert.deepEqual(view.reports,[])
})

test('prototype-named native extension ids remain unknown inline platforms and retain the original messaging entry',async t=>{
 const view=await render(t,{items:[item('constructor'),item('__proto__')]})
 for(const id of ['constructor','__proto__']){
  const platform=row(view,id);assert.ok(platform);assert.equal(Boolean(button(platform,'配置')),false)
  await click(button(platform,'打开原生消息连接器'))
 }
 assert.deepEqual(view.calls.filter(call=>call[0]==='surface'),[['surface','messaging','writer'],['surface','messaging','writer']])
})
