import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTerminalFontFamily, terminalClipboardIntent, droppedTerminalPaths, quoteTerminalPaths, activateTerminalLink } from '../src/terminal-interactions.mjs'
import { nativeTerminal } from '../src/native-desktop-terminal.mjs'
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(storageValues=new Map()) {
  let output
  const calls=[],storage={getItem:key=>storageValues.get(key)??null,setItem:(key,value)=>storageValues.set(key,value),removeItem:key=>storageValues.delete(key)}
  const host={terminal:{start:async options=>{calls.push(['start',options]);return{id:'pty',cwd:options.cwd,shell:'zsh'}},onData:(_id,fn)=>{output=fn;return()=>{}},onExit:()=>()=>{},attach:async()=>true,dispose:async()=>true,write:async()=>true,resize:async()=>true,cwd:async()=>'/updated'},
    api:async request=>{calls.push(['api',request]);return request.method==='PUT'?{ok:true}:{terminal:{font_family:'MesloLGS NF',env:{PRIVATE:'hidden'}}}},writeClipboard:async text=>{calls.push(['clipboard',text]);return true},readClipboard:async()=> 'pasted',getPathForFile:file=>file.path,openExternal:async url=>{calls.push(['external',url]);return true}}
  const api=nativeTerminal({host,rpc:async()=>({info:{cwd:'/project'}}),route:{connectionId:'local',profile:'writer'},stops:new Set(),check:()=>{},storage})
  return{api,host,calls,storageValues,output:value=>output(value)}
}

test('terminal clipboard chords retain Ctrl-C interrupt and require the platform copy/paste modifier',()=>{
  const key=(value,extras={})=>({type:'keydown',key:value,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,...extras})
  assert.equal(terminalClipboardIntent(key('c',{ctrlKey:true}),{isMac:true,hasSelection:false}),null)
  assert.equal(terminalClipboardIntent(key('c',{metaKey:true}),{isMac:true,hasSelection:true}),'copy')
  assert.equal(terminalClipboardIntent(key('v',{metaKey:true}),{isMac:true,hasSelection:false}),'paste')
  assert.equal(terminalClipboardIntent(key('c',{ctrlKey:true}),{isMac:false,hasSelection:true}),'copy')
})

test('terminal drops use native file paths once and quote shell arguments without controls or Enter',()=>{
  const transfer={types:['application/x-hermes-paths'],getData:()=>JSON.stringify([{path:'/work/a b'},{path:'/work/a b'}]),files:[{path:"/work/it's;$x"}]}
  const paths=droppedTerminalPaths(transfer,file=>file.path)
  const result=quoteTerminalPaths([...paths,'/bad\ncommand'],'zsh')
  assert.deepEqual(paths,['/work/a b',"/work/it's;$x"])
  assert.equal(result.text,"'/work/a b' '/work/it'\\''s;$x' ")
  assert.deepEqual(result.refused,['/bad\ncommand']);assert.equal(result.text.includes('\n'),false)
  assert.equal(quoteTerminalPaths(['/with space'],'ssh').text,'')
})

test('terminal links need a trusted modified user click and route preview/native separately',async()=>{
  const calls=[],handlers={isMac:true,onPreview:url=>calls.push(['preview',url]),openExternal:url=>calls.push(['external',url])}
  const click={isTrusted:true,metaKey:true,ctrlKey:false,shiftKey:false}
  assert.equal(await activateTerminalLink({...click,isTrusted:false},'https://example.com',handlers),false)
  assert.equal(await activateTerminalLink({...click,metaKey:false},'https://example.com',handlers),false)
  assert.equal(await activateTerminalLink(click,'javascript:alert(1)',handlers),false)
  assert.equal(await activateTerminalLink(click,'https://example.com/page',handlers),true)
  assert.equal(await activateTerminalLink({...click,shiftKey:true},'https://example.com/page',handlers),true)
  assert.deepEqual(calls,[['preview','https://example.com/page'],['external','https://example.com/page']])
})

