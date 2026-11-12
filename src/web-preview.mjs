export function webPreviewAddress(input) {
  const value = typeof input === 'string' ? input.trim() : ''
  if (!/^https?:\/\//i.test(value) || value.length > 4096 || /[\\\p{Cc}]/u.test(value)) return null
  try {
    const url = new URL(value)
    return !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function webPreviewReference(payload) {
  const url = webPreviewAddress(payload?.url)
  if (!url) return null
  const label = typeof payload.label === 'string' ? payload.label.trim() : ''
  return { url, label: (label || new URL(url).hostname).slice(0, 100) }
}

export function publicVideoAddress(input) {
  const address = webPreviewAddress(input)
  if (!address) return null
  const url = new URL(address)
  const host = url.hostname.replace(/\.$/, '')
  if (url.protocol !== 'https:' || (!host.includes('.') && !host.startsWith('[')) ||
      /\.(?:local|localhost|internal)$/.test(host)) return null
  url.hash = ''
  return url.href
}

export function addWebPreview(previews = [], preview) {
  if (!preview || previews.some(entry => entry.url === preview.url)) return previews
  return [...previews, preview].slice(-12)
}

const browserActionLabels = {
  open: '打开网页', read: '读取网页', elements: '查看可见元素', scroll: '滚动网页',
  click: '点击元素', hover: '悬停元素', type: '输入文本', press: '按键',
  strobe: '查看网页标记', back: '后退网页', forward: '前进网页', reload: '重新载入网页',
}
const driveActions = ['elements', 'scroll', 'click', 'hover', 'type', 'press', 'strobe', 'back', 'forward', 'reload']
const namedPageKeys = new Set(['Enter', 'Escape', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete', 'Insert',
  'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'PrintScreen', 'Pause', 'NumLock', 'ScrollLock',
  ...Array.from({ length: 24 }, (_, index) => 'F' + (index + 1))])

function previewObject(value) {
  if (typeof value === 'string') {
    if (value.length > 65536) return null
    try { value = JSON.parse(value) } catch { return null }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

export function gatewayBrowserActions(rows = []) {
  const calls = new Map()
  const actions = new Map()
  for (const row of rows) {
    if (row.role === 'assistant') {
      for (const call of Array.isArray(row.tool_calls) ? row.tool_calls : []) {
        const fn = call?.function
        if (typeof call?.id !== 'string' || !['drive_preview', 'tool_call'].includes(fn?.name)) continue
        const args = previewObject(fn.arguments)
        const entry = fn.name === 'tool_call' && Array.isArray(args?.calls) && args.calls.length === 1 ? args.calls[0] : null
        const verb = fn.name === 'drive_preview' ? args?.action
          : entry?.name === 'drive_preview' ? previewObject(entry.arguments)?.action : null
        if (verb) calls.set(call.id.split('|', 1)[0].trim(), verb)
      }
    }
    const name = row.tool_name ?? row.name
    const id = row.tool_call_uid || row.tool_call_id
    if (row.role !== 'tool' || typeof id !== 'string' || actions.has(id) ||
        !['desktop_preview', 'drive_preview'].includes(name)) continue
    const result = previewObject(row.content)
    const url = webPreviewAddress(result?.url)
    if (!url || result.success === false) continue
    let action
    if (name === 'desktop_preview') {
      if (result.kind === 'url' && typeof result.text === 'string') action = 'read'
      else if (result.success === true) action = 'open'
    } else if (result.success === true) {
      const verb = calls.get(row.tool_call_id)
      if (driveActions.includes(verb)) action = verb
    }
    if (!action) continue
    const description = action === 'open' ? result.label : result.hit?.label
    const target = typeof description === 'string' ? description.trim().slice(0, 160) : ''
    actions.set(id, { id, action, url, label: browserActionLabels[action], ...(target ? { target } : {}) })
  }
  return [...actions.values()].slice(-40)
}

export const previewMethods = ['preview.read', 'preview.act']

export function previewCommand(method, params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null
  const only = fields => Object.keys(params).every(key => key === 'session_id' || fields.includes(key))
  if (method === 'preview.read') {
    const { start = 0, count = 24000 } = params
    if (!only(['start', 'count']) || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 1) return null
    return { action: 'read', start, count: Math.min(count, 24000) }
  }
  if (method !== 'preview.act') return null
  const { action, ref, selector, key, allow_shortcut, text, submit, full, max, amount, to } = params
  if (![...driveActions, 'pin', 'hold', 'unpin'].includes(action)) return null
  const targetFields = ['ref', 'selector']
  const target = {}
  for (const [field, value] of [['ref', ref], ['selector', selector]]) {
    if (value === undefined) continue
    if (typeof value !== 'string' || !value.trim() || value.length > (field === 'ref' ? 256 : 4096) || /[\p{Cc}]/u.test(value)) return null
    target[field] = value
  }
  const targeted = Object.keys(target).length > 0
  if (['click', 'hover', 'type', 'press', 'pin'].includes(action) && !targeted) return null
  if (['back', 'forward', 'reload', 'strobe', 'hold'].includes(action)) return only(['action']) ? { action } : null
  if (action === 'elements') {
    if (!only(['action', 'max', 'full']) || (max !== undefined && (!Number.isSafeInteger(max) || max < 1)) ||
        (full !== undefined && typeof full !== 'boolean')) return null
    return { action, ...(max !== undefined ? { max: Math.min(max, 120) } : {}), ...(full !== undefined ? { full } : {}) }
  }
  if (action === 'scroll') {
    if (!only(['action', ...targetFields, 'amount', 'to']) || (amount !== undefined && !Number.isSafeInteger(amount)) ||
        (to !== undefined && !['top', 'bottom'].includes(to))) return null
    return { action, ...target, ...(amount !== undefined ? { amount: Math.max(-10000000, Math.min(amount, 10000000)) } : {}), ...(to ? { to } : {}) }
  }
  if (action === 'click' || action === 'hover' || action === 'unpin') return only(['action', ...targetFields]) ? { action, ...target } : null
  if (action === 'pin') return only(['action', ...targetFields, 'text']) && (text === undefined || typeof text === 'string' && text.length <= 4000 && !text.includes('\0'))
    ? { action, ...target, ...(text !== undefined ? { text } : {}) } : null
  if (action === 'press') {
    return only(['action', ...targetFields, 'key', 'allow_shortcut']) && typeof key === 'string' &&
      (Array.from(key).length === 1 && !/[\p{Cc}]/u.test(key) || namedPageKeys.has(key)) &&
      (allow_shortcut === undefined || typeof allow_shortcut === 'boolean')
      ? { action, ...target, key, ...(allow_shortcut !== undefined ? { allowShortcut: allow_shortcut } : {}) } : null
  }
  if (only(['action', ...targetFields, 'text', 'submit']) && (submit === undefined || typeof submit === 'boolean') &&
      typeof text === 'string' && text.length <= 4000 && !text.includes('\0')) {
    return { action, ...target, text, ...(submit ? { submit } : {}) }
  }
  return null
}

export const previewFailure = error => ({ success: false, error })

export function previewReply(body, request, now = Date.now()) {
  if (!request || request.expires <= now || body.session_id !== request.sessionId ||
      !body.result || typeof body.result !== 'object' || Array.isArray(body.result)) return null
  const value = JSON.stringify(body.result)
  return value.length <= 65536 ? { value } : null
}
