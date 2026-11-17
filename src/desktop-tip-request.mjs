import { collectTourTargets } from './vendor/aiwata-tour/collect-targets.mjs'

// A published event is not a displayed bubble. Resolve only after the positioned
// component acknowledges its DOM commit, or its owner/target disappears.
export function requestDesktopTip({ doc, payload, signal, present }) {
  const failed = error => ({ success: false, display_confirmed: false, error })
  let anchor
  try { anchor = typeof payload.selector === 'string' && doc.querySelector(payload.selector) } catch {}
  const rect = anchor?.getBoundingClientRect()
  if (!rect?.width || !rect.height || typeof payload.text !== 'string' || !payload.text.trim()) {
    const targets = collectTourTargets(doc, 150).filter(target => target.stable)
      .sort((a, b) => Number(['textarea', 'input'].includes(b.role)) - Number(['textarea', 'input'].includes(a.role)))
      .slice(0, 30).map(({ selector, label }) => ({ selector, label }))
    return Promise.resolve({ ...failed('No visible element matches this tip. Use a current selector from targets.'), targets })
  }
  if (signal?.aborted) return Promise.resolve(failed('The tip request was cancelled.'))
  return new Promise(resolve => {
    let settled = false, retire
    const finish = result => {
      if (settled) return
      settled = true
      doc.defaultView.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve(result)
    }
    const abort = () => { retire?.(); finish(failed('The tip request was cancelled.')) }
    const timer = doc.defaultView.setTimeout(() => {
      retire?.(); finish(failed('The desktop did not confirm rendering the tip.'))
    }, 1500)
    retire = present({ ...payload, text: payload.text.slice(0, 500), onReady: finish })
    if (!settled) signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}
