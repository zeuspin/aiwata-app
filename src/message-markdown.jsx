import React, { memo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remend from 'remend'
import { botHandle } from './room.mjs'
import { IconButton } from './icons.jsx'
import { Dialog } from './management-ui.jsx'
import { ContextMenu, menuPosition } from './tab-controls.jsx'
import './message-markdown.css'

const remarkPlugins = [remarkGfm]

function renderMentions(text, members, render) {
  return text.split(/((?<![\p{L}\p{N}_.@-])@[\p{L}\p{N}_-]+)/gu).map((part, index) => {
    const member = part.startsWith('@') && members.find(member => botHandle(member).toLowerCase() === part.slice(1).toLowerCase())
    return render(part, member, index)
  })
}

export function MentionText({ text, members }) {
  return renderMentions(text, members, (part, member, index) =>
    member ? <span className="conversation-mention" title={part} key={index}>@{member.name}</span> : part)
}

function rehypeMentions(members) {
  function visit(node) {
    if (!node.children || ['a', 'code', 'pre'].includes(node.tagName)) return
    node.children = node.children.flatMap(child => {
      if (child.type !== 'text') { visit(child); return child }
      if (!child.value.includes('@')) return child
      return renderMentions(child.value, members, (part, member) => member
        ? { type: 'element', tagName: 'span', properties: { className: ['conversation-mention'], title: part },
          children: [{ type: 'text', value: '@' + member.name }] }
        : { type: 'text', value: part })
    })
  }
  return visit
}

const markdownComponents = {
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <>{children}</>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
  table: ({ children }) => <div className="message-markdown-table"><table>{children}</table></div>,
}

function webUrl(url) {
  return /^https?:\/\//i.test(url) ? url : ''
}

export const MessageMarkdown = memo(function MessageMarkdown({ text, streaming, members }) {
  return <div className="message-markdown" data-streaming={streaming || undefined}>
    <Markdown skipHtml components={markdownComponents} remarkPlugins={remarkPlugins}
      rehypePlugins={members?.length ? [[rehypeMentions, members]] : []} urlTransform={webUrl}>
      {streaming ? remend(text, { katex: false }) : text}
    </Markdown>
  </div>
})

export function MessageSourceActions({ text }) {
  const [menu, setMenu] = useState(null)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState(null)

  async function copyMarkdown() {
    try {
      const host = window.hermesDesktop
      if (host?.writeClipboard) await host.writeClipboard(text)
      else await navigator.clipboard.writeText(text)
      setCopyStatus('已复制 Markdown')
    } catch {
      setCopyStatus('复制失败，可在源码窗口中手动复制')
    }
  }

  function dismiss(restoreFocus) {
    if (restoreFocus) menu?.anchor.focus()
    setMenu(null)
  }

  return <div className="message-source-actions">
    <IconButton label="更多消息操作" icon="more" aria-haspopup="menu" aria-expanded={Boolean(menu)}
      onClick={event => {
        setCopyStatus(null)
        setMenu({ ...menuPosition(event), label: '消息操作' })
      }} />
    {copyStatus && !sourceOpen && <small role="status">{copyStatus}</small>}
    {menu && <ContextMenu position={menu} dismiss={dismiss} groups={[[
      { label: '查看 Markdown 源码', icon: 'file', run: () => setSourceOpen(true) },
      { label: '复制 Markdown', icon: 'copy', run: copyMarkdown },
    ]]} />}
    {sourceOpen && <Dialog title="Markdown 源码" className="message-source-dialog" submit={null}
      onClose={() => { setSourceOpen(false); setCopyStatus(null) }}>
      <pre tabIndex={0}>{text}</pre>
      <button type="button" className="secondary" onClick={copyMarkdown}>复制 Markdown</button>
      {copyStatus && <small role="status">{copyStatus}</small>}
    </Dialog>}
  </div>
}
