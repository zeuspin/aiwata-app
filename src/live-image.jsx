import React, { useEffect, useRef, useState } from 'react'
import { liveImageSlots } from './local-attachments.mjs'
import { imageAspectRatios, maxImageBytes } from './tool-surfaces.mjs'
import { useToolMediaUrl } from './attachment-preview.jsx'

export const liveImageTool = '生图工具'
export const liveImageEditTool = '修图工具'
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export function LiveImage({ live, chat, api, refresh, report, thumbnail, editing }) {
  const sessionId = chat.gatewayStoredId
  const edits = chat.toolEdits ?? {}
  const slot = editing ? 'liveImageEdit' : 'liveImage'
  const promptField = editing ? 'imageEditPrompt' : 'prompt'
  const aspectField = editing ? 'imageEditAspect' : 'aspect'
  const prompt = edits[promptField] ?? ''
  const aspect = edits[aspectField] ?? 'square'
  const entry = edits[slot]
  const sources = editing ? liveImageSlots.filter(id => edits[id]) : []
  const selected = sources.includes(edits.imageEditSource) ? edits.imageEditSource : sources[0]
  const source = edits[selected]
  const name = editing ? liveImageEditTool : liveImageTool
  const [availability, setAvailability] = useState(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const inFlight = useRef(false)
  const [probe, retryProbe] = useState(0)

  useEffect(() => {
    if (thumbnail) return
    const controller = new AbortController()
    setAvailability(null)
    setError('')
    live.image(editing ? 'edit-status' : 'probe', sessionId, {}, controller.signal).then(response => {
      if (!controller.signal.aborted) setAvailability(response)
    }, problem => {
      if (!controller.signal.aborted) setError(problem.message)
    })
    return () => controller.abort()
  }, [live, sessionId, thumbnail, probe, editing])

  const url = useToolMediaUrl(api, chat.id, entry)
  const sourceUrl = useToolMediaUrl(api, chat.id, thumbnail ? null : source)
  const ready = availability?.available && (!editing || availability.editable)
  function edit(patch) {
    if (api.updateToolEdits(chat.id, () => patch)) refresh()
  }

  async function chooseSource(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    if (!extensions[file.type] || !file.size || file.size > maxImageBytes) {
      setError('请选择不超过 8 MB 的 PNG、JPEG 或 WebP 源图。')
      return
    }
    setError('')
    try {
      if (!await api.saveLocalToolMedia(chat.id, file, 'liveImageSource')) throw new Error('无法保存源图。')
      refresh()
    } catch { setError('无法保存源图。') }
  }

  async function generate(event) {
    event.preventDefault()
    if (inFlight.current || !ready || !prompt.trim() || (editing && !source)) return
    const record = api.current()
    inFlight.current = true
    setWorking(true)
    setError('')
    try {
      const params = { prompt, aspect_ratio: aspect }
      let response
      if (editing) {
        const blob = await api.readLocalAttachment(chat.id, source.blobId)
        if (api.current() !== record || api.getChat(chat.id) !== chat) return
        if (!blob) throw new Error('无法读取源图，请重新选择。')
        response = await live.editImage(sessionId, blob, params)
      } else response = await live.image('generate', sessionId, params)
      if (api.current() !== record || api.getChat(chat.id) !== chat) return
      const bytes = await fetch(response.imageData).then(value => value.blob())
      if (api.current() !== record || api.getChat(chat.id) !== chat) return
      const filename = (editing ? '修图-' : '生图-') + crypto.randomUUID().slice(0, 8) + '.' + extensions[response.mime]
      if (!await api.saveLocalToolMedia(chat.id, new File([bytes], filename, { type: response.mime }), slot)) throw new Error('无法保存图像结果。')
      if (api.current() === record) refresh()
    } catch (problem) {
      if (api.current() === record) setError(problem.message)
    } finally {
      inFlight.current = false
      setWorking(false)
    }
  }

  if (thumbnail) return url ? <div className="generation-result"><img src={url} alt="最近的图像结果" /></div>
    : <p className="live-browser-thumbnail">暂无图像结果</p>
  return <div className="tool-home tool-detail">
    <header className="tool-detail-header"><h3>{name}</h3></header>
    {availability === null && !error && <p role="status" className="muted">正在检查 AIWATA 图像供应商…</p>}
    {availability?.available === false && <p className="muted">当前工作区未配置可用的生图供应商。</p>}
    {editing && availability?.available && !availability.editable && <p className="muted">当前供应商或模型未提供图像编辑。</p>}
    {error && <p role="alert" className="management-error">{error}</p>}
    {!ready && (availability || error) &&
      <button type="button" className="tool-text-button" onClick={() => retryProbe(value => value + 1)}>重新检查</button>}
    <form className="generation-form" onSubmit={generate}>
      {editing && <>
        <label className="tool-field">上传源图<input type="file" accept="image/png,image/jpeg,image/webp" disabled={working} onChange={chooseSource} /></label>
        {!!sources.length && <label className="tool-field">源图<select value={selected} disabled={working}
          onChange={event => edit({ imageEditSource: event.target.value })}>
          {sources.map(id => <option key={id} value={id}>{edits[id].name}</option>)}
        </select></label>}
        {sourceUrl && <div className="image-preview"><img src={sourceUrl} alt="源图" /></div>}
      </>}
      <label>{editing ? '编辑要求' : '图像描述'}<textarea value={prompt} maxLength={4000}
        onChange={event => edit({ [promptField]: event.target.value })} placeholder={editing ? '描述要修改的内容' : '描述想生成的画面'} /></label>
      <label className="tool-field">画面比例<select value={aspect} onChange={event => edit({ [aspectField]: event.target.value })}>
        {Object.entries(imageAspectRatios).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button className="primary" disabled={!ready || working || !prompt.trim() || (editing && !source)}>
        {working ? (editing ? '正在编辑…' : '正在生成…') : editing ? '编辑图像' : '生成图像'}
      </button>
    </form>
    {url && <section className="generation-result" aria-label={editing ? '修图结果' : '生图结果'}>
      <img src={url} alt={editing ? 'AIWATA 编辑的图像' : 'AIWATA 生成的图像'} />
      <strong>{entry.name}</strong>
      <button className="secondary" disabled={chat.attachments.includes(entry.name)} onClick={() => {
        if (api.attachLocalToolMedia(chat.id, slot)) { refresh(); report('已添加到当前会话草稿') }
        else report('无法添加图像到当前会话草稿。', true)
      }}>带回会话</button>
    </section>}
  </div>
}
