import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeSettings } from '../src/native-desktop-settings.mjs'
import { connectorApplyPlan, applyNativeConnectorConfiguration } from '../src/native-connectors.mjs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

test('Telegram native pairing identity and readiness survive the full frontend start/status/apply/cancel path', async () => {
  const calls = []
  const service = nativeSettings({ rpc: async () => { throw new Error('unexpected RPC') }, api: async (path, options) => {
    calls.push([path, options])
    if (path.endsWith('/start')) return { pairing_id: 'pair/one', deep_link: 'https://t.me/fixture', expires_at: '2030-01-01T00:00:00Z' }
    if (options?.method === 'POST') return { ok: true, restart_started: true, needs_restart: false }
    if (options?.method === 'DELETE') return { ok: true }
    return { status: 'ready', bot_username: 'fixture_bot', owner_user_id: '123456', expires_at: '2030-01-01T00:00:00Z' }
  } })
  const started = await service.connector('telegramStart', 'writer')
  assert.deepEqual(started, { id: 'pair/one', deepLink: 'https://t.me/fixture', expiresAt: '2030-01-01T00:00:00Z' })
  const ready = await service.connector('telegramStatus', 'writer', { id: started.id })
  assert.deepEqual(ready, { status: 'ready', username: 'fixture_bot', ownerId: '123456', expiresAt: '2030-01-01T00:00:00Z' })
  const applied = await service.connector('telegramApply', 'writer', { id: started.id, allowedUserIds: ['123456'] })
  assert.equal(applied.restart_started, true)
  await service.connector('telegramCancel', 'writer', { id: started.id })
  assert.deepEqual(calls, [
    ['/api/messaging/telegram/onboarding/start', { profile: 'writer', method: 'POST', body: {} }],
    ['/api/messaging/telegram/onboarding/pair%2Fone', { profile: 'writer' }],
    ['/api/messaging/telegram/onboarding/pair%2Fone/apply', { profile: 'writer', method: 'POST', body: { allowed_user_ids: ['123456'], profile: 'writer' } }],
    ['/api/messaging/telegram/onboarding/pair%2Fone', { profile: 'writer', method: 'DELETE' }],
  ])
})

test('native pairing errors remain failures and are not turned into a successful save', async () => {
  const service = nativeSettings({ api: async () => { throw new Error('Telegram pairing expired') } })
  await assert.rejects(service.connector('telegramStatus', 'coder', { id: 'expired' }), /pairing expired/)
  await assert.rejects(service.connector('telegramApply', 'coder', { id: 'expired', allowedUserIds: ['123456'] }), /pairing expired/)
})

test('gateway apply shows the exact shared Profile impact and refuses unconfirmed or changed scope before restart', async () => {
  const calls = []
  let shared = ['writer', 'default', 'writer', ' coder ']
  const api = async (path, options) => { calls.push([path, options]); return { gateway_shared_with: shared } }
  const plan = await connectorApplyPlan(api, 'writer')
  assert.deepEqual(plan.sharedProfiles, ['default', 'coder', 'writer'])
  await assert.rejects(applyNativeConnectorConfiguration(api, 'writer', {}), /确认/)
  shared = ['default', 'other']
  await assert.rejects(applyNativeConnectorConfiguration(api, 'writer', { confirmationKey: plan.confirmationKey }), /范围已变化/)
  assert.equal(calls.some(([, options]) => options.method === 'POST'), false)
  assert.ok(calls.every(([, options]) => options.profile === 'writer'))
})

test('confirmed native apply polls the original restart action, tolerates restart outages and never claims a recorded failure passed', async () => {
  const calls = [], plan = await connectorApplyPlan(async () => ({ gateway_shared_with: ['default', 'writer'] }), 'writer')
  let polled = 0
  const api = async (path, options) => {
    calls.push([path, options])
    if (path === '/api/status') return { gateway_shared_with: ['writer', 'default'] }
    if (options.method === 'POST') return { ok: true, name: 'gateway-restart', pid: 100 }
    if (++polled === 1) throw new Error('restart window')
    return { running: false, exit_code: 0 }
  }
  const result = await applyNativeConnectorConfiguration(api, 'writer', { confirmationKey: plan.confirmationKey }, async () => {})
  assert.equal(result.ok, true)
  assert.equal(polled, 2)
  assert.ok(calls.every(([, options]) => options.profile === 'writer'))
  assert.equal(calls[1][0], '/api/gateway/restart')
  assert.equal(calls[1][1].method, 'POST')
  assert.equal(calls.at(-1)[0], '/api/actions/gateway-restart/status?lines=200')
  const failed = async (path, options) => path === '/api/status' ? { gateway_shared_with: ['default', 'writer'] }
    : options.method === 'POST' ? { ok: true, name: 'gateway-restart' } : { running: false, exit_code: 1 }
  await assert.rejects(applyNativeConnectorConfiguration(failed, 'writer', { confirmationKey: plan.confirmationKey }, async () => {}), /重启失败/)
})

test('unanswered native restart and canceled owner do not become successful configuration reloads', async () => {
  const plan = await connectorApplyPlan(async () => ({}), 'default')
  const api = async (path, options) => path === '/api/status' ? {} : options.method === 'POST' ? { ok: true, name: 'gateway-restart' } : Promise.reject(new Error('offline throughout'))
  await assert.rejects(applyNativeConnectorConfiguration(api, 'default', { confirmationKey: plan.confirmationKey }, async () => {}), /offline throughout/)
  const controller = new AbortController(); controller.abort()
  let touched = false
  await assert.rejects(applyNativeConnectorConfiguration(async () => { touched = true }, 'default', { confirmationKey: plan.confirmationKey, signal: controller.signal }, async () => {}), { name: 'AbortError' })
  assert.equal(touched, false)
})

test('shared gateway confirmation names all impacted Profiles before the user can confirm', async () => {
  const result = await build({ entryPoints: ['src/live-connectors.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', '@tabler/icons-react', 'qrcode'], loader: { '.css': 'empty' } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const impact = module.exports.ConnectorRestartImpact
  const html = renderToStaticMarkup(React.createElement(impact, { plan: { profile: 'writer', sharedProfiles: ['default', 'coder', 'writer'] } }))
  for (const name of ['default', 'coder', 'writer']) assert.ok(html.includes(name))
  assert.match(html, /共享网关/)
  assert.match(html, /中断/)
  const waiting = renderToStaticMarkup(React.createElement(impact, { plan: null }))
  assert.match(waiting, /正在检查/)
})
