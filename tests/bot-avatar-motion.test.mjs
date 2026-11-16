import test from 'node:test'
import assert from 'node:assert/strict'
import { observeInteractiveBot } from '../src/bot-avatar-motion.mjs'

class Target {
  listeners = new Map()
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(callback)
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback) }
  emit(type, event = {}) { for (const callback of this.listeners.get(type) ?? []) callback(event) }
  count(type) { return this.listeners.get(type)?.size ?? 0 }
}

function environment() {
  let clock = 0, id = 0
  const frames = new Map(), timers = new Map()
  const view = new Target(), document = new Target()
  const reduced = Object.assign(new Target(), { matches: false })
  const pointer = Object.assign(new Target(), { matches: true })
  Object.assign(view, {
    document, innerWidth: 1000, innerHeight: 800, performance: { now: () => clock },
    matchMedia: query => query.includes('reduced') ? reduced : pointer,
    requestAnimationFrame: callback => { frames.set(++id, callback); return id },
    cancelAnimationFrame: key => frames.delete(key),
    setTimeout: (callback, delay) => { timers.set(++id, { callback, due: clock + delay }); return id },
    clearTimeout: key => timers.delete(key),
  })
  Object.assign(document, { defaultView: view, hidden: false })
  function avatar(left = 100) {
    const styles = new Map()
    return { ownerDocument: document, styles, closest: () => null,
      getBoundingClientRect: () => ({ left, top: 100, width: 64, height: 64, right: left + 64, bottom: 164 }),
      style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    }
  }
  function advance(ms = 16) {
    clock += ms
    for (const [key, timer] of [...timers]) if (timer.due <= clock) { timers.delete(key); timer.callback() }
    const scheduled = [...frames]; frames.clear()
    for (const [, callback] of scheduled) callback(clock)
  }
  const move = (x, y = 132, pointerType = 'mouse') => view.emit('pointermove', { clientX: x, clientY: y, pointerType })
  return { view, document, reduced, pointer, frames, timers, avatar, advance, move }
}

test('multiple avatar subscribers share input and frames, follow gently, reverse continuously, and settle', () => {
  const env = environment(), first = env.avatar(), second = env.avatar(250)
  const releaseFirst = observeInteractiveBot(first), releaseSecond = observeInteractiveBot(second)
  assert.equal(env.view.count('pointermove'), 1)
  assert.equal(env.timers.size, 1)
  env.move(900)
  assert.equal(env.frames.size, 1)
  for (let index = 0; index < 15; index++) env.advance()
  const before = parseFloat(first.styles.get('--bot-look-x'))
  assert.ok(before > 0 && before < 3)
  assert.ok(parseFloat(first.styles.get('--bot-lean')) <= 4.1)
  env.move(-900)
  assert.equal(parseFloat(first.styles.get('--bot-look-x')), before)
  env.advance()
  assert.ok(Math.abs(parseFloat(first.styles.get('--bot-look-x')) - before) < 1)
  for (let index = 0; index < 100; index++) env.advance()
  assert.ok(parseFloat(first.styles.get('--bot-look-x')) < 0)
  assert.equal(env.frames.size, 0)
  releaseFirst()
  assert.equal(first.styles.size, 0)
  assert.equal(env.view.count('pointermove'), 1)
  releaseSecond()
  assert.equal(env.view.count('pointermove'), 0)
  assert.equal(env.view.count('blur'), 0)
  assert.equal(env.document.count('visibilitychange'), 0)
  assert.equal(env.reduced.count('change'), 0)
  assert.equal(env.frames.size, 0)
  assert.equal(env.timers.size, 0)
})

test('a natural blink returns to open eyes and never requires a continuously running frame loop', () => {
  const env = environment(), avatar = env.avatar(), stop = observeInteractiveBot(avatar)
  assert.equal(env.frames.size, 0)
  env.advance(7000)
  env.advance(90)
  assert.ok(parseFloat(avatar.styles.get('--bot-blink')) < .2)
  env.advance(100)
  assert.equal(avatar.styles.get('--bot-blink'), '1.000')
  assert.equal(env.frames.size, 0)
  assert.equal(env.timers.size, 1)
  stop()
})

test('reduced motion, touch, leaving the window and hidden documents reset motion and cancel work', () => {
  const env = environment(), avatar = env.avatar(), stop = observeInteractiveBot(avatar)
  function moved() { env.move(900); env.advance(); assert.ok(avatar.styles.size > 0) }
  function paused() { assert.equal(avatar.styles.size, 0); assert.equal(env.frames.size, 0); assert.equal(env.timers.size, 0) }
  moved()
  env.reduced.matches = true; env.reduced.emit('change'); paused()
  env.move(900); env.advance(); paused()
  env.reduced.matches = false; env.reduced.emit('change'); moved()
  env.move(900, 132, 'touch'); paused()
  moved(); env.view.emit('pointerout', { relatedTarget: null }); paused()
  moved(); env.view.emit('blur'); paused()
  env.view.emit('focus'); moved()
  env.document.hidden = true; env.document.emit('visibilitychange'); paused()
  env.document.hidden = false; env.document.emit('visibilitychange'); moved()
  env.pointer.matches = false; env.pointer.emit('change'); paused()
  stop()
})


test('BotFace opts into tracking explicitly, still and photos suppress it, and switching away cleans up', async t => {
  const { createRequire } = await import('node:module')
  const { build } = await import('esbuild')
  const { React, act } = await import('./helpers/native-react-harness.mjs')
  const { createRoot } = await import('react-dom/client')
  const result = await build({ stdin: { contents: "export {BotFace} from './src/bot-avatar.jsx'", resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'node', loader: { '.css': 'empty' }, external: ['react'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const { BotFace } = module.exports
  const element = document.createElement('div'); document.body.append(element)
  const root = createRoot(element), active = new Set()
  const originalAdd = window.addEventListener, originalRemove = window.removeEventListener
  window.addEventListener = function(type, callback, options) { if (type === 'pointermove') active.add(callback); originalAdd.call(this, type, callback, options) }
  window.removeEventListener = function(type, callback, options) { if (type === 'pointermove') active.delete(callback); originalRemove.call(this, type, callback, options) }
  t.after(async () => {
    await act(async () => root.unmount()); element.remove()
    window.addEventListener = originalAdd; window.removeEventListener = originalRemove
  })
  const render = props => act(async () => root.render(React.createElement(BotFace, { bot: { id: 'primary', isDefault: true }, ...props })))
  await render({})
  assert.equal(active.size, 0)
  await render({ interactive: true })
  assert.equal(active.size, 1)
  assert.equal(element.querySelector('[data-bot-shape]').dataset.botShape, 'boxy')
  assert.equal(element.querySelector('.bot-avatar-idle-effects'), null)
  assert.equal(element.querySelector('.bot-avatar-highlight'), null)
  await render({ interactive: true, still: true })
  assert.equal(active.size, 0)
  await render({ interactive: true, bot: { id: 'photo', avatar: '/my-photo.png' } })
  assert.equal(active.size, 0)
  assert.equal(element.querySelector('img').getAttribute('src'), '/my-photo.png')
  assert.equal(element.querySelector('.bot-avatar-eyes'), null)
  await render({ interactive: true })
  assert.equal(active.size, 1)
  await render({ interactive: false })
  assert.equal(active.size, 0)
})
