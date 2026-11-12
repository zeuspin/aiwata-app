import test from 'node:test'
import assert from 'node:assert/strict'
import { tourPreview } from '../scripts/desktop-preview-tour.mjs'

test('native tour refuses stale pages before injection and discards a late result after navigation', async () => {
  let called = 0, active = false
  const guest = { executeJavaScript: async source => { called++; assert.match(source, /__aiwataTourDocumentKey/); active = false; return { token: 'old-document', url: 'https://example.com/' } } }
  assert.equal((await tourPreview(guest, { kind: 'stop' }, () => active)).success, false)
  assert.equal(called, 0)
  active = true
  assert.equal((await tourPreview(guest, { kind: 'stop' }, () => active)).success, false)
  assert.equal(called, 1)
})

test('a tour cancelled while assets load does not inject any script', async () => {
  let current = true, calls = 0
  const result = tourPreview({ executeJavaScript: () => { calls++; return { success: true } } }, { kind: 'show' }, () => current)
  current = false
  assert.equal((await result).success, false)
  assert.equal(calls, 0)
})

test('same-URL reload between checks and injection fails inside the page before running the driver', async () => {
  const { default: vm } = await import('node:vm')
  let calls = 0
  const guest = { executeJavaScript: async source => {
    if (++calls === 1) return { token: 'old-document', url: 'https://example.com/' }
    return vm.runInNewContext(source, { window: { __aiwataTourDocumentKey: 'new-document' }, location: { href: 'https://example.com/' } })
  } }
  const result = await tourPreview(guest, { kind: 'show', text: 'old action' }, () => true)
  assert.equal(result.success, false)
  assert.equal(calls, 2)
})
