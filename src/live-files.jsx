import React, { useEffect, useRef, useState } from 'react'
import { attachmentSizeLimit } from './composer.mjs'
import { Icon, IconButton } from './icons.jsx'
import { useReadingPosition } from './surfaces.jsx'
import { createNativeFileEditor } from './native-file-editor-state.mjs'
import { NativeFileActions, NativeFileDrafts } from './native-file-actions.jsx'
import { useLiveQuery } from './live-query.jsx'

export const liveFileTool = '文件与产物'
const emptyPath = { parts: [] }

export function useLiveFiles({ live, chat, project, visible, api, refresh, report }) {
  const [revision, setRevision] = useState(0)
  const [inFlight, setInFlight] = useState(null)
  const operation = useRef(null)
  const priorRun = useRef(null)
  const [,refreshEditor]=useState(0)
  const editor=useRef(null)
  const editorOwner=useRef(null)
  if(!editor.current)editor.current=createNativeFileEditor({onChange:()=>refreshEditor(value=>value+1),
    operate:async(owned,file,action,params,signal)=>{
      if(operation.current)throw new Error('另一个文件操作尚未完成。')
      if(owned.api.accountId!==owned.accountId||owned.api.getChat(owned.chat.id)!==owned.chat)throw new Error('文件所属会话已变化。')
      const result=await owned.live.manageFile(action,owned.sessionId,file.root,[...file.parts,file.entry.name],params,signal)
      signal.throwIfAborted()
      if(owned.api.accountId!==owned.accountId||owned.api.getChat(owned.chat.id)!==owned.chat)throw new Error('文件所属会话已变化。')
      setRevision(value=>value+1)
      return result
    }})
  editorOwner.current={live,chat,api,accountId:api.accountId,scopeIdentity:live?.scopeIdentity,connectionId:live?.route?.connectionId,profile:chat?.gatewayProfile||live?.route?.profile||'default',sessionId:chat?.gatewayStoredId,visible}
  editor.current.bind(editorOwner.current)
  useEffect(()=>{editor.current.bind(editorOwner.current);return()=>editor.current.dispose()},[])
  const session = visible ? chat?.gatewayStoredId : null
  const running = Boolean(chat?.pending)
  const path = chat?.toolEdits?.liveFiles ?? emptyPath
  const scope = JSON.stringify([project?.id, project?.folder, project?.folders, revision])
  const directory = useLiveQuery(live, 'files', session && ['list', session, path.root, path.parts], scope)
  const listing = directory?.data
  const selected = listing?.entries.find(entry => !entry.directory && entry.name === path.selected)
    ?? (listing && path.exact && path.selected ? { name: path.selected } : listing?.entries.find(entry => !entry.directory))
  const file = useLiveQuery(live, 'files', session && selected && ['preview', session, listing.root, [...path.parts, selected.name]], scope)
  const selectionKey = JSON.stringify([chat?.id, session, listing?.root, path.parts, selected?.name, scope])

  useEffect(() => {
    if (session && priorRun.current?.session === session && priorRun.current.running && !running) {
      setRevision(value => value + 1)
    }
    priorRun.current = { session, running }
  }, [session, running])

  useEffect(() => () => {
    operation.current?.abort()
    operation.current = null
  }, [live, selectionKey])

  function navigate(root, parts, selectedName) {
    api.updateToolEdits(chat.id, () => ({ liveFiles: { root, parts, selected: selectedName } }))
    refresh()
  }

  async function transfer(attach) {
    if (!file?.data || operation.current || editor.current.snapshot().busy) return
    const controller = new AbortController()
    operation.current = controller
    setInFlight(controller)
    try {
      const data = await live.files('read', session, listing.root, [...path.parts, selected.name], controller.signal)
      if (controller.signal.aborted || api.getChat(chat.id) !== chat) return
      const bytes = Uint8Array.fromBase64(data.data_base64)
      if (attach) {
        if (!bytes.length) throw new Error('空文件无法作为 AIWATA 附件。')
        const result = await api.addLocalAttachments(chat.id, [new File([bytes], data.name, { type: data.mime })])
        if (!result.ok && !result.cancelled) throw new Error('无法保存会话附件。')
        if (controller.signal.aborted || !result.ok) return
        refresh()
        report(result.duplicate ? '草稿中已有同名附件。' : '已添加到当前会话。')
      } else {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
        const link = document.createElement('a')
        link.href = url
        link.download = data.name
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (error) {
      if (!controller.signal.aborted) report(error.message, true)
    } finally {
      if (operation.current === controller) operation.current = null
      setInFlight(current => current === controller ? null : current)
    }
  }

  return {
    fileActions:editor.current,path, directory, listing, selected, file, navigate, transfer, busy: editor.current.snapshot().busy || inFlight !== null && inFlight === operation.current,
    reload: () => setRevision(value => value + 1),
  }
}

export function LiveFiles({ state, chat, api, visible = false, thumbnail = false }) {
  const content = useRef(null)
  const { path, directory, listing, selected, file, navigate, transfer, busy, reload } = state
  const preview = file?.data
  const root = listing?.roots.find(entry => entry.id === listing.root)
  const title = [root?.label, ...path.parts].filter(Boolean).join(' / ')
  useReadingPosition({ chat, api, contentRef: content, visible,
    scope: preview && JSON.stringify(['live-file', listing.root, ...path.parts, selected.name]) })

  return <div className="tool-home tool-detail" ref={content}>
    <header className="tool-detail-header"><div><h3>文件与产物</h3><p>{title || '当前会话的工作目录'}</p></div>
      {!thumbnail && <IconButton icon="refresh" label="刷新文件" onClick={reload} />}</header>
    {!thumbnail && <NativeFileDrafts controller={state.fileActions} />}
    {!thumbnail && listing?.roots.length > 1 && <label className="tool-field">项目文件夹
      <select aria-label="项目文件夹" value={listing.root} onChange={event => navigate(event.target.value, [])}>
        {listing.roots.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select>
    </label>}
    {!thumbnail && path.parts.length > 0 && <button className="tool-text-button" onClick={() => navigate(path.root, path.parts.slice(0, -1))}>
      返回上一级
    </button>}
    {!directory ? <p role="status">正在读取目录…</p> : directory.error ? <div>
      <p role="alert" className="management-error">{directory.error}</p>
      {!thumbnail && <button className="tool-text-button" onClick={() => navigate(undefined, [])}>返回工作目录</button>}
    </div> : <>
      {listing.entries.length ? <ul className="tool-file-list">{listing.entries.map(entry => <li key={entry.name}>
        <button aria-pressed={entry.directory ? undefined : entry === selected}
          onClick={() => entry.directory ? navigate(listing.root, [...path.parts, entry.name]) : navigate(listing.root, path.parts, entry.name)}>
          <Icon name={entry.directory ? 'folder' : 'file'} size={17} /><span title={entry.name}>{entry.name}</span>
          <small>{entry.directory ? '文件夹' : !Number.isFinite(entry.size) || entry.size<0 ? '文件' : entry.size < 1024 ? entry.size + ' B' : Math.ceil(entry.size / 1024) + ' KB'}</small>
        </button>
        {!thumbnail && listing.native && <NativeFileActions entry={entry} state={state} />}
      </li>)}</ul> : <div className="tool-empty"><Icon name="folder" size={30} /><h3>这个目录里没有可查看的文件</h3></div>}
      {listing.truncated && <p className="muted">目录较大，仅显示前 500 项。</p>}
    </>}
    {selected && <section className="tool-file-preview" aria-label="文件预览">
      <div className="tool-title"><strong>{selected.name}</strong><span className="tool-badge">预览</span></div>
      {!file ? <p role="status">正在读取文件…</p> : file.error ? <p role="alert" className="management-error">{file.error}</p>
        : preview.image ? <div className="image-preview"><img src={preview.image} alt={preview.name} /></div>
          : preview.media && preview.mime==='application/pdf' ? <iframe title={preview.name} src={preview.media} style={{width:'100%',minHeight:500,border:0}} />
          : preview.media && preview.mime?.startsWith('video/') ? <video controls src={preview.media} style={{width:'100%'}} />
          : preview.media && preview.mime?.startsWith('audio/') ? <audio controls src={preview.media} />
          : preview.mime==='text/html' && preview.text ? <><iframe title={preview.name} sandbox="" srcDoc={preview.text} style={{width:'100%',minHeight:400,border:0,background:'white'}} /><details><summary>查看 HTML 源码</summary><pre>{preview.text}</pre></details></>
          : preview.text !== undefined ? <pre>{preview.text || '空文件'}{preview.truncated && '\n… 预览已截断'}</pre>
            : <p className="muted">可下载查看此文件。</p>}
      {!thumbnail && preview && <>
        <div className="tool-action-row">
          <button className="secondary" disabled={busy || !preview.size || preview.size > attachmentSizeLimit} onClick={() => transfer(true)}>
            <Icon name="attach" size={15} />添加到会话
          </button>
          <button className="secondary" disabled={busy || preview.size > attachmentSizeLimit} onClick={() => transfer(false)}>
            <Icon name="download" size={15} />下载
          </button>
        </div>
        {preview.size > attachmentSizeLimit && <p className="muted">本机联调支持下载和添加不超过 16 MB 的文件。</p>}
      </>}
    </section>}
  </div>
}
