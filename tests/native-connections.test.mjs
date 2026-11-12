import assert from 'node:assert/strict'
import test from 'node:test'
import { connectionDraft, connectionPayload, createNativeConnectionsController } from '../src/native-connections.mjs'

const route = { connectionId: 'local', profile: 'default' }
const local = { id: 'local', kind: 'local', label: '本机', tokenSet: false }
const remote = { id: 'remote', kind: 'remote', label: '工作站', url: 'https://gateway.example', authMode: 'token', tokenSet: true, headerNames: ['CF-Access-Client-Id'] }
const registry = { version: 2, primary: 'local', launchMode: 'primary', secureTokenStorage: true, connections: [local, remote] }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function fixture(overrides = {}, extras = {}) {
  const calls = [], opened = []
  const host = { connections: {
    list: async () => registry,
    save: async payload => { calls.push(['save', payload]); return { ok: true, connection: { ...remote, ...payload }, registry } },
    remove: async id => { calls.push(['remove', id]); return { ok: true, registry: { ...registry, connections: [local] } } },
    test: async id => { calls.push(['test', id]); return { ok: true } },
    setPrimary: async id => { calls.push(['primary', id]); return { ok: true, registry: { ...registry, primary: id } } },
    setLaunchMode: async mode => { calls.push(['launch', mode]); return { ok: true, registry: { ...registry, launchMode: mode } } },
    ...overrides,
  }, ...extras }
  let currentRoute = route
  const controller = createNativeConnectionsController({ host, currentRoute: route, getCurrentRoute: () => currentRoute, onActivate: value => opened.push(value) })
  return { controller, host, calls, opened, changeOwner: value => { currentRoute = value } }
}

test('unchanged remote secrets are omitted or retained by name, never hydrated into the draft', () => {
  const draft = connectionDraft({ ...remote, tokenPreview: 'do-not-copy', token: 'unexpected-native-secret' })
  assert.equal(draft.token, '')
  assert.equal(Object.hasOwn(draft, 'tokenPreview'), false)
  assert.deepEqual(connectionPayload(draft), { id: 'remote', kind: 'remote', label: '工作站', url: 'https://gateway.example', authMode: 'token', headers: { 'CF-Access-Client-Id': null } })
  assert.equal(Object.hasOwn(connectionPayload(draft), 'token'), false)
})

test('SSH editing sends the edited composite host without stale user/port fields', () => {
  const draft = connectionDraft({ id: 'ssh', kind: 'ssh', label: '开发机', host: 'old', user: 'alice', port: 2200, keyPath: '/keys/id', remoteProfile: 'coder' })
  assert.equal(draft.host, 'alice@old:2200')
  const payload = connectionPayload({ ...draft, host: 'bob@new:2222' })
  assert.equal(payload.host, 'bob@new:2222')
  assert.equal(payload.remoteProfile, 'coder')
  assert.equal(Object.hasOwn(payload, 'user'), false)
  assert.equal(Object.hasOwn(payload, 'port'), false)
})

test('save uses only native storage; rejection keeps the draft and native error across refresh/edit', async () => {
  const f = fixture({ save: async () => { throw new Error('native storage unavailable') } })
  await f.controller.load(); f.controller.edit('remote'); f.controller.patchDraft({ token: 'new-secret' })
  assert.equal(await f.controller.save(), false)
  assert.equal(f.controller.getSnapshot().error, 'native storage unavailable')
  assert.equal(f.controller.getSnapshot().draft.token, 'new-secret')
  await f.controller.load(); f.controller.patchDraft({ label: '重新命名' })
  assert.equal(f.controller.getSnapshot().error, 'native storage unavailable')
  f.controller.dispose()
  assert.equal(f.controller.getSnapshot().draft, null)
})

test('plaintext secret storage needs a separate explicit confirmation and never retries automatically', async () => {
  const f = fixture({ list: async () => ({ ...registry, secureTokenStorage: false }) })
  await f.controller.load(); f.controller.edit('remote'); f.controller.patchDraft({ token: 'fixture-secret' })
  assert.equal(await f.controller.save(), false)
  assert.equal(f.calls.length, 0)
  assert.equal(f.controller.getSnapshot().confirmation.kind, 'plaintext')
  await f.controller.confirm()
  assert.equal(f.calls[0][1].allowPlainTextToken, true)
  assert.equal(f.calls[0][1].token, 'fixture-secret')
  assert.equal(f.controller.getSnapshot().draft, null)
})

