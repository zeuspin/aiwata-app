import test from 'node:test'
import assert from 'node:assert/strict'
import {React,act,harness,click,edit} from './helpers/native-react-harness.mjs'
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
const chat=id=>({id,gatewayStoredId:'stored-'+id,gatewayProfile:'',toolEdits:{},messages:[],attachments:[],attachmentDetails:{}})
const apiFor=own=>({accountId:'account-'+own.id,current:()=>({chats:{[own.id]:own}}),getChat:id=>id===own.id?own:null,updateToolEdits:(_id,fn)=>{own.toolEdits={...own.toolEdits,...fn(own.toolEdits)}}})

test('changing Git ownership releases the old lock and an old reply cannot release a newer operation',async t=>{
 const h=await harness(t),a=chat('a'),b=chat('b'),old=deferred(),next=deferred();let state
 const live={native:true,git:async params=>params.action==='status'?{root:'/project',repository:{files:[]}}:params.session_id==='stored-a'?old.promise:next.promise}
 const props={live,api:apiFor(a),chat:a,project:{id:'p',folder:'/project'},visible:true,refresh(){},inspect:value=>{state=value}}
 await h.render(React.createElement(h.GitHarness,props));let first
 await act(async()=>{first=state.mutate('stage')});assert.equal(h.element.querySelector('output').dataset.busy,'true')
 await h.render(React.createElement(h.GitHarness,{...props,chat:b,api:{...apiFor(b),accountId:props.api.accountId}}))
 assert.equal(h.element.querySelector('output').dataset.busy,'false')
 let second;await act(async()=>{second=state.mutate('stage')})
 await act(async()=>{old.resolve({ok:true});await first});assert.equal(h.element.querySelector('output').dataset.busy,'true')
 await act(async()=>{next.resolve({ok:true});await second});assert.equal(h.element.querySelector('output').dataset.busy,'false')
})

