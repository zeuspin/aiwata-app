import test from 'node:test'
import assert from 'node:assert/strict'
const native = await import('../scripts/desktop-preview-devtools.mjs').catch(() => ({}))

function fixture() {
  const frame = { url: 'http://127.0.0.1:4181/' }
  const renderer = { mainFrame: frame }
  const event = { sender: renderer, senderFrame: frame }
  const calls = []
  const session = {}
  let open = false
  let url = 'https://example.com/'
  let loading = false
  let destroyed = false
  let epoch = 1
  const guest = {
    id: 12, session,
    isDestroyed: () => destroyed,
    isLoadingMainFrame: () => loading,
    getURL: () => url,
    isDevToolsOpened: () => open,
    openDevTools(options) { calls.push(['open', options]); open = true },
    closeDevTools() { calls.push(['close']); open = false },
  }
  const initial = { partition: 'account-scope', session, guests: new Set([guest]), closed: false }
  let scope = initial
  assert.equal(typeof native.createPreviewDevToolsHandler, 'function', 'native DevTools handler is implemented')
  const handle = native.createPreviewDevToolsHandler({ renderer, origin: 'http://127.0.0.1:4181', getScope: () => scope, getEpoch: () => epoch })
  const invoke = (command = { action: 'toggle' }, overrides = {}) => handle(overrides.event ?? event, overrides.partition ?? 'account-scope', overrides.guestId ?? 12, overrides.url ?? 'https://example.com/', command)
  return { invoke, guest, calls, event, renderer, initial, setScope: value => { scope = value }, setUrl: value => { url = value }, setLoading: value => { loading = value }, destroy: () => { destroyed = true }, navigate: () => { epoch++ } }
}

test('only the trusted workbench main frame can use native DevTools', () => {
  const f = fixture()
  for (const event of [
    { sender: {}, senderFrame: f.event.senderFrame },
    { sender: f.renderer, senderFrame: { url: 'http://127.0.0.1:4181/' } },
    { sender: f.renderer, senderFrame: null },
  ]) assert.equal(f.invoke({ action: 'toggle' }, { event }).success, false)
  f.event.senderFrame.url = 'https://example.com/'
  assert.equal(f.invoke().success, false)
  assert.equal(f.calls.length, 0)
})

test('DevTools cannot target another partition, an unowned guest or an incompatible document', () => {
  const f = fixture()
  for (const overrides of [{ partition: 'another-account' }, { guestId: 99 }, { guestId: -1 }, { guestId: '12' }, { url: 'https://example.com/other' }, { url: 'javascript:evil()' }]) {
    assert.equal(f.invoke({ action: 'toggle' }, overrides).success, false)
  }
  f.setLoading(true)
  assert.equal(f.invoke().success, false)
  f.setLoading(false)
  f.initial.closed = true
  assert.equal(f.invoke().success, false)
  assert.equal(f.calls.length, 0)
})

test('only fixed DevTools commands are admitted and no page code is accepted', () => {
  const f = fixture()
  for (const command of [null, {}, [], { action: 'execute', code: 'evil()' }, { action: 'open', guestId: 99 }, { action: 'toggle', code: 'evil()' }]) {
    assert.equal(f.invoke(command).success, false)
  }
  assert.equal(f.calls.length, 0)
})

test('toggle opens the owned webview detached and state and close reflect native state', () => {
  const f = fixture()
  assert.deepEqual(f.invoke({ action: 'state' }), { success: true, open: false })
  assert.deepEqual(f.invoke(), { success: true, open: true })
  assert.deepEqual(f.calls, [['open', { mode: 'detach' }]])
  assert.deepEqual(f.invoke({ action: 'state' }), { success: true, open: true })
  assert.deepEqual(f.invoke(), { success: true, open: false })
  assert.deepEqual(f.invoke({ action: 'close' }), { success: true, open: false })
  assert.deepEqual(f.calls, [['open', { mode: 'detach' }], ['close'], ['close']])
})

test('an asynchronous native opening reports actual state until the opened event occurs', () => {
  const f = fixture()
  f.guest.openDevTools = options => { f.calls.push(['open', options]) }
  assert.deepEqual(f.invoke(), { success: true, open: false })
  assert.deepEqual(f.invoke({ action: 'state' }), { success: true, open: false })
})

test('a page change during the native action rejects the result and closes the requested DevTools', () => {
  const f = fixture()
  f.guest.openDevTools = options => { f.calls.push(['open', options]); f.navigate() }
  assert.equal(f.invoke().success, false)
  assert.deepEqual(f.calls, [['open', { mode: 'detach' }], ['close']])
})

