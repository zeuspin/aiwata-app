import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace } from '../src/workspace.mjs'
import { getBotAppearance } from '../src/bot-appearance.mjs'

const lib = () => import('../src/bot-peeking.mjs')
const rng = (n = 73) => () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296)

test('peeking designs reject unknown values and normalize incompatible hair ornaments', async () => {
  const { getPeekingDesign } = await lib()
  const defaults = getPeekingDesign()
  assert.deepEqual(getPeekingDesign(null), defaults)
  const invalid = getPeekingDesign({ hair: '__proto__', skin: 'constructor', headwear: 'missing', hairColor: '#bad', extra: true })
  assert.deepEqual(invalid, defaults)
  assert.equal(getPeekingDesign({ hair: 'pixie', headwear: 'jadePin' }).headwear, 'none')
  assert.equal(getPeekingDesign({ hair: 'messyBun', headwear: 'jadePin' }).headwear, 'jadePin')
})

test('changing hair clears only an incompatible headwear and preserves unrelated choices', async () => {
  const { getPeekingDesign, updatePeekingDesign } = await lib()
  const initial = getPeekingDesign({ hair: 'messyBun', headwear: 'jadePin', skin: 'cocoa', eyewear: 'round' })
  const changed = updatePeekingDesign(initial, 'hair', 'pixie')
  assert.equal(changed.hair, 'pixie')
  assert.equal(changed.headwear, 'none')
  assert.equal(changed.skin, 'cocoa')
  assert.equal(changed.eyewear, 'round')
  assert.deepEqual(updatePeekingDesign(changed, 'headwear', 'jadePin'), changed)
})

test('random peeking candidates vary silhouettes and obey headwear compatibility and contrast', async () => {
  const { randomPeekingBatch, canWearHeadwear, peekingPalettes } = await lib()
  const luminance = color => color.slice(1).match(/../g).reduce((sum, hex, i) => {
    const n = parseInt(hex, 16) / 255
    return sum + (n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]
  }, 0)
  for (let run = 0; run < 20; run++) {
    const batch = randomPeekingBatch({ rng: rng(73 + run) })
    assert.equal(batch.length, 10)
    assert.equal(new Set(batch.map(item => item.hair)).size, 10)
    assert.equal(new Set(batch.map(JSON.stringify)).size, 10)
    assert.ok(new Set(batch.map(item => item.headwear)).size >= 5)
    for (const item of batch) {
      assert.ok(canWearHeadwear(item.hair, item.headwear))
      const bg = luminance(peekingPalettes.background[item.background].colors[0])
      for (const tone of peekingPalettes.hairColor[item.hairColor].colors) {
        const fg = luminance(tone)
        assert.ok((Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) >= 3, `${tone}/${item.background}`)
      }
    }
  }
})

test('locked headwear constrains hair while arbitrary locked colors and accessories survive randomization', async () => {
  const { getPeekingDesign, randomPeekingBatch, canWearHeadwear } = await lib()
  const design = getPeekingDesign({ hair: 'messyBun', headwear: 'jadePin', skin: 'cocoa', eyewear: 'round', hairColor: 'ink', background: 'ivory' })
  const locked = ['headwear', 'skin', 'eyewear', 'hairColor']
  const batch = randomPeekingBatch({ design, locked, rng: rng() })
  assert.equal(batch.length, 10)
  for (const item of batch) {
    for (const field of locked) assert.equal(item[field], design[field])
    assert.ok(canWearHeadwear(item.hair, 'jadePin'))
  }
  const allLocked = randomPeekingBatch({ design, locked: Object.keys(design), rng: () => 0 })
  assert.deepEqual(allLocked, [design])
  assert.deepEqual(randomPeekingBatch({ count: 0 }), [])
})

test('peeking avatar parameters persist through reloads, family switches, and account isolation', async () => {
  const { getPeekingDesign } = await lib()
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) }
  const api = createWorkspace(storage)
  api.login('lin')
  const bot = api.current().bots.find(item => item.id === 'editor')
  const design = getPeekingDesign({ hair: 'messyBun', headwear: 'jadePin', hairColor: 'rose', earrings: 'hoops', eyewear: 'round' })
  const appearance = { ...getBotAppearance(bot), mode: 'peeking', peekingDesign: design }
  const avatar = 'data:image/png;base64,example'
  assert.equal(api.saveBotEntity('bot', { ...bot, avatar, appearance }), true)
  const restored = createWorkspace(storage)
  restored.login('lin')
  const saved = restored.current().bots.find(item => item.id === bot.id)
  assert.equal(getBotAppearance(saved).mode, 'peeking')
  assert.deepEqual(getBotAppearance(saved).peekingDesign, design)
  const character = getBotAppearance({ ...saved, appearance: { ...saved.appearance, mode: 'character' } })
  assert.deepEqual(character.peekingDesign, design)
  assert.equal(character.mode, 'character')
  assert.equal(saved.avatar, avatar)
  restored.login('qiao')
  assert.ok(restored.current().bots.every(item => item.appearance?.mode !== 'peeking'))
})

test('the rendered peeking parts keep shoulder and neck in front of back hair for the approved pose', async () => {
  const { build } = await import('esbuild')
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: ['src/bot-peeking.jsx'], bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'shared-react', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(require.resolve('react')).href, external: true }))
    } }] })
  const { PeekingPortrait } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { getPeekingDesign, peekingHair, peekingHeadwear, canWearHeadwear } = await lib()
  const cases = [
    ...Object.keys(peekingHair).map(hair => ({ hair })),
    ...Object.keys(peekingHeadwear).map(headwear => ({ headwear, hair: Object.keys(peekingHair).find(hair => canWearHeadwear(hair, headwear)) })),
  ]
  for (const design of cases) {
    const svg = renderToStaticMarkup(React.createElement('svg', { viewBox: '0 0 64 64' }, React.createElement(PeekingPortrait, { design })))
    assert.ok(svg.includes('data-peeking-headwear="' + getPeekingDesign(design).headwear + '"'))
    assert.ok(svg.indexOf('data-peeking-layer="hair-back"') < svg.indexOf('data-peeking-layer="neck"'), design.hair)
    assert.ok(svg.indexOf('data-peeking-layer="neck"') < svg.indexOf('data-peeking-layer="face"'), design.hair)
    assert.ok(!svg.includes('undefined') && !svg.includes('NaN'))
  }
})
