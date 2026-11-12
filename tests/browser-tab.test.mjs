import test from 'node:test'
import assert from 'node:assert/strict'
import { browserTabInfo, updateBrowserPageMetadata } from '../src/browser-tab.mjs'
import { emptyBrowserState, navigateBrowser, moveBrowser } from '../src/tool-surfaces.mjs'
import { createWorkspace } from '../src/workspace.mjs'
import { browserState } from '../src/tool-tabs.mjs'

const icon = 'data:image/png;base64,iVBORw0KGgo='
test('browser tab shows live page identity and drops stale identity across navigation and history', () => {
  let state = navigateBrowser(emptyBrowserState, 'https://example.com/')
  assert.equal(browserTabInfo(state).title, 'example.com')
  state = updateBrowserPageMetadata(state, state.visited, { title: ' Example  Domain\n', favicon: icon })
  assert.deepEqual(browserTabInfo(state), { title: 'Example Domain', favicon: icon })
  assert.equal(browserTabInfo(state, '我的参考').title, '我的参考')
  const next = navigateBrowser(state, 'https://example.org/')
  assert.deepEqual(browserTabInfo(next), { title: 'example.org', favicon: null })
  assert.equal(updateBrowserPageMetadata(next, state.visited, { title: 'late', favicon: icon }), next)
  assert.equal(browserTabInfo(moveBrowser(next, -1)).title, 'example.com')
  assert.equal(browserTabInfo(navigateBrowser(next, '')).title, '浏览器')
  assert.equal(updateBrowserPageMetadata(state, state.visited, { title: 'Example Domain', favicon: icon }), state)
})

test('metadata accepts only bounded image data, stays in its browser and persists independently', () => {
  const saved = new Map(), storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }
  const api = createWorkspace(storage); api.login('lin')
  api.openTool('plan', '浏览器'); const first = api.getChat('plan').tool
  api.updateBrowser('plan', b => navigateBrowser(b, 'https://example.com/'), first)
  api.updateBrowser('plan', b => updateBrowserPageMetadata(b, b.visited, { title: '<script> text', favicon: 'http://127.0.0.1/private' }), first)
  assert.equal(browserTabInfo(browserState(api.getChat('plan'), first)).favicon, null)
  api.openTool('plan', '浏览器', undefined, { newInstance: true }); const second = api.getChat('plan').tool
  assert.equal(browserTabInfo(browserState(api.getChat('plan'), second)).title, '浏览器')
  const restored = createWorkspace(storage); restored.login('lin')
  assert.equal(browserTabInfo(browserState(restored.getChat('plan'), first)).title, '<script> text')
  assert.equal(browserTabInfo(browserState(restored.getChat('plan'), second)).title, '浏览器')
})
