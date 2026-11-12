import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const bundle = build({ stdin: { contents: "export { Rail } from './src/navigation.jsx'; export { Directory } from './src/surfaces.jsx'", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'cjs', platform: 'node', loader: { '.css': 'empty' },
  external: ['react', '@tabler/icons-react'],
}).then(result => {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  return module.exports
})
const account = { name: '测试账号', initial: '测', color: '#ccc' }
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))

test('live main navigation retains module and account entries alongside model and MCP management', async () => {
  const { Rail } = await bundle
  const html = render(Rail, { live: true, account, menu: 'account' })
  for (const label of ['项目', 'Bot 与群聊', '素材库', '定时任务', '技能工具', '消息连接器', '记忆与学习', '积分余额']) {
    assert.ok(html.includes(`aria-label="${label}"`), `missing entry: ${label}`)
  }
  for (const label of ['个人资料', '积分和用量', '模拟断网', '模型授权', 'MCP 管理', '退出登录']) assert.ok(html.includes(label), label)
  assert.match(html, /<button[^>]*disabled=""[^>]*>.*?模拟断网/s)
  assert.match(html, /仅.*演示模式/)
})

test('live balance never projects the local demo balance and explains unavailable billing', async () => {
  const { Rail } = await bundle
  const html = render(Rail, { live: true, account, menu: 'credits', balance: 987654321 })
  assert.ok(!html.includes('987,654,321'))
  assert.match(html, /未接入/)
  assert.match(html, /查看用量明细/)
})

test('live unsupported directories explain status without reading demo records', async () => {
  const { Directory } = await bundle
  const record = Object.fromEntries(['assets', 'credits', 'usage'].map(key => [key, undefined]))
  for (const key of Object.keys(record)) Object.defineProperty(record, key, { get() { throw new Error(`read demo ${key}`) } })
  for (const section of ['library', 'profile', 'usage']) {
    const html = render(Directory, { live: true, section, record, account })
    assert.match(html, /未接入/)
    assert.match(html, /role="status"/)
    assert.ok(!html.includes('暂无用量记录'))
    assert.ok(!html.includes('可用积分'))
    assert.ok(!html.includes('本机工作区 · 演示账号'))
  }
})

test('mock directories and credits identify demo data and retain their existing contents', async () => {
  const { Directory, Rail } = await bundle
  const record = { assets: ['example.md'], credits: 1234, usage: [] }
  const library = render(Directory, { section: 'library', record, account })
  assert.match(library, /example.md/)
  assert.match(library, /演示数据/)
  const usage = render(Directory, { section: 'usage', record, account })
  assert.match(usage, /1,234/)
  assert.match(usage, /演示数据/)
  const credits = render(Rail, { account, balance: 1234, menu: 'credits' })
  assert.match(credits, /1,234/)
  assert.match(credits, /演示/)
})


test('archive entry belongs to the account card and opens the archive panel', async () => {
  const { Rail } = await bundle
  const closed = render(Rail, { account, menu: '' })
  assert.ok(!closed.includes('回收站'))
  assert.ok(!closed.includes('归档记录'))
  const opened = render(Rail, { account, menu: 'account' })
  assert.match(opened, /aria-label="账号操作"[\s\S]*归档记录/)
})
