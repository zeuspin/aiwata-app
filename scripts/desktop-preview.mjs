import { tourPreview } from './desktop-preview-tour.mjs'
import { createFolderPicker } from './desktop-folder-picker.mjs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, session, shell, systemPreferences, dialog } from 'electron'
import { accounts } from '../src/fixtures.mjs'
import { previewCommand, previewFailure, webPreviewAddress } from '../src/web-preview.mjs'
import { configurePreviewSession, previewLocalOrigins } from './desktop-preview-policy.mjs'
import { drivePreviewPage } from './desktop-preview-inspection.mjs'
import { createInspectionRequests, inspectionResultIsCurrent } from './desktop-preview-requests.mjs'
import { readWindowBelow } from './vendor/aiwata-window/window-below.mjs'
import { createAnnotationController } from './desktop-preview-annotations.mjs'
import { createOwnedPreviewDevToolsManager, createPreviewDevToolsHandler } from './desktop-preview-devtools.mjs'
import { createPreviewFaviconHandler } from './desktop-preview-favicon.mjs'

const origin = new URL(process.env.AIWATA_APP_DESKTOP_ORIGIN || 'http://127.0.0.1:4181')
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.href !== origin.origin + '/') {
  throw new Error('桌面预览需要工作台的本机 HTTP 地址。')
}
const configuredOrigins = JSON.parse(process.env.AIWATA_APP_PREVIEW_ORIGINS || '{}')
const localOrigins = new Map(accounts.map(({ id }) => [id, previewLocalOrigins(configuredOrigins, id, origin)]))

app.setName('AIWATA 工作台预览')
app.setPath('userData', join(app.getPath('appData'), 'AIWATA Workbench Preview'))
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp')

