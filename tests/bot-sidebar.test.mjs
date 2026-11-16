import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace, fitPanels, resizePanels } from '../src/workspace.mjs'

test('Bot avatar sidebar can occupy 72px without changing normal sidebar and tool widths', () => {
  const saved = { side: 72, tools: 400 }
  assert.deepEqual(fitPanels(saved, 1278, true, true, 72), { side: 72, tools: 400 })
  assert.deepEqual(fitPanels(saved, 1278, true, true), { side: 200, tools: 400 })
  assert.equal(resizePanels({ side: 322, tools: 400 }, 1278, 'left', -250, true, true, 72).side, 72)
  assert.equal(resizePanels({ side: 322, tools: 400 }, 1278, 'left', -250, true, true).side, 200)
  assert.equal(resizePanels(saved, 1278, 'right', -500, true, true, 72).side, 72)
  assert.equal(fitPanels(saved, 1278, false, true, 72).side, 0)
})

test('Bot avatar sidebar leaves narrow content space and never changes saved widths during fitting', () => {
  const saved = { side: 72, tools: 494 }
  assert.equal(fitPanels(saved, 390, true, false, 72).side, 72)
  assert.ok(390 - 50 - fitPanels(saved, 390, true, false, 72).side > 200)
  assert.deepEqual(saved, { side: 72, tools: 494 })
})

test('Bot sidebar width persists independently for each account and ordinary sidebar', () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
  let api = createWorkspace(storage)
  api.login('lin')
  api.savePanelWidth('side', 350)
  api.updateNavigationModule('bots', { sidebarWidth: 72, sidebarExpandedWidth: 310 })
  api.logout(); api.login('qiao')
  assert.equal(api.current().navigation?.modules?.bots?.sidebarWidth, undefined)
  api.logout(); api = createWorkspace(storage); api.login('lin')
  assert.equal(api.current().navigation.modules.bots.sidebarWidth, 72)
  assert.equal(api.current().navigation.modules.bots.sidebarExpandedWidth, 310)
  assert.equal(api.current().preferredPanelWidths.side, 350)
})


test('Bot separator tracks drag without persisting, commits on release, cancels cleanly and leaves project width unchanged', async t => {
  const { createRequire } = await import('node:module')
  const { build } = await import('esbuild')
  const { React, act } = await import('./helpers/native-react-harness.mjs')
  const { createRoot } = await import('react-dom/client')
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  window.HTMLCanvasElement.prototype.getContext = () => null
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: ['src/workbench.jsx'], bundle: true, write: false,
    format: 'cjs', platform: 'node', loader: { '.css': 'empty' }, external: ['react', '@tabler/icons-react'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  let writes = 0
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => { writes++; data.set(key, value) } }
  const api = createWorkspace(storage)
  api.login('lin')
  api.updateNavigation({ section: 'bots', sidebarOpen: true })
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  t.after(async () => { await act(async () => root.unmount()); element.remove() })
  await act(async () => root.render(React.createElement(module.exports.Workbench, {
    api, account: { id: 'lin', initial: '林', name: '林' }, refresh() {}, onOffline() {},
  })))
  const divider = () => element.querySelector('[aria-label="调整 Bot 列表宽度"]')
  const width = () => Number.parseFloat(element.querySelector('.window').style.getPropertyValue('--context-size'))
  async function pointer(type, clientX) {
    const node = divider()
    node.setPointerCapture ??= id => { node.capturedPointer = id }
    node.hasPointerCapture ??= id => node.capturedPointer === id
    node.releasePointerCapture ??= () => { node.capturedPointer = null }
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    await act(async () => node.dispatchEvent(event))
  }
  async function key(key) { await act(async () => divider().dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }))) }
  assert.equal(width(), 322)
  let before = writes
  await pointer('pointerdown', 372)
  await pointer('pointermove', 100)
  assert.equal(width(), 72)
  assert.equal(writes, before, 'dragging must not save each pointer frame')
  assert.equal(api.current().navigation.modules?.bots?.sidebarWidth, undefined)
  await pointer('pointerup', 100)
  assert.equal(api.current().navigation.modules.bots.sidebarWidth, 72)
  assert.equal(writes, before + 1)
  before = writes
  await pointer('pointerdown', 122)
  await pointer('pointermove', 310)
  assert.equal(width(), 260)
  await pointer('pointercancel', 310)
  assert.equal(width(), 72)
  assert.equal(writes, before, 'cancel restores the saved size without writing a new preference')
  await pointer('pointerdown', 122)
  await pointer('pointermove', 310)
  await key('Escape')
  assert.equal(width(), 72)
  assert.equal(divider().capturedPointer, null, 'Escape releases pointer capture')
  await pointer('pointerup', 310)
  assert.equal(writes, before, 'Escape prevents a later pointer release from committing')
  await key('ArrowRight')
  assert.equal(width(), 322)
  assert.equal(api.current().navigation.modules.bots.sidebarWidth, 322)
  await key('Home')
  assert.equal(width(), 72)
  await key('End')
  assert.equal(width(), 520)
  await key('Home')
  await act(async () => divider().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
  assert.equal(width(), 520)
  await key('Home')
  await act(async () => element.querySelector('.rail [aria-label="项目"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  assert.equal(width(), 322, 'project sidebar keeps its independent normal width')
  assert.equal(api.current().navigation.modules.bots.sidebarWidth, 72)
  assert.equal(api.current().preferredPanelWidths?.side, undefined)
  await act(async () => element.querySelector('.rail [aria-label="Bot 与群聊"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  const originalWidth = window.innerWidth
  t.after(() => { window.innerWidth = originalWidth })
  await act(async () => { window.innerWidth = 390; window.dispatchEvent(new Event('resize')) })
  await key('ArrowRight')
  assert.equal(width(), 153)
  await pointer('pointerdown', 203)
  assert.equal(width(), 153, 'starting a drag in a narrow window must not jump to avatar width')
  await pointer('pointermove', 204)
  assert.equal(width(), 153)
  await pointer('pointerup', 204)
  assert.equal(width(), 153, 'dragging right at the narrow-window limit keeps the expanded state')
  await key('Home')
  await pointer('pointerdown', 122)
  await pointer('pointermove', 203)
  await pointer('pointerup', 203)
  assert.equal(width(), 153, 'avatar sidebar can expand to the narrow-window limit')
  assert.equal(api.current().navigation.modules.bots.sidebarWidth, 200)
})
