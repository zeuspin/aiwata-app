import assert from 'node:assert/strict'
import test from 'node:test'
import { installNativePrimaryBridge } from '../src/native-primary-bridge.mjs'

const owner = { connectionId: 'local', profile: 'default' }
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function setup(actions = {}, patch = {}) {
  const events = new Map(), calls = [], gaps = []
  const listen = name => fn => { calls.push(['listen', name]); events.set(name, fn); return () => { calls.push(['off', name]); events.delete(name) } }
  const host = {
    quickEntry: { onSubmit: listen('submit'), pushState: value => calls.push(['quick', value]), ackSubmit: (id, result) => calls.push(['ack', id, result]) },
    petOverlay: { onControl: listen('pet'), pushState: value => calls.push(['pet', value]) },
    onDeepLink: listen('deep'), onFocusSession: listen('focus'), onOpenFolderRequested: listen('folder'), onOpenUpdatesRequested: listen('updates'),
    signalDeepLinkReady: async () => { calls.push(['ready']); events.get('deep')?.({ kind: 'open', name: 'sessions', params: {} }); return { ok: true } },
    setNativeTheme: mode => calls.push(['theme', mode]),
  }
  let state = { owner: { ...owner }, quickEntry: { connected: true, sessions: [] }, ...patch }, notify
  const bridge = installNativePrimaryBridge({ host, owner, getState: () => state, subscribe: callback => { notify = callback; return () => { notify = null; calls.push(['off', 'state']) } }, actions, onGap: gap => gaps.push(gap) })
  return { bridge, events, calls, gaps, update(value) { state = { ...state, ...value }; notify?.() } }
}

test('installs the deep-link handler before releasing queued native links and disposes all subscriptions', async () => {
  const seen = []
  const fixture = setup({ deepLink: (payload, context) => seen.push([payload, context.owner]) })
  assert.deepEqual(seen, [[{ kind: 'open', name: 'sessions', params: {} }, owner]])
  assert.ok(fixture.calls.findIndex(row => row[0] === 'listen' && row[1] === 'deep') < fixture.calls.findIndex(row => row[0] === 'ready'))
  fixture.bridge.dispose(); fixture.bridge.dispose()
  assert.equal(fixture.events.size, 0)
  assert.equal(fixture.calls.filter(row => row[0] === 'off' && row[1] === 'state').length, 1)
})

test('quick entry publishes connected truth and only five unarchived native session options', () => {
  const fixture = setup({}, { quickEntry: { connected: true, sessions: [{ id: 'gone', archived: true }, { id: 's1', title: ' Title ', token: 'not-projected' }, { id: 's2', preview: ' Preview ' }, ...[3, 4, 5, 6].map(n => ({ id: 's' + n }))] } })
  assert.deepEqual(fixture.calls.find(row => row[0] === 'quick')[1], { connected: true, sessions: [{ id: 's1', title: 'Title' }, { id: 's2', title: 'Preview' }, { id: 's3', title: 's3' }, { id: 's4', title: 's4' }, { id: 's5', title: 's5' }] })
  fixture.update({ quickEntry: { connected: false, sessions: [] } })
  assert.deepEqual(fixture.calls.filter(row => row[0] === 'quick').at(-1)[1], { connected: false, sessions: [] })
  fixture.bridge.dispose()
})

test('quick entry preserves target and text, then acknowledges native admission exactly once', async () => {
  const pending = deferred(), received = []
  const fixture = setup({ submitQuickEntry: (payload, context) => { received.push([payload, context]); return pending.promise } })
  const payload = { correlationId: 'q1', target: 'stored-a', text: ' original prompt ' }
  fixture.events.get('submit')(payload); fixture.events.get('submit')(payload)
  assert.equal(received.length, 1)
  assert.deepEqual(received[0][0], payload)
  assert.equal(fixture.calls.filter(row => row[0] === 'ack').length, 0)
  pending.resolve({ ok: true, sessionId: 'stored-a', runtimeSessionId: 'runtime-a' }); await tick()
  assert.deepEqual(fixture.calls.filter(row => row[0] === 'ack'), [['ack', 'q1', { ok: true, sessionId: 'stored-a', runtimeSessionId: 'runtime-a' }]])
  fixture.bridge.dispose()
})

