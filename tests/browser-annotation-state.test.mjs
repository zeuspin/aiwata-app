import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace } from '../src/workspace.mjs'
import * as surfaces from '../src/tool-surfaces.mjs'
import { browserState } from '../src/tool-tabs.mjs'
import { attachmentIds } from '../src/local-attachments.mjs'

const url = 'https://example.com/page'
const png = 'data:image/png;base64,iVBORw0KGgo='
const capture = { kind: 'element', rect: { x: 2, y: 3, width: 40, height: 50 }, identity: { selector: '#title', html: '<h1>Title</h1>', styles: { color: 'red' } }, imageDataUrl: png, pageUrl: url, pageTitle: 'Page' }
function setup() {
  const metadata = new Map(), files = new Map()
  const state = { fail: false, pause: null }
  const key = (account, chat, id) => JSON.stringify([account, chat, id])
  const storage = { getItem: key => metadata.get(key), setItem(key, value) { if (state.fail) throw Error('quota'); metadata.set(key, value) } }
  const store = {
    async save(account, chat, items) { for (const { id, file } of items) files.set(key(account, chat, id), file) },
    async read(account, chat, id) { if (state.pause) await state.pause; return files.get(key(account, chat, id)) },
    async remove(account, chat, ids) { for (const id of ids) files.delete(key(account, chat, id)) },
  }
  const api = createWorkspace(storage, store)
  api.login('lin')
  const open = (id = 'plan') => { api.openTool(id, '浏览器'); api.updateBrowser(id, browser => surfaces.navigateBrowser(browser, url)); return id }
  open()
  return { api, files, state, storage, store, open }
}
async function pin(fixture, chatId = 'plan', tabId = '浏览器') {
  const { api } = fixture
  assert.equal((await api.saveBrowserAnnotationCapture(chatId, tabId, url, capture)).ok, true)
  api.updateBrowser(chatId, browser => surfaces.editBrowserAnnotation(browser, url, { text: '调整标题' }), tabId)
  api.updateBrowser(chatId, browser => surfaces.saveBrowserAnnotation(browser, url), tabId)
  return browserState(api.getChat(chatId), tabId).annotations.at(-1)
}
const request = (api, chatId, pins, tabId = '浏览器') => ({ accountId: api.accountId, chatId, tabId, url, pinIds: pins.map(pin => pin.id), destinationLabel: surfaces.annotationDestination(api.current(), chatId).label })

test('destination resolves current account conversations, Bots and groups only', () => {
  const { api } = setup()
  assert.equal(surfaces.annotationDestination(api.current(), 'plan').kind, 'conversation')
  assert.equal(surfaces.annotationDestination(api.current(), 'editor').kind, 'bot')
  assert.equal(surfaces.annotationDestination(api.current(), 'release').kind, 'group')
  api.login('qiao')
  assert.equal(surfaces.annotationDestination(api.current(), 'plan'), null)
})

test('capture bytes persist apart from metadata and rich pin numbers never recycle after removal', async () => {
  const f = setup(), first = await pin(f)
  assert.equal(first.number, 1)
  assert.equal(typeof first.id, 'string')
  assert.equal(first.capture.identity.selector, '#title')
  assert.equal(first.capture.imageDataUrl, undefined)
  assert.equal(f.files.size, 1)
  f.api.updateBrowser('plan', b => ({ ...b, annotations: [] }))
  const second = await pin(f)
  assert.equal(second.number, 2)
  const reopened = createWorkspace(f.storage, f.store)
  reopened.login('lin')
  assert.equal(browserState(reopened.getChat('plan')).annotations[0].number, 2)
  assert.equal((await reopened.readLocalAttachment('plan', second.capture.image.blobId)).size > 0, true)
  reopened.login('qiao')
  assert.equal(await reopened.readLocalAttachment('plan', second.capture.image.blobId), null)
})

