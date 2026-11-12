import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeUpdateController } from '../src/native-update-controller.mjs'
const atom=value=>({get:()=>value,listeners:new Set(),set(next){value=next;for(const fn of this.listeners)fn()},listen(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}})
function fixture(){const status=atom({supported:true,updateAvailable:true,branch:'main'}),checking=atom(false),apply=atom({applying:false,stage:'idle',message:'',log:[]}),version=atom(null),calls=[];let listener,current=true
 const original={$updateStatus:status,$updateChecking:checking,$updateApply:apply,$desktopVersion:version,
 checkUpdates:async options=>{calls.push(['check',options]);return status.get()},applyUpdates:async()=>{calls.push(['apply']);apply.set({applying:false,stage:'done',message:'done',log:[]});return{ok:true}}}
 const host={updates:{onProgress:fn=>{listener=fn;return()=>{listener=null}}}},controller=createNativeUpdateController({host,original,isCurrent:()=>current,onChange:()=>{}})
 return{controller,calls,status,checking,apply,version,progress:value=>listener?.(value),logout:()=>{current=false},listener:()=>listener}}

test('opening updates only checks; applying requires an explicit confirmation call',async()=>{const f=fixture();await f.controller.open();assert.deepEqual(f.calls,[['check',{force:true}]]);assert.equal(f.controller.snapshot().open,true);await f.controller.apply(false);assert.equal(f.calls.some(row=>row[0]==='apply'),false);await f.controller.apply(true);assert.equal(f.calls.filter(row=>row[0]==='apply').length,1);f.controller.dispose()})
test('retired or unsupported updates never invoke installer',async()=>{for(const status of [{supported:false},{supported:true,retirement:{message:'retired'}}]){const f=fixture();f.status.set(status);await f.controller.apply(true);assert.equal(f.calls.some(row=>row[0]==='apply'),false);f.controller.dispose()}})
test('native progress is visible and disposal drops every listener',()=>{const f=fixture();f.progress({stage:'rebuild',message:'building',percent:25,error:null});assert.equal(f.controller.snapshot().progress.message,'building');f.controller.dispose();assert.equal(f.listener(),null);for(const store of [f.status,f.checking,f.apply,f.version])assert.equal(store.listeners.size,0)})
test('owner logout cannot start a client update',async()=>{const f=fixture();f.logout();await f.controller.apply(true);assert.equal(f.calls.length,0);f.controller.dispose()})

test('update presentation contains localized status without raw logs, commands, or managed-package diagnostics', async () => {
  const { nativeUpdatePresentation } = await import('../src/native-update-controller.mjs')
  const view=nativeUpdatePresentation({status:{supported:false,message:'managed_package update is not supported'},apply:{stage:'manual',command:'cmd.secret',message:'cmd.secret',log:[{message:'long diagnostic'}]},progress:{message:'raw output'}})
  assert.doesNotMatch(JSON.stringify(view),/managed_package|cmd\.secret|long diagnostic|raw output/)
  assert.match(view.status,/安装|自动更新/);assert.match(view.progress,/安装|更新/)
})

test('update diagnostics uses the original platform-specific shortcut and rejects ambiguous modifiers', async () => {
  const { nativeUpdateDiagnosticsShortcut } = await import('../src/native-update-controller.mjs')
  const mac={key:'L',metaKey:true,ctrlKey:false,shiftKey:true,altKey:false,repeat:false}
  assert.equal(nativeUpdateDiagnosticsShortcut(mac,'MacIntel'),true)
  assert.equal(nativeUpdateDiagnosticsShortcut({...mac,ctrlKey:true},'MacIntel'),false)
  assert.equal(nativeUpdateDiagnosticsShortcut({...mac,altKey:true},'MacIntel'),false)
  assert.equal(nativeUpdateDiagnosticsShortcut({...mac,repeat:true},'MacIntel'),false)
  assert.equal(nativeUpdateDiagnosticsShortcut({...mac,metaKey:false,ctrlKey:true},'Win32'),true)
})

test('diagnostic copying preserves original stage-line formatting through the original selection helper', async () => {
  const copied=[],notice=[],listeners=new Map(),f=fixture()
  f.apply.set({applying:false,stage:'error',message:'failed',error:'failure fact',log:[{stage:'download',message:'read-only log'}]})
  const environment={navigator:{platform:'MacIntel',clipboard:{writeText:async()=>{throw Error('unexpected fallback')}}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name),setTimeout,clearTimeout}
  const controller=createNativeUpdateController({host:{},original:{$updateStatus:f.status,$updateChecking:f.checking,$updateApply:f.apply,$desktopVersion:f.version,checkUpdates:async()=>{},applyUpdates:async()=>{}},isCurrent:()=>true,onChange:()=>notice.push(controller.snapshot().notice),environment,copySelection:text=>{copied.push(text);return true}})
  await controller.open();let prevented=false
  listeners.get('keydown')({key:'l',metaKey:true,ctrlKey:false,shiftKey:true,altKey:false,repeat:false,preventDefault:()=>{prevented=true}})
  assert.equal(prevented,true);assert.equal(copied[0],'[download] read-only log\nfailure fact');assert.equal(controller.snapshot().notice,'copied')
  controller.dispose();f.controller.dispose();assert.equal(listeners.size,0)
})

test('hidden diagnostics retains each native progress line rather than only the most recent one', async () => {
  const { nativeUpdateDiagnostics }=await import('../src/native-update-controller.mjs')
  const f=fixture();f.progress({stage:'download',message:'first native line',percent:10});f.progress({stage:'rebuild',message:'second native line',percent:null})
  assert.equal(nativeUpdateDiagnostics(f.controller.snapshot()),'[download] first native line\n[rebuild] second native line')
  f.controller.dispose()
})