async function openWindow() {
  const window = new BrowserWindow({
    title: 'AIWATA 工作台预览', width: 1280, height: 800, minWidth: 760, minHeight: 560,
    webPreferences: {
      preload: fileURLToPath(new URL('./desktop-preview-preload.cjs', import.meta.url)),
      sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: true,
    },
  })
  const renderer = window.webContents
  const navigationEpochs = new WeakMap()
  const favicons = new WeakMap()
  const annotations = new WeakMap()
  const releaseAnnotation = guest => {
    annotations.get(guest)?.controller.invalidate()
    annotations.delete(guest)
  }
  let current = null
  const inspections = createInspectionRequests()
  function trustedUrl(url) {
    try { return new URL(url).origin === origin.origin }
    catch { return false }
  }
  const trustedFrame = event => event.sender === renderer && event.senderFrame === renderer.mainFrame &&
    trustedUrl(event.senderFrame?.url)
  const ownedDevTools = createOwnedPreviewDevToolsManager({
    getScope: () => current, getEpoch: guest => navigationEpochs.get(guest),
    createWindow: ({ scope }) => {
      const devToolsWindow = new BrowserWindow({
        title: '网页开发者工具', width: 1000, height: 720, show: false,
        webPreferences: { session: scope.session, sandbox: true, contextIsolation: true, nodeIntegration: false,
          nodeIntegrationInSubFrames: false, webviewTag: false, devTools: false, webSecurity: true,
          allowRunningInsecureContent: false },
      })
      devToolsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      devToolsWindow.webContents.on('will-navigate', event => {
        if (!event.url.startsWith('devtools://devtools/bundled/')) event.preventDefault()
      })
      return devToolsWindow
    },
  })

  function release() {
    const scope = current
    if (scope) inspections.release(scope)
    current = null
    if (!scope) return
    scope.closed = true
    for (const guest of scope.guests) {
      releaseAnnotation(guest)
      ownedDevTools.close(guest)
      if (!guest.isDestroyed()) guest.close({ waitForBeforeUnload: false })
    }
    void Promise.allSettled([scope.session.clearStorageData(), scope.session.clearCache(), scope.session.clearAuthCache()])
  }

  ipcMain.handle('workbench-preview:start', async (event, account) => {
    if (!trustedFrame(event) || !localOrigins.has(account)) throw new Error('无法确认网页预览的工作台账号。')
    release()
    const partition = 'aiwata-preview-' + randomUUID()
    const browsing = session.fromPartition(partition, { cache: false })
    const scope = current = { account, partition, session: browsing, guests: new Set(), closed: false }
    await configurePreviewSession(browsing, localOrigins.get(account), () => current === scope && !scope.closed,
      contentsId => ownedDevTools.owns(contentsId))
    if (scope !== current) throw new Error('当前网页预览已退出。')
    return partition
  })
  ipcMain.handle('workbench-preview:select-paths', createFolderPicker({
    trusted: trustedFrame, scope: () => current, show: options => dialog.showOpenDialog(window, options),
  }))
  ipcMain.handle('workbench-preview:open-external', async (event, value) => {
    let address
    try { address = new URL(value) } catch {}
    if (!trustedFrame(event) || !address || address.protocol !== 'https:' || address.username || address.password) throw new Error('无法打开这个授权地址。')
    await shell.openExternal(address.href)
    return { ok: true }
  })
  ipcMain.handle('workbench-preview:window-below', async event => {
    if (!trustedFrame(event) || !current || current.closed) throw new Error('当前工作台没有已登录账号。')
    const scope = current
    const titlesAvailable = process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('screen') === 'granted'
    const result = await readWindowBelow(process.pid, window.getBounds(), titlesAvailable)
    if (current !== scope || scope.closed) throw new Error('当前账号已切换。')
    return result
  })
  ipcMain.handle('workbench-preview:stop', (event, partition) => {
    if (trustedFrame(event) && current?.partition === partition) release()
  })
  async function inspect(event, partition, guestId, url, command, requestId = randomUUID()) {
    const scope = current
    const address = webPreviewAddress(url)
    if (!trustedFrame(event) || !scope || scope.partition !== partition || !Number.isSafeInteger(guestId) || !address || !command) {
      return previewFailure('当前桌面预览无法处理这个请求。')
    }
    const guest = [...scope.guests].find(item => !item.isDestroyed() && item.id === guestId)
    const activeGuest = () => current === scope && guest && !guest.isDestroyed()
    const currentPage = () => activeGuest() && !guest.isLoadingMainFrame() && guest.getURL() === address
    if (!currentPage()) return previewFailure('当前网页尚未载入，或预览已切换。')
    const epoch = navigationEpochs.get(guest)
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) return previewFailure('网页操作请求标识无效。')
    let request
    try {
      request = inspections.begin(scope, guest, requestId)
      const currentDocument = () => currentPage() && epoch === navigationEpochs.get(guest)
      const result = await drivePreviewPage(guest, command, epoch, currentDocument, request.signal, activeGuest)
      if (inspectionResultIsCurrent({ action: command.action, result, active: activeGuest(),
        documentCurrent: currentDocument(), aborted: request.signal.aborted })) return result
    } catch { /* Navigation or release may have destroyed this guest. */ }
    finally { request?.finish() }
    return previewFailure('网页预览已切换，请重新发起请求。')
  }

  ipcMain.handle('workbench-preview:inspect', (event, partition, guestId, url, method, params, requestId) =>
    inspect(event, partition, guestId, url, previewCommand(method, params), requestId))
  ipcMain.handle('workbench-preview:inspect-cancel', (event, partition, guestId, requestId) => {
    const scope = current
    if (!trustedFrame(event) || scope?.partition !== partition) return false
    const guest = [...scope.guests].find(item => !item.isDestroyed() && item.id === guestId)
    return Boolean(guest && inspections.cancel(scope, guest, requestId))
  })
  ipcMain.handle('workbench-preview:target', (event, partition, guestId, url, x, y) => {
    const inViewport = value => Number.isFinite(value) && value >= 0 && value < 1
    return inspect(event, partition, guestId, url, inViewport(x) && inViewport(y) ? { action: 'target', x, y } : null)
  })

  ipcMain.handle('workbench-preview:tour', async (event, partition, guestId, url, action, requestId) => {
    const scope = current
    const guest = scope && [...scope.guests].find(item => !item.isDestroyed() && item.id === guestId)
    const epoch = guest && navigationEpochs.get(guest)
    const valid = () => trustedFrame(event) && current === scope && !scope?.closed && scope?.partition === partition && guest &&
      !guest.isDestroyed() && !guest.isLoadingMainFrame() && guest.getURL() === webPreviewAddress(url) && navigationEpochs.get(guest) === epoch
    if (!valid() || !['targets', 'show', 'start', 'next', 'prev', 'stop'].includes(action?.kind) || JSON.stringify(action).length > 65536) return { success: false, error: '当前网页无法执行导览。' }
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) return { success: false, error: '导览请求标识无效。' }
    let request
    try {
      request = inspections.begin(scope, guest, requestId)
      return await tourPreview(guest, action, () => valid() && !request.signal.aborted)
    } finally { request?.finish() }
  })
  ipcMain.handle('workbench-preview:annotate', async (event, partition, guestId, url, command) => {
    const scope = current
    const address = webPreviewAddress(url)
    if (!trustedFrame(event) || !scope || scope.partition !== partition || !Number.isSafeInteger(guestId) || !address || !command) {
      return previewFailure('当前桌面预览无法处理这个批注请求。')
    }
    const guest = [...scope.guests].find(item => !item.isDestroyed() && item.id === guestId)
    const epoch = guest && navigationEpochs.get(guest)
    const currentDocument = () => trustedFrame(event) && current === scope && !scope.closed && guest && !guest.isDestroyed() &&
      !guest.isLoadingMainFrame() && guest.getURL() === address && navigationEpochs.get(guest) === epoch
    if (!currentDocument()) return previewFailure('网页尚未载入或批注页面已切换。')
    let record = annotations.get(guest)
    if (record && record.epoch !== epoch) { releaseAnnotation(guest); record = null }
    if (!record) {
      if (command.action !== 'start') return previewFailure('请先开启网页批注。')
      record = { epoch, controller: createAnnotationController({ guest, isCurrent: currentDocument, url: address }) }
      annotations.set(guest, record)
    }
    return record.controller.run(command)
  })

  ipcMain.handle('workbench-preview:devtools', createPreviewDevToolsHandler({
    renderer, origin, getScope: () => current, getEpoch: guest => navigationEpochs.get(guest),
    openDevTools: guest => ownedDevTools.open(guest), closeDevTools: guest => ownedDevTools.close(guest),
  }))
  ipcMain.handle('workbench-preview:favicon', createPreviewFaviconHandler({
    renderer, origin, getScope: () => current, getEpoch: guest => navigationEpochs.get(guest), getIcons: guest => favicons.get(guest),
  }))

  renderer.on('will-navigate', event => { if (!trustedUrl(event.url)) event.preventDefault() })
  renderer.on('will-redirect', event => { if (!trustedUrl(event.url)) event.preventDefault() })
  renderer.on('did-start-navigation', event => { if (event.isMainFrame && !event.isSameDocument) release() })
  renderer.on('render-process-gone', release)
  renderer.setWindowOpenHandler(() => ({ action: 'deny' }))
  renderer.on('will-attach-webview', (event, preferences, params) => {
    if (!current || params.partition !== current.partition || !trustedUrl(renderer.getURL()) || !webPreviewAddress(params.src)) {
      event.preventDefault()
      return
    }
    delete preferences.preload
    Object.assign(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false,
      nodeIntegrationInSubFrames: false, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false })
  })
  renderer.on('did-attach-webview', (_event, guest) => {
    const scope = current
    if (!scope || guest.session !== scope.session) { guest.close({ waitForBeforeUnload: false }); return }
    scope.guests.add(guest)
    navigationEpochs.set(guest, 0)
    guest.on('page-favicon-updated', (_event, urls) => {
      favicons.set(guest, { epoch: navigationEpochs.get(guest), urls: urls.filter(url => typeof url === 'string' && url.length <= 4096).slice(0, 8) })
    })
    const nextEpoch = event => {
      if (event.isMainFrame) {
        releaseAnnotation(guest)
        ownedDevTools.close(guest)
        navigationEpochs.set(guest, navigationEpochs.get(guest) + 1)
      }
    }
    guest.on('did-start-navigation', nextEpoch)
    guest.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
      if (isMainFrame) {
        releaseAnnotation(guest)
        ownedDevTools.close(guest)
        navigationEpochs.set(guest, navigationEpochs.get(guest) + 1)
      }
    })
    guest.once('destroyed', () => { releaseAnnotation(guest); scope.guests.delete(guest) })
    guest.on('render-process-gone', () => { releaseAnnotation(guest); ownedDevTools.close(guest) })
    guest.on('devtools-opened', () => {
      if (current !== scope || scope.closed || !trustedUrl(renderer.getURL())) ownedDevTools.close(guest)
    })
    guest.setWindowOpenHandler(() => ({ action: 'deny' }))
    guest.on('will-navigate', event => { if (!webPreviewAddress(event.url)) event.preventDefault() })
  })
  window.on('closed', release)
  app.on('window-all-closed', () => app.quit())
  await window.loadURL(origin.href)
}

// Two Electron processes must never open the same account storage concurrently.
// Match the native client's instance ownership before Chromium opens its stores.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window?.isMinimized()) window.restore()
    window?.show()
    window?.focus()
  })
  void app.whenReady().then(openWindow).catch(error => {
    console.error(error.message)
    app.exit(1)
  })
}
