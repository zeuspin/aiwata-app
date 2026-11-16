import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { React, act, click } from './helpers/native-react-harness.mjs'
import { createRoot } from 'react-dom/client'
import { createWorkspace } from '../src/workspace.mjs'

test('chat identity opens only that Bot settings and closing preserves conversation, draft and route', async t => {
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  window.HTMLCanvasElement.prototype.getContext = () => null
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: ['src/workbench.jsx'], bundle: true, write: false,
    format: 'cjs', platform: 'node', loader: { '.css': 'empty' }, external: ['react', '@tabler/icons-react'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  const data = new Map()
  const api = createWorkspace({ getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) })
  api.login('lin')
  const bot = api.current().bots.find(bot => !bot.isDefault)
  api.openChat(bot.id)
  api.changeChat(bot.id, { draft: '保留这段未发送的工作内容' })
  api.updateNavigation({ section: 'bots', sidebarOpen: true })
  api.updateNavigationModule('bots', { chatId: bot.id }, true)
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  t.after(async () => { await act(async () => root.unmount()); element.remove() })
  await act(async () => root.render(React.createElement(module.exports.Workbench, {
    api, account: { id: 'lin', name: '林', initial: '林' }, refresh() {}, onOffline() {},
  })))
  const header = element.querySelector('.bot-conversation-pill')
  header.focus()
  const chatPane = element.querySelector('.chat-pane')
  const route = JSON.stringify(api.current().navigation)
  await click(header)
  const drawer = element.querySelector('dialog.bot-settings-drawer')
  assert.ok(drawer?.open, 'selected settings should open in a drawer')
  assert.match(drawer.textContent, new RegExp(bot.name))
  assert.equal(drawer.querySelector('.management-header h2')?.textContent === 'Bot 与群聊管理', false)
  assert.equal(element.querySelector('.chat-pane'), chatPane, 'conversation must remain mounted')
  assert.equal(JSON.stringify(api.current().navigation), route, 'opening settings must not change navigation')
  assert.equal(api.current().chats[bot.id].draft, '保留这段未发送的工作内容')
  await click(drawer.querySelector('[aria-label="关闭 Bot 设置"]'))
  assert.equal(element.querySelector('.bot-settings-drawer'), null)
  assert.equal(element.querySelector('.chat-pane'), chatPane)
  assert.equal(api.current().chats[bot.id].draft, '保留这段未发送的工作内容')
  assert.equal(document.activeElement, header, 'closing returns keyboard focus to the header')
})


test('settings drawer blocks cancellation while saving and ignores nested dialog cancellation', async t => {
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: ['src/bot-settings-drawer.jsx'], bundle: true, write: false,
    format: 'cjs', platform: 'node', loader: { '.css': 'empty' }, external: ['react', '@tabler/icons-react'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  t.after(async () => { await act(async () => root.unmount()); element.remove() })
  let closes = 0
  const render = busy => act(async () => root.render(React.createElement(module.exports.BotSettingsDrawer, {
    name: '设计助手', busy, onClose: () => closes++,
  }, React.createElement('dialog', { className: 'nested' }))))
  await render(true)
  const drawer = element.querySelector('.bot-settings-drawer')
  await act(async () => drawer.dispatchEvent(new Event('cancel', { cancelable: true })))
  assert.equal(closes, 0)
  assert.equal(drawer.querySelector('button').disabled, true)
  await render(false)
  await act(async () => element.querySelector('.nested').dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })))
  assert.equal(closes, 0, 'nested editor cancellation must not close its parent')
  await act(async () => drawer.dispatchEvent(new Event('cancel', { cancelable: true })))
  assert.equal(closes, 1)
})


test('legacy selected settings navigation restores the manager and opens guarded Bot drawers', async t => {
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  window.HTMLCanvasElement.prototype.getContext = () => null
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: ['src/workbench.jsx'], bundle: true, write: false,
    format: 'cjs', platform: 'node', loader: { '.css': 'empty' }, external: ['react', '@tabler/icons-react'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  const api = createWorkspace()
  api.login('lin')
  const bot = api.current().bots.find(bot => !bot.isDefault)
  api.updateNavigation({ section: 'bot-settings', sidebarOpen: true })
  api.updateNavigationModule('bot-settings', { item: bot.id }, true)
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  t.after(async () => { await act(async () => root.unmount()); element.remove() })
  await act(async () => root.render(React.createElement(module.exports.Workbench, {
    api, account: { id: 'lin', name: '林', initial: '林' }, refresh() {}, onOffline() {},
  })))
  assert.equal(element.querySelector('.management-header h2').textContent, '全部 Bot 管理')
  assert.equal(element.querySelector('[name="name"]'), null)
  await click(element.querySelector('[aria-label="设置 Bot · ' + bot.name + '"]'))
  assert.ok(element.querySelector('dialog.bot-settings-drawer[open] [name="name"]'))
})