test('handoff preserves text and attachments, uses unique numbered image names, and stays idempotent after draft edits', async () => {
  const f = setup(), saved = await pin(f)
  const name = '网页批注-1.png'
  await f.api.addLocalAttachments('plan', [new File(['existing'], name, { type: 'image/png' })])
  f.api.setDraft('plan', '已有草稿')
  const input = request(f.api, 'plan', [saved])
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, true)
  const chat = f.api.getChat('plan')
  assert.equal(chat.attachments.length, 2)
  assert.equal(new Set(chat.attachments).size, 2)
  assert.match(chat.draft, /^已有草稿\n\n/)
  assert.match(chat.draft, /#title/)
  assert.match(chat.draft, /不可信/)
  assert.equal(chat.pending, null)
  assert.equal(browserState(chat).annotations.length, 1)
  f.api.setDraft('plan', '用户改写')
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).duplicate, true)
  assert.equal(chat.draft, '用户改写')
  assert.equal(chat.attachments.length, 2)
})

test('missing images and failed metadata storage leave destination entirely unchanged', async () => {
  const f = setup(), saved = await pin(f)
  const input = request(f.api, 'plan', [saved]), chat = f.api.getChat('plan')
  const file = [...f.files.values()][0]
  f.files.clear()
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, false)
  assert.equal(chat.draft, '')
  assert.deepEqual(chat.attachments, [])
  await f.store.save('lin', 'plan', [{ id: saved.capture.image.blobId, file }])
  f.state.fail = true
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, false)
  assert.equal(chat.draft, '')
  assert.deepEqual(chat.attachments, [])
  f.state.fail = false
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, true)
})

for (const [label, mutate] of [
  ['logout and relogin', f => { f.api.logout(); f.api.login('lin') }],
  ['draft edit', f => f.api.setDraft('plan', '期间修改')],
  ['navigation', f => f.api.updateBrowser('plan', b => surfaces.navigateBrowser(b, 'https://example.com/other'))],
  ['pin edit', f => f.api.updateBrowser('plan', b => ({ ...b, annotations: b.annotations.map(p => ({ ...p, text: 'changed' })) }))],
  ['recipient rename', f => f.api.renameChat('plan', 'renamed')],
  ['browser close', f => f.api.closeTools('plan', '浏览器', 'one')],
]) test(`handoff rejects ${label} during image read without a partial append`, async () => {
  const f = setup(), saved = await pin(f)
  let release
  f.state.pause = new Promise(resolve => { release = resolve })
  const pending = f.api.addBrowserAnnotationsToDraft(request(f.api, 'plan', [saved]))
  mutate(f)
  release()
  assert.equal((await pending).ok, false)
  assert.equal(f.api.getChat('plan').attachments.length, 0)
  assert.equal(f.api.getChat('plan').draft.includes('调整标题'), false)
})

test('capture replacement storage failure retains prior capture and closes release only unreferenced instance images', async () => {
  const f = setup()
  await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, capture)
  const first = browserState(f.api.getChat('plan')).annotationDrafts[url].capture
  f.state.fail = true
  assert.equal((await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, capture)).ok, false)
  assert.deepEqual(browserState(f.api.getChat('plan')).annotationDrafts[url].capture, first)
  assert.equal(f.files.size, 1)
  f.state.fail = false
  f.api.openTool('plan', '浏览器', undefined, { newInstance: true })
  const tabId = f.api.getChat('plan').tool
  f.api.updateBrowser('plan', b => surfaces.navigateBrowser(b, url), tabId)
  const saved = await pin(f, 'plan', tabId)
  assert.equal(attachmentIds(f.api.getChat('plan')).size, 2)
  await f.api.addBrowserAnnotationsToDraft(request(f.api, 'plan', [saved], tabId))
  f.api.closeTools('plan', tabId, 'one')
  assert.equal(f.files.size, 2)
  f.api.changeChat('plan', { attachments: [], attachmentDetails: {} })
  assert.equal(f.files.size, 1)
})