test('account release and destroyed guests cannot leave usable DevTools handles', () => {
  const f = fixture()
  f.guest.openDevTools = options => { f.calls.push(['open', options]); f.setScope(null) }
  assert.equal(f.invoke().success, false)
  assert.deepEqual(f.calls, [['open', { mode: 'detach' }], ['close']])
  assert.equal(typeof native.closePreviewDevTools, 'function')
  const other = fixture()
  other.invoke()
  native.closePreviewDevTools(other.guest)
  assert.deepEqual(other.invoke({ action: 'state' }), { success: true, open: false })
  other.destroy()
  assert.doesNotThrow(() => native.closePreviewDevTools(other.guest))
  assert.equal(other.invoke().success, false)
})

test('close cancels an opening native DevTools window before its opened event', () => {
  const f = fixture()
  f.guest.openDevTools = options => { f.calls.push(['open', options]) }
  f.invoke()
  assert.deepEqual(f.invoke({ action: 'close' }), { success: true, open: false })
  assert.deepEqual(f.calls, [['open', { mode: 'detach' }], ['close']])
})

test('matching guest IDs cannot bypass native session membership', () => {
  const f = fixture()
  f.guest.session = {}
  assert.equal(f.invoke().success, false)
  assert.equal(f.calls.length, 0)
})

async function requestPolicyFixture() {
  const { configurePreviewSession } = await import('../scripts/desktop-preview-policy.mjs')
  let handler
  let active = true
  let owner = 501
  let dnsCalls = 0
  const browsing = {
    setPermissionCheckHandler() {}, setPermissionRequestHandler() {}, on() {},
    webRequest: { onBeforeRequest: value => { handler = value } },
    setProxy: async () => {},
    resolveHost: async () => { dnsCalls++; return { endpoints: [{ address: '93.184.216.34' }] } },
  }
  await configurePreviewSession(browsing, new Set(['http://127.0.0.1:5199']), () => active, id => id === owner)
  const request = (...args) => new Promise(resolve => handler({ url: args[0], webContentsId: args.length > 1 ? args[1] : 501 }, resolve))
  return { request, release: () => { active = false }, clearOwner: () => { owner = null }, dnsCalls: () => dnsCalls }
}

test('session request policy admits bundled DevTools only for the current native DevTools contents ID', async () => {
  const f = await requestPolicyFixture()
  assert.deepEqual(await f.request('devtools://devtools/bundled/devtools_app.html?can_dock=true'), { cancel: false })
  assert.deepEqual(await f.request('devtools://devtools/bundled/core/common/common.js'), { cancel: false })
  assert.equal(f.dnsCalls(), 0)
  for (const id of [12, 99, -1, undefined]) {
    assert.deepEqual(await f.request('devtools://devtools/bundled/devtools_app.html', id), { cancel: true })
  }
  f.clearOwner()
  assert.deepEqual(await f.request('devtools://devtools/bundled/devtools_app.html'), { cancel: true })
})

test('DevTools exception protects internal schemes while supporting native local development pages', async () => {
  const f = await requestPolicyFixture()
  for (const url of [
    'devtools://devtools/remote/devtools_app.html', 'devtools://other/bundled/devtools_app.html',
    'devtools://devtools/bundled/../remote/devtools_app.html', 'devtools://user@devtools/bundled/devtools_app.html',
    'file:///etc/passwd', 'chrome://settings/',
  ]) assert.deepEqual(await f.request(url), { cancel: true }, url)
  assert.deepEqual(await f.request('https://example.com/'), { cancel: false })
  assert.deepEqual(await f.request('http://127.0.0.1:5199/'), { cancel: false })
  assert.deepEqual(await f.request('http://10.0.0.1/'), { cancel: false })
  f.release()
  assert.deepEqual(await f.request('devtools://devtools/bundled/devtools_app.html'), { cancel: true })
  assert.deepEqual(await f.request('https://example.com/'), { cancel: true })
})

async function ownedWindowFixture({ navigateOnCreate = false } = {}) {
  const { EventEmitter } = await import('node:events')
  const calls = []
  let epoch = 1
  let current
  let manager
  let window
  const session = {}
  const guest = new EventEmitter()
  Object.assign(guest, {
    id: 12, session, devToolsWebContents: null, isDestroyed: () => false,
    setDevToolsWebContents(contents) { calls.push('set'); assert.equal(manager.owns(contents.id), true) },
    openDevTools(options) { calls.push(['open', options]); assert.equal(manager.owns(window.webContents.id), true) },
    closeDevTools() { calls.push('close'); guest.emit('devtools-closed') },
  })
  const scope = current = { session, guests: new Set([guest]), closed: false }
  assert.equal(typeof native.createOwnedPreviewDevToolsManager, 'function', 'owned native DevTools lifecycle is implemented')
  manager = native.createOwnedPreviewDevToolsManager({ getScope: () => current, getEpoch: () => epoch, createWindow: () => {
    window = new EventEmitter()
    let destroyed = false
    Object.assign(window, {
      webContents: { id: 501, session, isDestroyed: () => destroyed },
      isDestroyed: () => destroyed,
      show: () => calls.push('show'),
      destroy: () => { destroyed = true; calls.push('destroy'); window.emit('closed') },
    })
    if (navigateOnCreate) epoch++
    return window
  } })
  return { manager, guest, scope, calls, getWindow: () => window, release: () => { current = null }, navigate: () => { epoch++ } }
}

