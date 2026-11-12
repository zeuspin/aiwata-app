import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

let fixtureId = 0
const asModule = source => 'data:text/javascript,' + encodeURIComponent(source)

// Module-loader stubs keep these tests away from Electron, OS enumeration and
// compositor sockets. The native picker, mapper and privacy options run intact.
async function withNativeWindowProvider(provider, run, platform = process.platform) {
  const prior = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { ...prior, value: platform })
  const identifier = ++fixtureId
  const optionsKey = '__aiwataWindowOptions' + identifier
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'electron') return { url: asModule("export const app = { getAppPath: () => '/nonexistent-native-window-test' }"), shortCircuit: true }
    if (specifier === './hyprland.mjs') return { url: asModule('export const readHyprlandWindows = async () => null'), shortCircuit: true }
    if (specifier === 'get-windows') return { url: asModule(`export async function openWindows(options) {
      globalThis[${JSON.stringify(optionsKey)}] = options;
      ${provider}
    }`), shortCircuit: true }
    return next(specifier, context)
  } })
  try {
    const module = await import('../scripts/vendor/aiwata-window/window-below.mjs?fixture=' + identifier)
    await run(module, () => globalThis[optionsKey])
  } finally {
    hooks.deregister()
    Object.defineProperty(process, 'platform', prior)
    delete globalThis[optionsKey]
  }
}

const bounds = { x: 0, y: 0, width: 100, height: 100 }
const window = (id, pid, area = bounds, title = '') => ({ id, pid, bounds: area, title, app: 'App ' + pid })

test('native picker excludes every own window and chooses the first overlapping window behind us', async () => {
  await withNativeWindowProvider('return []', async ({ pickWindowBelow }) => {
    const front = window(10, 20)
    const ours = window(11, 1)
    const otherDisplay = window(12, 21, { x: 200, y: 0, width: 100, height: 100 })
    const anotherOwn = window(13, 1)
    const below = window(14, 22)
    const farther = window(15, 23)
    const result = pickWindowBelow([front, ours, otherDisplay, anotherOwn, below, farther], 1, bounds)
    assert.equal(result.frontmost, front)
    assert.equal(result.below, below)
  })
})

test('without an own z-order entry native selection uses overlap rather than another display', async () => {
  await withNativeWindowProvider('return []', async ({ pickWindowBelow }) => {
    const adjacent = window(1, 20, { x: 100, y: 0, width: 100, height: 100 })
    const overlapping = window(2, 21, { x: 99, y: 0, width: 100, height: 100 })
    const result = pickWindowBelow([adjacent, overlapping], 1, bounds)
    assert.equal(result.frontmost, adjacent)
    assert.equal(result.below, overlapping)
    assert.deepEqual(pickWindowBelow([window(3, 1)], 1, bounds), { below: null, frontmost: null })
  })
})

test('native macOS reader suppresses permission prompting and preserves absent titles', async () => {
  const provider = `return [
    { id: 1, owner: { name: 'AIWATA', processId: 100 }, bounds: { x: 0, y: 0, width: 100, height: 100 }, title: '' },
    { id: 2, owner: { name: 'Editor', processId: 200 }, bounds: { x: 10, y: 10, width: 100, height: 100 }, title: '' }
  ]`
  await withNativeWindowProvider(provider, async ({ readWindowBelow }, options) => {
    const result = await readWindowBelow(100, bounds, false)
    assert.deepEqual(options(), { accessibilityPermission: false, screenRecordingPermission: false })
    assert.deepEqual(result.frontmost, { app: 'Editor', title: '' })
    assert.deepEqual(result.window, { app: 'Editor', bounds: { x: 10, y: 10, width: 100, height: 100 }, id: 2, title: '' })
    assert.equal(result.platform, 'darwin')
    assert.match(result.note, /Window titles are hidden/)
    assert.deepEqual(Object.keys(result.window).sort(), ['app', 'bounds', 'id', 'title'])
  }, 'darwin')
})

test('native reader reports enumeration failure distinctly from an empty window list', async () => {
  await withNativeWindowProvider("throw new Error('enumerator unavailable')", async ({ readWindowBelow }) => {
    const result = await readWindowBelow(100, bounds, false)
    assert.equal(result.window, undefined)
    assert.match(result.error, /window enumerator failed: enumerator unavailable/)
    assert.equal(result.platform, 'darwin')
  }, 'darwin')
  await withNativeWindowProvider('return []', async ({ readWindowBelow }) => {
    const result = await readWindowBelow(100, bounds, true)
    assert.equal(result.error, undefined)
    assert.equal(result.window, null)
    assert.equal(result.frontmost, null)
  }, 'darwin')
})

test('native Hyprland parsing excludes own and hidden workspace windows in focus order', async () => {
  const { parseHyprlandClients } = await import('../scripts/vendor/aiwata-window/hyprland.mjs')
  const windows = parseHyprlandClients(JSON.stringify([
    { pid: 100, workspace: { id: 1 }, size: [100, 100], focusHistoryID: 2 },
    { pid: 200, class: 'Editor', title: '', workspace: { id: 1 }, at: [10, 10], size: [100, 100], focusHistoryID: 1 },
    { pid: 300, class: 'Other desktop', workspace: { id: 2 }, size: [100, 100], focusHistoryID: 0 },
    { pid: 400, class: 'Browser', workspace: { id: 1 }, at: [5, 5], size: [100, 100], focusHistoryID: 0 },
  ]), 100)
  assert.deepEqual(windows.map(entry => entry.pid), [400, 200])
  assert.equal(windows[1].title, '')
})

test('snapshot output and license match provenance for the pinned native version', async () => {
  const root = new URL('../scripts/vendor/aiwata-window/', import.meta.url)
  const provenance = JSON.parse(await readFile(new URL('provenance.json', root), 'utf8'))
  assert.equal(provenance.commit, '6631a6af2c58fc498ef01fa5cc4b222fc8682683')
  assert.equal(provenance.dependencies['get-windows'], '9.3.0')
  for (const entry of [...provenance.modules, { output: provenance.license.path, outputSha256: provenance.license.sha256 }]) {
    const bytes = await readFile(new URL(entry.output, root))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.outputSha256)
  }
})
