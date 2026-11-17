import test from 'node:test'
import assert from 'node:assert/strict'
import {React,harness,click} from './helpers/native-react-harness.mjs'

test('an ambient tip preserves composer focus and other controls without a tour overlay',async t=>{
 const h=await harness(t,`export {DesktopTip} from './src/desktop-tip.jsx'`)
 const anchor=document.createElement('textarea');anchor.id='tip-target';anchor.getBoundingClientRect=()=>({left:300,right:450,top:300,bottom:330,width:150,height:30})
 const other=document.createElement('button');document.body.append(anchor,other);t.after(()=>{anchor.remove();other.remove()})
 let clicks=0,closed=0;other.onclick=()=>clicks++;anchor.focus()
 await h.render(React.createElement(h.DesktopTip,{tip:{selector:'#tip-target',text:'审计提示',title:'提示',side:'top'},onClose:()=>closed++}))
 assert.match(h.element.querySelector('[role="status"]').textContent,/审计提示/)
 assert.equal(document.activeElement,anchor);assert.equal(document.querySelector('.driver-overlay'),null)
 assert.equal(document.body.classList.contains('driver-active'),false)
 await click(other);assert.equal(clicks,1)
 await click(h.element.querySelector('[aria-label="关闭提示"]'));assert.equal(closed,1)
 await h.render(null);assert.equal(anchor.hasAttribute('data-tip-target'),false)
})


test('the tip reports success only after its positioned bubble has rendered',async t=>{
 const h=await harness(t,`export {DesktopTip} from './src/desktop-tip.jsx'`)
 const anchor=document.createElement('textarea');anchor.id='confirmed-tip';anchor.getBoundingClientRect=()=>({left:300,right:450,top:300,bottom:330,width:150,height:30});document.body.append(anchor);t.after(()=>anchor.remove())
 let shown=false
 await h.render(React.createElement(h.DesktopTip,{tip:{selector:'#confirmed-tip',text:'Visible',onReady:()=>{shown=h.element.querySelector('.desktop-tip')?.style.visibility==='visible'}},onClose(){}}))
 assert.equal(shown,true)
})


test('the native tip request rejects an absent selector and returns confirmation from the real bubble',async t=>{
 const h=await harness(t,`export {DesktopTip} from './src/desktop-tip.jsx';export {requestDesktopTip} from './src/desktop-tip-request.mjs'`)
 const anchor=document.createElement('textarea');anchor.id='requested-tip';anchor.setAttribute('aria-label','Agent 输入框');anchor.getBoundingClientRect=()=>({left:300,right:450,top:300,bottom:330,width:150,height:30});document.body.append(anchor);t.after(()=>anchor.remove())
 let tip
 const missing=await h.requestDesktopTip({doc:document,payload:{selector:'[contenteditable="true"]',text:'Missing'},present:value=>{tip=value}})
 assert.equal(missing.success,false);assert.equal(tip,undefined);assert.equal(missing.targets[0].selector,'#requested-tip')
 const pending=h.requestDesktopTip({doc:document,payload:{selector:'#requested-tip',text:'Displayed'},present:value=>{tip=value;return()=>{}}})
 await h.render(React.createElement(h.DesktopTip,{tip,onClose(){}}))
 assert.deepEqual(await pending,{success:true,display_confirmed:true,selector:'#requested-tip'})
 assert.equal(h.element.querySelector('.desktop-tip').style.visibility,'visible')
 assert.equal(document.querySelector('.driver-overlay'),null)
})


test('development StrictMode effect replay cannot reject a displayed tip',async t=>{
 const h=await harness(t,`export {DesktopTip} from './src/desktop-tip.jsx';export {requestDesktopTip} from './src/desktop-tip-request.mjs'`)
 const anchor=document.createElement('textarea');anchor.id='strict-tip';anchor.getBoundingClientRect=()=>({left:300,right:450,top:300,bottom:330,width:150,height:30});document.body.append(anchor);t.after(()=>anchor.remove())
 let tip
 const pending=h.requestDesktopTip({doc:document,payload:{selector:'#strict-tip',text:'Strict visible'},present:value=>{tip=value;return()=>{}}})
 await h.render(React.createElement(React.StrictMode,null,React.createElement(h.DesktopTip,{tip,onClose(){}})))
 assert.equal((await pending).display_confirmed,true)
 assert.equal(h.element.querySelector('.desktop-tip').style.visibility,'visible')
})