test('native errors do not expose draft token/header values including trimmed payload values', async () => {
  const f = fixture({ save: async () => { throw new Error('fixture-secret:header-secret') } })
  await f.controller.load(); f.controller.edit('remote')
  f.controller.patchDraft({ token: ' fixture-secret ', headers: [{ name: 'X-Auth', value: ' header-secret ', stored: false }] })
  await f.controller.save()
  assert.equal(f.controller.getSnapshot().error.includes('fixture-secret'), false)
  assert.equal(f.controller.getSnapshot().error.includes('header-secret'), false)
})

test('remove requires confirmation and refuses local/current routes before native mutation', async () => {
  const f = fixture(); await f.controller.load()
  assert.equal(f.controller.requestRemove('local'), false)
  assert.equal(f.controller.requestRemove('remote'), true)
  assert.equal(f.calls.length, 0)
  await f.controller.confirm()
  assert.deepEqual(f.calls, [['remove', 'remote']])
  const active = createNativeConnectionsController({ host: f.host, currentRoute: { connectionId: 'remote', profile: 'default' } })
  await active.load()
  assert.equal(active.requestRemove('remote'), false)
  assert.match(active.getSnapshot().error, /请先打开其他连接/)
  assert.deepEqual(f.calls, [['remove', 'remote']])
})

test('failed confirmation remains available with the native refusal', async () => {
  const f = fixture({ remove: async () => ({ ok: false, error: 'connection is busy' }) })
  await f.controller.load(); f.controller.requestRemove('remote')
  assert.equal(await f.controller.confirm(), false)
  assert.equal(f.controller.getSnapshot().confirmation.id, 'remote')
  assert.equal(f.controller.getSnapshot().error, 'connection is busy')
})

test('opening a saved route delegates lifecycle while primary and startup changes remain staged', async () => {
  const f = fixture(); await f.controller.load()
  await f.controller.makePrimary('remote'); await f.controller.setLaunchMode('last-used')
  assert.equal(f.opened.length, 0)
  await f.controller.activate('remote')
  assert.deepEqual(f.opened, [{ connectionId: 'remote', profile: 'default' }])
  await f.controller.test('remote')
  assert.equal(f.controller.getSnapshot().notice, '连接测试通过。')
})

test('late list completion cannot replace a newer list', async () => {
  const first = deferred(), second = deferred(); let count = 0
  const f = fixture({ list: () => (++count === 1 ? first.promise : second.promise) })
  const a = f.controller.load(), b = f.controller.load()
  second.resolve({ ...registry, primary: 'remote' }); await b
  first.resolve(registry); await a
  assert.equal(f.controller.getSnapshot().registry.primary, 'remote')
})

test('owner change or dispose suppresses late state/error/activation completion', async () => {
  const pending = deferred(), f = fixture({ list: () => pending.promise })
  const loading = f.controller.load()
  f.changeOwner({ connectionId: 'another', profile: 'coder' })
  pending.resolve(registry); await loading
  assert.equal(f.controller.getSnapshot().registry, null)
  assert.equal(await f.controller.activate('remote'), false)
  const save = deferred(), g = fixture({ save: () => save.promise })
  await g.controller.load(); g.controller.edit('remote')
  const saving = g.controller.save(); g.controller.dispose()
  save.reject(new Error('late failure')); await saving
  assert.equal(g.controller.getSnapshot().error, '')
  assert.equal(g.controller.getSnapshot().draft, null)
})

test('OAuth uses the native draft identity and pins its settled id only into the same editor', async () => {
  const received = [], f = fixture({}, { oauthLoginConnectionConfig: async (...args) => { received.push(args); return { ok: true, connected: true, connectionId: 'settled-id' } } })
  await f.controller.load(); f.controller.create('remote'); f.controller.patchDraft({ label: '另一台', url: 'box.example:8080', authMode: 'oauth' })
  await f.controller.signIn()
  assert.deepEqual(received, [['http://box.example:8080', { connectionId: null, label: '另一台', kind: 'remote', authMode: 'oauth' }]])
  assert.equal(f.controller.getSnapshot().draft.id, 'settled-id')
  await f.controller.save()
  assert.equal(f.calls[0][1].id, 'settled-id')
  const pending = deferred(), g = fixture({}, { oauthLoginConnectionConfig: () => pending.promise })
  await g.controller.load(); g.controller.create('remote'); g.controller.patchDraft({ label: '旧', url: 'https://old.example', authMode: 'oauth' })
  const login = g.controller.signIn(); g.controller.patchDraft({ url: 'https://new.example' })
  pending.resolve({ ok: true, connected: true, connectionId: 'old-id' }); await login
  assert.equal(g.controller.getSnapshot().draft.id, null)
  assert.equal(g.controller.getSnapshot().draft.oauthConnected, false)
})

