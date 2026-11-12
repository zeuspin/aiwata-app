import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'

async function client(t, handler, grant) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const origin = `http://127.0.0.1:${server.address().port}`
  const module = await import('../scripts/live-aiwata-native-http.mjs').catch(() => ({}))
  assert.equal(typeof module.nativeComputerRequest, 'function')
  return (action, active = () => true, profile = '') => module.nativeComputerRequest({ action, profile,
    active, grant: () => grant ? grant(origin) : { origin, ticket: 'one-use-fixture' } })
}

test('Computer Use status uses native REST with a private one-use profile ticket', async t => {
  const request = await client(t, (req, res) => {
    assert.equal(req.url, '/api/tools/computer-use/status?profile=bot-one')
    assert.equal(req.method, 'GET')
    assert.equal(req.headers['x-hermes-gateway-ticket'], 'one-use-fixture')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ installed: true, ready: null, accessibility: null, can_grant: true }))
  })
  assert.deepEqual(await request('status', () => true, 'bot-one'), {
    installed: true, ready: null, accessibility: null, can_grant: true,
  })
})

test('permission initiation and progress preserve the native asynchronous action contract', async t => {
  const seen = []
  const request = await client(t, (req, res) => {
    seen.push([req.method, req.url])
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(req.method === 'POST' ? { ok: true, name: 'computer-use-grant' } : { running: false, exit_code: 0 }))
  })
  assert.deepEqual(await request('permissions'), { ok: true, name: 'computer-use-grant' })
  assert.deepEqual(await request('permissionStatus'), { running: false, exit_code: 0 })
  assert.deepEqual(seen, [['POST', '/api/tools/computer-use/permissions/grant?profile=default'],
    ['GET', '/api/actions/computer-use-grant/status?profile=default']])
})

test('unsupported actions, unsafe origins, redirects and revoked logins never forward arbitrary requests', async t => {
  let calls = 0
  const request = await client(t, (_, res) => { calls++; res.writeHead(302, { location: 'https://example.com' }); res.end() })
  await assert.rejects(request('install'), /请求/)
  await assert.rejects(request('status', () => false), /退出/)
  await assert.rejects(request('status'), /原生/)
  assert.equal(calls, 1)
  const unsafe = await client(t, (_, res) => { calls++; res.end('{}') }, () => ({ origin: 'https://example.com', ticket: 'private' }))
  await assert.rejects(unsafe('status'), /地址/)
  assert.equal(calls, 1)
})

test('a login revoked while acquiring its native grant does not reach the endpoint', async t => {
  let active = true, calls = 0
  const request = await client(t, (_, res) => { calls++; res.end('{}') }, origin => {
    active = false; return { origin, ticket: 'private' }
  })
  await assert.rejects(request('status', () => active), /退出/)
  assert.equal(calls, 0)
})

test('native file and Git reads use fixed read-only endpoints and preserve Profile in query', async t => {
  const server = createServer((req, res) => {
    assert.equal(req.method, 'GET')
    const url = new URL(req.url, 'http://local')
    assert.equal(url.pathname, '/api/git/status')
    assert.equal(url.searchParams.get('path'), '/Users/owner/project')
    assert.equal(url.searchParams.get('profile'), 'bot')
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ branch: 'main', files: [] }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const { nativeReadRequest } = await import('../scripts/live-aiwata-native-http.mjs')
  assert.equal(typeof nativeReadRequest, 'function')
  const context = { profile: 'bot', active: () => true, grant: () => ({ origin: `http://127.0.0.1:${server.address().port}`, ticket: 'fixture' }) }
  assert.deepEqual(await nativeReadRequest({ ...context, action: 'gitStatus', params: { path: '/Users/owner/project' } }), { branch: 'main', files: [] })
  await assert.rejects(nativeReadRequest({ ...context, action: 'gitPush', params: {} }))
  await assert.rejects(nativeReadRequest({ ...context, action: 'gitStatus', params: { path: '/x', url: 'https://other' } }))
})