test('font preferences use scoped native config and sparse writes without projecting other terminal settings',async()=>{
  const f=fixture();assert.equal(await f.api.terminalFont(),'MesloLGS NF')
  await f.api.terminalFont(' SF Mono ')
  assert.deepEqual(f.calls.filter(row=>row[0]==='api').at(-1)[1],{connectionId:'local',profile:'writer',path:'/api/config',method:'PUT',body:{config:{terminal:{font_family:'SF Mono'}}}})
  assert.match(resolveTerminalFontFamily('SF Mono'),/^'SF Mono',/)
})

test('terminal relaunch restores bounded presentation and last cwd into a new native shell without replaying input',async()=>{
  const values=new Map(),first=fixture(values)
  const response=await first.api.terminalOpen('s',80,24,new AbortController().signal,'one')
  await first.api.terminalSaveSnapshot('s','one',{text:Array.from({length:250},(_,i)=>'line-'+i).join('\n')})
  await response.body.cancel()
  const next=fixture(values),reopened=await next.api.terminalOpen('s',80,24,new AbortController().signal,'one')
  assert.equal(next.calls.find(row=>row[0]==='start')[1].cwd,'/updated')
  const reader=reopened.body.getReader();let frames=[]
  for(let i=0;i<4;i++){const value=await reader.read();frames.push(...new TextDecoder().decode(value.value).trim().split('\n').filter(Boolean).map(JSON.parse));if(frames.some(f=>f.type==='replay-end'))break}
  const text=frames.filter(f=>f.type==='output').map(f=>Buffer.from(f.data,'base64').toString()).join('')
  assert.equal(text.includes('line-0\n'),false);assert.ok(text.includes('line-249'))
  assert.equal(frames.find(f=>f.type==='open').shell,'zsh')
  assert.equal(next.calls.some(row=>row[0]==='write'),false)
  await reader.cancel()
})

test('context commands copy xterm selection, paste via bracketed paste, and clear display without shell input',async()=>{
  const {createTerminalCommands}=await import('../src/terminal-interactions.mjs')
  const calls=[];let current=true,resolve
  const terminal={getSelection:()=> 'selected',paste:text=>calls.push(['paste',text]),focus:()=>{},clear:()=>calls.push(['clear']),selectAll:()=>calls.push(['all'])}
  const commands=createTerminalCommands({terminal,isCurrent:()=>current,clipboard:async(action,text)=>{calls.push([action,text]);return 'clipboard'},onClear:()=>calls.push(['clear-history'])})
  await commands.copy();await commands.paste();commands.clear();commands.selectAll()
  assert.deepEqual(calls,[['write','selected'],['read',undefined],['paste','clipboard'],['clear'],['clear-history'],['all']])
  const late=createTerminalCommands({terminal,isCurrent:()=>current,clipboard:()=>new Promise(done=>{resolve=done})})
  const pending=late.paste();current=false;resolve('wrong owner');await pending
  assert.equal(calls.some(row=>row[1]==='wrong owner'),false)
})

test('terminal control rejects a stale tool instance and a host-declined write instead of reporting success',async()=>{
  const f=fixture(),response=await f.api.terminalOpen('s',80,24,new AbortController().signal,'one')
  const reader=response.body.getReader(),frame=JSON.parse(new TextDecoder().decode((await reader.read()).value))
  await assert.rejects(f.api.terminalControl({action:'write',session_id:'s',instance_id:'other',viewer_id:frame.viewer_id,data:'text'}),/归属/)
  f.host.terminal.write=async()=>false
  await assert.rejects(f.api.terminalControl({action:'write',session_id:'s',instance_id:'one',viewer_id:frame.viewer_id,data:'text'}),/关闭/)
  await assert.rejects(f.api.terminalControl({action:'unknown',session_id:'s',viewer_id:frame.viewer_id}),/支持/)
  await reader.cancel()
})