test('SSH host resolution and URL probe stay bound to their originating draft', async () => {
  const pending = deferred(), f = fixture({}, { sshConfigHosts: async () => ({ hosts: ['work'] }), sshResolveHost: () => pending.promise, probeConnectionConfig: async () => ({ reachable: false, error: 'gateway refused' }) })
  await f.controller.load(); f.controller.create('ssh'); f.controller.patchDraft({ host: 'work', label: '工作' })
  await f.controller.loadSshHosts()
  assert.deepEqual(f.controller.getSnapshot().sshHosts, ['work'])
  const resolving = f.controller.resolveSsh(); f.controller.patchDraft({ host: 'other' })
  pending.resolve({ identityFile: '/keys/old' }); await resolving
  assert.equal(f.controller.getSnapshot().draft.keyPath, '')
  f.controller.create('remote'); f.controller.patchDraft({ label: 'URL', url: 'https://box.example' })
  assert.equal(await f.controller.probe(), false)
  assert.equal(f.controller.getSnapshot().error, 'gateway refused')
})

test('managed/all updates require confirmation and retain per-row refusal details', async () => {
  const updated = [], ssh = { id: 'ssh', kind: 'ssh', label: '开发机', host: 'work' }
  const f = fixture({ list: async () => ({ ...registry, connections: [local, remote, ssh] }), updateManaged: async id => { updated.push(id); return { ok: false, error: 'active drain refused', outcome: 'refused' } }, updateAll: async () => ({ ok: false, results: [{ connectionId: 'remote', label: '工作站', ok: false, skipped: true, reason: 'external-url' }] }) })
  await f.controller.load()
  assert.equal(f.controller.requestUpdate('remote'), false)
  assert.equal(f.controller.requestUpdate('ssh'), true)
  assert.equal(updated.length, 0)
  await f.controller.confirm()
  assert.equal(f.controller.getSnapshot().error, 'active drain refused')
  f.controller.cancelConfirmation(); f.controller.requestUpdateAll(); await f.controller.confirm()
  assert.equal(f.controller.getSnapshot().updateResults[0].reason, 'external-url')
})

test('an old registry read cannot replace a completed primary mutation', async () => {
  const pending = deferred(); let count = 0
  const f = fixture({ list: () => ++count === 1 ? registry : pending.promise })
  await f.controller.load()
  const loading = f.controller.load()
  await f.controller.makePrimary('remote')
  pending.resolve(registry); await loading
  assert.equal(f.controller.getSnapshot().registry.primary, 'remote')
})

test('a save cannot close a replacement draft or carry plaintext consent to it', async () => {
  const pending = deferred(), f = fixture({ save: () => pending.promise })
  await f.controller.load(); f.controller.edit('remote')
  const saving = f.controller.save()
  f.controller.create('ssh'); f.controller.patchDraft({ label: '另一份', host: 'new-host' })
  pending.resolve({ ok: true, registry }); await saving
  assert.equal(f.controller.getSnapshot().draft.kind, 'ssh')
  assert.equal(f.controller.getSnapshot().draft.label, '另一份')
  const g = fixture({ list: async () => ({ ...registry, secureTokenStorage: false }) })
  await g.controller.load(); g.controller.edit('remote'); g.controller.patchDraft({ token: 'typed-secret' })
  await g.controller.save()
  g.controller.patchDraft({ url: 'https://new.example' })
  assert.equal(await g.controller.confirm(), false)
  assert.equal(g.calls.length, 0)
})

test('registry subscription is released once, late events cannot restart disposed work', async () => {
  let notify, removed = 0, listed = 0
  const f = fixture({ onChanged: callback => { notify = callback; return () => { removed++ } }, list: async () => { listed++; return registry } })
  await f.controller.load()
  f.controller.dispose(); f.controller.dispose(); notify({ reason: 'saved', connectionId: 'remote' })
  assert.equal(removed, 1)
  assert.equal(listed, 1)
})

test('unavailable native APIs and failed tests surface errors without changing routes', async () => {
  const f = fixture({ test: async () => ({ ok: false, reachable: false, error: 'SSH authentication refused' }) })
  await f.controller.load(); assert.equal(await f.controller.test('remote'), false)
  assert.equal(f.controller.getSnapshot().error, 'SSH authentication refused')
  assert.equal(f.controller.getSnapshot().notice, '')
  assert.equal(f.opened.length, 0)
  const manager = createNativeConnectionsController({ host: {}, currentRoute: route })
  assert.equal(await manager.load(), false)
  assert.match(manager.getSnapshot().error, /未提供/)
})
