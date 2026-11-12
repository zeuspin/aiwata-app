import { webPreviewAddress } from '../src/web-preview.mjs'

const types = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml'])
const maxBytes = 128 * 1024
const failed = () => ({ success: false, favicon: null })

async function imageBytes(response) {
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!response.ok || !types.has(type) || Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); return null }
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks = []; let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel(); return null }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  return size ? 'data:' + type + ';base64,' + Buffer.concat(chunks).toString('base64') : null
}

// Only a native-reported favicon for this owned guest may be read. Fetches stay
// in that login's constrained session; the workbench never loads a remote icon.
export function createPreviewFaviconHandler({ renderer, origin, getScope, getEpoch, getIcons }) {
  const workbenchOrigin = new URL(origin).origin
  const cache = new WeakMap()
  return async (event, partition, guestId, pageUrl) => {
    try {
      const trusted = () => event?.sender === renderer && event.senderFrame === renderer.mainFrame &&
        new URL(event.senderFrame.url).origin === workbenchOrigin
      const scope = getScope(), url = webPreviewAddress(pageUrl)
      if (!trusted() || !scope || scope.closed || scope.partition !== partition || !Number.isSafeInteger(guestId) || guestId <= 0 || !url) return failed()
      const guest = [...scope.guests].find(item => !item.isDestroyed() && item.id === guestId)
      const epoch = guest && getEpoch(guest)
      const current = () => trusted() && getScope() === scope && !scope.closed && scope.guests.has(guest) && guest &&
        !guest.isDestroyed() && guest.session === scope.session && getEpoch(guest) === epoch && guest.getURL() === url
      if (!current()) return failed()
      const reported = getIcons(guest)
      const source = (reported?.epoch === epoch ? reported.urls : []).map(webPreviewAddress).find(Boolean) ?? new URL('/favicon.ico', url).href
      let record = cache.get(guest)
      if (!record || record.epoch !== epoch || record.source !== source) {
        record = { epoch, source, result: (async () => {
          try {
            const response = await guest.session.fetch(source, { credentials: 'omit', signal: AbortSignal.timeout(5000) })
            return await imageBytes(response)
          } catch { return null }
        })() }
        cache.set(guest, record)
      }
      const favicon = await record.result
      return current() ? { success: true, favicon } : failed()
    } catch { return failed() }
  }
}
