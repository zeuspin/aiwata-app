import { actEngineSource } from '../src/vendor/aiwata-preview-drive/act-in-page.mjs'
import { actWithChannels } from '../src/vendor/aiwata-preview-drive/preview-act.mjs'

const inputs = new WeakMap()
const expired = () => ({ success: false, error: '网页、会话或操作请求已切换。' })

// Fixed source only: requests supply structured data, never executable code.
function readOrTarget(command) {
  const url = location.href
  const title = document.title.slice(0, 256)
  if (command.action === 'read') {
    const text = document.body?.innerText ?? ''
    const start = Math.min(command.start, text.length)
    const end = Math.min(start + command.count, text.length)
    return { kind: 'url', url, title, text: text.slice(start, end), start, end, total_chars: text.length }
  }
  const hit = document.elementFromPoint(command.x * innerWidth, command.y * innerHeight)
  const node = hit?.closest('a[href],button,[role="button"],input,textarea,select,[contenteditable],img,iframe,summary,h1,h2,h3,h4,h5,h6,label,p') ?? hit
  if (!node?.isConnected || node === document.body || node === document.documentElement ||
      node.matches('input[type="hidden"],input[type="password"],input[type="file"]') || node.closest('[inert],[aria-hidden="true"]'))
    return { success: true, url, target: '' }
  const rect = node.getBoundingClientRect()
  const style = getComputedStyle(node)
  if (!rect.width || !rect.height || style.visibility !== 'visible' || style.opacity === '0') return { success: true, url, target: '' }
  const canReadText = !node.closest('input,textarea,select,[contenteditable]')
  const label = node.getAttribute('aria-label') || node.getAttribute('alt') || node.getAttribute('title') ||
    (canReadText ? node.innerText : node.getAttribute('placeholder')) || node.tagName.toLowerCase()
  return { success: true, url, target: label.replace(/\s+/gu, ' ').trim().slice(0, 160) }
}

function scopedSource(code, epoch) {
  return `(async () => {
    if (window.__aiwataDriveEpoch !== ${JSON.stringify(epoch)}) {
      window.__aiwataDriveEpoch = ${JSON.stringify(epoch)};
      window.__hermesActHolder = {};
    }
    return (${code});
  })()`
}

function execute(guest, code, epoch) {
  return guest.executeJavaScriptInIsolatedWorld(1001, [{ code: scopedSource(code, epoch) }])
}

export function inspectPreviewPage(guest, command, epoch = 0) {
  if (command.action === 'read' || command.action === 'target') {
    return execute(guest, `(${readOrTarget.toString()})(${JSON.stringify(command)})`, epoch)
  }
  const { action, ...fields } = command
  return execute(guest, `(${actEngineSource()})(document, window.__hermesActHolder, ${JSON.stringify({ ...fields, kind: action })})`, epoch)
}

export async function drivePreviewPage(guest, command, epoch, isCurrent, signal, isActive = isCurrent) {
  const valid = () => !signal?.aborted && isCurrent()
  if (!valid()) return expired()
  const guard = () => { if (!valid()) throw new Error('网页、会话或操作请求已切换。') }
  if (['back', 'forward', 'reload'].includes(command.action)) {
    guard()
    if (command.action === 'reload') guest.reload()
    else if (command.action === 'back' && guest.canGoBack()) guest.goBack()
    else if (command.action === 'forward' && guest.canGoForward()) guest.goForward()
    return { success: true, acted: command.action, note: 'Page is loading — call elements to see what is on it.' }
  }
  if (command.action === 'read' || command.action === 'target') {
    const result = await inspectPreviewPage(guest, command, epoch)
    return valid() ? result : expired()
  }
  let input = inputs.get(guest)
  if (!input) {
    input = { pointerKey: guest, current: null,
      send(event) {
        this.current.guard()
        const zoom = guest.getZoomFactor?.() ?? 1
        const scaled = 'x' in event && Number.isFinite(zoom) && zoom > 0
          ? { ...event, x: Math.round(event.x * zoom), y: Math.round(event.y * zoom) } : event
        guest.sendInputEvent(scaled)
        if (['mouseDown', 'keyDown', 'char'].includes(event.type)) this.current.delivered = true
      },
      focus() { this.current.guard(); guest.focus() },
    }
    inputs.set(guest, input)
  }
  // Native pointer state belongs to this guest; the current request guard is
  // captured in its channel, so a stale action can never acquire newer consent.
  const channel = Object.create(input)
  channel.current = { guard }
  const inputNavigation = () => !signal?.aborted && isActive() && !isCurrent() && channel.current.delivered &&
    ['click', 'type', 'press'].includes(command.action)
    ? { success: true, navigated: true,
      note: 'Input was delivered before the page changed. Call elements to inspect the new page.' } : null
  const run = async (code, tripSignal) => {
    guard()
    const combined = signal && tripSignal ? AbortSignal.any([signal, tripSignal]) : signal ?? tripSignal
    combined?.throwIfAborted()
    const pending = execute(guest, code, epoch)
    if (!combined) return pending
    let abort
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(new Error('操作请求已取消。'))
      combined.addEventListener('abort', abort, { once: true })
    })
    try { return await Promise.race([pending, cancelled]) }
    finally { combined.removeEventListener('abort', abort) }
  }
  try {
    const { action, ...fields } = command
    const result = await actWithChannels({ ...fields, kind: action }, run, channel, signal)
    if (signal?.aborted || !isActive()) return expired()
    // A successful native action may itself navigate. Preserve that outcome;
    // the host still owns the final epoch/account checks before responding.
    return inputNavigation() ?? (valid() || result.success ? result : expired())
  } catch (error) {
    return inputNavigation() ?? { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
