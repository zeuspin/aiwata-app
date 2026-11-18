import test from 'node:test'
import assert from 'node:assert/strict'
import { React, act, click, harness } from './helpers/native-react-harness.mjs'

test('the composer immediately shows the server-confirmed /approvals change', async t => {
  const { Composer, element, render } = await harness(t, "export { Composer } from './src/chat.jsx'")
  const chat = { id: 'bot-chat', gatewayProfile: 'writer', draft: '/approvals manual', attachments: [], messages: [] }
  let nativeMode = 'smart'
  const writes = []
  const service = { async rpc(method, params, profile) {
    assert.equal(profile, 'writer')
    assert.equal(params.key, 'approvals.mode')
    if (method === 'config.set') {
      writes.push(params.value)
      nativeMode = params.value
    }
    return { value: nativeMode }
  } }
  const props = { chat, live: true, approvalService: service, approvalConnected: true, assets: [],
    api: { current: () => ({}), getChat: () => chat, setDraft: (_, draft) => { chat.draft = draft } },
    refresh() {}, send() { assert.fail('The settings command should not be sent to the model') }, report() {} }
  await render(React.createElement(Composer, props))
  const mode = () => element.querySelector('[aria-label="Agent 批准方式"]')
  assert.equal(mode().textContent, '帮我批准')
  assert.ok(mode().querySelector('[data-approval-icon="terminal"]'))
  await act(async () => element.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  assert.deepEqual(writes, ['manual'])
  assert.equal(mode().textContent, '请求批准')
  assert.ok(mode().querySelector('[data-approval-icon="hand"]'))

  await click(mode())
  const options = element.querySelector('[aria-label="批准方式选项"]')
  assert.doesNotMatch(options.textContent, /应用于当前 Profile 的所有会话/)
  const rows = [...options.querySelectorAll('button')]
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map(row => [
    row.querySelector('[data-approval-icon]').dataset.approvalIcon,
    row.querySelector('strong').textContent,
    row.querySelector('small').textContent,
  ]), [
    ['hand', '请求批准', '命中审批规则时询问'],
    ['terminal', '帮我批准', '由模型评估，必要时请你确认'],
    ['warning', '关闭审批', '跳过常规审批，仍受系统权限约束'],
  ])
  assert.equal(options.querySelector('[aria-pressed="true"]'), rows[0])
  assert.ok(rows[0].lastElementChild.matches('.approval-option-check'))
  assert.equal(options.querySelectorAll('.approval-option-check').length, 1)
  await click(rows[2])
  assert.deepEqual(writes, ['manual', 'off'])
  assert.match(mode().textContent, /关闭审批/)
  assert.ok(mode().querySelector('[data-approval-icon="warning"]'))
})

test('an old Profile read cannot replace the mode after switching or reconnecting', async t => {
  const { ApprovalHarness, element, render } = await harness(t, `
    import { LiveApprovalControl, useLiveApprovalMode } from './src/live-approval-control.jsx'
    export function ApprovalHarness({ service, profile, connected }) {
      const approval = useLiveApprovalMode(service, profile, connected, () => {})
      return <LiveApprovalControl approval={approval} connected={connected} />
    }
  `)
  let resolveOld
  let mode = 'manual'
  const service = { rpc(method, params, profile) {
    assert.equal(method, 'config.get')
    assert.equal(params.key, 'approvals.mode')
    if (profile === 'old') return new Promise(resolve => { resolveOld = resolve })
    return Promise.resolve({ value: mode })
  } }
  const show = (profile, connected = true) => render(React.createElement(ApprovalHarness, { service, profile, connected }))
  const label = () => element.querySelector('[aria-label="Agent 批准方式"]')
  await show('old')
  await show('current')
  assert.equal(label().textContent, '请求批准')
  await act(async () => { resolveOld({ value: 'off' }) })
  assert.equal(label().textContent, '请求批准')
  await show('current', false)
  assert.equal(label().disabled, true)
  mode = 'smart'
  await show('current')
  assert.equal(label().textContent, '帮我批准')
})

test('message actions show and copy the exact original Markdown', async t => {
  const { MessageSourceActions, element, render } = await harness(t, "export { MessageSourceActions } from './src/message-markdown.jsx'")
  const text = '# 原文\n\n- **内容**  \n- 第二行\n'
  const copies = []
  window.hermesDesktop = { writeClipboard: async value => { copies.push(value); return true } }
  t.after(() => { delete window.hermesDesktop })
  await render(React.createElement(MessageSourceActions, { text }))
  const more = () => element.querySelector('[aria-label="更多消息操作"]')
  const menuItem = label => [...element.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === label)
  await click(more())
  await click(menuItem('复制 Markdown'))
  assert.deepEqual(copies, [text])
  await click(more())
  await click(menuItem('查看 Markdown 源码'))
  const source = element.querySelector('dialog')
  assert.equal(source.querySelector('pre').textContent, text)
  await click([...source.querySelectorAll('button')].find(button => button.textContent === '复制 Markdown'))
  assert.deepEqual(copies, [text, text])
})
