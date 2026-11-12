import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeSettings } from '../src/native-desktop-settings.mjs'

test('editing a scheduled task follows original PUT updates contract on its owning Profile', async () => {
  const calls = [], settings = nativeSettings({ api: async (...args) => { calls.push(args); return { ok: true } } })
  const updates = { name: '每周摘要', prompt: '整理项目', schedule: '0 9 * * 1' }
  await settings.task('save', { id: 'job/1', profile: 'writer', data: updates })
  assert.deepEqual(calls, [['/api/cron/jobs/job%2F1', { profile: 'writer', method: 'PUT', body: { updates } }]])
  calls.length = 0
  await settings.task('save', { profile: 'default', data: updates })
  assert.deepEqual(calls, [['/api/cron/jobs', { profile: 'default', method: 'POST', body: updates }]])
})
