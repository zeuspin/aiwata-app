import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import { projectRoom } from '../src/live-room-state.mjs'

const require = createRequire(import.meta.url)
function loadComponent(entry) {
  return build({ entryPoints: [entry], bundle: true, write: false,
  format: 'cjs', platform: 'node', loader: { '.css': 'empty' }, external: ['react', '@tabler/icons-react'],
  }).then(result => {
    const module = { exports: {} }
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
    return module.exports
  })
}
const bundle = loadComponent('src/agent-transcript.jsx')

const members = [{ id: 'bot:writer', name: '文案助手', roomHandle: 'writer' }, { id: 'bot:designer', name: '设计助手', roomHandle: 'designer' }]
async function render(messages, extra = {}) {
  const { Transcript } = await bundle
  return renderToStaticMarkup(React.createElement(Transcript, {
    chat: { messages, draft: '', attachments: [] }, group: { id: 'room' }, members, account: { initial: '林' }, onReply() {}, ...extra,
  }))
}

test('the private chat header shows just the Bot avatar and name', async () => {
  const { BotConversationHeader } = await loadComponent('src/bot-conversation.jsx')
  const html = renderToStaticMarkup(React.createElement(BotConversationHeader, {
    bot: { ...members[0], name: 'AIWATA', model: 'glm-5.3', description: '简介' },
    chat: { messages: [] }, onManage() {},
  }))
  assert.match(html, /class="bot-conversation-name">AIWATA</)
  assert.doesNotMatch(html, /待命|glm-5\.3|简介|bot-conversation-meta/)
})

test('history renders assistant Markdown and preserves literal user text', async () => {
  const html = await render([
    { role: 'user', text: '**用户原文**' },
    { role: 'agent', text: '# 标题\n\n- **粗体**\n\n> 引用\n\n| 列 |\n| --- |\n| 值 |\n\n```sh\nprintf hi\n```' },
  ], { group: undefined })
  assert.match(html, /\*\*用户原文\*\*/)
  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /<li><strong>粗体<\/strong><\/li>/)
  assert.match(html, /<blockquote>/)
  assert.match(html, /<table>/)
  assert.match(html, /<pre><code class="language-sh">printf hi/)
  assert.match(html, /aria-label="更多消息操作"/)
})

test('a streaming reply renders an unfinished markdown span', async () => {
  const messages = [{ role: 'user', text: '开始' }]
  const html = await render(messages, { group: undefined, chat: {
    messages, pending: 'run', agentRun: { text: '**生成中' },
  } })
  assert.match(html, /<strong>生成中<\/strong>/)
})

test('assistant markdown only creates web links and does not fetch inline images', async () => {
  const html = await render([{ role: 'agent', text: [
    '[文档](https://example.test)', '[本机](file:///tmp/note.txt)', '[脚本](javascript:alert%281%29)',
    '![图片](https://example.test/image.png)', '<iframe src="https://example.test"></iframe>',
  ].join('\n\n') }], { group: undefined })
  assert.match(html, /href="https:\/\/example\.test"/)
  assert.doesNotMatch(html, /href="(?:file:|javascript:)|<img|<iframe/)
})

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

test('active group members use their own avatars and other transcripts retain their layout', async () => {
  const privateChat = await render([{ role: 'agent', text: '你好' }], { group: undefined, bot: members[0] })
  assert.doesNotMatch(privateChat, /aria-label="文案助手的头像"/)
  const active = await render([{ role: 'user', text: '开始' }], {
    chat: { messages: [{ role: 'user', text: '开始' }], pending: true, agentRun: { room: { statuses: { 'bot:designer': 'running' } } } },
  })
  assert.match(active, /aria-label="设计助手正在回复"/)
  const project = await render([{ role: 'agent', text: '普通会话' }], { group: undefined })
  assert.ok(!project.includes('conversation-transcript'))
  assert.ok(!project.includes('的头像'))
})


test('private chat shows no Bot avatars in any historical reply', async () => {
  const html = await render([
    { id: 'old', role: 'agent', text: 'Earlier reply', status: 'complete' },
    { id: 'ask', role: 'user', text: 'Continue' },
    { id: 'latest', role: 'agent', text: 'Latest reply', status: 'complete' },
    { id: 'new-input', role: 'user', text: 'Follow-up' },
  ], { group: undefined, bot: members[0] })
  const rows = [...html.matchAll(/<article[^>]*data-message-index="(\d+)"[^>]*>(.*?)<\/article>/gs)]
  assert.ok(rows.every(([, , body]) => !body.includes('data-bot-state')))
  assert.match(html, /Earlier reply/)
  assert.match(html, /Follow-up/)
})

test('a new private response keeps its status with no avatar before text arrives', async () => {
  const messages = [{ id: 'old', role: 'agent', text: 'Earlier reply', status: 'complete' }, { role: 'user', text: 'Start again' }]
  const html = await render(messages, { group: undefined, bot: members[0],
    chat: { messages, pending: { runId: 'next' }, agentRun: { text: '', tools: {}, children: {} } } })
  assert.doesNotMatch(html, /data-bot-state=/)
  assert.match(html, /思考中/)
  const old = html.match(/data-message-index="0"[^>]*>(.*?)<\/article>/s)[1]
  assert.ok(!old.includes('conversation-avatar'))
})
