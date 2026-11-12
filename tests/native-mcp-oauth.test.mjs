import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeMcpOAuth } from '../src/native-mcp-oauth.mjs'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture({ redirect = 'http://127.0.0.1:1234/callback', bridge = true } = {}) {
  const calls = [], callback = deferred(), stops = new Set()
  let poll = { ok: true, status: 'pending' }
  const host = bridge ? { mcpOauth: { listen: async () => ({ id: 'listener', redirectUri: redirect }), wait: () => callback.promise, cancel: async id => { calls.push(['close', id]); return true } } } : {}
  const rpc = async (method, params, profile) => {
    calls.push([method, params, profile])
    if (method.endsWith('.start')) return { ok: true, session_id: 'session', auth_url: 'https://auth.example/authorize?redirect_uri=' + encodeURIComponent(redirect) }
    if (method.endsWith('.poll')) return poll
    return { ok: true }
  }
  const service = createNativeMcpOAuth({ host, rpc, route: { connectionId: 'remote-work' }, stops })
  return { service, host, calls, callback, stops, setPoll: value => { poll = value } }
}

test('MCP OAuth uses original native loopback and relays state/code to the original Profile', async () => {
  const f = fixture(), start = await f.service.start('writer', { name: 'docs' })
  assert.equal(start.auth_url.startsWith('https://auth.example/'), true)
  assert.deepEqual(f.calls[0], ['mcp.servers.oauth.start', { name: 'docs', client_redirect_uri: 'http://127.0.0.1:1234/callback' }, 'writer'])
  f.callback.resolve({ code: 'fixture-code', error: null, state: 'fixture-state', iss: null }); await tick()
  assert.deepEqual(f.calls[1], ['mcp.servers.oauth.callback', { name: 'docs', session_id: 'session', code: 'fixture-code', error: null, state: 'fixture-state' }, 'writer'])
  f.setPoll({ ok: true, status: 'approved', tools: [] })
  assert.equal((await f.service.poll('writer', { name: 'docs', handle: start.handle })).status, 'approved')
  assert.equal(f.calls.filter(row => row[0] === 'close').length, 1)
})

test('MCP cancel closes native waiter before backend cancellation; late callback cannot commit', async () => {
  const f = fixture(), start = await f.service.start('writer', { name: 'docs' })
  await f.service.cancel('writer', { name: 'docs', handle: start.handle })
  f.callback.resolve({ code: 'late', state: 'late' }); await tick()
  assert.equal(f.calls.some(row => row[0].endsWith('.callback')), false)
  assert.ok(f.calls.findIndex(row => row[0] === 'close') < f.calls.findIndex(row => row[0].endsWith('.cancel')))
})

test('MCP handles never cross Profile/server scope and a remote host without native callback cannot start', async () => {
  const f = fixture(), start = await f.service.start('writer', { name: 'docs' })
  await assert.rejects(f.service.poll('coder', { name: 'docs', handle: start.handle }), /归属/)
  await assert.rejects(f.service.cancel('writer', { name: 'other', handle: start.handle }), /归属/)
  const unavailable = fixture({ bridge: false })
  await assert.rejects(unavailable.service.start('writer', { name: 'docs' }), /本机.*回调/)
  assert.equal(unavailable.calls.length, 0)
  await f.service.cancel('writer', { name: 'docs', handle: start.handle })
})

test('MCP old backend redirect mismatch is rejected before the browser is offered', async () => {
  const f = fixture()
  const original = f.host.mcpOauth.listen
  f.host.mcpOauth.listen = async () => ({ ...await original(), redirectUri: 'http://127.0.0.1:9999/callback' })
  await assert.rejects(f.service.start('writer', { name: 'docs' }), /升级.*后端/)
  assert.ok(f.calls.some(row => row[0] === 'close'))
  assert.ok(f.calls.some(row => row[0].endsWith('.cancel')))
})

test('MCP client disposal releases listeners and suppresses stale callback completions', async () => {
  const f = fixture(); await f.service.start('writer', { name: 'docs' })
  for (const stop of f.stops) stop()
  await tick(); f.callback.resolve({ code: 'late', state: 'late' }); await tick()
  assert.equal(f.calls.some(row => row[0].endsWith('.callback')), false)
  await assert.rejects(f.service.start('writer', { name: 'docs' }), /关闭/)
})

test('a native listener created after disposal is still canceled without starting backend OAuth', async () => {
  const f = fixture(), pending = deferred()
  f.host.mcpOauth.listen = () => pending.promise
  const starting = f.service.start('writer', { name: 'docs' })
  f.service.dispose()
  pending.resolve({ id: 'late-listener', redirectUri: 'http://127.0.0.1:1234/callback' })
  await assert.rejects(starting, /关闭/)
  assert.deepEqual(f.calls, [['close', 'late-listener']])
})
