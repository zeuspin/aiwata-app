import { webPreviewAddress } from '../src/web-preview.mjs'

const failure = () => ({ success: false, error: '当前网页已切换，或无法打开这个网页的开发者工具。' })

// Used on account release and on stale opens, including an opening which has not
// emitted devtools-opened yet. A destroyed webContents closes its own DevTools.
export function closePreviewDevTools(guest) {
  try { if (guest && !guest.isDestroyed()) guest.closeDevTools() }
  catch { /* A guest may disappear during account release. */ }
}

// Precreate the actual frontend WebContents so its ownership is known before
// Chromium's first devtools:// request, rather than relying on a late getter.
export function createOwnedPreviewDevToolsManager({ createWindow, getScope, getEpoch }) {
  const records = new WeakMap()
  const current = record => {
    try {
      const { scope, guest, window, contents } = record
      return !record.closed && getScope() === scope && !scope.closed && scope.guests.has(guest) &&
        !guest.isDestroyed() && guest.session === scope.session && getEpoch(guest) === record.epoch &&
        !window.isDestroyed() && !contents.isDestroyed() && contents.session === scope.session &&
        scope.ownedDevTools?.get(guest) === record
    } catch { return false }
  }
  const closeRecord = record => {
    if (!record || record.closed) return
    record.closed = true
    const { guest, scope, window } = record
    if (scope.ownedDevTools?.get(guest) === record) scope.ownedDevTools.delete(guest)
    if (records.get(guest) === record) records.delete(guest)
    guest.removeListener('devtools-opened', record.opened)
    guest.removeListener('devtools-closed', record.stopped)
    guest.removeListener('destroyed', record.stopped)
    window.removeListener('closed', record.stopped)
    closePreviewDevTools(guest)
    try { if (!window.isDestroyed()) window.destroy() } catch { /* Already closing. */ }
  }
  return {
    owns(contentsId) {
      const scope = getScope()
      if (!scope || scope.closed || !Number.isSafeInteger(contentsId) || contentsId <= 0) return false
      return [...(scope.ownedDevTools?.values() || [])].some(record => record.contents.id === contentsId && current(record))
    },
    close(guest) {
      const record = records.get(guest)
      if (record) closeRecord(record)
      else closePreviewDevTools(guest)
    },
    open(guest) {
      const previous = records.get(guest)
      if (previous && current(previous)) return
      if (previous) closeRecord(previous)
      const scope = getScope()
      if (!scope || scope.closed || !scope.guests.has(guest) || guest.isDestroyed() || guest.session !== scope.session) throw new Error('Preview guest is no longer owned')
      const epoch = getEpoch(guest)
      const window = createWindow({ guest, scope })
      const record = { guest, scope, window, contents: window.webContents, epoch, closed: false }
      record.stopped = () => closeRecord(record)
      record.opened = () => {
        if (!current(record) || guest.devToolsWebContents !== record.contents) { closeRecord(record); return }
        window.show()
      }
      scope.ownedDevTools ||= new Map()
      scope.ownedDevTools.set(guest, record)
      records.set(guest, record)
      guest.on('devtools-opened', record.opened)
      guest.on('devtools-closed', record.stopped)
      guest.once('destroyed', record.stopped)
      window.once('closed', record.stopped)
      try {
        if (!current(record)) throw new Error('Preview scope changed during DevTools creation')
        guest.setDevToolsWebContents(record.contents)
        if (!current(record)) throw new Error('Preview document changed during DevTools setup')
        guest.openDevTools({ mode: 'detach' })
      } catch (error) { closeRecord(record); throw error }
    },
  }
}

export function createPreviewDevToolsHandler({ renderer, origin, getScope, getEpoch, openDevTools = guest => guest.openDevTools({ mode: 'detach' }), closeDevTools = closePreviewDevTools }) {
  const workbenchOrigin = new URL(origin).origin
  const trustedFrame = event => {
    try {
      return event?.sender === renderer && event.senderFrame === renderer.mainFrame &&
        new URL(event.senderFrame.url).origin === workbenchOrigin
    } catch { return false }
  }
  return (event, partition, guestId, url, command) => {
    let openedGuest = null
    try {
      // No executable code, options, selectors or arbitrary guest references are
      // accepted. The actual guest is resolved only from this account partition.
      if (!command || typeof command !== 'object' || Array.isArray(command) ||
          Object.keys(command).length !== 1 || !['toggle', 'close', 'state'].includes(command.action)) return failure()
      const scope = getScope()
      const address = webPreviewAddress(url)
      if (!trustedFrame(event) || !scope || scope.closed || scope.partition !== partition ||
          !Number.isSafeInteger(guestId) || guestId <= 0 || !address) return failure()
      const guest = [...scope.guests].find(item => !item.isDestroyed() && item.id === guestId)
      const epoch = guest && getEpoch(guest)
      const currentDocument = () => trustedFrame(event) && getScope() === scope && !scope.closed &&
        scope.partition === partition && scope.guests.has(guest) && guest && !guest.isDestroyed() &&
        guest.session === scope.session && !guest.isLoadingMainFrame() && guest.getURL() === address && getEpoch(guest) === epoch
      if (!currentDocument()) return failure()
      const open = guest.isDevToolsOpened()
      if (command.action === 'toggle') {
        if (open) closeDevTools(guest)
        else {
          openedGuest = guest
          openDevTools(guest)
        }
      } else if (command.action === 'close') closeDevTools(guest)
      // Native DevTools opening is asynchronous. Return the native current
      // state; the renderer observes devtools-opened/closed for later changes.
      const actualOpen = guest.isDevToolsOpened()
      if (!currentDocument()) {
        if (openedGuest) closeDevTools(openedGuest)
        return failure()
      }
      return { success: true, open: actualOpen }
    } catch {
      if (openedGuest) closeDevTools(openedGuest)
      return failure()
    }
  }
}