test('rich edits retain IDs and screenshot numbers, reject stale new captures and preserve native page rectangles', async () => {
  const f = setup()
  const page = { x: 12, y: 103, width: 40, height: 50 }
  assert.equal((await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, { ...capture, number: 1, page })).ok, true)
  f.api.updateBrowser('plan', b => surfaces.editBrowserAnnotation(b, url, { text: 'first' }))
  f.api.updateBrowser('plan', b => surfaces.saveBrowserAnnotation(b, url))
  const first = browserState(f.api.getChat('plan')).annotations[0]
  assert.deepEqual(first.capture.page, page)
  f.api.updateBrowser('plan', b => surfaces.editBrowserAnnotation(b, url, { ...first, open: true, text: 'edited' }))
  f.api.updateBrowser('plan', b => surfaces.saveBrowserAnnotation(b, url))
  const edited = browserState(f.api.getChat('plan')).annotations[0]
  assert.equal(edited.id, first.id)
  assert.equal(edited.number, 1)
  assert.equal(edited.text, 'edited')
  assert.equal((await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, { ...capture, number: 1 })).ok, false)
  assert.equal(surfaces.nextBrowserAnnotationNumber(browserState(f.api.getChat('plan')), url), 2)
})

for (const chatId of ['editor', 'release']) test(`handoff for ${chatId} stays in that destination and remains idempotent after reload`, async () => {
  const f = setup()
  f.open(chatId)
  const saved = await pin(f, chatId)
  const input = request(f.api, chatId, [saved])
  assert.equal((await f.api.addBrowserAnnotationsToDraft({ ...input, destinationLabel: 'wrong recipient' })).ok, false)
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, true)
  assert.equal(f.api.getChat('plan').draft, '')
  assert.deepEqual(f.api.getChat('plan').attachments, [])
  const reopened = createWorkspace(f.storage, f.store)
  reopened.login('lin')
  assert.equal((await reopened.addBrowserAnnotationsToDraft(input)).duplicate, true)
  assert.equal(reopened.getChat(chatId).attachments.length, 1)
})

test('legacy text-only annotations can be added without fabricating a screenshot', async () => {
  const f = setup()
  f.api.updateBrowser('plan', b => surfaces.editBrowserAnnotation(b, url, { target: '正文', text: '旧批注' }))
  f.api.updateBrowser('plan', b => surfaces.saveBrowserAnnotation(b, url))
  const input = { ...request(f.api, 'plan', []), pinIds: undefined }
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, true)
  assert.match(f.api.getChat('plan').draft, /正文 · 旧批注/)
  assert.deepEqual(f.api.getChat('plan').attachments, [])
  assert.equal(f.files.size, 0)
})

test('removing a group recipient during image reads cannot append elsewhere', async () => {
  const f = setup()
  f.open('release')
  const saved = await pin(f, 'release')
  let release
  f.state.pause = new Promise(resolve => { release = resolve })
  const pending = f.api.addBrowserAnnotationsToDraft(request(f.api, 'release', [saved]))
  f.api.removeBotEntity('group', 'release')
  release()
  assert.equal((await pending).ok, false)
  assert.equal(f.api.getChat('release'), undefined)
  assert.equal(f.api.getChat('plan').draft, '')
  assert.equal(f.files.size, 0)
})

test('aborting a native capture during image storage preserves the existing draft and removes staged bytes', async () => {
  const f = setup()
  await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, capture)
  f.api.updateBrowser('plan', b => surfaces.editBrowserAnnotation(b, url, { text: '保留原草稿' }))
  const previous = structuredClone(browserState(f.api.getChat('plan')).annotationDrafts[url])
  let release, started
  const entered = new Promise(resolve => { started = resolve })
  const blocked = new Promise(resolve => { release = resolve })
  const save = f.store.save
  f.store.save = async (...args) => { started(); await blocked; return save(...args) }
  const controller = new AbortController()
  const pending = f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, capture, { signal: controller.signal })
  await entered
  controller.abort()
  release()
  assert.equal((await pending).ok, false)
  assert.deepEqual(browserState(f.api.getChat('plan')).annotationDrafts[url], previous)
  assert.equal(f.files.size, 1)
  assert.equal((await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, capture, { signal: controller.signal })).ok, false)
  assert.equal(f.files.size, 1)
})

