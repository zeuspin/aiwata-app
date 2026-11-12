import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {React,act} from './helpers/native-react-harness.mjs'
import {createRoot} from 'react-dom/client'
import {createWorkspace} from '../src/workspace.mjs'
import {navigateBrowser,editBrowserAnnotation} from '../src/tool-surfaces.mjs'

const require=createRequire(import.meta.url)
const components=build({stdin:{contents:"export {AnnotationControls} from './src/browser-annotations.jsx';export {LiveBrowser} from './src/live-browser.jsx'",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',loader:{'.css':'empty'},external:['react','@tabler/icons-react']}).then(result=>{const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports})
async function render(t,make){
 const observers=[],previous=globalThis.ResizeObserver
 globalThis.ResizeObserver=class {constructor(callback){this.callback=callback;observers.push(this)}observe(element){this.element=element}disconnect(){this.disconnected=true}}
 const element=document.createElement('div');document.body.append(element);const root=createRoot(element);let closed=false
 async function close(){if(closed)return;closed=true;await act(async()=>root.unmount());element.remove()}
 t.after(async()=>{await close();globalThis.ResizeObserver=previous})
 await act(async()=>root.render(make(await components)))
 return {element,observers,close}
}
const props={pane:{width:1200,height:800},count:1,ready:true,destination:{label:'Owned chat'}}

test('AnnotationControls measures its live panel but ignores a retained ResizeObserver notification after unmount',async t=>{
 const view=await render(t,({AnnotationControls})=>React.createElement(AnnotationControls,props)),observer=view.observers[0],panel=observer.element
 Object.defineProperty(panel,'offsetWidth',{configurable:true,get:()=>280});Object.defineProperty(panel,'offsetHeight',{configurable:true,get:()=>40})
 await act(async()=>observer.callback());assert.equal(panel.style.left,'460px')
 await view.close();assert.equal(observer.disconnected,true)
 Object.defineProperty(panel,'offsetWidth',{configurable:true,get:()=>assert.fail('disposed panel measured')})
 await act(async()=>assert.doesNotThrow(()=>observer.callback()))
})

test('StrictMode effect replay cannot let a cleaned AnnotationControls observer measure or update the current toolbar',async t=>{
 const view=await render(t,({AnnotationControls})=>React.createElement(React.StrictMode,null,React.createElement(AnnotationControls,props)))
 const [old,current]=view.observers;assert.ok(old.disconnected);assert.equal(current.disconnected,undefined)
 let measurements=0;Object.defineProperty(current.element,'offsetWidth',{configurable:true,get:()=>{measurements++;return 320}})
 await act(async()=>old.callback());assert.equal(measurements,0)
 await act(async()=>current.callback());assert.equal(measurements,1);assert.equal(current.element.style.left,'440px')
})

test('the real LiveBrowser Page ignores its retained frame ResizeObserver after owning connection unmount',async t=>{
 const api=createWorkspace(undefined,null,{live:true,accounts:[{id:'native'}]});api.login('native');const chat=api.newChat(),url='https://example.test/'
 api.openTool(chat.id,'浏览器');api.updateBrowser(chat.id,data=>editBrowserAnnotation(navigateBrowser(data,url),url,{open:true}))
 const previewPage={current:null},view=await render(t,({LiveBrowser})=>React.createElement(LiveBrowser,{chat,api,partition:'persist:owner',visible:true,refresh(){},report(){},previewPage,availableTools:['浏览器']}))
 const frame=view.element.querySelector('.live-browser-frame'),observer=view.observers.find(entry=>entry.element===frame)
 assert.ok(observer);await act(async()=>observer.callback())
 await view.close();assert.equal(observer.disconnected,true);assert.equal(previewPage.current,null)
 Object.defineProperty(frame,'clientWidth',{configurable:true,get:()=>assert.fail('disposed browser frame measured')})
 await act(async()=>assert.doesNotThrow(()=>observer.callback()))
})
