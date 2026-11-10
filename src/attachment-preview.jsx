import React, { useEffect, useId, useRef, useState } from 'react'
import { IconButton } from './icons.jsx'

const textLimit = 256 * 1024

function previewKind(name, type) {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (type.startsWith('text/') || /\.(txt|md|csv|json|xml|html?|js|jsx|ts|tsx|css|yaml|yml|log)$/i.test(name)) return 'text'
  return 'download'
}

export function AttachmentPreview({ api, chatId, entry, onClose }) {
  const dialog = useRef(null)
  const title = useId()
  const [preview, setPreview] = useState(null)

  useEffect(() => { dialog.current.showModal() }, [])

  useEffect(() => {
    if (!entry.blobId) return
    let active = true
    let url
    async function load() {
      try {
        const file = await api.readLocalAttachment(chatId, entry.blobId)
        if (!file) throw new Error('Attachment unavailable')
        const kind = previewKind(entry.name, file.type)
        const text = kind === 'text' ? await file.slice(0, textLimit).text() : ''
        if (!active) return
        url = URL.createObjectURL(kind === 'pdf' ? file.slice(0, file.size, 'application/pdf') : file)
        setPreview({ kind, url, text, truncated: file.size > textLimit })
      } catch {
        if (active) setPreview({ kind: 'missing' })
      }
    }
    void load()
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [api, chatId, entry])

  return <dialog ref={dialog} className="project-dialog attachment-preview" aria-labelledby={title} onCancel={onClose}>
    <header><h2 id={title}>{entry.name}</h2><IconButton icon="close" label="关闭附件预览" onClick={onClose} /></header>
    {!entry.blobId ? <p>此附件来自旧版草稿，重新选择原文件即可预览。</p>
      : !preview ? <p role="status">正在读取本地附件…</p>
        : preview.kind === 'missing' && <p role="alert">原文件无法读取，请移除附件后重新选择。</p>}
    {preview?.kind === 'image' && <img src={preview.url} alt={entry.name} />}
    {preview?.kind === 'audio' && <audio src={preview.url} controls preload="metadata" />}
    {preview?.kind === 'video' && <video src={preview.url} controls preload="metadata" />}
    {preview?.kind === 'pdf' && <object data={preview.url} type="application/pdf" aria-label="PDF 预览">
      <p>当前浏览器无法内嵌预览此 PDF，可下载原文件查看。</p>
    </object>}
    {preview?.kind === 'text' && <><pre aria-label="附件正文">{preview.text || '空文件'}</pre>
      {preview.truncated && <p className="muted">预览显示前 256 KiB，可下载查看完整文件。</p>}</>}
    {preview?.kind === 'download' && <p>此格式可下载原文件查看。</p>}
    {preview?.url && <footer><a className="secondary tool-download" href={preview.url} download={entry.name}>下载原文件</a></footer>}
  </dialog>
}