test('a removed import can be explicitly added to a new draft while a present batch remains a duplicate', async () => {
  const f = setup(), saved = await pin(f)
  const input = request(f.api, 'plan', [saved])
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, true)
  f.api.changeChat('plan', { draft: '', attachments: [], attachmentDetails: {} })
  f.api.setDraft('plan', '新的独立请求')
  const added = await f.api.addBrowserAnnotationsToDraft(input)
  assert.equal(added.ok, true)
  assert.equal(Boolean(added.duplicate), false)
  assert.match(f.api.getChat('plan').draft, /^新的独立请求\n\n/)
  assert.equal(f.api.getChat('plan').attachments.length, 1)
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).duplicate, true)
  f.api.setDraft('plan', '用户改写导入的文字')
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).duplicate, true)
  assert.equal(f.api.getChat('plan').attachments.length, 1)
  assert.equal(browserState(f.api.getChat('plan')).annotations[0].text, '调整标题')
})

test('editing saved annotation content creates a fresh import batch', async () => {
  const f = setup(), saved = await pin(f)
  const input = request(f.api, 'plan', [saved])
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, true)
  f.api.updateBrowser('plan', b => ({ ...b, annotations: b.annotations.map(p => ({ ...p, text: '新的用户批注' })) }))
  const result = await f.api.addBrowserAnnotationsToDraft(input)
  assert.equal(result.ok, true)
  assert.equal(Boolean(result.duplicate), false)
  assert.match(f.api.getChat('plan').draft, /新的用户批注/)
})

test('legacy true receipts prevent a duplicate while the source image is present and permit reuse after removal', async () => {
  const f = setup(), saved = await pin(f)
  const input = request(f.api, 'plan', [saved])
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).ok, true)
  const legacyKey = JSON.stringify(['浏览器', url, [saved.id]])
  f.api.changeChat('plan', { browserAnnotationDeliveries: { [legacyKey]: true }, draft: '重写文字' })
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).duplicate, true)
  f.api.changeChat('plan', { draft: '下一轮请求', attachments: [], attachmentDetails: {} })
  const result = await f.api.addBrowserAnnotationsToDraft(input)
  assert.equal(result.ok, true)
  assert.equal(Boolean(result.duplicate), false)
})

test('legacy true receipts recognize their prompt after a colliding image filename is removed', async () => {
  const f = setup(), saved = await pin(f)
  const input = request(f.api, 'plan', [saved])
  await f.api.addLocalAttachments('plan', [new File(['prior'], '网页批注-1.png', { type: 'image/png' })])
  await f.api.addBrowserAnnotationsToDraft(input)
  const legacyKey = JSON.stringify(['浏览器', url, [saved.id]])
  f.api.changeChat('plan', { browserAnnotationDeliveries: { [legacyKey]: true }, attachments: [], attachmentDetails: {} })
  assert.equal((await f.api.addBrowserAnnotationsToDraft(input)).duplicate, true)
})

test('native pill can save an empty captured note and continue marking without losing its evidence', async () => {
  const f = setup()
  await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, capture)
  f.api.updateBrowser('plan', b => surfaces.saveBrowserAnnotation(b, url, { continueMarking: true }))
  const browser = browserState(f.api.getChat('plan'))
  assert.equal(browser.annotations.length, 1)
  assert.equal(browser.annotations[0].text, '')
  assert.equal(browser.annotationDrafts[url].open, true)
  assert.equal(browser.annotationDrafts[url].capture, undefined)
  const added = await f.api.addBrowserAnnotationsToDraft({ ...request(f.api, 'plan', browser.annotations), consume: true })
  assert.equal(added.ok, true)
  const after = browserState(f.api.getChat('plan'))
  assert.equal(surfaces.pendingBrowserAnnotations(after, url).length, 0)
  assert.equal(after.annotations.length, 1, 'stored evidence survives native stack clearing')
  assert.equal(f.api.getChat('plan').attachments.length, 1)
})

for (const duplicate of [false, true]) test(`native stack consumption releases a discarded draft screenshot (duplicate=${duplicate})`, async () => {
  const f = setup(), saved = await pin(f)
  const input = request(f.api, 'plan', [saved])
  if (duplicate) await f.api.addBrowserAnnotationsToDraft(input)
  await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, { ...capture, number: 2 })
  assert.equal(f.files.size, 2)
  assert.equal((await f.api.addBrowserAnnotationsToDraft({ ...input, consume: true })).ok, true)
  assert.equal(f.files.size, 1)
  assert.equal(attachmentIds(f.api.getChat('plan')).size, 1)
})

