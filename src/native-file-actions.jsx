import React from 'react'
import {IconButton} from './icons.jsx'
import {Confirm,Dialog,Field} from './management-ui.jsx'

export function NativeFileActions({entry,state}) {
 const selected=state.selected?.name===entry.name
 return <IconButton icon="more" label={'文件操作 · '+entry.name} onClick={()=>state.fileActions.open(entry,{
   root:state.listing.root,parts:state.path.parts,preview:selected?state.file?.data:null,local:state.listing.localFiles})} />
}
export function NativeFileDrafts({controller}) {
 const state=controller?.snapshot()
 if(state?.active||!state?.drafts.length)return null
 return <div role="status"><p>此会话有未保存的文件草稿，仅保留在当前窗口内存中。</p>
   {state.drafts.map(file=><button key={file.id} type="button" className="secondary" onClick={()=>controller.resume(file.id)}>继续编辑 {file.entry.name}</button>)}
 </div>
}
export function NativeFileDialog({controller}) {
 const state=controller?.snapshot(),file=state?.active
 if(!file)return null
 const {entry,mode,error,draft,baseline,local,preview}=file
 const close=()=>{if(mode==='edit'&&draft!==baseline){if(!window.confirm('放弃尚未保存的文件修改？'))return;controller.dismiss(true)}else controller.dismiss()}
 const execute=async(action,params)=>{await controller.execute(action,params);return false}
 const location=[file.root,...file.parts,entry.name].join('/').replace(/\/{2,}/g,'/')
 if(mode==='menu')return <Dialog title={entry.name} onClose={close} submit={null}>
   <p className="muted">{location}</p><div className="management-tags">
   <button type="button" className="secondary" disabled={state.busy} onClick={()=>void execute('copyAbsolute')}>复制绝对路径</button>
   <button type="button" className="secondary" disabled={state.busy} onClick={()=>void execute('copyRelative')}>复制相对路径</button>
   {local&&<><button type="button" className="secondary" disabled={state.busy} onClick={()=>void execute('reveal')}>在 Finder 中显示</button>
     <button type="button" className="secondary" disabled={state.busy} onClick={()=>controller.mode('rename')}>重命名…</button>
     <button type="button" className="secondary" disabled={state.busy} onClick={()=>controller.mode('trash')}>移到废纸篓…</button></>}
   {!entry.directory&&preview?.text!==undefined&&!preview.truncated&&<button type="button" className="secondary" disabled={state.busy} onClick={()=>controller.edit()}>编辑文本…</button>}
   </div>{!entry.directory&&!preview&&<p className="muted">先选择并预览此文件，即可编辑可用的完整文本。</p>}
   {!local&&<p className="muted">远端文件可编辑、复制路径或下载；Finder、重命名和废纸篓仅用于本机文件。</p>}
   {error&&<p role="alert" className="management-error">{error}</p>}
 </Dialog>
 if(mode==='rename')return <Dialog title={'重命名 '+entry.name} onClose={close} submit="重命名" onSubmit={form=>execute('rename',{name:String(form.get('name')??'')})}><Field name="name" label="新名称" defaultValue={entry.name} required autoFocus />{error&&<p role="alert">{error}</p>}</Dialog>
 if(mode==='trash')return <Confirm title={'将 '+entry.name+' 移到废纸篓？'} submit="移到废纸篓" onClose={close} onConfirm={()=>execute('trash')}>文件将由原生系统废纸篓保管。{error&&<p role="alert" className="management-error">{error}</p>}</Confirm>
 return <Dialog title={'编辑 '+entry.name} onClose={close} submit="保存" onSubmit={()=>execute('write',{content:draft,expectedText:baseline})}>
   <p className="muted">{location}</p>
   <textarea aria-label="文件文本" value={draft} onChange={event=>controller.change(event.target.value)} style={{width:'100%',minHeight:350,fontFamily:'monospace'}} />
   {error&&<p role="alert" className="management-error">{error}</p>}
 </Dialog>
}
