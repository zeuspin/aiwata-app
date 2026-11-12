import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeMessagingFlows } from '../src/native-messaging-flows.mjs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

test('relay UI uses original shared-bot APIs and keeps one-time codes behind exact Profile/platform handles', async () => {
  const calls = [], service = createNativeMessagingFlows({ api: async (path, options) => {
    calls.push([path, options])
    if (path === '/api/messaging/relay') return { managed_by: 'connector', platforms: [{ platform: 'telegram', bot_url: 'https://t.me/fixture', accounts: [{ platformUserId: '123', displayName: '账户' }] }] }
    if (path.endsWith('/link')) return { code: 'one-time', command: '/link one-time', expires_at: '2030-01-01T00:00:00Z', bot_url: 'https://t.me/fixture' }
    if (options.method === 'DELETE') return { unlinked: true }
    return { state: 'pending' }
  } })
  const read = await service.call('relayRead', 'writer', { platform: 'telegram' })
  assert.equal(read.managedBy, 'connector'); assert.equal(read.accounts[0].id, '123')
  const link = await service.call('relayStart', 'writer', { platform: 'telegram' })
  assert.equal(Object.hasOwn(link, 'code'), false)
  await assert.rejects(service.call('relayStatus', 'coder', { platform: 'telegram', id: link.id }), /归属/)
  await service.call('relayStatus', 'writer', { platform: 'telegram', id: link.id })
  assert.equal(calls.at(-1)[0], '/api/messaging/relay/link/one-time')
  await service.call('relayDismiss', 'writer', { platform: 'telegram', id: link.id })
  await service.call('relayUnlink', 'writer', { platform: 'telegram', id: '123' })
  assert.deepEqual(calls.at(-1), ['/api/messaging/relay/telegram/accounts/123', { profile: 'writer', method: 'DELETE' }])
})

test('WhatsApp start/status/apply follows original schema and keeps the native session on its Profile', async () => {
  const calls = [], service = createNativeMessagingFlows({ api: async (path, options) => {
    calls.push([path, options])
    if (path.endsWith('/apply')) return { ok: true, restart_started: true }
    return { pairing_id: 'native/pair', status: path.endsWith('/start') ? 'starting' : 'connected', qr_payload: 'fixture QR', account_phone: '123', expires_at: '2030-01-01T00:00:00Z' }
  } })
  const started = await service.call('whatsappStart', 'writer', { mode: 'bot', allowedUsers: '123', resetSession: false })
  assert.equal(started.status, 'starting'); assert.equal(Object.hasOwn(started, 'pairing_id'), false)
  assert.deepEqual(calls[0], ['/api/messaging/whatsapp/onboarding/start', { profile: 'writer', method: 'POST', body: { mode: 'bot', allowed_users: '123', reset_session: false, profile: 'writer' } }])
  await assert.rejects(service.call('whatsappStatus', 'coder', { id: started.id }), /归属/)
  const ready = await service.call('whatsappStatus', 'writer', { id: started.id })
  assert.equal(ready.accountPhone, '123')
  await service.call('whatsappApply', 'writer', { id: started.id, mode: 'bot', allowedUsers: '123' })
  assert.deepEqual(calls.at(-1), ['/api/messaging/whatsapp/onboarding/native%2Fpair/apply', { profile: 'writer', method: 'POST', body: { mode: 'bot', allowed_users: '123', profile: 'writer' } }])
})

test('closing during a WhatsApp native start waits for and cancels the late original pairing', async () => {
  let resolve; const pending = new Promise(done => { resolve = done }), calls = []
  const service = createNativeMessagingFlows({ api: async (path, options) => { calls.push([path, options]); return path.endsWith('/start') ? pending : { ok: true } } })
  const starting = service.call('whatsappStart', 'writer', {})
  const closing = service.dispose()
  resolve({ pairing_id: 'late', status: 'starting' })
  await assert.rejects(starting, /关闭/); await closing
  assert.deepEqual(calls.at(-1), ['/api/messaging/whatsapp/onboarding/late', { profile: 'writer', method: 'DELETE' }])
})

test('native messaging errors propagate and never become a success notice', async () => {
  const service = createNativeMessagingFlows({ api: async () => { throw new Error('WhatsApp is in use') } })
  await assert.rejects(service.call('whatsappStart', 'writer', {}), /WhatsApp is in use/)
  await assert.rejects(service.call('relayRead', 'writer', { platform: 'telegram' }), /WhatsApp is in use/)
})

test('WhatsApp native dialog starts no pairing until user action and keeps reset as a separate confirmation', async () => {
  const result = await build({ entryPoints: ['src/native-whatsapp.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', '@tabler/icons-react', 'qrcode'], loader: { '.css': 'empty' } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.NativeWhatsAppSetup, {
    live: { connector() { assert.fail('server render must not start native pairing') } }, profile: 'writer', configured: true, onClose() {}, onApplied() {},
  }))
  assert.match(html, /生成二维码/)
  assert.match(html, /重新配对…/)
  assert.ok(!html.includes('确认重新配对'))
  assert.match(html, /disabled=""[^>]*>保存 WhatsApp 配置/)
})