test('a fresh browser starts at one and a delivered batch restarts numbering without changing archived evidence', async () => {
  const f = setup(), old = await pin(f)
  await f.api.addBrowserAnnotationsToDraft({ ...request(f.api, 'plan', [old]), consume: true })
  const browser = browserState(f.api.getChat('plan'))
  assert.equal(surfaces.nextBrowserAnnotationNumber(browser, url), 1)
  const next = await pin(f)
  assert.equal(next.number, 1)
  assert.notEqual(next.id, old.id)
  assert.equal(browserState(f.api.getChat('plan')).annotations[0].number, 1)
  assert.deepEqual(surfaces.pendingBrowserAnnotations(browserState(f.api.getChat('plan')), url).map(pin => pin.id), [next.id])
  assert.equal((await f.api.addBrowserAnnotationsToDraft({ ...request(f.api, 'plan', [next]), consume: true })).ok, true)
  assert.equal(f.api.getChat('plan').attachments.length, 2)
  assert.equal(new Set(f.api.getChat('plan').attachments).size, 2)
  f.api.openTool('plan', '浏览器', undefined, { newInstance: true })
  const tab = f.api.getChat('plan').tool
  f.api.updateBrowser('plan', state => surfaces.navigateBrowser(state, url), tab)
  assert.equal(surfaces.nextBrowserAnnotationNumber(browserState(f.api.getChat('plan'), tab), url), 1)
  assert.equal((await pin(f, 'plan', tab)).number, 1)
})

test('old consumed lifetime counters migrate to a fresh batch and partially delivered batches retain their sequence', async () => {
  const f = setup(), first = await pin(f), second = await pin(f)
  await f.api.addBrowserAnnotationsToDraft({ ...request(f.api, 'plan', [first]), consume: true })
  assert.equal(surfaces.nextBrowserAnnotationNumber(browserState(f.api.getChat('plan')), url), 3)
  const legacy = { annotations: [first, second], annotationConsumed: [first.id, second.id], annotationNumbers: { [url]: 9 } }
  assert.equal(surfaces.nextBrowserAnnotationNumber(legacy, url), 1)
})


test('assistant streaming during annotation storage does not discard a valid screenshot', async () => {
  const f = setup(), chat = f.api.getChat('plan'), save = f.store.save
  f.store.save = async (...args) => {
    await save(...args)
    f.api.changeChat(chat.id, { messages: [...chat.messages, { role: 'agent', text: 'Still responding' }],
      agentRun: { text: 'Streaming update' }, gatewaySeq: 42, activity: { background: true } })
  }
  const result = await f.api.saveBrowserAnnotationCapture(chat.id, '浏览器', url, capture)
  assert.equal(result.ok, true, 'streaming changes neither the browser nor the annotation recipient')
  assert.equal(browserState(chat).annotationDrafts[url].capture.identity.selector, '#title')
  assert.equal(chat.agentRun.text, 'Streaming update')
  assert.equal(f.files.size, 1)
})

test('assistant streaming during annotation handoff preserves both the live reply and appended draft', async () => {
  const f = setup(), saved = await pin(f), read = f.store.read, chat = f.api.getChat('plan')
  f.store.read = async (...args) => {
    const file = await read(...args)
    f.api.changeChat(chat.id, { agentRun: { text: 'Continuing reply' }, gatewaySeq: 43 })
    return file
  }
  assert.equal((await f.api.addBrowserAnnotationsToDraft(request(f.api, chat.id, [saved]))).ok, true)
  assert.match(chat.draft, /调整标题/)
  assert.equal(chat.agentRun.text, 'Continuing reply')
})

test('navigating away and back during annotation storage still rejects the stale screenshot', async () => {
  const f = setup(), save = f.store.save
  f.store.save = async (...args) => {
    await save(...args)
    f.api.updateBrowser('plan', browser => surfaces.navigateBrowser(browser, 'https://example.com/other'))
    f.api.updateBrowser('plan', browser => surfaces.navigateBrowser(browser, url))
  }
  assert.equal((await f.api.saveBrowserAnnotationCapture('plan', '浏览器', url, capture)).ok, false)
  assert.equal(f.files.size, 0)
})
