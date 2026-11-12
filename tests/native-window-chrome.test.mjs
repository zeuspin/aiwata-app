import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeChromeLayout, bindNativeWindowChrome } from '../src/native-window-chrome.mjs'

test('native caption geometry follows host window state and both overlay edges', () => {
  assert.deepEqual(nativeChromeLayout({ darwinMajor: 26, windowButtonPosition: { x: 12, y: 10 } }),
    { left: 86, right: 0, height: 34, custom: false, maximized: false, fullscreen: false })
  assert.equal(nativeChromeLayout({ darwinMajor: 26, windowButtonPosition: { x: 20, y: 10 } }).left, 94)
  assert.equal(nativeChromeLayout({ darwinMajor: 0, windowButtonPosition: null, nativeOverlayWidth: 144 }).right, 144)
  assert.equal(nativeChromeLayout({ darwinMajor: 0 }, { left: 0, right: 137 }).right, 137)
  assert.equal(nativeChromeLayout({ darwinMajor: 0 }, { left: 120, right: 0 }).left, 120)
  const full = nativeChromeLayout({ darwinMajor: 26, isFullscreen: true, customWindowControls: true })
  assert.equal(full.left, 0); assert.equal(full.right, 0); assert.equal(full.custom, false)
  assert.equal(nativeChromeLayout({ darwinMajor: 0, customWindowControls: true, isMaximized: true }).custom, true)
  assert.equal(nativeChromeLayout({ darwinMajor: 0, customWindowControls: true, isMaximized: true }).maximized, true)
})

test('native chrome drops credentials, ignores late initial replies, tracks geometry and disposes listeners', () => {
  const events = new EventTarget()
  const overlayEvents = new EventTarget()
  const overlay = Object.assign(overlayEvents, { visible: true, getTitlebarAreaRect: () => ({ x: 0, width: 663 }) })
  const properties = new Map()
  const root = { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) } }
  let callback, detached = false
  const host = { onWindowStateChanged: fn => { callback = fn; return () => { detached = true } } }
  const environment = Object.assign(events, { innerWidth: 800, navigator: { platform: 'Win32', windowControlsOverlay: overlay } })
  const chrome = bindNativeWindowChrome({ host, element: root, environment })
  chrome.prime({ nativeOverlayWidth: 144, windowButtonPosition: null, darwinMajor: 0, token: 'must-not-leak', baseUrl: 'private' })
  assert.equal(chrome.snapshot().right, 137)
  assert.equal(JSON.stringify(chrome.snapshot()).includes('must-not-leak'), false)
  callback({ isFullscreen: true, darwinMajor: 0 })
  chrome.prime({ isFullscreen: false, darwinMajor: 0 })
  assert.equal(chrome.snapshot().fullscreen, true)
  callback({ isFullscreen: false, isMaximized: true, customWindowControls: true })
  assert.equal(chrome.snapshot().custom, true)
  assert.equal(properties.get('--native-caption-right'), '144px')
  callback({ customWindowControls: false })
  environment.innerWidth = 1000; overlayEvents.dispatchEvent(new Event('geometrychange'))
  assert.equal(chrome.snapshot().right, 337)
  let notifications = 0
  const off = chrome.subscribe(() => notifications++)
  callback({ isMaximized: false }); assert.equal(notifications, 1)
  off(); chrome.dispose(); assert.equal(detached, true)
  assert.equal(root.dataset.nativeWindow, undefined)
  assert.equal(properties.size, 0)
  callback({ isFullscreen: true }); events.dispatchEvent(new Event('resize'))
  assert.equal(notifications, 1)
})
