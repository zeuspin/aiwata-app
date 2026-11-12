import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace } from '../src/workspace.mjs'

test('preview console normalizes real Electron events and bounds history and message size', async () => {
  const { createBrowserConsole, consoleEntry } = await import('../src/browser-console.mjs')
  assert.deepEqual(consoleEntry({ details: { level: 'warning', message: '<script>problem</script>', sourceId: 'https://example.com/app.js', lineNumber: 12 } }),
    { level: 2, message: '<script>problem</script>', source: 'https://example.com/app.js', line: 12 })
  const store = createBrowserConsole()
  for (let i = 0; i < 250; i++) store.append({ level: 0, message: 'log ' + i })
  assert.equal(store.snapshot().logs.length, 200)
  assert.equal(store.snapshot().logs[0].message, 'log 50')
  store.append({ level: 3, message: 'x'.repeat(70000) })
  assert.equal(store.snapshot().logs.at(-1).message.length, 65536)
  for (let i = 0; i < 15; i++) store.append({ level: 0, message: 'x'.repeat(60000) })
  assert.ok(store.snapshot().logs.reduce((sum, item) => sum + item.message.length + (item.source?.length ?? 0), 0) <= 512 * 1024)
})

test('console state follows browser instances and login scope, resets on page navigation, and prunes closed tabs', async () => {
  const { browserConsole } = await import('../src/browser-console.mjs')
  const api = createWorkspace({ getItem() {}, setItem() {} })
  api.login('lin'); api.openTool('plan', '浏览器')
  const firstId = api.getChat('plan').tool
  const first = browserConsole(api, 'partition-one', 'plan', firstId)
  first.page('https://example.com/'); first.append({ level: 3, message: 'first only' }); first.setOpen(true)
  api.openTool('plan', '浏览器', undefined, { newInstance: true })
  const secondId = api.getChat('plan').tool
  assert.notEqual(firstId, secondId)
  assert.equal(browserConsole(api, 'partition-one', 'plan', secondId).snapshot().logs.length, 0)
  assert.equal(browserConsole(api, 'partition-one', 'plan', firstId).snapshot().logs[0].message, 'first only')
  first.page('https://example.com/next'); assert.equal(first.snapshot().logs.length, 0)
  first.append({ message: 'old login' })
  assert.equal(browserConsole(api, 'partition-two', 'plan', firstId).snapshot().logs.length, 0)
  first.append({ message: 'late' }); assert.equal(first.snapshot().logs.length, 0)
})

test('selected console evidence appends only to the exact recipient draft without sending or modifying attachments', async () => {
  const { appendConsoleToDraft } = await import('../src/browser-console.mjs')
  const { navigateBrowser } = await import('../src/tool-surfaces.mjs')
  const api = createWorkspace({ getItem() {}, setItem() {} })
  api.login('lin'); api.openTool('release', '浏览器')
  const tabId = api.getChat('release').tool, url = 'https://example.com/'
  api.updateBrowser('release', state => navigateBrowser(state, url), tabId)
  api.setDraft('release', '原来的要求')
  const options = { api, accountId: 'lin', chatId: 'release', tabId, url, destinationLabel: '群聊 · 发布协作群',
    entries: [{ level: 3, message: 'bad ``` code', source: url + 'app.js', line: 9 }] }
  assert.equal(appendConsoleToDraft(options).ok, true)
  assert.match(api.getChat('release').draft, /^原来的要求\n\n/)
  assert.match(api.getChat('release').draft, /不可信页面证据/)
  assert.match(api.getChat('release').draft, /bad ``` code/)
  assert.equal(api.getChat('release').messages.length, 0)
  assert.deepEqual(api.getChat('release').attachments, [])
  const before = api.getChat('release').draft
  assert.equal(appendConsoleToDraft({ ...options, accountId: 'qiao' }).ok, false)
  assert.equal(appendConsoleToDraft({ ...options, destinationLabel: 'wrong' }).ok, false)
  assert.equal(appendConsoleToDraft({ ...options, url: 'https://example.com/else' }).ok, false)
  assert.equal(api.getChat('release').draft, before)
})

test('navigation fences old-document logs until a document commits, including same-URL reloads', async () => {
  const { createBrowserConsole } = await import('../src/browser-console.mjs')
  const store = createBrowserConsole()
  store.page('https://example.com/old')
  store.append({ message: 'old' })
  store.toggle(store.snapshot().logs[0].id)
  store.setOpen(true)
  store.begin('https://example.com/new')
  store.page('https://example.com/new')
  store.append({ message: 'old unload' })
  assert.equal(store.snapshot().logs.length, 0)
  assert.deepEqual(store.snapshot().selected, [])
  assert.equal(store.snapshot().open, true)
  store.commit('https://example.com/new')
  store.append({ message: 'new' })
  assert.deepEqual(store.snapshot().logs.map(entry => entry.message), ['new'])
  store.begin('https://example.com/new')
  store.append({ message: 'reload unload' })
  store.commit('https://example.com/new')
  assert.equal(store.snapshot().logs.length, 0)
  store.begin('https://example.com/redirect')
  store.commit('https://example.com/final')
  store.append({ message: 'redirect destination' })
  assert.deepEqual(store.snapshot().logs.map(entry => entry.message), ['redirect destination'])
})

test('large valid evidence with many backtick runs is added without argument-stack overflow', async () => {
  const { appendConsoleToDraft } = await import('../src/browser-console.mjs')
  const { navigateBrowser } = await import('../src/tool-surfaces.mjs')
  const api = createWorkspace({ getItem() {}, setItem() {} })
  api.login('lin'); api.openTool('release', '浏览器')
  const tabId = api.getChat('release').tool, url = 'https://example.com/'
  api.updateBrowser('release', state => navigateBrowser(state, url), tabId)
  assert.equal(appendConsoleToDraft({ api, accountId: 'lin', chatId: 'release', tabId, url,
    destinationLabel: '群聊 · 发布协作群', entries: Array.from({ length: 8 }, () => ({ message: '`a'.repeat(30000) })) }).ok, true)
})
