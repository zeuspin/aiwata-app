import React, { useEffect, useMemo, useRef, useState } from 'react'
import { editBrowserAnnotation, emptyAnnotationDraft, emptyBrowserState, saveBrowserAnnotation } from './tool-surfaces.mjs'
import { annotationDestination, nextBrowserAnnotationNumber, pendingBrowserAnnotations } from './browser-annotation-state.mjs'
import { Icon, IconButton } from './icons.jsx'
import { createAnnotationDictation } from './browser-annotation-dictation.mjs'
import { placeAnnotationControls } from './browser-annotation-card.mjs'
import './browser-annotations.css'

const targetLabel = pin => pin.capture?.identity?.text || pin.target || '框选区域'

export function AnnotationImage({ image, chatId, api, number }) {
  const [source, setSource] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const preview = useRef(null)
  useEffect(() => {
    let current = true
    let objectUrl
    setSource(null)
    if (image?.blobId) void api.readLocalAttachment(chatId, image.blobId).then(file => {
      if (!current || !file) return
      objectUrl = URL.createObjectURL(file)
      setSource(objectUrl)
    }).catch(() => {})
    return () => { current = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [api, chatId, image?.blobId])
  useEffect(() => { if (expanded) preview.current?.showModal() }, [expanded])
  if (!image) return null
  return source ? <><button type="button" className="annotation-image" onClick={() => setExpanded(true)} aria-label={'查看批注 ' + number + ' 的标记截图'}>
    <img src={source} alt={'批注 ' + number + ' 的蓝色标记截图'} />
  </button>{expanded && <dialog className="annotation-image-preview" ref={preview} aria-label={'批注 ' + number + ' 截图'} onCancel={() => setExpanded(false)}>
    <header><strong>批注 {number}</strong><IconButton icon="close" label="关闭标注截图" onClick={() => setExpanded(false)} /></header>
    <img src={source} alt={'批注 ' + number + ' 的蓝色标记截图'} />
  </dialog>}</> : <small className="muted">正在读取标注截图…</small>
}

// White note capsule follows the user's recorded interaction; selection and
// screenshot ownership still use AIWATA's native overlay.
export function NativeAnnotationCard({ left, top, number, note, onChange, onSave, onCancel, voiceService, profile = 'default', identity, isCurrent = () => true, report = () => {} }) {
  const input = useRef(null)
  const latest = useRef({ note, onChange, isCurrent, report, identity })
  latest.current = { note, onChange, isCurrent, report, identity }
  const [voice, setVoice] = useState(null)
  const dictation = useMemo(() => createAnnotationDictation({ service: voiceService, profile,
    mediaDevices: globalThis.navigator?.mediaDevices, Recorder: globalThis.MediaRecorder,
    isCurrent: () => latest.current.identity === identity && latest.current.isCurrent(), onState: setVoice,
    onTranscript: text => { latest.current.onChange([latest.current.note, text].filter(Boolean).join(' ')); input.current?.focus() },
    onError: message => latest.current.report(message, true),
  }), [voiceService, profile, identity])
  useEffect(() => { setVoice(null); return () => dictation.cancel() }, [dictation])
  useEffect(() => { input.current?.focus() }, [number])
  return <form className="native-annotation-card" style={{ left, top }} aria-label={'批注 ' + number}
    data-annotate-card="true" data-annotate-number={number} onSubmit={event => { event.preventDefault(); if (!voice && note.trim()) onSave(event) }}>
    <input ref={input} aria-label="添加批注…" placeholder="添加批注…" autoComplete="off" spellCheck value={note}
      onChange={event => onChange(event.target.value)} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel() }
      }} />
    {voice && <span className="annotation-voice-status" role="status">{voice === 'recording' ? '录音中' : voice === 'transcribing' ? '转写中' : '准备中'}</span>}
    <button type="button" className={'annotation-microphone' + (voice === 'recording' ? ' recording' : '')}
      aria-label={voice === 'recording' ? '完成录音并转写' : '语音输入批注'} title={voice === 'recording' ? '完成录音并转写' : '语音输入批注'}
      disabled={!!voice && voice !== 'recording'} onClick={() => voice === 'recording' ? void dictation.finish() : void dictation.start()}>
      <Icon name={voice === 'recording' ? 'stop' : 'mic'} size={16} /></button>
    {voice ? <button type="button" aria-label="取消语音输入" title="取消语音输入" onClick={() => dictation.cancel()}><Icon name="close" size={14} /></button>
      : <button type="submit" className="annotation-save" aria-label="保存" title="保存" disabled={!note.trim()}><Icon name="tick" size={18} /></button>}
  </form>
}

