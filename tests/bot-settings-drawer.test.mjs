import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { React, act, click } from './helpers/native-react-harness.mjs'
import { createRoot } from 'react-dom/client'
import { createWorkspace } from '../src/workspace.mjs'

test('private chat opens a bounded Bot card and returns to it after editing the avatar', async t => {
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
  function Harness() {
    const [, refresh] = React.useReducer(value => value + 1, 0)
    return React.createElement(module.exports.Workbench, {
      api, account: { id: 'lin', name: '林', initial: '林' }, refresh, onOffline() {},
    })
  }
  await act(async () => root.render(React.createElement(Harness)))
  const header = element.querySelector('.bot-conversation-pill')
  header.focus()
  const chatPane = element.querySelector('.chat-pane')
  const route = JSON.stringify(api.current().navigation)
  await click(header)
  let card = chatPane.querySelector('.bot-profile-card')
  assert.ok(card, 'the card belongs to the current chat pane')
  assert.equal(header.getAttribute('aria-expanded'), 'true')
  assert.equal(header.closest('.bot-conversation-header').hidden, true)
  assert.match(card.textContent, new RegExp(bot.name))
  assert.equal(element.querySelector('dialog[open]'), null)
  assert.equal(JSON.stringify(api.current().navigation), route)
  assert.equal(element.querySelector('[aria-label="打开工具"]').getAttribute('aria-expanded'), 'false')
  assert.equal(chatPane.dataset.botProfileLayout, 'docked')
  const transcript = chatPane.querySelector('.transcript-region')
  await click(element.querySelector('[aria-label="打开工具"]'))
  assert.equal(chatPane.dataset.botProfileLayout, 'overlay')
  assert.ok(chatPane.querySelector('.bot-profile-card') === card, 'toggling right tools preserves the card')
  assert.ok(chatPane.querySelector('.transcript-region') === transcript, 'layout changes preserve the transcript DOM')
  await click(element.querySelector('[aria-label="隐藏工具"]'))
  assert.equal(chatPane.dataset.botProfileLayout, 'docked')
  assert.ok(chatPane.querySelector('.bot-profile-card') === card)
  await click(element.querySelector('[aria-label="收起侧栏"]'))
  assert.equal(chatPane.dataset.botProfileLayout, 'docked', 'left navigation does not choose the card layout')
  assert.ok(card.querySelector('[aria-label="Bot 答复语言"]'))
  assert.match(card.textContent, /计划/)
  assert.deepEqual([...card.querySelectorAll('[role="tab"]')].map(tab => tab.textContent), ['概览', 'SOUL', '记忆', '技能', '工具'])
  await click([...card.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === 'SOUL'))
  const soul = card.querySelector('[name="soul"]')
  assert.ok(!soul.closest('[hidden]'), 'SOUL is editable in the card')
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(soul, '请用短句答复。')
    soul.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const originalConfirm = window.confirm
  let confirmations = 0
  window.confirm = () => { confirmations++; return false }
  try {
    await act(async () => soul.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'O', metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
    })))
  } finally {
    window.confirm = originalConfirm
  }
  assert.equal(confirmations, 1)
  assert.equal(soul.value, '请用短句答复。')
  assert.ok(card.isConnected, 'rejecting the shortcut preserves the definition draft')
  await click([...card.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === '概览'))
  const language = card.querySelector('[aria-label="Bot 答复语言"]')
  await act(async () => {
    language.value = 'English'
    language.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => language.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  assert.match(api.current().bots.find(entry => entry.id === bot.id).soul, /请用短句答复。/)
  assert.match(api.current().bots.find(entry => entry.id === bot.id).soul, /English/)
  await click([...card.querySelectorAll('button')].find(button => button.textContent === '新建计划'))
  const task = card.querySelector('dialog[open]')
  assert.ok(task)
  assert.equal(task.querySelector('input[name="profile"]').value, bot.id)
  await act(async () => {
    task.querySelector('[name="name"]').value = '每周检查'
    task.querySelector('[name="prompt"]').value = '总结本周进度'
    task.querySelector('[name="schedule"]').value = '0 9 * * 1'
    task.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  assert.match(card.querySelector('.bot-profile-plan-summary').textContent, /每周检查/)
  assert.ok(api.current().management.tasks.some(plan => plan.name === '每周检查' && plan.profile === bot.id))
  await click(element.querySelector('[aria-label="展开侧栏"]'))
  assert.ok(card.isConnected, 'changing sidebar visibility preserves the same card')
  assert.equal(header.closest('.bot-conversation-header').hidden, true)
  await click(card.querySelector('[aria-label="更换头像"]'))
  const avatarEditor = element.querySelector('dialog.bot-avatar-dialog[open]')
  assert.ok(avatarEditor?.querySelector('.bot-look-preview'))
  assert.equal(avatarEditor.querySelector('[name="model"]'), null)
  const before = api.current().bots.find(entry => entry.id === bot.id).appearance
  await click(avatarEditor.querySelector('.bot-shape-grid button[aria-pressed="false"]'))
  const submit = avatarEditor.querySelector('button[form]')
  await act(async () => document.getElementById(submit.getAttribute('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  assert.ok(!element.querySelector('dialog.bot-avatar-dialog'), 'successful save should close the editor')
  assert.notDeepEqual(api.current().bots.find(entry => entry.id === bot.id).appearance, before)
  assert.ok(chatPane.querySelector('.bot-profile-card') === card, 'save should return to the same card')
  assert.equal(document.activeElement?.getAttribute('aria-label'), '更换头像', 'save should restore focus to the avatar')
  await click(card.querySelector('[aria-label="Bot 设置"]'))
  const drawer = element.querySelector('dialog.bot-settings-drawer[open]')
  assert.ok(drawer?.querySelector('[name="name"]'))
  await click(drawer.querySelector('[aria-label="关闭 Bot 设置"]'))
  assert.ok(!element.querySelector('.bot-settings-drawer'), 'closing should remove the drawer')
  const sidebar = element.querySelector('.context-track')
  let sidebarClicked = false
  sidebar.addEventListener('click', () => { sidebarClicked = true })
  await click(sidebar)
  assert.equal(sidebarClicked, true, 'dismissal must not swallow the sidebar click')
  assert.ok(!chatPane.querySelector('.bot-profile-card'), 'the sidebar should dismiss the card')
  assert.equal(header.getAttribute('aria-expanded'), 'false')
  await click(header)
  card = chatPane.querySelector('.bot-profile-card')
  await click(card.querySelector('[aria-label="关闭 Bot 信息"]'))
  assert.ok(element.querySelector('.chat-pane') === chatPane, 'preserve the conversation DOM')
  assert.equal(api.current().chats[bot.id].draft, '保留这段未发送的工作内容')
  assert.ok(document.activeElement === header, 'closing returns keyboard focus to the header')
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
