import test from 'node:test'
import assert from 'node:assert/strict'

test('annotation capture carries the shown number and cancellation never delivers a late screenshot', async () => {
  const { runBrowserAnnotationSession } = await import('../src/native-browser-annotations.mjs')
  const controller = new AbortController()
  const actions = []
  const captures = []
  let finishCapture
  let ready
  const captureStarted = new Promise(resolve => { ready = resolve })
  const host = { async annotate(_partition, _guest, _url, command) {
    actions.push(command)
    if (command.action === 'start') return { success: true, session: 'owned' }
    if (command.action === 'next') return { success: true, event: { type: 'pick-area', rect: { x: 10, y: 20, width: 40, height: 30 } } }
    if (command.action === 'capture') { ready(); return new Promise(resolve => { finishCapture = resolve }) }
    return { success: true }
  } }
  const running = runBrowserAnnotationSession({ host, partition: 'account', guestId: 1, url: 'https://example.com/',
    signal: controller.signal, getNumber: () => 7, onPick: value => captures.push(value) })
  await captureStarted
  controller.abort()
  finishCapture({ success: true, imageDataUrl: 'data:image/png;base64,late' })
  await running
  assert.equal(actions.find(action => action.action === 'capture').number, 7)
  assert.equal(actions.find(action => action.action === 'stop').session, 'owned')
  assert.deepEqual(captures, [])
})

test('native selection results and image travel together, then a native Escape ends the session', async () => {
  const { runBrowserAnnotationSession } = await import('../src/native-browser-annotations.mjs')
  const picks = []
  const events = [{ type: 'pick-element', identity: { text: '标题', selector: 'h1' }, rect: { x: 1, y: 2, width: 30, height: 20 } }, { type: 'end' }]
  let ended = false
  await runBrowserAnnotationSession({ host: { async annotate(_p, _g, _u, command) {
    if (command.action === 'start') return { success: true, session: 'owned' }
    if (command.action === 'next') return { success: true, event: events.shift() }
    if (command.action === 'capture') return { success: true, imageDataUrl: 'data:image/png;base64,screenshot', page: { x: 1, y: 102, width: 30, height: 20 } }
    return { success: true }
  } }, partition: 'account', guestId: 1, url: 'https://example.com/', signal: new AbortController().signal,
    getNumber: () => 3, onPick: pick => picks.push(pick), onEnd: () => { ended = true } })
  assert.equal(picks[0].number, 3)
  assert.equal(picks[0].kind, 'element')
  assert.equal(picks[0].identity.selector, 'h1')
  assert.equal(picks[0].imageDataUrl, 'data:image/png;base64,screenshot')
  assert.equal(picks[0].page.y, 102)
  assert.equal(ended, true)
})

test('native scroll reposition events move the floating editor without taking another screenshot', async () => {
  const { runBrowserAnnotationSession } = await import('../src/native-browser-annotations.mjs')
  const positions = []
  const events = [{ type: 'reposition', rect: { x: 10, y: 80, width: 40, height: 30 } }, { type: 'end' }]
  await runBrowserAnnotationSession({ host: { async annotate(_p, _g, _u, command) {
    if (command.action === 'start') return { success: true, session: 'owned' }
    if (command.action === 'next') return { success: true, event: events.shift() }
    if (command.action === 'capture') assert.fail('reposition is not a new capture')
    return { success: true }
  } }, partition: 'account', guestId: 1, url: 'https://example.com/', signal: new AbortController().signal,
    getNumber: () => 1, onReposition: rect => positions.push(rect) })
  assert.deepEqual(positions, [{ x: 10, y: 80, width: 40, height: 30 }])
})