export function AnnotationControls({ pane, count, hidden, onHidden, onClear, onSend, onClose, destination, busy, ready }) {
  const panel = useRef(null), drag = useRef(null)
  const [size, setSize] = useState({ width: 304, height: 40 })
  const [position, setPosition] = useState(null)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const element = panel.current
    let alive = true
    const resize = new ResizeObserver(() => {
      if (alive) setSize({ width: element.offsetWidth, height: element.offsetHeight })
    })
    resize.observe(element)
    return () => { alive = false; resize.disconnect() }
  }, [])
  const placed = placeAnnotationControls({ paneWidth: pane.width, paneHeight: pane.height, panelWidth: size.width, panelHeight: size.height, position })
  const finish = () => { drag.current = null; setDragging(false) }
  useEffect(() => {
    if (!dragging) return
    const cancelKey = event => { if (event.key === 'Escape') finish() }
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('mouseup', finish, true)
    window.addEventListener('blur', finish)
    window.addEventListener('keydown', cancelKey, true)
    return () => {
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('mouseup', finish, true)
      window.removeEventListener('blur', finish)
      window.removeEventListener('keydown', cancelKey, true)
    }
  }, [dragging])
  return <>
    {dragging && <div className="annotation-drag-shield" onPointerUp={finish} onPointerCancel={finish} />}
    <div ref={panel} className="annotation-controls" style={placed} role="toolbar" aria-label="标注控制条">
      <button type="button" className="annotation-grip" aria-label="拖动标注控制条" title="拖动标注控制条；方向键移动"
        onPointerDown={event => {
          if (event.button !== 0) return
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, y: event.clientY, ...placed }; setDragging(true)
        }} onPointerMove={event => {
          if (drag.current) setPosition({ left: drag.current.left + event.clientX - drag.current.x, top: drag.current.top + event.clientY - drag.current.y })
        }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          setPosition({ left: placed.left + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0),
            top: placed.top + (event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0) })
        }}><Icon name="grip" size={15} /></button>
      <span className="annotation-control-count">{hidden ? '已隐藏' : ready ? '正在批注' : '准备中'} · {count}</span>
      <IconButton icon={hidden ? 'eye' : 'eyeOff'} label={hidden ? '显示标注' : '隐藏标注'} aria-pressed={hidden} onClick={onHidden} />
      <IconButton icon="trash" label="清空本页待发送标注" disabled={!count || busy} onClick={onClear} />
      {destination && <span className="annotation-control-recipient" title={'接收对象：' + destination.label}>{destination.label}</span>}
      <button type="button" className="annotation-send" disabled={!count || busy || !destination} onClick={onSend}
        title={'添加到「' + (destination?.label ?? '会话') + '」的输入框'}>{busy ? '添加中…' : '发送'}</button>
      <IconButton icon="close" label="退出标注" onClick={onClose} />
    </div>
  </>
}