test('picked-session success never claims another target and malformed acceptance never becomes success', async () => {
  const fixture = setup({ submitQuickEntry: payload => payload.target === 'stored-a' ? { ok: true, sessionId: 'stored-b', runtimeSessionId: 'r' } : true })
  fixture.events.get('submit')({ correlationId: 'q1', target: 'stored-a', text: 'hello' })
  fixture.events.get('submit')({ correlationId: 'q2', target: 'new', text: 'hello' }); await tick()
  const results = fixture.calls.filter(row => row[0] === 'ack')
  assert.equal(results[0][2].ok, false); assert.equal(results[0][2].retryable, false)
  assert.equal(results[1][2].ok, false); assert.equal(results[1][2].retryable, false)
  fixture.bridge.dispose()
})

test('quick entry returns explicit unavailable without a submit callback and preserves native rejection', async () => {
  const fixture = setup()
  fixture.events.get('submit')({ correlationId: 'q1', target: 'current', text: 'hello' }); await tick()
  assert.equal(fixture.calls.find(row => row[0] === 'ack')[2].code, 'submit-unavailable')
  assert.equal(fixture.calls.find(row => row[0] === 'ack')[2].ok, false)
  assert.equal(fixture.calls.some(row => row[0] === 'ready'), false)
  fixture.bridge.dispose()
  const rejection = { ok: false, code: 'busy', message: 'Busy', retryable: true }
  const rejected = setup({ submitQuickEntry: () => rejection })
  rejected.events.get('submit')({ correlationId: 'q2', target: 'current', text: 'hello' }); await tick()
  assert.deepEqual(rejected.calls.find(row => row[0] === 'ack')[2], rejection)
  rejected.bridge.dispose()
})

test('unknown dispatch failures are not advertised as retryable', async () => {
  const fixture = setup({ submitQuickEntry: () => { throw new Error('wire lost') } })
  fixture.events.get('submit')({ correlationId: 'q1', target: 'current', text: 'hello' }); await tick()
  const result = fixture.calls.find(row => row[0] === 'ack')[2]
  assert.equal(result.ok, false); assert.equal(result.retryable, false)
  fixture.bridge.dispose()
})

test('owner changes abort callbacks and suppress stale admission acknowledgements and state', async () => {
  const pending = deferred(); let context
  const fixture = setup({ submitQuickEntry: (_, ctx) => { context = ctx; return pending.promise } })
  fixture.events.get('submit')({ correlationId: 'q1', target: 'new', text: 'hello' })
  fixture.update({ owner: { connectionId: 'remote', profile: 'other' } })
  assert.equal(context.signal.aborted, true); assert.equal(context.isCurrent(), false)
  pending.resolve({ ok: true, sessionId: 'new-a', runtimeSessionId: 'runtime-a' }); await tick()
  assert.equal(fixture.calls.filter(row => row[0] === 'ack').length, 0)
  assert.deepEqual(fixture.calls.filter(row => row[0] === 'quick').at(-1)[1], { connected: false, sessions: [] })
  assert.equal(fixture.events.size, 0)
})

test('equivalent default-profile route keeps the lifetime and explicit dispose aborts pending work', async () => {
  let context; const pending = deferred()
  const fixture = setup({ submitQuickEntry: (_, ctx) => { context = ctx; return pending.promise } })
  fixture.update({ owner: { connectionId: 'local', profile: '' } })
  fixture.events.get('submit')({ correlationId: 'q1', target: 'new', text: 'hello' })
  assert.equal(context.isCurrent(), true); assert.equal(Object.isFrozen(context.owner), true)
  fixture.bridge.dispose(); assert.equal(context.signal.aborted, true)
  pending.resolve({ ok: true, sessionId: 's', runtimeSessionId: 'r' }); await tick()
  assert.equal(fixture.calls.some(row => row[0] === 'ack'), false)
})

