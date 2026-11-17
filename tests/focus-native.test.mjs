import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = dirname(dirname(fileURLToPath(import.meta.url)))
const core = resolve(process.env.AIWATA_APP_SOURCE || join(frontend, '../aiwata'))
const requireCore = createRequire(join(core, 'apps/desktop/package.json'))
const { build } = requireCore('esbuild')
const { _electron } = requireCore('@playwright/test')
let app, page, scratch

before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'aiwata-focus-native-'))
  await build({ entryPoints: [join(frontend, 'tests/fixtures/focus-native.jsx')], bundle: true,
    platform: 'browser', format: 'iife', outfile: join(scratch, 'fixture.js'),
    define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent' })
  await writeFile(join(scratch, 'index.html'), '<!doctype html><html lang="en"><head><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>')
  await writeFile(join(scratch, 'main.cjs'), `const { app, BrowserWindow, session } = require('electron');
app.setPath('userData', ${JSON.stringify(join(scratch, 'user-data'))});
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*','ws://*/*','wss://*/*'] }, (_, callback) => callback({ cancel: true }));
  const window = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  window.loadFile(${JSON.stringify(join(scratch, 'index.html'))});
});`)
  app = await _electron.launch({ executablePath: requireCore('electron'), args: [join(scratch, 'main.cjs')],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, timeout: 20000 })
  page = await app.firstWindow()
}, { timeout: 30000 })

after(async () => {
  try { if (app) await app.close() }
  finally { if (scratch) await rm(scratch, { recursive: true, force: true }) }
})

beforeEach(async () => {
  await page.reload()
  await page.waitForSelector('#opener')
  await page.emulateMedia({ forcedColors: 'none' })
})

async function focusId() { return page.evaluate(() => document.activeElement.id) }
async function openForm(opener = '#opener') {
  await page.locator(opener).focus()
  await page.keyboard.press('Enter')
  await page.waitForSelector('dialog[open]')
}
async function openMenu() {
  await page.locator('#menu-opener').focus()
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="menu"]')
}

for (const [name, dismiss] of [
  ['Escape', () => page.keyboard.press('Escape')],
  ['close button', () => page.locator('dialog [aria-label="关闭"]').click()],
  ['Cancel', () => page.locator('dialog').getByText('取消', { exact: true }).click()],
  ['successful save', () => page.locator('dialog').getByText('保存', { exact: true }).click()],
]) {
  test(`management dialog returns focus after ${name}`, async () => {
    await openForm()
    await dismiss()
    await page.waitForSelector('dialog', { state: 'detached' })
    assert.equal(await focusId(), 'opener')
  })
}

test('renaming a tab returns focus on cancellation', async () => {
  await openForm('#tab-opener')
  await page.keyboard.press('Escape')
  await page.waitForSelector('dialog', { state: 'detached' })
  assert.equal(await focusId(), 'tab-opener')
})

for (const opener of ['#project-opener', '#attachment-opener']) {
  test(`sibling modal ${opener} returns focus on cancellation`, async () => {
    await openForm(opener)
    await page.keyboard.press('Escape')
    await page.waitForSelector('dialog', { state: 'detached' })
    assert.equal(await focusId(), opener.slice(1))
  })
}

test('annotation image preview returns focus to its thumbnail', async () => {
  const thumbnail = page.getByRole('button', { name: '查看批注 1 的标记截图' })
  await thumbnail.click()
  await page.waitForSelector('dialog[open]')
  await page.keyboard.press('Escape')
  await page.waitForSelector('dialog', { state: 'detached' })
  assert.equal(await thumbnail.evaluate(el => document.activeElement === el), true)
})

test('saving prevents dismissal and a rejected save keeps the form open', async () => {
  await openForm()
  await page.locator('dialog input').fill('wait')
  await page.locator('dialog').getByText('保存', { exact: true }).click()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('dialog[open]').count(), 1)
  await page.evaluate(() => window.finishSave(false))
  await page.locator('dialog [aria-label="关闭"]').waitFor()
  await page.locator('dialog [aria-label="关闭"]').click()
  await page.waitForSelector('dialog', { state: 'detached' })
  assert.equal(await focusId(), 'opener')
})

