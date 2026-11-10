import test from 'node:test'
import assert from 'node:assert/strict'
import { createMockAgent } from '../src/agent-session.mjs'
import { createWorkspace } from '../src/workspace.mjs'

test('approval stops a simulated run until the matching request is resolved', () => {
  const scheduled = new Map()
  const agent = createMockAgent({
    schedule: fn => { const id = Symbol(); scheduled.set(id, fn); return id },
    cancel: id => scheduled.delete(id),
  })
  const events = []
  const runScheduled = () => {
    while (scheduled.size) {
      const [id, fn] = scheduled.entries().next().value
      scheduled.delete(id)
      fn()
    }
  }
  agent.request('prompt.submit', { session_id: 's', text: '演示审批' }, {
    turnId: 't', onEvent: event => events.push(event), approvalMode: 'manual',
  })
  runScheduled()
  const request = events.at(-1)
  assert.equal(request.method, 'approval')
  assert.deepEqual(agent.request('approval.respond', { session_id: 's', request_id: 'stale', choice: 'once' }), { resolved: 0 })
  assert.equal(scheduled.size, 0)
  assert.deepEqual(agent.request('approval.respond', { session_id: 's', request_id: request.id, choice: 'once' }), { resolved: 1 })
  runScheduled()
  assert.ok(events.some(event => event.type === 'message.delta'))
  assert.equal(events.at(-1).data.status, 'complete')
})

test('queued messages charge when admitted and stay paused after an interruption', () => {
  const api = createWorkspace()
  api.login('lin')
  const { chats, credits } = api.current()
  api.setDraft('plan', '第一轮')
  assert.equal(api.send('plan', 'first').ok, true)
  api.setDraft('plan', '第二轮')
  assert.equal(api.queuePrompt('plan', 'second'), true)
  assert.equal(api.current().credits, credits - 12)
  api.applyAgentEvent('plan', 'first', { type: 'message.complete', data: { status: 'interrupted' } }, true)
  assert.equal(chats.plan.activity.queuePaused, true)
  assert.equal(api.startQueuedPrompt('plan').ok, false)
  api.pausePromptQueue('plan', false)
  assert.equal(api.startQueuedPrompt('plan').runId, 'second')
  assert.equal(api.current().credits, credits - 24)
  assert.equal(chats.plan.messages.at(-1).text, '第二轮')
})

test('replayed deltas are ignored and final output is recorded once', () => {
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('plan', '开始')
  api.send('plan', 't')
  const event = { type: 'message.delta', data: { text: '一段', turn_id: 't', segment: 0, offset: 0 } }
  api.applyAgentEvent('plan', 't', event, true)
  api.applyAgentEvent('plan', 't', event, true)
  assert.equal(api.current().chats.plan.agentRun.text, '一段')
  const done = { type: 'message.complete', data: { status: 'complete', text: '一段' } }
  api.applyAgentEvent('plan', 't', done, false)
  assert.equal(api.applyAgentEvent('plan', 't', done, false), false)
  assert.equal(api.current().chats.plan.messages.at(-1).text, '一段')
  assert.equal(api.current().chats.plan.unread, true)
})

test('a lost mock run settles once and preserves partial output, drafts, and the paused queue', () => {
  const api = createWorkspace()
  api.login('lin')
  const { chats, credits } = api.current()
  api.setDraft('plan', '第一轮')
  api.send('plan', 'lost-run')
  api.applyAgentEvent('plan', 'lost-run', { type: 'message.delta', data: { text: '已经生成的文字' } }, true)
  api.setDraft('plan', '等待执行')
  api.queuePrompt('plan', 'queued-run')
  api.setDraft('plan', '正在编写的草稿')

  assert.equal(api.recoverOrphanedAgentRuns(), true)
  assert.equal(api.recoverOrphanedAgentRuns(), false)
  assert.equal(chats.plan.pending, null)
  assert.equal(chats.plan.messages.at(-1).status, 'interrupted')
  assert.equal(chats.plan.messages.at(-1).text, '已经生成的文字')
  assert.equal(chats.plan.activity.queuePaused, true)
  assert.equal(chats.plan.queue[0].text, '等待执行')
  assert.equal(chats.plan.draft, '正在编写的草稿')
  assert.equal(api.current().credits, credits - 12)
  assert.equal(api.applyAgentEvent('plan', 'lost-run', { type: 'message.complete', data: { text: '过期结果' } }, true), false)
})

test('demo prompts can fill an empty draft without replacing typed text', () => {
  const api = createWorkspace()
  api.login('lin')
  api.setDraft('plan', '请保留这条草稿')
  assert.equal(api.fillDemoPrompt('plan', '演示审批'), false)
  assert.equal(api.current().chats.plan.draft, '请保留这条草稿')
  api.setDraft('plan', '')
  assert.equal(api.fillDemoPrompt('plan', '演示审批'), true)
  assert.equal(api.current().chats.plan.draft, '演示审批')
})
