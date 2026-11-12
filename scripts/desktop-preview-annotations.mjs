const randomUUID = () => globalThis.crypto.randomUUID()
import { annotateInPageSource } from '../src/vendor/aiwata-preview/in-page.mjs'
import { compactIdentity } from '../src/vendor/aiwata-preview/identity.mjs'
import { ANNOTATE_CROP_PAD } from '../src/vendor/aiwata-preview/tokens.mjs'

const failure = () => ({ success: false, error: '网页批注已切换、请求无效或截图暂不可用。' })
const ended = () => ({ success: true, event: { type: 'end' } })
let generation = 0
const validNumber = value => Number.isSafeInteger(value) && value > 0 && value <= 1000000
const validRect = value => value && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key]) && Math.abs(value[key]) <= 1000000) && value.width > 0 && value.height > 0
const rectFields = ({ x, y, width, height }) => ({ x, y, width, height })

// Projection rejects executable inputs and bounds IPC payloads before crossing into a guest.
export function annotationCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return null
  const { action, session } = command
  if (action === 'start') return { action }
  if (typeof session !== 'string' || session.length > 100) return null
  if (['next', 'stop', 'hideDraft'].includes(action)) return { action, session }
  if (['draft', 'capture'].includes(action) && validRect(command.rect) && validNumber(command.number)) {
    if (action === 'draft' && ((command.page !== undefined && !validRect(command.page)) || (command.selector !== undefined && (typeof command.selector !== 'string' || command.selector.length > 2000)))) return null
    return { action, session, rect: rectFields(command.rect), number: command.number, ...(action === 'draft' && command.page ? { page: rectFields(command.page) } : {}), ...(action === 'draft' && command.selector ? { selector: command.selector } : {}) }
  }
  if (action !== 'sync' || !Array.isArray(command.pins) || command.pins.length > 200) return null
  const seen = new Set()
  const pins = []
  for (const pin of command.pins) {
    if (!pin || !['area', 'element'].includes(pin.kind) || !validNumber(pin.number) || seen.has(pin.number) || !validRect(pin.rect) ||
        (pin.page !== undefined && !validRect(pin.page)) || (pin.selector !== undefined && (typeof pin.selector !== 'string' || pin.selector.length > 2000))) return null
    seen.add(pin.number)
    pins.push({ kind: pin.kind, number: pin.number, rect: rectFields(pin.rect), ...(pin.page ? { page: rectFields(pin.page) } : {}), ...(pin.selector ? { selector: pin.selector } : {}) })
  }
  return { action, session, pins }
}

export function annotationCaptureRect(rect, viewport, zoom) {
  if (!validRect(rect) || !viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0 || !Number.isFinite(zoom) || zoom <= 0 || zoom > 5) throw new Error('Invalid capture bounds')
  const left = Math.max(0, rect.x - ANNOTATE_CROP_PAD)
  const top = Math.max(0, rect.y - ANNOTATE_CROP_PAD)
  const right = Math.min(viewport.width, rect.x + rect.width + ANNOTATE_CROP_PAD)
  const bottom = Math.min(viewport.height, rect.y + rect.height + ANNOTATE_CROP_PAD)
  const x = Math.floor(left * zoom), y = Math.floor(top * zoom)
  const width = Math.ceil(right * zoom) - x, height = Math.ceil(bottom * zoom) - y
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192 || width * height > 16000000) throw new Error('Capture is outside the viewport or too large')
  return { x, y, width, height }
}

// This function and the pinned native source are the only executable programs sent to guests.
// Caller data is JSON, never code. World 1002 is separate from both the page and inspection world.
function dispatchAnnotation(command, native) {
  const previous = globalThis.__aiwataNativeAnnotation
  if (command.action === 'stop') {
    if (!previous || previous.generation <= command.generation) {
      previous?.api?.teardown()
      globalThis.__aiwataNativeAnnotation = { generation: command.generation, token: command.session, api: null }
    }
    return true
  }
  if (command.action === 'start') {
    if ((previous?.generation ?? 0) >= command.generation || location.href !== command.url) return false
    previous?.api?.teardown()
    globalThis.__aiwataNativeAnnotation = { generation: command.generation, token: command.session, api: native, url: command.url }
    native.install()
    return true
  }
  if (!previous?.api || previous.token !== command.session || previous.generation !== command.generation || previous.url !== location.href) return false
  const api = previous.api
  if (command.action === 'wait') return api.wait()
  if (command.action === 'sync') { api.showPins(command.pins); return true }
  if (command.action === 'draft') {
    let rect = command.rect
    if (command.page || command.selector) {
      // A restored draft has no native picked-element reference. Discard an old
      // liveDraft before restoring its anchor in this exact owned guest document.
      api.hideDraft()
      if (command.page) rect = { ...command.page, x: command.page.x - scrollX, y: command.page.y - scrollY }
      if (command.selector) {
        try {
          const element = document.querySelector(command.selector)
          const bounds = element?.getBoundingClientRect()
          if (bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0) {
            rect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
          }
        } catch { /* An unavailable or stale selector falls back to the page anchor. */ }
      }
    }
    api.showDraft(rect, command.number)
    return true
  }
  if (command.action === 'hideDraft') { api.hideDraft(); return true }
  if (command.action === 'beginCapture') return api.beginCapture()
  if (command.action === 'endCapture') { api.endCapture(); return true }
  if (command.action === 'viewport') return { width: innerWidth, height: innerHeight, scrollX, scrollY }
  return false
}

