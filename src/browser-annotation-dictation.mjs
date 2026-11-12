// Owned by the note editor, never by the untrusted preview guest.
export function createAnnotationDictation({ service, profile, mediaDevices, Recorder, isCurrent, onState, onTranscript, onError }) {
  let job
  const active = candidate => job === candidate && isCurrent()
  function release(candidate) {
    candidate.controller.abort()
    clearTimeout(candidate.timer)
    candidate.stopResolve?.()
    candidate.stopResolve = null
    if (candidate.recorder) {
      candidate.recorder.onstop = candidate.recorder.ondataavailable = candidate.recorder.onerror = null
      if (candidate.recorder.state !== 'inactive') candidate.recorder.stop()
    }
    candidate.stream?.getTracks().forEach(track => track.stop())
    candidate.stream = null
    candidate.chunks.length = 0
  }
  function end(candidate, error) {
    const deliver = active(candidate)
    if (job === candidate) job = null
    release(candidate)
    if (deliver) { onState(null); if (error) onError(error) }
  }
  return {
    async start() {
      if (job) return
      if (!service) return onError('语音批注需要连接 AIWATA 的语音转写服务。')
      if (!mediaDevices?.getUserMedia || !Recorder) return onError('当前环境不支持麦克风录音。')
      const candidate = job = { controller: new AbortController(), chunks: [], size: 0 }
      onState('checking')
      try {
        const status = await service.voiceStatus(profile, candidate.controller.signal)
        if (!active(candidate)) return end(candidate)
        if (!status.available) return end(candidate, status.message || '请先配置 AIWATA 语音转写。')
        onState('requesting')
        const stream = await mediaDevices.getUserMedia({ audio: true })
        if (!active(candidate)) { stream.getTracks().forEach(track => track.stop()); return end(candidate) }
        candidate.stream = stream
        const recorder = candidate.recorder = new Recorder(stream)
        recorder.ondataavailable = event => {
          if (!active(candidate) || !event.data.size) return
          candidate.size += event.data.size
          if (candidate.size > 25 * 1024 * 1024) end(candidate, '录音超过 25 MiB，请缩短后重试。')
          else candidate.chunks.push(event.data)
        }
        recorder.onerror = () => end(candidate, '录音中断，请重试。')
        recorder.start(1000)
        onState('recording')
        candidate.timer = setTimeout(() => end(candidate, '录音已达到两分钟，请缩短备注后重试。'), 120000)
      } catch (error) {
        end(candidate, error.name === 'NotAllowedError' ? '请允许工作台使用麦克风。' : error.message || '无法打开麦克风。')
      }
    },
    async finish() {
      const candidate = job
      if (!candidate || candidate.recorder?.state !== 'recording') return
      clearTimeout(candidate.timer)
      onState('transcribing')
      await new Promise(resolve => { candidate.stopResolve = resolve; candidate.recorder.onstop = resolve; candidate.recorder.stop() })
      candidate.stopResolve = null
      candidate.stream?.getTracks().forEach(track => track.stop()); candidate.stream = null
      if (!active(candidate)) return end(candidate)
      const audio = new Blob(candidate.chunks, { type: candidate.recorder.mimeType })
      candidate.chunks.length = 0
      if (!audio.size) return end(candidate, '未录到声音，请重试。')
      try {
        const result = await service.transcribeVoice(profile, audio, candidate.controller.signal)
        if (active(candidate)) {
          if (typeof result.transcript === 'string' && result.transcript.trim()) onTranscript(result.transcript.trim())
          else return end(candidate, '未检测到清晰语音，请重试。')
        }
        end(candidate)
      } catch (error) { end(candidate, error.message || '转写失败，已有备注已保留。') }
    },
    cancel() { if (job) end(job) },
  }
}
