import React, { useLayoutEffect, useRef, useState } from 'react'
import { Icon, IconButton } from './icons.jsx'
import { formatConsoleEntry } from './browser-console.mjs'
import './browser-console.css'

const levels = ['log', 'info', 'warn', 'error']
export function PreviewConsole({ store, state, destination, onDraft, report }) {
  const body = useRef(null)
  const panel = useRef(null)
  const following = useRef(true)
  const drag = useRef(null)
  const [dragging, setDragging] = useState(false)
  const selected = state.logs.filter(log => state.selected.includes(log.id))
  useLayoutEffect(() => {
    if (following.current && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [state.logs, state.height])
  async function copy() {
    try {
      await navigator.clipboard.writeText((selected.length ? selected : state.logs).map(formatConsoleEntry).join('\n'))
      report('已复制控制台日志')
    } catch { report('未能复制日志，请重试。', true) }
  }
  function move(event) {
    if (!drag.current) return
    const max = Math.max(32, panel.current.parentElement.clientHeight - 40)
    store.setHeight(Math.min(max, drag.current.height + drag.current.y - event.clientY))
  }
  function finish() { drag.current = null; setDragging(false) }
  return <section className="preview-console" ref={panel} style={{ height: state.height }} aria-label="预览控制台">
    <div className="preview-console-resizer" role="separator" aria-label="调整预览控制台高度" aria-orientation="horizontal"
      tabIndex={0} aria-valuemin={32} aria-valuemax={800} aria-valuenow={state.height}
      onDoubleClick={() => store.setHeight(32)} onKeyDown={event => {
        if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); store.setHeight(state.height + (event.key === 'ArrowUp' ? 20 : -20)) }
      }} onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { y: event.clientY, height: panel.current.clientHeight }; setDragging(true)
      }} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}><span /></div>
    {dragging && <div className="preview-console-resize-shield" />}
    <header><span className="preview-console-title"><Icon name="terminal" size={/* @ai-token sys.icon.size.14 */ 14} />预览控制台
      {selected.length > 0 && <small>已选 {selected.length}</small>}</span>
      <div className="preview-console-actions">
        <IconButton icon="copy" label={selected.length ? '复制所选日志' : '复制全部日志'} disabled={!state.logs.length} onClick={copy} />
        <IconButton icon="send" label={'添加' + (selected.length ? '所选' : '全部') + '日志到' + (destination?.label ?? '会话') + '的草稿'} disabled={!state.logs.length || !destination} onClick={() => onDraft(selected.length ? selected : state.logs)} />
        <IconButton icon="trash" label="清空控制台" disabled={!state.logs.length} onClick={() => store.clear()} />
        <IconButton icon="close" label="隐藏预览控制台" onClick={() => store.setOpen(false)} />
      </div>
    </header>
    <div className="preview-console-body" ref={body} onScroll={event => {
      const el = event.currentTarget; following.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 24
    }}>
      {state.logs.length ? state.logs.map(log => <div className={'preview-console-row level-' + levels[log.level] + (state.selected.includes(log.id) ? ' selected' : '')} key={log.id}>
        <button type="button" className="preview-console-level" aria-label={'选择日志 ' + log.id} aria-pressed={state.selected.includes(log.id)} onClick={() => store.toggle(log.id)}>{levels[log.level]}</button>
        <div><pre>{log.message}</pre>{log.source && <small title={log.source}>{log.source}{log.line ? ':' + log.line : ''}</small>}</div>
        <IconButton icon="send" label={'添加日志 ' + log.id + ' 到' + (destination?.label ?? '会话') + '的草稿'} disabled={!destination} onClick={() => onDraft([log])} />
      </div>) : <p className="preview-console-empty">暂无日志。网页运行时的日志、警告和错误会显示在这里。</p>}
    </div>
  </section>
}
