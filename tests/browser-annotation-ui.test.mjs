import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'

test('native annotation card is an anchored single-line form with dictation and an explicit save action', async () => {
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: ['src/browser-annotations.jsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', '@tabler/icons-react'], loader: { '.css': 'empty' } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.NativeAnnotationCard, {
    left: 27, top: 26, number: 3, note: '增加留白', onChange() {}, onSave() {}, onCancel() {},
  }))
  assert.match(html, /aria-label="批注 3"/)
  assert.match(html, /style="left:27px;top:26px"/)
  assert.match(html, /placeholder="添加批注…"/)
  assert.match(html, /type="submit"[^>]*aria-label="保存"/)
  assert.ok(!html.includes('<textarea'))
})