test('refreshing or removing the listed row cannot discard the dirty editor or change its save target',async t=>{
 const h=await harness(t),own=chat('editor'),api=apiFor(own),reload=deferred(),writes=[];let state,blocked=false
 const live={native:true,route:{connectionId:'local',profile:'default'},files:async(action,_session,root)=>action==='list'?(blocked?reload.promise:{native:true,localFiles:true,root:root||'/project',roots:[{id:'/project',label:'Project'}],entries:[{name:'file.txt',directory:false}]}):{name:'file.txt',text:'baseline',size:8},manageFile:async(...args)=>{writes.push(args);return{ok:true}}}
 const props={live,api,chat:own,project:{id:'p',folder:'/project'},visible:true,refresh(){},report(){},inspect:value=>{state=value}}
 await h.render(React.createElement(h.FilesHarness,props))
 await click(h.element.querySelector('[aria-label="文件操作 · file.txt"]'))
 await click([...h.element.querySelectorAll('button')].find(button=>button.textContent==='编辑文本…'))
 await edit(h.element.querySelector('textarea[aria-label="文件文本"]'),'unsaved secret text')
 blocked=true;await act(async()=>state.reload())
 assert.equal(h.element.querySelector('textarea[aria-label="文件文本"]')?.value,'unsaved secret text')
 await act(async()=>reload.resolve({native:true,localFiles:true,root:'/project',roots:[{id:'/project',label:'Project'}],entries:[]}))
 assert.equal(h.element.querySelector('textarea[aria-label="文件文本"]')?.value,'unsaved secret text')
 await act(async()=>{state.navigate('/other',[])});await h.render(React.createElement(h.FilesHarness,props))
 await act(async()=>h.element.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(writes[0][2],'/project');assert.deepEqual(writes[0][3],['file.txt']);assert.equal(writes[0][4].content,'unsaved secret text')
})

test('changing only the Git worktree resets ownership without letting the old failure overwrite the new operation',async t=>{
 const h=await harness(t),own=chat('worktree'),old=deferred(),next=deferred();let state
 const live={native:true,git:async params=>params.action==='status'?{root:'/project',repository:{files:[]}}:params.worktree==='/second'?next.promise:old.promise}
 const props={live,api:apiFor(own),chat:own,project:{id:'p',folder:'/project'},visible:true,refresh(){},inspect:value=>{state=value}}
 await h.render(React.createElement(h.GitHarness,props));let first
 await act(async()=>{first=state.mutate('stage')})
 own.toolEdits.liveGit={worktree:'/second'};await h.render(React.createElement(h.GitHarness,props))
 assert.equal(h.element.querySelector('output').dataset.busy,'false')
 let second;await act(async()=>{second=state.mutate('stage')})
 await act(async()=>{old.resolve({ok:false,error:'old worktree failure'});await first})
 assert.equal(h.element.querySelector('output').dataset.busy,'true');assert.equal(h.element.querySelector('output').textContent,'')
 await act(async()=>{next.resolve({ok:true});await second});assert.equal(h.element.querySelector('output').dataset.busy,'false')
})

test('background tool reveal keeps the owned editor focused while account navigation retains an isolated memory draft',async t=>{
 const h=await harness(t),a=chat('memory-a'),b=chat('memory-b');let state
 const live={native:true,route:{connectionId:'local',profile:'default'},files:async action=>action==='list'?{native:true,localFiles:true,root:'/project',roots:[{id:'/project',label:'Project'}],entries:[{name:'file.txt',directory:false}]}:{name:'file.txt',text:'baseline',size:8},manageFile:async()=>({ok:true})}
 const props={live,api:apiFor(a),chat:a,project:{id:'p',folder:'/project'},visible:true,refresh(){},report(){},inspect:value=>{state=value}}
 await h.render(React.createElement(h.FilesHarness,props))
 await click(h.element.querySelector('[aria-label="文件操作 · file.txt"]'));await click([...h.element.querySelectorAll('button')].find(button=>button.textContent==='编辑文本…'))
 const textarea=h.element.querySelector('textarea[aria-label="文件文本"]');textarea.focus();await edit(textarea,'private unsaved draft');assert.equal(state.fileActions.snapshot().active.draft,'private unsaved draft');assert.equal(Object.keys(window.localStorage).some(key=>String(window.localStorage.getItem(key)).includes('private unsaved draft')),false)
 await h.render(React.createElement(h.FilesHarness,{...props,visible:false,showPane:false}))
 assert.equal(h.element.querySelector('textarea'),textarea);assert.equal(document.activeElement,textarea)
 await h.render(React.createElement(h.FilesHarness,{...props,key:'account-b',chat:b,api:apiFor(b)}))
 assert.equal(h.element.querySelector('textarea'),null);assert.doesNotMatch(h.element.textContent,/private unsaved draft/)
 await h.render(React.createElement(h.FilesHarness,props))
 assert.equal(state.fileActions.snapshot().drafts.length,1)
 await click([...h.element.querySelectorAll('button')].find(button=>button.textContent==='继续编辑 file.txt'))
 assert.equal(h.element.querySelector('textarea')?.value,'private unsaved draft')
 await click([...h.element.querySelectorAll('dialog button')].find(button=>button.textContent==='取消'))
})

test('native branch lookup opens the real picker without invalidating its parent Git view',async t=>{
 const h=await harness(t),own=chat('branch-picker')
 const live={native:true,git:async params=>params.action==='branches'?{branches:[{name:'main',checkedOut:true},{name:'feature',checkedOut:false}]}:{root:'/project',roots:[{id:'/project',label:'Project'}],repository:{absolutePath:'/project',files:[],worktrees:[]}}}
 await h.render(React.createElement(h.GitViewHarness,{live,api:apiFor(own),chat:own,project:{id:'p',folder:'/project'},visible:true,refresh(){}}))
 await click([...h.element.querySelectorAll('button')].find(button=>button.textContent==='切换分支…'))
 assert.equal(h.element.querySelector('dialog select[aria-label="切换到分支"]')?.querySelector('option[value="feature"]')?.textContent,'feature')
})

test('a replacement physical target cannot restore the previous target file draft even with the same logical session and path',async t=>{
 const h=await harness(t),own=chat('same-session'),api=apiFor(own);let state
 const live={native:true,scopeIdentity:'install-A',route:{connectionId:'same-id',profile:'default'},files:async action=>action==='list'?{native:true,localFiles:true,root:'/project',roots:[{id:'/project',label:'Project'}],entries:[{name:'file.txt',directory:false}]}:{name:'file.txt',text:'baseline',size:8},manageFile:async()=>({ok:true})}
 const props={live,api,chat:own,project:{id:'p',folder:'/project'},visible:true,refresh(){},report(){},inspect:value=>{state=value}}
 await h.render(React.createElement(h.FilesHarness,props))
 await click(h.element.querySelector('[aria-label="文件操作 · file.txt"]'));await click([...h.element.querySelectorAll('button')].find(button=>button.textContent==='编辑文本…'))
 await edit(h.element.querySelector('textarea'),'previous target secret')
 await h.render(React.createElement(h.FilesHarness,{...props,key:'new-source',live:{...live,scopeIdentity:'install-B'}}))
 assert.equal(state.fileActions.snapshot().drafts.length,0)
 assert.equal(h.element.querySelector('textarea'),null)
 await h.render(React.createElement(h.FilesHarness,{...props,key:'original-source'}))
 assert.equal(state.fileActions.snapshot().drafts.length,1)
})

test('legacy cache notice exposes aggregate counts only and stays dismissed through a same-owner reconnect',async t=>{
 const h=await harness(t),route={connectionId:'remote',profile:'default'},storage={getItem:()=>JSON.stringify({oldAccount:{chats:{one:{draft:'do not reveal this private text',attachments:['private.txt']}}}}),setItem:(key,value)=>{assert.match(key,/^aiwata-app-native:legacy-cache-notice:/);assert.equal(value,'true')}}
 const props={route,storage,enabled:true}
 await h.render(React.createElement(h.NativeLegacyCacheNotice,props))
 assert.match(h.element.textContent,/1 份未发送草稿/);assert.doesNotMatch(h.element.textContent,/private|do not reveal/)
 await click([...h.element.querySelectorAll('button')].find(button=>button.textContent==='知道了，保留旧缓存'))
 assert.equal(h.element.querySelector('dialog'),null)
 await h.render(React.createElement(h.NativeLegacyCacheNotice,{...props,enabled:false}))
 await h.render(React.createElement(h.NativeLegacyCacheNotice,props))
 assert.equal(h.element.querySelector('dialog'),null)
})

test('acknowledging the legacy cache notice survives a renderer restart without modifying legacy data or acknowledging another route',{timeout:5000},async t=>{
 const h=await harness(t),route={connectionId:'notice-remote',profile:'default'},legacy=JSON.stringify({oldAccount:{chats:{one:{draft:'private old draft'}}}}),values=new Map([[`aiwata-app-native:v1:${JSON.stringify([route.connectionId,route.profile])}`,legacy],[`aiwata-app-native:v1:${JSON.stringify(['other-route',route.profile])}`,legacy]])
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{assert.match(key,/^aiwata-app-native:legacy-cache-notice:/);assert.equal(value,'true');values.set(key,value)}}
 await h.render(React.createElement(h.NativeLegacyCacheNotice,{route,storage,key:'before-restart'}))
 await click([...h.element.querySelectorAll('button')].find(button=>button.textContent==='知道了，保留旧缓存'))
 await h.render(React.createElement(h.NativeLegacyCacheNotice,{route,storage,key:'after-restart'}))
 assert.equal(Boolean(h.element.querySelector('dialog')),false)
 assert.equal(values.get(`aiwata-app-native:v1:${JSON.stringify([route.connectionId,route.profile])}`),legacy)
 await h.render(React.createElement(h.NativeLegacyCacheNotice,{route:{...route,connectionId:'other-route'},storage,key:'other-route'}))
 assert.ok(h.element.querySelector('dialog'))
})
