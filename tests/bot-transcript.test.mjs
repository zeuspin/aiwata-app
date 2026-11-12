import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import { projectRoom } from '../src/live-room-state.mjs'

const require = createRequire(import.meta.url)
const bundle = build({ entryPoints: ['src/agent-transcript.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', loader: { '.css': 'empty' }, external: ['react', '@tabler/icons-react'],
}).then(result => {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  return module.exports
})

const members = [{ id: 'bot:writer', name: '文案助手', roomHandle: 'writer' }, { id: 'bot:designer', name: '设计助手', roomHandle: 'designer' }]
async function render(messages, extra = {}) {
  const { Transcript } = await bundle
  return renderToStaticMarkup(React.createElement(Transcript, {
    chat: { messages, draft: '', attachments: [] }, group: { id: 'room' }, members, account: { initial: '林' }, onReply() {}, ...extra,
  }))
}

test('group messages resolve the real speaker avatar by identity and retain accessible quoted replies', async () => {
  const html = await render([
    { id: 'one', role: 'agent', memberId: 'bot:writer', author: '文案助手', text: '请 @designer 看一下', threadId: 'thread' },
    { id: 'two', role: 'agent', memberId: 'missing', author: '文案助手', text: '历史成员', threadId: 'thread' },
    { id: 'three', role: 'user', text: '收到', threadId: 'thread' },
  ])
  assert.match(html, /aria-label="文案助手的头像"/)
  assert.equal((html.match(/data-bot-still="true"/g) ?? []).length, 1, 'unknown identities must not borrow a same-name bot')
  assert.match(html, /title="@designer">@设计助手<\/span>/)
  assert.match(html, /aria-label="引用回复 文案助手"/)
  assert.match(html, /class="conversation-user-avatar"[^>]*>林/)
})

test('native timestamps survive room projection and ambiguous model text never implies an acceptance result', async () => {
  const projected = projectRoom({ room: { members: [{ member_id: 'writer', profile: 'writer', display_name: '文案助手' }] } }, [
    { seq: 1, event_id: 'one', kind: 'message.member', created_at: 1794371654.248,
      actor: { id: 'writer' }, payload: { text: '(通过)', thread_id: 'thread' } },
  ])
  assert.equal(projected.messages[0].timestamp, 1794371654248)
  assert.equal(projected.messages[0].text, '(通过)')
  const html = await render(projected.messages)
  assert.match(html, /<time dateTime="2026-11-11T04:34:14.248Z"/)
  assert.match(html, /Bot 原文，非验收状态/)
  assert.match(html, /\(通过\)/)
  const ordinary = await render([{ role: 'agent', text: '验收通过，详见日志。', memberId: 'bot:writer' }])
  assert.ok(!ordinary.includes('非验收状态'))
})

test('private bot and active group members use their own avatars; project transcripts retain their layout', async () => {
  const privateChat = await render([{ role: 'agent', text: '你好' }], { group: undefined, bot: members[0] })
  assert.match(privateChat, /aria-label="文案助手的头像"/)
  const active = await render([{ role: 'user', text: '开始' }], {
    chat: { messages: [{ role: 'user', text: '开始' }], pending: true, agentRun: { room: { statuses: { 'bot:designer': 'running' } } } },
  })
  assert.match(active, /aria-label="设计助手正在回复"/)
  const project = await render([{ role: 'agent', text: '普通会话' }], { group: undefined })
  assert.ok(!project.includes('conversation-transcript'))
  assert.ok(!project.includes('的头像'))
})
