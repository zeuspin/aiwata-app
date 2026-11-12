import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeCronPayload, blueprintInitialValues, cronRunRoute } from '../src/native-cron.mjs'
import { gatewayTask } from '../src/live-tasks.mjs'
import { nativeSettings } from '../src/native-desktop-settings.mjs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

test('cron edits preserve untouched catch-up, reset both model axes together and never convert script-only jobs', () => {
  const base = { gatewayId: 'job', name: '任务', prompt: '做事', schedule: '0 9 * * 1', deliver: 'local', model: '', provider: '', catchUp: null }
  const data = nativeCronPayload(base)
  assert.equal(data.model, null); assert.equal(data.provider, null)
  assert.equal(Object.hasOwn(data, 'catch_up'), false)
  assert.equal(nativeCronPayload({ ...base, catchUp: false, catchUpChanged: true }).catch_up, false)
  const script = nativeCronPayload({ ...base, prompt: '', noAgent: true, script: '/project/job.sh', model: 'stored', provider: 'stored-provider' })
  for (const key of ['model', 'provider', 'prompt', 'script', 'no_agent']) assert.equal(Object.hasOwn(script, key), false)
})
test('native cron projection retains advanced job state for editing and blueprint defaults use Desktop delivery', () => {
  const job = gatewayTask({ id: 'a', profile: 'writer', model: 'm', provider: 'p', no_agent: true, script: '/job.sh', catch_up: false })
  assert.equal(job.model, 'm'); assert.equal(job.noAgent, true); assert.equal(job.catchUp, false); assert.equal(job.script, '/job.sh')
  assert.deepEqual(blueprintInitialValues({ fields: [{ name: 'deliver', default: 'origin' }, { name: 'time', default: '09:00' }] }), { deliver: 'local', time: '09:00' })
})
test('recurring cron edits hydrate the real expression before the human display label', () => {
  assert.equal(gatewayTask({ id: 'a', profile: 'default', schedule: { expr: '0 9 * * 1' }, schedule_display: 'Every Monday' }).schedule, '0 9 * * 1')
})
test('blueprint catalog and creation use the original owning-Profile endpoints', async () => {
  const calls = [], service = nativeSettings({ api: async (...args) => { calls.push(args); return { blueprints: [] } } })
  await service.task('blueprints', { profile: 'writer' })
  await service.task('blueprint-create', { profile: 'writer', blueprint: 'weekly', values: { time: '09:00', deliver: 'local' } })
  assert.deepEqual(calls, [['/api/cron/blueprints?profile=writer', { profile: 'writer' }], ['/api/cron/blueprints/instantiate?profile=writer', { profile: 'writer', method: 'POST', body: { blueprint: 'weekly', values: { time: '09:00', deliver: 'local' } } }]])
})
test('run-history opening retains exact backend/Profile and original scheduler-owned read-only policy', () => {
  const row = { id: 'run', source: 'cron', ended_at: null, scheduler_owned: false }
  const opened = cronRunRoute(row, { connectionId: 'ssh' }, 'writer')
  assert.deepEqual(opened, { connectionId: 'ssh', profile: 'writer', sessionId: 'run', session: row, readOnly: true })
  assert.equal(cronRunRoute({ ...row, ended_at: 100 }, { connectionId: 'ssh' }, 'writer').readOnly, false)
  assert.equal(cronRunRoute({ ...row, source: 'cron_output' }, { connectionId: 'ssh' }, 'writer'), null)
})
test('native blueprint dialog renders original typed fields and Desktop delivery defaults', async () => {
  const result = await build({ entryPoints: ['src/native-cron.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', '@tabler/icons-react'], loader: { '.css': 'empty' } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.NativeTaskBlueprintDialog, {
    live: {}, profile: 'writer', blueprint: { key: 'weekly', title: '周报', description: '原生模板', fields: [
      { name: 'time', type: 'time', label: '时间', default: '09:00', optional: false },
      { name: 'deliver', type: 'enum', label: '投递', default: 'origin', options: ['local'], optional: false },
      { name: 'weekday', type: 'weekdays', label: '工作日', default: '1-5', options: ['1-5', '0,6'], optional: false },
    ] }, targets: [], rooms: [], onClose() {}, onCreated() {},
  }))
  assert.match(html, /type="time"/); assert.match(html, /09:00/)
  assert.match(html, /value="local" selected/); assert.match(html, /writer/)
  assert.match(html, /1-5/)
})
