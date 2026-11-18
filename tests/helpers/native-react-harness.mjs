import { createRequire } from 'node:module'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const requireFrontend=createRequire(new URL('../../package.json',import.meta.url))
const coreRoot=process.env.AIWATA_APP_SOURCE || fileURLToPath(new URL('../../../aiwata',import.meta.url))
const requireCore=createRequire(join(coreRoot,'apps/desktop/package.json'))
const {JSDOM}=requireCore('jsdom')
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true})
for(const name of ['window','document','navigator','HTMLElement','HTMLDialogElement','Event','MouseEvent','FormData'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
globalThis.ResizeObserver=class {observe(){}disconnect(){}}
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
window.HTMLDialogElement.prototype.close=function(){this.open=false}
window.confirm=()=>true
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window)
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window)
export const React=await import('react')
const {createRoot}=await import('react-dom/client')
export const act=React.act
export async function harness(t,extra=''){
 const temp=await mkdtemp(join(tmpdir(),'aiwata-owned-ui-'))
 const output=join(temp,'harness.mjs')
 const result=await build({stdin:{contents:`import React from 'react';import {useLiveGit,LiveGit} from './src/live-git.jsx';import {useLiveFiles,LiveFiles} from './src/live-files.jsx';import {NativeFileDialog} from './src/native-file-actions.jsx';export {NativeLegacyCacheNotice} from './src/native-legacy-cache-notice.jsx';export function GitHarness(props){const state=useLiveGit(props);props.inspect(state);return <output data-busy={state.mutation.busy}>{state.mutation.error}</output>}export function GitViewHarness(props){const state=useLiveGit(props);return <div className="tool-scroll"><LiveGit state={state} chat={props.chat} api={props.api} visible/></div>}export function FilesHarness(props){const state=useLiveFiles(props);props.inspect(state);return <><NativeFileDialog controller={state.fileActions}/>{props.showPane!==false&&<div className="tool-scroll"><LiveFiles state={state} chat={props.chat} api={props.api} visible/></div>}</>}
${extra}`,resolveDir:resolve('.'),loader:'jsx'},bundle:true,write:false,platform:'node',format:'esm',loader:{'.css':'empty'},plugins:[{name:'shared-react',setup(builder){builder.onResolve({filter:/^react(?:\/jsx(?:-dev)?-runtime)?$|^@tabler\/icons-react$/},args=>({path:pathToFileURL(requireFrontend.resolve(args.path)).href,external:true}))}}]})
 await writeFile(output,result.outputFiles[0].contents)
 const modules=await import(pathToFileURL(output).href)
 const element=document.createElement('div');document.body.append(element);const root=createRoot(element)
 t.after(async()=>{await act(async()=>root.unmount());element.remove();await rm(temp,{recursive:true,force:true})})
 return {...modules,element,render:async component=>act(async()=>root.render(component))}
}
export async function click(element){if(!element)throw Error('Expected live UI control missing');await act(async()=>element.dispatchEvent(new MouseEvent('click',{bubbles:true})))}
export async function edit(element,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))})}
