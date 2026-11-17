import test from 'node:test'
import assert from 'node:assert/strict'
import {browserViewport} from '../src/browser-viewport.mjs'
import {React,act,harness,click} from './helpers/native-react-harness.mjs'
const entry=`import {useState} from 'react';import {BrowserViewportControls,BrowserViewportFrame} from './src/browser-viewport.jsx';import {browserViewport} from './src/browser-viewport.mjs';export {BrowserViewportFrame};export function ViewportHarness(){const [settings,setSettings]=useState(browserViewport({enabled:true}));return <><BrowserViewportControls settings={settings} onChange={patch=>setSettings(s=>browserViewport({...s,...patch}))}/><output>{JSON.stringify(settings)}</output></>}`
async function input(element,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))})}
async function enter(element){await act(async()=>element.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})))}
test('real controls commit custom dimensions, retain valid viewport on invalid input, rotate and select presets',async t=>{
 const h=await harness(t,entry);await h.render(React.createElement(h.ViewportHarness))
 const width=h.element.querySelector('[aria-label="预览宽度"]'),height=h.element.querySelector('[aria-label="预览高度"]')
 const state=()=>JSON.parse(h.element.querySelector('output').textContent)
 await input(width,'199');await enter(width);assert.equal(state().width,393);assert.match(h.element.querySelector('[role=alert]').textContent,/200–3840/)
 await input(width,'380');await enter(width);assert.equal(state().width,380);assert.equal(state().presetId,'custom');assert.equal(h.element.querySelector('[role=alert]'),null)
 await click(h.element.querySelector('[aria-label="切换横竖屏"]'));assert.equal(state().width,852);assert.equal(state().height,380)
 const preset=h.element.querySelector('[aria-label="预览设备型号"]')
 await act(async()=>{preset.value='pixel-7';preset.dispatchEvent(new Event('change',{bubbles:true}))})
 assert.equal(width.value,'412');assert.equal(height.value,'915');assert.equal(state().presetId,'pixel-7')
})
test('viewport mode and zoom retain the same guest node; disposed ResizeObservers cannot measure it',async t=>{
 const observers=[],previous=globalThis.ResizeObserver
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;observers.push(this)}observe(element){this.element=element}disconnect(){this.disconnected=true}}
 t.after(()=>{globalThis.ResizeObserver=previous})
 const h=await harness(t,entry)
 const render=settings=>h.render(React.createElement(h.BrowserViewportFrame,{settings:browserViewport(settings)},React.createElement('webview',{'data-testid':'guest'})))
 await render({enabled:false});const guest=h.element.querySelector('webview')
 await render({enabled:true,width:360,height:800,zoom:'50'});assert.equal(h.element.querySelector('webview'),guest)
 assert.equal(h.element.querySelector('.browser-viewport-content').style.width,'360px');assert.equal(h.element.querySelector('.browser-viewport-content').style.transform,'scale(0.5)')
 await render({enabled:false});assert.equal(h.element.querySelector('webview'),guest);assert.equal(h.element.querySelector('.browser-viewport-content').style.transform,'')
 await h.render(null);const observer=observers[0];assert.equal(observer.disconnected,true)
 Object.defineProperty(observer.element,'clientWidth',{get:()=>assert.fail('disposed stage measured')})
 await act(async()=>observer.callback())
})