test('a save rejection keeps the error and form visible until the user dismisses it', async () => {
  await openForm()
  await page.locator('dialog input').fill('reject')
  await page.locator('dialog').getByText('保存', { exact: true }).click()
  assert.equal(await page.locator('dialog [role="alert"]').textContent(), 'Save failed')
  assert.equal(await page.locator('dialog[open]').count(), 1)
  await page.keyboard.press('Escape')
  await page.waitForSelector('dialog', { state: 'detached' })
  assert.equal(await focusId(), 'opener')
})

test('closing a nested setting preserves the Bot drawer and restores each opener', async () => {
  await openForm('#nested-opener')
  await page.locator('#nested-child-opener').click()
  await page.getByRole('dialog', { name: 'Nested setting', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Nested setting', exact: true }).waitFor({ state: 'detached' })
  assert.equal(await page.locator('.bot-settings-drawer[open]').count(), 1)
  assert.equal(await focusId(), 'nested-child-opener')
  await page.keyboard.press('Escape')
  await page.waitForSelector('dialog', { state: 'detached' })
  assert.equal(await focusId(), 'nested-opener')
})

test('ordinary menu commands restore focus and run exactly once', async () => {
  await openMenu()
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="menu"]', { state: 'detached' })
  assert.equal(await page.locator('#actions').textContent(), '1')
  assert.equal(await focusId(), 'menu-opener')
})

test('a menu command hands focus to its new dialog, then back to its trigger', async () => {
  await openMenu()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('dialog[open]')
  assert.equal(await page.evaluate(() => document.activeElement.closest('dialog')?.open), true)
  await page.keyboard.press('Escape')
  await page.waitForSelector('dialog', { state: 'detached' })
  assert.equal(await focusId(), 'menu-opener')
})

test('navigation and outside clicks retain their destination focus', async () => {
  await openMenu()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  assert.equal(await focusId(), 'destination')
  await openMenu()
  await page.locator('#destination').click()
  assert.equal(await focusId(), 'destination')
  assert.equal(await page.locator('[role="menu"]').count(), 0)
})

test('menu arrow keys and Escape retain their existing behavior', async () => {
  await openMenu()
  await page.keyboard.press('ArrowDown')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Open dialog')
  await page.keyboard.press('Escape')
  assert.equal(await focusId(), 'menu-opener')
})

test('focused composer has a visible border with at least 3:1 contrast', async () => {
  await page.locator('textarea').focus()
  const colors = await page.locator('.composer').evaluate(el => {
    const style = getComputedStyle(el)
    return [style.borderColor, style.backgroundColor]
  })
  const luminance = color => color.match(/\d+/g).slice(0, 3).map(Number).map(x => x / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0)
  const [a, b] = colors.map(luminance)
  assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 3, colors.join(' / '))
})

test('forced colors retains a focused composer outline without changing geometry', async () => {
  const composer = page.locator('.composer')
  const before = await composer.boundingBox()
  await page.emulateMedia({ forcedColors: 'active' })
  await page.locator('textarea').focus()
  const outline = await composer.evaluate(el => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }))
  assert.notEqual(outline.style, 'none')
  assert.ok(outline.width >= 2)
  assert.deepEqual(await composer.boundingBox(), before)
})

test('composer keeps IME confirmation, Shift+Enter and Enter send behavior', async () => {
  const area = page.locator('textarea')
  await area.fill('中文输入')
  await area.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true })))
  assert.equal(await page.locator('#sent').textContent(), '0')
  await area.press('Shift+Enter')
  assert.equal(await page.locator('#sent').textContent(), '0')
  await area.press('Enter')
  assert.equal(await page.locator('#sent').textContent(), '1')
})
