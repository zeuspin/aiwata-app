import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const host = await import('../scripts/desktop-preview-annotations.mjs').catch(() => ({}))

function fixture(options = {}) {
  let current = true
  const calls = []
  const scripts = []
  let waiting
  let captureResolve
  const guest = new EventEmitter()
  Object.assign(guest, {
    executeJavaScriptInIsolatedWorld: async (world, [{ code }]) => {
      assert.equal(world, 1002)
      const request = JSON.parse(code.slice(code.lastIndexOf('\n/* request */') + 14, -1))
      calls.push(request)
      scripts.push(code)
      if (request.action === 'wait') return new Promise(resolve => { waiting = resolve })
      if (request.action === 'stop') { waiting?.({ type: 'end' }); return true }
      if (request.action === 'viewport') return { width: 800, height: 600 }
      return true
    },
    getURL: () => 'https://example.com/',
    getZoomFactor: () => 1,
    capturePage: async rect => {
      calls.push({ action: 'capturePage', rect })
      if (options.delayedCapture) await new Promise(resolve => { captureResolve = resolve })
      return { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,cGl4ZWxz' }
    },
    isDestroyed: () => false,
  })
  assert.equal(typeof host.createAnnotationController, 'function', 'annotation host controller is implemented')
  const controller = host.createAnnotationController({ guest, isCurrent: () => current, nextTimeoutMs: 10, operationTimeoutMs: 100 })
  return { controller, calls, scripts, invalidate: () => { current = false; controller.invalidate() }, releaseCapture: () => captureResolve?.(), emit: event => waiting?.(event) }
}

test('annotation commands reject executable and oversized inputs before calling the guest', async () => {
  const { controller, calls } = fixture()
  for (const command of [{ action: 'execute', code: 'evil()' }, { action: 'capture', rect: { x: 0, y: 0, width: Infinity, height: 2 }, number: 1 }, { action: 'sync', pins: Array(201).fill({}) }]) {
    assert.equal((await controller.run(command)).success, false)
  }
  assert.equal(calls.length, 0)
})

test('capture shows native numbered draft, dresses chrome, crops padded viewport and restores chrome', async () => {
  const { controller, calls } = fixture()
  const started = await controller.run({ action: 'start' })
  assert.equal(started.success, true)
  const result = await controller.run({ action: 'capture', session: started.session, rect: { x: 2, y: 20, width: 40, height: 16 }, number: 7 })
  assert.equal(result.imageDataUrl, 'data:image/png;base64,cGl4ZWxz')
  assert.deepEqual(calls.map(item => item.action), ['start', 'draft', 'beginCapture', 'viewport', 'capturePage', 'endCapture'])
  assert.deepEqual(calls.at(-2).rect, { x: 0, y: 8, width: 54, height: 40 })
  assert.equal(calls[1].number, 7)
})

test('a late capture is rejected when its document is invalidated', async () => {
  const f = fixture({ delayedCapture: true })
  const { session } = await f.controller.run({ action: 'start' })
  const capture = f.controller.run({ action: 'capture', session, rect: { x: 20, y: 20, width: 40, height: 20 }, number: 1 })
  await new Promise(resolve => setImmediate(resolve))
  f.invalidate()
  f.releaseCapture()
  assert.equal((await capture).success, false)
})

test('next reuses one native waiter across timeouts and stop releases the long poll', async () => {
  const { controller, calls } = fixture()
  const { session } = await controller.run({ action: 'start' })
  assert.deepEqual(await controller.run({ action: 'next', session }), { success: true, event: null })
  const pending = controller.run({ action: 'next', session })
  await controller.run({ action: 'stop', session })
  assert.deepEqual(await pending, { success: true, event: { type: 'end' } })
  assert.equal(calls.filter(item => item.action === 'wait').length, 1)
})

test('replacement session fences old commands and invalidation releases next immediately', async () => {
  const f = fixture()
  const first = await f.controller.run({ action: 'start' })
  const second = await f.controller.run({ action: 'start' })
  assert.notEqual(first.session, second.session)
  assert.equal((await f.controller.run({ action: 'hideDraft', session: first.session })).success, false)
  const next = f.controller.run({ action: 'next', session: second.session })
  f.invalidate()
  assert.deepEqual(await next, { success: true, event: { type: 'end' } })
})

test('capture bounds scale CSS pixels by native guest zoom and clamp to the viewport', () => {
  assert.equal(typeof host.annotationCaptureRect, 'function')
  assert.deepEqual(host.annotationCaptureRect({ x: 790, y: 590, width: 30, height: 30 }, { width: 800, height: 600 }, 2), { x: 1556, y: 1156, width: 44, height: 44 })
  assert.throws(() => host.annotationCaptureRect({ x: 900, y: 800, width: 5, height: 5 }, { width: 800, height: 600 }, 1))
})

test('capture includes document coordinates so restored area pins follow scrolling', async () => {
  const f = fixture()
  const { session } = await f.controller.run({ action: 'start' })
  const result = await f.controller.run({ action: 'capture', session, rect: { x: 2, y: 20, width: 40, height: 16 }, number: 1 })
  assert.deepEqual(result.page, { x: 2, y: 20, width: 40, height: 16 })
})

test('native events are projected and identity text is bounded before returning to workbench', async () => {
  const f = fixture()
  const { session } = await f.controller.run({ action: 'start' })
  const waiting = f.controller.run({ action: 'next', session })
  f.emit({ type: 'pick-element', rect: { x: 1, y: 1, width: 2, height: 2, secret: 'drop' }, identity: { tag: 'h1', text: 'x'.repeat(10000), selector: '#title', css: { color: 'blue', unknown: 'drop' } }, extra: 'drop' })
  const { event } = await waiting
  assert.equal(event.identity.text.length, 80)
  assert.equal(event.extra, undefined)
  assert.equal(event.rect.secret, undefined)
  assert.deepEqual(event.identity.css, { color: 'blue' })
})

test('repeated native stop is harmless and never ends a replacement session', async () => {
  const f = fixture()
  const first = await f.controller.run({ action: 'start' })
  await f.controller.run({ action: 'stop', session: first.session })
  const second = await f.controller.run({ action: 'start' })
  assert.equal((await f.controller.run({ action: 'stop', session: first.session })).success, false)
  assert.equal((await f.controller.run({ action: 'hideDraft', session: second.session })).success, true)
})

test('native module provenance matches every checked-in output with no runtime sibling dependency', async () => {
  const { readFile } = await import('node:fs/promises')
  const { createHash } = await import('node:crypto')
  const directory = new URL('../src/vendor/aiwata-preview/', import.meta.url)
  const provenance = JSON.parse(await readFile(new URL('provenance.json', directory), 'utf8'))
  assert.equal(provenance.commit, '6631a6af2c58fc498ef01fa5cc4b222fc8682683')
  assert.equal(provenance.modules.length, 6)
  for (const file of provenance.modules) {
    const output = await readFile(new URL(file.output, directory), 'utf8')
    assert.equal(createHash('sha256').update(output).digest('hex'), file.outputSha256)
    assert.doesNotMatch(output, /(?:from|import\()\s*['"][^'"]*\.\.\//)
  }
  const { addAnnotatePin, removeAnnotatePin, emptyAnnotateStack } = await import('../src/vendor/aiwata-preview/stack.mjs')
  let stack = addAnnotatePin(emptyAnnotateStack(), { note: 'a', rect: {} })
  stack = addAnnotatePin(stack, { note: 'b', rect: {} })
  stack = removeAnnotatePin(stack, stack.pins[0].id)
  stack = addAnnotatePin(stack, { note: 'c', rect: {} })
  assert.deepEqual(stack.pins.map(pin => pin.number), [2, 3])
})

test('a native pick arriving between long polls is delivered once on the next poll', async () => {
  const f = fixture()
  const { session } = await f.controller.run({ action: 'start' })
  await f.controller.run({ action: 'next', session })
  f.emit({ type: 'pick-area', rect: { x: 20, y: 20, width: 40, height: 30 } })
  await new Promise(resolve => setImmediate(resolve))
  const result = await f.controller.run({ action: 'next', session })
  assert.equal(result.event?.type, 'pick-area')
  assert.equal(f.calls.filter(item => item.action === 'wait').length, 1)
})

test('a queued native install cannot resurrect an overlay after its teardown tombstone', async () => {
  const { runInNewContext } = await import('node:vm')
  const f = fixture()
  const { session } = await f.controller.run({ action: 'start' })
  await f.controller.run({ action: 'stop', session })
  const context = { document: { defaultView: null }, location: { href: 'https://example.com/' } }
  assert.equal(runInNewContext(f.scripts[1], context), true)
  // No createElement is available: a stale start which installs would throw.
  assert.equal(runInNewContext(f.scripts[0], context), false)
  assert.equal(context.__aiwataNativeAnnotation.api, null)
})

test('sync waits until the screenshot finishes so it cannot replace capture chrome', async () => {
  const f = fixture({ delayedCapture: true })
  const { session } = await f.controller.run({ action: 'start' })
  const screenshot = f.controller.run({ action: 'capture', session, rect: { x: 20, y: 20, width: 40, height: 20 }, number: 1 })
  await new Promise(resolve => setImmediate(resolve))
  const sync = f.controller.run({ action: 'sync', session, pins: [] })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.calls.some(item => item.action === 'sync'), false)
  f.releaseCapture()
  assert.equal((await screenshot).success, true)
  assert.equal((await sync).success, true)
  assert.deepEqual(f.calls.slice(-2).map(item => item.action), ['endCapture', 'sync'])
})

test('a stuck native capture expires, tears down its session and releases next', async () => {
  const f = fixture({ delayedCapture: true })
  const { session } = await f.controller.run({ action: 'start' })
  const screenshot = f.controller.run({ action: 'capture', session, rect: { x: 20, y: 20, width: 40, height: 20 }, number: 1 })
  const result = await screenshot
  assert.equal(result.success, false)
  assert.equal(f.calls.some(item => item.action === 'stop'), true)
  assert.equal((await f.controller.run({ action: 'hideDraft', session })).success, false)
  f.releaseCapture()
})

test('restored native drafts receive page coordinates and a bounded element selector', async () => {
  const f = fixture()
  const { session } = await f.controller.run({ action: 'start' })
  const result = await f.controller.run({ action: 'draft', session, number: 4, rect: { x: 20, y: 40, width: 60, height: 30 }, page: { x: 20, y: 400, width: 60, height: 30 }, selector: '#heading' })
  assert.equal(result.success, true)
  assert.deepEqual(f.calls.at(-1).page, { x: 20, y: 400, width: 60, height: 30 })
  assert.equal(f.calls.at(-1).selector, '#heading')
  assert.equal((await f.controller.run({ action: 'draft', session, number: 4, rect: { x: 20, y: 40, width: 60, height: 30 }, selector: 'x'.repeat(2001) })).success, false)
})

test('restored native draft resolves current element bounds or subtracts current page scroll', async () => {
  const { runInNewContext } = await import('node:vm')
  const f = fixture()
  const { session } = await f.controller.run({ action: 'start' })
  await f.controller.run({ action: 'draft', session, number: 4, rect: { x: 20, y: 40, width: 60, height: 30 }, page: { x: 20, y: 400, width: 60, height: 30 }, selector: '#heading' })
  const request = f.calls.at(-1)
  const draws = []
  let hidden = 0
  const context = {
    location: { href: 'https://example.com/' }, scrollX: 10, scrollY: 300,
    document: { querySelector: () => null },
    __aiwataNativeAnnotation: { generation: request.generation, token: session, url: 'https://example.com/', api: {
      hideDraft: () => { hidden++ }, showDraft: (rect, number) => draws.push({ ...rect, number }),
    } },
  }
  runInNewContext(f.scripts.at(-1), context)
  assert.deepEqual(draws[0], { x: 10, y: 100, width: 60, height: 30, number: 4 })
  context.document.querySelector = () => ({ getBoundingClientRect: () => ({ x: 50, y: 250, width: 70, height: 35 }) })
  runInNewContext(f.scripts.at(-1), context)
  assert.deepEqual(draws[1], { x: 50, y: 250, width: 70, height: 35, number: 4 })
  assert.equal(hidden, 2)
})
