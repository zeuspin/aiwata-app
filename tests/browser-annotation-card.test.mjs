import test from 'node:test'
import assert from 'node:assert/strict'

test('floating card uses the AIWATA anchor placement and fits narrow/right-edge panes', async () => {
  const { placeAnnotateCard } = await import('../src/browser-annotation-card.mjs')
  assert.deepEqual(placeAnnotateCard({ paneWidth: 420, paneHeight: 640, rect: { x: 8, y: 48, width: 400, height: 220 } }), { left: 27, top: 26 })
  assert.deepEqual(placeAnnotateCard({ paneWidth: 360, paneHeight: 400, rect: { x: 300, y: 20, width: 80, height: 40 } }), { left: 68, top: 12 })
  assert.deepEqual(placeAnnotateCard({ paneWidth: 220, paneHeight: 300, rect: { x: 190, y: 290, width: 20, height: 20 } }), { left: 12, top: 244 })
})

test('dragged annotation controls stay in the viewport after pane shrink and use bottom center initially', async () => {
  const { placeAnnotationControls } = await import('../src/browser-annotation-card.mjs')
  assert.deepEqual(placeAnnotationControls({ paneWidth: 774, paneHeight: 1100 }), { left: 235, top: 1036 })
  assert.deepEqual(placeAnnotationControls({ paneWidth: 400, paneHeight: 300, position: { left: 2000, top: -100 } }), { left: 84, top: 12 })
  assert.deepEqual(placeAnnotationControls({ paneWidth: 400, paneHeight: 300, position: { left: -100, top: 1000 } }), { left: 12, top: 248 })
})
