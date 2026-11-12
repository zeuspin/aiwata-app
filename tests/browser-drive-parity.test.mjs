import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { previewCommand } from '../src/web-preview.mjs'
import { inspectPreviewPage, drivePreviewPage } from '../scripts/desktop-preview-inspection.mjs'

// Real injected programs run in an isolated VM; this fixture supplies only the
// browser layout APIs that Node lacks. It does not implement ref or delta logic.
function pageFixture() {
  let nodes = []
  const listeners = new Map()
  const inputs = []
  const document = {
    title: 'Fixture', location: { href: 'https://example.com/' },
    querySelectorAll: () => nodes,
    querySelector: selector => nodes.find(node => selector === '#' + node.id) ?? null,
    getElementById: id => nodes.find(node => node.id === id) ?? null,
    contains: node => nodes.includes(node),
    addEventListener(type, listener) { listeners.set(type, listener) }, removeEventListener(type) { listeners.delete(type) },
    body: { innerText: 'Visible page text' }, documentElement: { scrollHeight: 1600 },
  }
  const window = { innerWidth: 1000, innerHeight: 700, matchMedia: () => ({ matches: true }),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    scrollBy() {}, scrollTo() {} }
  document.defaultView = window
  const context = vm.createContext({ document, window, location: document.location,
    innerWidth: 1000, innerHeight: 700, getComputedStyle: window.getComputedStyle,
    setTimeout, clearTimeout, requestAnimationFrame: callback => callback(),
    crypto: globalThis.crypto, console })
  const guest = { calls: 0, focus() {}, sendInputEvent(event) {
    inputs.push(event)
    if (event.type === 'mouseDown') listeners.get('pointerdown')?.({ target: nodes[0], isTrusted: true })
  }, async executeJavaScriptInIsolatedWorld(world, scripts) {
    assert.equal(world, 1001)
    this.calls++
    return vm.runInContext(scripts[0].code, context)
  } }
  const setNodes = entries => { nodes = entries.map(({ id, label, value = '' }) => ({ id, value, tagName: 'BUTTON', textContent: label,
    innerText: label, isConnected: true, disabled: false,
    getAttribute: key => key === 'id' ? id : null, closest: () => null,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 90, bottom: 50, width: 80, height: 40 }),
    contains(other) { return this === other }, scrollIntoView() {}, matches: () => false,
  })) }
  setNodes([{ id: 'save', label: 'Save' }, { id: 'help', label: 'Help' }])
  return { guest, document, setNodes, inputs, nodes: () => nodes }
}

test('wire validation admits native navigation, selectors, marks and readable refs', () => {
  for (const action of ['back', 'forward', 'reload', 'strobe', 'hold', 'unpin'])
    assert.deepEqual(previewCommand('preview.act', { action }), { action })
  assert.deepEqual(previewCommand('preview.act', { action: 'click', ref: 'btn-save' }), { action: 'click', ref: 'btn-save' })
  assert.deepEqual(previewCommand('preview.act', { action: 'scroll', selector: '#results', amount: 4000 }),
    { action: 'scroll', selector: '#results', amount: 4000 })
  assert.deepEqual(previewCommand('preview.act', { action: 'elements', full: true, max: 120 }), { action: 'elements', full: true, max: 120 })
  assert.deepEqual(previewCommand('preview.act', { action: 'press', selector: 'body', key: 'a', allow_shortcut: true }),
    { action: 'press', selector: 'body', key: 'a', allowShortcut: true })
  assert.equal(previewCommand('preview.act', { action: 'click', selector: '#save', code: 'process.exit()' }), null)
})

test('injected native inventory returns readable refs and rebinds them after a render', async () => {
  const fixture = pageFixture()
  const first = await inspectPreviewPage(fixture.guest, { action: 'elements' }, 1)
  assert.equal(first.elements[0].ref, 'btn-save')
  assert.equal(first.elements[0].selector, '#save')
  fixture.setNodes([{ id: 'save', label: 'Save' }, { id: 'help', label: 'Help' }])
  const next = await inspectPreviewPage(fixture.guest, { action: 'elements' }, 1)
  assert.deepEqual(Array.from(next.delta.rebound), ['btn-save', 'btn-help'])
  const full = await inspectPreviewPage(fixture.guest, { action: 'elements', full: true }, 1)
  assert.equal(full.elements[0].ref, 'btn-save')
})

