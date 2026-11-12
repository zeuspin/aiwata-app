// The guest UI and capture run through the native AIWATA overlay. This loop
// owns only one mounted page; abort fences all late host results.
export async function runBrowserAnnotationSession({ host, partition, guestId, url, signal,
  getNumber, onReady, onPick, onReposition, onBusy, onEnd, onError }) {
  let session
  let stopped = false
  const stop = () => {
    if (!session || stopped) return
    stopped = true
    void host.annotate(partition, guestId, url, { action: 'stop', session }).catch(() => {})
  }
  const command = async fields => {
    const result = await host.annotate(partition, guestId, url, { ...fields, session })
    if (!result?.success) throw new Error(result?.error || '浏览器标注已失效，请重新开启。')
    return result
  }
  signal.addEventListener('abort', stop, { once: true })
  try {
    if (signal.aborted) return
    const started = await host.annotate(partition, guestId, url, { action: 'start' })
    if (!started?.success || !started.session) throw new Error(started?.error || '无法开启浏览器标注。')
    session = started.session
    if (signal.aborted) return
    onReady?.({ command })
    while (!signal.aborted) {
      const { event } = await command({ action: 'next' })
      if (signal.aborted) return
      if (!event) continue
      if (event.type === 'end') { onEnd?.(); return }
      if (event.type === 'reposition') { onReposition?.(event.rect); continue }
      if (!['pick-element', 'pick-area'].includes(event.type)) continue
      const number = getNumber()
      onBusy?.(true)
      try {
        const result = await command({ action: 'capture', rect: event.rect, number })
        if (signal.aborted) return
        await onPick({ kind: event.type === 'pick-element' ? 'element' : 'area', rect: event.rect,
          ...(event.identity ? { identity: event.identity } : {}), pageUrl: url, number,
          page: result.page, imageDataUrl: result.imageDataUrl }, signal)
      } finally { if (!signal.aborted) onBusy?.(false) }
    }
  } catch (error) {
    if (!signal.aborted) onError?.(error)
  } finally {
    signal.removeEventListener('abort', stop)
    stop()
  }
}