export function browserAnnotations({ chat, url, api, refresh, report }) {
  const data = chat.browser ?? emptyBrowserState
  const pins = pendingBrowserAnnotations(data, url)
  const draft = data.annotationDrafts?.[url] ?? emptyAnnotationDraft
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const record = api.current()
  const ownerAccountId = api.accountId
  const destination = annotationDestination(record, chat.id)
  const update = action => { if (api.updateBrowser(chat.id, action, chat.toolInstanceId)) refresh() }
  async function send() {
    if (sending.current) return
    if (api.current() !== record || api.accountId !== ownerAccountId || !destination || !pins.length) {
      report('接收对象或批注已变化，请重新打开浏览器。', true)
      return
    }
    sending.current = true; setBusy(true)
    try {
      const result = await api.addBrowserAnnotationsToDraft({ accountId: ownerAccountId, chatId: chat.id,
        tabId: chat.toolInstanceId, url, pinIds: pins.every(pin => pin.id) ? pins.map(pin => pin.id) : undefined,
        destinationLabel: destination.label, consume: true })
      if (api.current() !== record || api.accountId !== ownerAccountId) return
      refresh()
      if (!result.ok) { report(result.error || '无法添加，批注和原草稿已保留。', true); return }
      report(result.duplicate ? '这批批注已在草稿中' : '已添加到「' + destination.label + '」的输入框')
      if (record.activeChat === chat.id) document.querySelector('main.chat-pane textarea')?.focus()
    } catch {
      if (api.current() === record && api.accountId === ownerAccountId) report('无法添加批注，请重试。已保存的批注会保留。', true)
    } finally { sending.current = false; setBusy(false) }
  }
  return {
    pins, draft, destination, busy, api, chatId: chat.id,
    isCurrent: () => api.current() === record && api.accountId === ownerAccountId && !!api.getChat(chat.id)?.tabs.includes(chat.toolInstanceId ?? '浏览器'),
    nextNumber: nextBrowserAnnotationNumber(data, url),
    edit: patch => update(previous => editBrowserAnnotation(previous, url, patch)),
    save: (event, continueMarking = false) => {
      event.preventDefault()
      if (api.updateBrowser(chat.id, previous => saveBrowserAnnotation(previous, url, { continueMarking }), chat.toolInstanceId)) refresh()
      else report('批注保存未完成，请检查编号是否已变化后重试。', true)
    },
    remove: pin => update(previous => ({ ...previous, annotations: previous.annotations.filter(item => item !== pin) })),
    clear: () => update(previous => ({ ...previous, annotations: previous.annotations.filter(pin => !pins.includes(pin)) })),
    capture: async (value, signal) => {
      const result = await api.saveBrowserAnnotationCapture(chat.id, chat.toolInstanceId, url, value, { signal })
      if (!result.ok) throw new Error(result.error || '未能保存截图，请重新选择。')
      if (!signal?.aborted) refresh()
    },
    send,
  }
}

export function BrowserAnnotationForm({ draft, edit, save, controls, capturing, api, chatId, nextNumber }) {
  return <form className="browser-note" onSubmit={save}>
    {controls}
    {capturing ? <p className="annotation-capturing" role="status"><span className="spinner" />正在截取带标记的画面…</p>
      : draft.capture && <div className="annotation-draft-target"><span className="annotation-number">{draft.capture.number ?? nextNumber}</span>
        <span>{draft.capture.kind === 'area' ? '框选区域' : draft.capture.identity?.text || '页面元素'}</span>
        <button type="button" className="tool-text-button" onClick={() => edit({ capture: null, target: '' })}>取消选择</button></div>}
    {draft.capture && <AnnotationImage image={draft.capture.image} chatId={chatId} api={api} number={draft.capture.number ?? nextNumber} />}
    <label>{draft.capture ? '修改意见' : '批注位置 · ' + (draft.target || '整个页面')}<textarea value={draft.text}
      onChange={event => edit({ text: event.target.value })} placeholder="描述你希望修改的内容" /></label>
    <button className="secondary" disabled={capturing || !draft.text.trim()}>保存批注</button>
  </form>
}

export function BrowserAnnotationList({ pins, send, remove, api, chatId, destination, busy }) {
  return <>
    {pins.length > 0 && <section className="browser-pins" aria-label="网页批注">
      <ul>{pins.map((pin, index) => <li key={pin.id ?? index}>
        <div className="annotation-pin-title"><span className="annotation-number">{pin.number ?? index + 1}</span>
          <strong>{targetLabel(pin)}</strong>{remove && <IconButton icon="close" label={'移除批注 ' + (pin.number ?? index + 1)} onClick={() => remove(pin)} />}</div>
        <p>{pin.text}</p><AnnotationImage image={pin.capture?.image} chatId={chatId} api={api} number={pin.number ?? index + 1} />
      </li>)}</ul>
      {destination && <small className="annotation-recipient">接收对象：{destination.label}</small>}
      <button className="primary" disabled={busy} onClick={send}>{busy ? '正在添加…' : '添加到草稿'}</button>
    </section>}
  </>
}
