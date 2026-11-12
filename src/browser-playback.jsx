import React from 'react'

export function BrowserPlayback({ actions, index, onSelect, onClose, onOpenPage }) {
  const selected = actions[index]
  return <section className="browser-playback" aria-label="Agent 操作回放">
    <div className="tool-title">
      <strong>{selected ? '回放 · ' + (index + 1) + ' / ' + actions.length : '最近的网页操作'}</strong>
      <button type="button" className="tool-text-button" onClick={onClose}>返回当前页面</button>
    </div>
    <ol>{actions.map((action, position) => <li key={action.id ?? position}>
      <button type="button" aria-pressed={index === position} onClick={() => onSelect(position)}>
        <span>{position + 1}. {action.label || action.action || '打开网页'}{action.target ? ' · ' + action.target : ''}</span>
        {action.url && <small>{action.url}</small>}
      </button>
    </li>)}</ol>
    {selected?.url && onOpenPage && <button type="button" className="tool-text-button" onClick={() => onOpenPage(selected.url)}>打开这一步的网页</button>}
  </section>
}