test('native actions receive the original focus identity, deep-link payload and client update target', () => {
  const received = []
  const fixture = setup({ deepLink: value => received.push(['deep', value]), focusSession: value => received.push(['focus', value]), openFolder: () => received.push(['folder']), openUpdates: value => received.push(['updates', value]) })
  fixture.events.get('focus')('runtime:1'); fixture.events.get('folder')(); fixture.events.get('updates')()
  assert.deepEqual(received.slice(1), [['focus', 'runtime:1'], ['folder'], ['updates', { target: 'client' }]])
  fixture.bridge.dispose()
})

test('pet ready restores the original snapshot and pet controls route without inventing submit success', () => {
  const pet = { info: { enabled: true, slug: 'owl', spritesheetBase64: 'aA==' }, activity: { busy: true }, busy: true, awaiting: false, unread: true, reaction: { id: 2, kind: 'vibe' }, pluginMessages: [{ key: 'p:1', pluginId: 'p', pluginName: 'Plugin', text: 'Hi', tone: 'info', seq: 1 }] }
  const received = []
  const actions = Object.fromEntries(['submitPet', 'popInPet', 'savePetBounds', 'setPetScale', 'openPetApp'].map(name => [name, (...args) => received.push([name, ...args])]))
  const fixture = setup(actions, { petOverlay: pet, petOverlayActive: false })
  assert.equal(fixture.calls.some(row => row[0] === 'pet'), false)
  fixture.events.get('pet')({ type: 'ready' })
  assert.deepEqual(fixture.calls.find(row => row[0] === 'pet')[1], pet)
  for (const control of [{ type: 'submit', text: 'hi' }, { type: 'scale', scale: 0.5 }, { type: 'bounds', bounds: { x: -10, y: 20, width: 240, height: 300 } }, { type: 'open-app' }, { type: 'pop-in' }]) fixture.events.get('pet')(control)
  assert.deepEqual(received.map(row => row[0]), ['submitPet', 'setPetScale', 'savePetBounds', 'openPetApp', 'popInPet'])
  assert.equal(received[0][1], 'hi')
  fixture.update({ petOverlayActive: true })
  assert.equal(fixture.calls.filter(row => row[0] === 'pet').length, 2)
  fixture.bridge.dispose()
})

test('theme sync respects system preference and the actual rendered palette', () => {
  const fixture = setup({}, { theme: { preference: 'system', rendered: 'dark' } })
  fixture.update({ theme: { preference: 'light', rendered: 'dark' } })
  fixture.update({ theme: { preference: 'light', rendered: 'dark' } })
  assert.deepEqual(fixture.calls.filter(row => row[0] === 'theme'), [['theme', 'system'], ['theme', 'dark']])
  fixture.bridge.dispose()
})

test('uncorrelated or empty quick submissions do not dispatch, and current slash success claims no session', async () => {
  const received = []
  const fixture = setup({ submitQuickEntry: payload => { received.push(payload); return { ok: true, token: 'not-projected' } } })
  for (const payload of ['legacy prompt', {}, { text: 'text' }, { correlationId: 'empty', text: '   ' }]) fixture.events.get('submit')(payload)
  assert.equal(received.length, 0)
  fixture.events.get('submit')({ correlationId: 'slash', target: 'current', text: '/help' }); await tick()
  assert.deepEqual(fixture.calls.filter(row => row[0] === 'ack'), [['ack', 'slash', { ok: true }]])
  fixture.bridge.dispose()
})

test('queued native events and asynchronous action failures cannot affect a disposed owner', async () => {
  const pending = deferred(), failures = []
  const fixture = setup({ openFolder: async context => { await pending.promise; if (context.isCurrent()) failures.push('stale UI mutation'); throw new Error('late failure') } })
  const queuedFocus = fixture.events.get('focus'), queuedFolder = fixture.events.get('folder')
  fixture.events.get('folder')()
  fixture.bridge.dispose()
  queuedFocus('stored-a'); queuedFolder()
  pending.resolve(); await tick()
  assert.deepEqual(failures, [])
  assert.equal(fixture.gaps.some(gap => gap.feature === 'openFolder'), false)
})
