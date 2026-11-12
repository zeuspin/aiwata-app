import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeModelOAuth } from '../src/native-model-oauth.mjs'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  const calls = [], stops = new Set()
  const api = async (path, options) => {
    calls.push([path, options])
    if (path.endsWith('/start')) return { session_id: 'native-session', flow: 'device_code', user_code: 'ABCD', verification_url: 'https://auth.example/device', expires_in: 300 }
    if (path.includes('/poll/')) return { status: 'pending' }
    if (path.endsWith('/submit')) return { ok: true, status: 'approved' }
    return { ok: true }
  }
  return { calls, stops, api, service: createNativeModelOAuth({ api, stops }) }
}

test('provider OAuth reuses native start/long-poll/submit/cancel with exact Profile and no credentials in public handles', async () => {
  const f = fixture(), flow = await f.service.start('writer', { provider: 'openai-codex' })
  assert.equal(flow.user_code, 'ABCD'); assert.equal(Object.hasOwn(flow, 'session_id'), false)
  await f.service.poll('writer', { provider: 'openai-codex', handle: flow.handle })
  assert.deepEqual(f.calls[1], ['/api/providers/oauth/openai-codex/poll/native-session?wait=25', { profile: 'writer', timeoutMs: 45000 }])
  const result = await f.service.submit('writer', { provider: 'openai-codex', handle: flow.handle, code: ' fixture-code ' })
  assert.equal(result.status, 'approved')
  assert.deepEqual(f.calls[2], ['/api/providers/oauth/openai-codex/submit', { profile: 'writer', method: 'POST', body: { session_id: 'native-session', code: 'fixture-code' } }])
  const second = await f.service.start('writer', { provider: 'openai-codex' })
  await f.service.cancel('writer', { provider: 'openai-codex', handle: second.handle })
  assert.deepEqual(f.calls.at(-1), ['/api/providers/oauth/sessions/native-session', { profile: 'writer', method: 'DELETE' }])
})

test('provider OAuth handles cannot cross Profile/provider and original errors are retained', async () => {
  const f = fixture(), flow = await f.service.start('writer', { provider: 'openai-codex' })
  await assert.rejects(f.service.poll('coder', { provider: 'openai-codex', handle: flow.handle }), /归属/)
  await assert.rejects(f.service.submit('writer', { provider: 'other', handle: flow.handle, code: 'x' }), /归属/)
  const rejected = createNativeModelOAuth({ api: async () => { throw new Error('native device login unavailable') } })
  await assert.rejects(rejected.start('writer', { provider: 'openai-codex' }), /native device login unavailable/)
  f.service.dispose()
})

test('client disposal during native login start cancels late native session and exposes no stale flow', async () => {
  const pending = deferred(), calls = [], stops = new Set()
  const service = createNativeModelOAuth({ stops, api: async (path, options) => {
    calls.push([path, options]); return path.endsWith('/start') ? pending.promise : { ok: true }
  } })
  const starting = service.start('writer', { provider: 'openai-codex' })
  const closing = service.dispose()
  let closed = false
  closing.then(() => { closed = true }); await tick()
  assert.equal(closed, false, 'native owner must remain usable until late-start cancellation finishes')
  pending.resolve({ session_id: 'late-session', flow: 'pkce', auth_url: 'https://auth.example/authorize', expires_in: 300 })
  await assert.rejects(starting, /关闭/); await closing
  assert.equal(calls.at(-1)[0], '/api/providers/oauth/sessions/late-session')
})

test('cancellation during native poll suppresses approved result from the old editor', async () => {
  const pending = deferred(), f = fixture()
  const service = createNativeModelOAuth({ api: (path, options) => path.includes('/poll/') ? pending.promise : f.api(path, options) })
  const flow = await service.start('writer', { provider: 'openai-codex' })
  const polling = service.poll('writer', { provider: 'openai-codex', handle: flow.handle })
  await service.cancel('writer', { provider: 'openai-codex', handle: flow.handle })
  pending.resolve({ status: 'approved' })
  await assert.rejects(polling, /取消|归属/)
})
