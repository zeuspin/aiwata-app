import test from 'node:test'
import assert from 'node:assert/strict'
import {browserViewport, updateBrowserViewport, viewportLayout, scaleViewportRect} from '../src/browser-viewport.mjs'
import {createWorkspace} from '../src/workspace.mjs'
import {browserState} from '../src/tool-tabs.mjs'

test('viewport settings keep valid dimensions and reject corrupt saved values',()=>{
 assert.deepEqual(browserViewport(),{enabled:false,presetId:'iphone-16',width:393,height:852,zoom:'fit'})
 assert.equal(browserViewport({width:0,height:Infinity,zoom:'bad'}).width,393)
 assert.equal(browserViewport({width:400,height:800,presetId:'iphone-16'}).presetId,'custom')
 assert.equal(browserViewport({width:852,height:393,presetId:'iphone-16'}).presetId,'iphone-16')
 assert.equal(browserViewport({enabled:'true'}).enabled,false)
})
test('fit scales presentation without changing the logical viewport; fixed zoom allows overflow',()=>{
 const settings=browserViewport({enabled:true})
 const fit=viewportLayout(settings,{width:300,height:600})
 assert.equal(fit.width,393);assert.equal(fit.height,852);assert.equal(fit.scale,600/852)
 assert.equal(viewportLayout({...settings,zoom:'200'},{width:300,height:600}).scale,2)
 assert.equal(viewportLayout(settings,{width:2000,height:2000}).scale,1)
 assert.deepEqual(scaleViewportRect({x:40,y:60,width:100,height:80},{left:12,top:16,scale:.5}),{x:32,y:46,width:50,height:40})
})
test('viewport persists per browser instance without changing page/history/annotations or another account',()=>{
 const saved=new Map(),storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}
 const api=createWorkspace(storage);api.login('lin');api.openTool('plan','浏览器');const first=api.getChat('plan').tool
 api.updateBrowser('plan',b=>updateBrowserViewport(b,{enabled:true,presetId:'pixel-7',width:412,height:915}),first)
 api.openTool('plan','浏览器',undefined,{newInstance:true});const second=api.getChat('plan').tool
 const restored=createWorkspace(storage);restored.login('lin')
 assert.equal(browserViewport(browserState(restored.getChat('plan'),first).viewport).width,412)
 assert.equal(browserViewport(browserState(restored.getChat('plan'),second).viewport).enabled,false)
 const original={history:['one'],annotations:[{id:1}],visited:'one'}
 const next=updateBrowserViewport(original,{enabled:true});assert.equal(next.history,original.history);assert.equal(next.annotations,original.annotations);assert.equal(next.visited,'one')
 assert.equal(restored.login('qiao'),true);assert.equal(browserViewport(browserState(restored.getChat('plan'),first).viewport).enabled,false)
})