function guestScript(command) {
  // Separate native source from request JSON for readable auditing; both are fixed except JSON data.
  return '(function(request){return (' + dispatchAnnotation.toString() + ')(request,' +
    (command.action === 'start' ? annotateInPageSource() : 'null') + ');})(\n/* request */' + JSON.stringify(command) + ')'
}

export function createAnnotationController({ guest, isCurrent, url = guest.getURL?.(), nextTimeoutMs = 20000, operationTimeoutMs = 5000 }) {
  let active = null
  let closed = false
  let serial = Promise.resolve()
  const current = state => !closed && active === state && !state.ended && isCurrent() && !guest.isDestroyed()
  const raw = (state, command) => guest.executeJavaScriptInIsolatedWorld(1002, [{ code: guestScript({ ...command, session: state.token, generation: state.generation, url }) }])
  const stopState = state => {
    if (!state || state.ended) return
    state.ended = true
    state.abort.abort()
  }
  const cleanup = state => { if (!guest.isDestroyed()) void raw(state, { action: 'stop' }).catch(() => {}) }
  const enqueue = operation => {
    const result = serial.then(operation, operation)
    serial = result.catch(() => {})
    return result
  }
  async function bounded(operation, state, milliseconds, onTimeout = () => {}) {
    let timer
    let abort
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => { onTimeout(); resolve(null) }, milliseconds)
      abort = () => resolve(null)
      state.abort.signal.addEventListener('abort', abort, { once: true })
      if (state.abort.signal.aborted) resolve(null)
    })
    try { return await Promise.race([Promise.resolve(operation), timeout]) }
    finally { clearTimeout(timer); state.abort.signal.removeEventListener('abort', abort) }
  }
  const execute = async (state, command) => {
    if (!current(state)) throw new Error('Annotation document expired')
    const result = await bounded(raw(state, command), state, operationTimeoutMs, () => { stopState(state); cleanup(state) })
    if (!current(state) || result === false || result === null) throw new Error('Annotation document expired')
    return result
  }
  async function next(state) {
    if (!current(state) || state.polling) return failure()
    state.polling = true
    try {
      // Native wait supports one resolver. Reuse it after a bounded IPC poll expires.
      if (!state.wait) state.wait = raw(state, { action: 'wait' })
      const event = await bounded(state.wait, state, nextTimeoutMs)
      if (state.ended || !isCurrent()) return ended()
      if (event === null) return { success: true, event: null }
      state.wait = null
      if (!event || !['pick-element', 'pick-area', 'reposition', 'end'].includes(event.type) || (event.type !== 'end' && !validRect(event.rect))) return failure()
      if (event.type === 'end') { stopState(state); cleanup(state) }
      const projected = { type: event.type, ...(event.rect ? { rect: rectFields(event.rect) } : {}), ...(event.type === 'pick-element' ? { identity: compactIdentity(event.identity) } : {}) }
      return { success: true, event: projected }
    } catch { state.wait = null; return state.ended ? ended() : failure() }
    finally { state.polling = false }
  }
  async function capture(state, command) {
    try {
      await execute(state, { action: 'draft', rect: command.rect, number: command.number })
      await execute(state, { action: 'beginCapture' })
      const viewport = await execute(state, { action: 'viewport' })
      const bounds = annotationCaptureRect(command.rect, viewport, guest.getZoomFactor())
      const image = await bounded(guest.capturePage(bounds), state, operationTimeoutMs, () => { stopState(state); cleanup(state) })
      // Native capture may settle after navigation, logout, stop or replacement.
      if (!current(state) || !image || image.isEmpty()) return failure()
      const size = image.getSize?.()
      if (size && (size.width > 8192 || size.height > 8192 || size.width * size.height > 16000000)) return failure()
      const imageDataUrl = image.toDataURL()
      if (!imageDataUrl.startsWith('data:image/png;base64,') || imageDataUrl.length > 12000000) return failure()
      return { success: true, imageDataUrl, page: { ...command.rect, x: command.rect.x + (viewport.scrollX || 0), y: command.rect.y + (viewport.scrollY || 0) }, viewport }
    } finally {
      // Never restore chrome on a replacement session or different document.
      if (active === state && isCurrent() && !guest.isDestroyed()) {
        await bounded(raw(state, { action: 'endCapture' }).catch(() => false), state, operationTimeoutMs)
      }
    }
  }
  return {
    invalidate() { closed = true; stopState(active); if (active) cleanup(active) },
    async run(input) {
      const command = annotationCommand(input)
      if (!command || closed || !isCurrent()) return failure()
      if (command.action === 'next') {
        if (!active || active.token !== command.session) return failure()
        return next(active)
      }
      if (command.action === 'stop') {
        if (!active || active.token !== command.session) return failure()
        stopState(active)
        cleanup(active)
        return { success: true }
      }
      return enqueue(async () => {
        if (closed || !isCurrent()) return failure()
        try {
          if (command.action === 'start') {
            stopState(active)
            if (active) cleanup(active)
            const state = active = { token: randomUUID(), generation: ++generation, abort: new AbortController(), ended: false, wait: null, polling: false }
            await execute(state, { action: 'start' })
            return { success: true, session: state.token }
          }
          const state = active
          if (!state || state.token !== command.session || !current(state)) return failure()
          if (command.action === 'capture') return await capture(state, command)
          await execute(state, command)
          return { success: true }
        } catch { return failure() }
      })
    },
  }
}
