import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {nativeFiles} from '../src/native-desktop-files.mjs'
const require=createRequire(import.meta.url)
const entries=[{name:'unknown.txt',isDirectory:false},{name:'empty.txt',isDirectory:false,byteSize:0},{name:'known.txt',isDirectory:false,byteSize:4096}]
async function list(){const calls=[];const files=nativeFiles({host:{getConnectionFor:async()=>({mode:'local'})},route:{connectionId:'local',profile:'default'},rpc:async method=>method==='session.resume'?{info:{cwd:'/project'}}:{projects:[]},api:async path=>{calls.push(path);return{entries}}});return{listing:await files.files('list','owned-session',undefined,[]),calls}}
test('native directory listing retains unknown size without fabricating zero and adds no per-file I/O',async()=>{
 const {listing,calls}=await list();assert.deepEqual(listing.entries.map(entry=>entry.size),[undefined,0,4096]);assert.deepEqual(calls,['/api/fs/list?path=%2Fproject&session_id=owned-session'])
})
test('the real file list labels unknown size as a file while preserving real zero and known byte counts',async()=>{
 const result=await build({stdin:{contents:"export {LiveFiles} from './src/live-files.jsx'",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','@tabler/icons-react']}),module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports)
 const {listing}=await list(),html=renderToStaticMarkup(React.createElement(module.exports.LiveFiles,{chat:{toolEdits:{}},api:{},thumbnail:true,state:{path:{parts:[]},listing,directory:{data:listing},navigate(){}}}))
 for(const [name,label] of [['unknown.txt','文件'],['empty.txt','0 B'],['known.txt','4 KB']])assert.match(html,new RegExp(name.replace('.','\\.')+'</span><small>'+label+'</small>'))
 assert.doesNotMatch(html,/NaN/)
})
