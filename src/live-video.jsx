import React, { useEffect, useRef, useState } from 'react'
import { useToolMediaUrl } from './attachment-preview.jsx'
import { publicVideoAddress } from './web-preview.mjs'

export const liveVideoTool = '剪辑工具'
const slot = 'liveVideoEdit'

export function LiveVideo({ live, chat, api, refresh, report, thumbnail }) {
  const { videoUrl = '', videoEditPrompt = '', liveVideoEdit: entry } = chat.toolEdits ?? {}
  const sessionId = chat.gatewayStoredId
  const url = useToolMediaUrl(api, chat.id, entry)
  const source = publicVideoAddress(videoUrl)
  const [available, setAvailable] = useState(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [probe, retryProbe] = useState(0)
  const running = useRef(false)

  useEffect(() => {
    if (thumbnail) return
    const controller = new AbortController()
    setAvailable(null)
    setError('')
    live.video('status', sessionId, {}, controller.signal).then(response => {
      if (!controller.signal.aborted) setAvailable(response.available)
    }, problem => {
      if (!controller.signal.aborted) setError(problem.message)
    })
    return () => controller.abort()
  }, [live, sessionId, probe, thumbnail])

  function change(patch) {
    if (api.updateToolEdits(chat.id, () => patch)) refresh()
  }

  async function edit(event) {
    event.preventDefault()
    if (running.current || !available || !source || !videoEditPrompt.trim()) return
    const record = api.current()
    const current = () => api.current() === record && api.getChat(chat.id) === chat
    running.current = true
    setWorking(true)
    setError('')
    try {
      const { video } = await live.video('edit', sessionId, { source, prompt: videoEditPrompt })
      if (!current()) return
      const bytes = await fetch('data:video/mp4;base64,' + video).then(response => response.blob())
      if (!current()) return
      const filename = '视频编辑-' + crypto.randomUUID().slice(0, 8) + '.mp4'
      if (!await api.saveLocalToolMedia(chat.id, new File([bytes], filename, { type: 'video/mp4' }), slot)) {
        throw new Error('无法保存视频结果。')
      }
      if (current()) refresh()
    } catch (problem) {
      if (current()) setError(problem.message)
    } finally {
      running.current = false
      setWorking(false)
    }
  }

  if (thumbnail) return url ? <video className="live-video-player" src={url} preload="metadata" aria-label="最近的视频编辑结果" />
    : <p className="live-browser-thumbnail">暂无视频编辑结果</p>
  return <div className="tool-home tool-detail">
    <header className="tool-detail-header"><h3>AI 视频编辑</h3><span className="tool-badge">xAI</span></header>
    {available === null && !error && <p role="status" className="muted">正在检查 AIWATA 视频供应商…</p>}
    {available === false && <p className="muted">当前工作区未配置可用的 xAI 视频供应商。</p>}
    {error && <p role="alert" className="management-error">{error}</p>}
    {available !== true && (available === false || error) &&
      <button type="button" className="tool-text-button" onClick={() => retryProbe(value => value + 1)}>重新检查</button>}
    <form className="generation-form" onSubmit={edit}>
      <label>源视频地址<input type="url" maxLength={4096} value={videoUrl}
        onChange={event => change({ videoUrl: event.target.value })} placeholder="公开 HTTPS MP4 链接" /></label>
      <label>编辑要求<textarea maxLength={2000} value={videoEditPrompt}
        onChange={event => change({ videoEditPrompt: event.target.value })} placeholder="描述想修改的视频内容" /></label>
      <button className="primary" disabled={!available || !source || !videoEditPrompt.trim() || working}>
        {working ? '正在编辑…' : '编辑视频'}
      </button>
    </form>
    {url && <section className="generation-result" aria-label="视频编辑结果">
      <video className="live-video-player" src={url} controls preload="metadata" aria-label="AIWATA 编辑的视频" />
      <strong>{entry.name}</strong>
      <div className="tool-action-row">
        <a className="secondary tool-download" href={url} download={entry.name}>下载视频</a>
        <button className="secondary" disabled={chat.attachments.includes(entry.name)} onClick={() => {
          if (api.attachLocalToolMedia(chat.id, slot)) { refresh(); report('已添加到当前会话草稿') }
          else report('无法添加视频到当前会话草稿。', true)
        }}>带回会话</button>
      </div>
    </section>}
  </div>
}