test('owned DevTools register their explicit WebContents before native first-request setup and show only after opened', async () => {
  const f = await ownedWindowFixture()
  f.manager.open(f.guest)
  assert.deepEqual(f.calls, ['set', ['open', { mode: 'detach' }]])
  assert.equal(f.manager.owns(501), true)
  assert.equal(f.manager.owns(12), false)
  f.guest.devToolsWebContents = f.getWindow().webContents
  f.guest.emit('devtools-opened')
  assert.equal(f.calls.at(-1), 'show')
  f.guest.emit('devtools-closed')
  assert.equal(f.manager.owns(501), false)
  assert.equal(f.getWindow().isDestroyed(), true)
})

test('owned DevTools destruction releases account ownership and native event handlers', async () => {
  const f = await ownedWindowFixture()
  f.manager.open(f.guest)
  f.release()
  assert.equal(f.manager.owns(501), false)
  f.guest.devToolsWebContents = f.getWindow().webContents
  f.guest.emit('devtools-opened')
  assert.equal(f.calls.includes('show'), false)
  assert.equal(f.getWindow().isDestroyed(), true)
  assert.equal(f.guest.listenerCount('devtools-opened'), 0)
  assert.equal(f.guest.listenerCount('devtools-closed'), 0)
})

test('a changed guest document cannot reveal or retain a pending owned DevTools window', async () => {
  const f = await ownedWindowFixture()
  f.manager.open(f.guest)
  f.navigate()
  assert.equal(f.manager.owns(501), false)
  f.guest.devToolsWebContents = f.getWindow().webContents
  f.guest.emit('devtools-opened')
  assert.equal(f.calls.includes('show'), false)
  assert.equal(f.getWindow().isDestroyed(), true)
})

test('the first bundled frontend request is admitted before the native DevTools getter becomes available', async () => {
  const { configurePreviewSession } = await import('../scripts/desktop-preview-policy.mjs')
  const f = await ownedWindowFixture()
  let request
  const browsing = {
    setPermissionCheckHandler() {}, setPermissionRequestHandler() {}, on() {},
    webRequest: { onBeforeRequest: value => { request = value } },
    setProxy: async () => {}, resolveHost: async () => { throw new Error('Internal frontend must not use DNS') },
  }
  await configurePreviewSession(browsing, new Set(), () => !f.scope.closed, id => f.manager.owns(id))
  let firstRequest
  f.guest.openDevTools = () => {
    assert.equal(f.guest.devToolsWebContents, null)
    firstRequest = new Promise(resolve => request({ url: 'devtools://devtools/bundled/devtools_app.html', webContentsId: f.getWindow().webContents.id }, resolve))
  }
  f.manager.open(f.guest)
  assert.deepEqual(await firstRequest, { cancel: false })
  f.manager.close(f.guest)
  const stale = await new Promise(resolve => request({ url: 'devtools://devtools/bundled/devtools_app.html', webContentsId: 501 }, resolve))
  assert.deepEqual(stale, { cancel: true })
})

test('destroying an inspected guest or closing its owned window destroys and unregisters the frontend', async () => {
  const f = await ownedWindowFixture()
  f.manager.open(f.guest)
  f.guest.emit('destroyed')
  assert.equal(f.getWindow().isDestroyed(), true)
  assert.equal(f.manager.owns(501), false)
  assert.equal(f.guest.listenerCount('devtools-opened'), 0)
  const other = await ownedWindowFixture()
  other.manager.open(other.guest)
  other.getWindow().destroy()
  assert.equal(other.manager.owns(501), false)
  assert.equal(other.guest.listenerCount('devtools-opened'), 0)
  assert.equal(other.calls.filter(item => item === 'close').length, 1)
})


test('a document change while creating the dedicated native window cannot change the admitted epoch', async () => {
  const f = await ownedWindowFixture({ navigateOnCreate: true })
  assert.throws(() => f.manager.open(f.guest))
  assert.equal(f.calls.includes('set'), false)
  assert.equal(f.getWindow().isDestroyed(), true)
  assert.equal(f.manager.owns(501), false)
})