test('native inventory reports changed values instead of resending unchanged controls', async () => {
  const fixture = pageFixture()
  fixture.setNodes([{ id: 'save', label: 'Save' }, { id: 'help', label: 'Help' }, { id: 'settings', label: 'Settings' }])
  await inspectPreviewPage(fixture.guest, { action: 'elements' }, 1)
  fixture.nodes()[0].value = 'saved'
  const next = await inspectPreviewPage(fixture.guest, { action: 'elements' }, 1)
  assert.equal(next.elements, undefined)
  assert.equal(next.delta.changed[0].ref, 'btn-save')
  assert.equal(next.delta.changed[0].value, 'saved')
})

test('withdrawn native action sends no further guest script or input', async () => {
  const fixture = pageFixture()
  const controller = new AbortController()
  controller.abort('interrupted')
  const result = await drivePreviewPage(fixture.guest, { action: 'elements' }, 1, () => true, controller.signal)
  assert.equal(result.success, false)
  assert.equal(fixture.guest.calls, 0)
})

test('native history action navigates the owned guest and asks for a new inventory', async () => {
  const fixture = pageFixture()
  let navigated = 0
  fixture.guest.canGoBack = () => true
  fixture.guest.goBack = () => { navigated++ }
  const result = await drivePreviewPage(fixture.guest, { action: 'back' }, 1, () => true)
  assert.equal(result.success, true)
  assert.equal(result.acted, 'back')
  assert.equal(navigated, 1)
  assert.equal(fixture.guest.calls, 0)
})

// Removing the native real-input route would make this action lack a pointer
// witness and fail; synthetic DOM click is deliberately absent from the fixture.
test('host native driver clicks through trusted guest input and returns a delta', async () => {
  const fixture = pageFixture()
  const first = await drivePreviewPage(fixture.guest, { action: 'elements' }, 1, () => true)
  const result = await drivePreviewPage(fixture.guest, { action: 'click', ref: first.elements[0].ref }, 1, () => true)
  assert.equal(result.success, true)
  assert.equal(result.acted, 'clicked button "Save"')
  assert.equal(result.delta.same, 2)
  assert.deepEqual(fixture.inputs.filter(event => event.type !== 'mouseMove').map(event => event.type), ['mouseDown', 'mouseUp'])
})

test('losing page ownership during pointer travel stops before mouse activation', async () => {
  const fixture = pageFixture()
  const first = await drivePreviewPage(fixture.guest, { action: 'elements' }, 1, () => true)
  let owned = true
  const record = fixture.guest.sendInputEvent.bind(fixture.guest)
  fixture.guest.sendInputEvent = event => { record(event); owned = false }
  const result = await drivePreviewPage(fixture.guest, { action: 'click', ref: first.elements[0].ref }, 1, () => owned)
  assert.equal(result.success, false)
  assert.equal(fixture.inputs.some(event => event.type === 'mouseDown'), false)
})

test('a withdrawn request stops waiting for a guest that no longer answers', async () => {
  const controller = new AbortController()
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const guest = { executeJavaScriptInIsolatedWorld() { entered(); return new Promise(() => {}) } }
  const pending = drivePreviewPage(guest, { action: 'elements' }, 1, () => true, controller.signal)
  await started
  controller.abort('timeout')
  const result = await pending
  assert.equal(result.success, false)
})

test('native input uses guest zoom when converting element points to host input pixels', async () => {
  const fixture = pageFixture()
  fixture.guest.getZoomFactor = () => 2
  const first = await drivePreviewPage(fixture.guest, { action: 'elements' }, 1, () => true)
  const result = await drivePreviewPage(fixture.guest, { action: 'click', ref: first.elements[0].ref }, 1, () => true)
  assert.equal(result.success, true)
  const down = fixture.inputs.find(event => event.type === 'mouseDown')
  assert.equal(down.x, 100)
  assert.equal(down.y, 60)
})
