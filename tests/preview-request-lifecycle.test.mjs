import test from 'node:test'
import assert from 'node:assert/strict'
import { createInspectionRequests, inspectionResultIsCurrent } from '../scripts/desktop-preview-requests.mjs'

test('inspection cancellation is scoped to the original account and guest and releases in-flight work', () => {
  const registry = createInspectionRequests()
  const owner = {}, other = {}, guest = { id: 2 }, another = { id: 3 }
  const request = registry.begin(owner, guest, 'request')
  assert.equal(registry.cancel(other, guest, 'request'), false)
  assert.equal(registry.cancel(owner, another, 'request'), false)
  assert.equal(request.signal.aborted, false)
  assert.equal(registry.cancel(owner, guest, 'request'), true)
  assert.equal(request.signal.aborted, true)
  const next = registry.begin(owner, guest, 'next')
  registry.release(owner)
  assert.equal(next.signal.aborted, true)
})

test('native results need no URL field; navigation is accepted only for successful input or history actions', () => {
  assert.equal(inspectionResultIsCurrent({ action: 'elements', result: { success: true }, active: true, documentCurrent: true }), true)
  assert.equal(inspectionResultIsCurrent({ action: 'reload', result: { success: true }, active: true, documentCurrent: false }), true)
  assert.equal(inspectionResultIsCurrent({ action: 'elements', result: { success: true }, active: true, documentCurrent: false }), false)
  assert.equal(inspectionResultIsCurrent({ action: 'click', result: { success: true }, active: false, documentCurrent: false }), false)
  assert.equal(inspectionResultIsCurrent({ action: 'click', result: { success: true }, active: true, documentCurrent: true, aborted: true }), false)
})
