import test from 'node:test'
import assert from 'node:assert/strict'
import { desktopEventPatch } from '../src/desktop-events.mjs'
import { createWorkspace } from '../src/workspace.mjs'

test('Agent process output creates only its read-only view and terminal.close preserves process data', () => {
  const chat = { tabs: [], tool: null, view: 'hidden', toolInstances: {} }
  const patch = desktopEventPatch(chat, 'agent.terminal.output', { process_id: 'proc_one', chunk: '输出' }, false)
  assert.equal(patch.tool, undefined)
  assert.equal(patch.view, undefined)
  assert.equal(patch.toolInstances['终端:agent:proc_one'].agentProcess.output, '输出')
  const next = { ...chat, ...patch, tool: patch.tabs[0], view: 'split' }
  const closed = desktopEventPatch(next, 'terminal.close', { process_id: 'proc_one' }, true)
  assert.deepEqual(closed.tabs, [])
  assert.equal(closed.view, 'hidden')
  assert.equal(closed.toolInstances['终端:agent:proc_one'].agentProcess.output, '输出')
})

test('live Bot preview events open the Bot-owned browser; hosted groups keep native surface restrictions', () => {
  const api = createWorkspace(null, null, { live: true }); api.login('lin')
  const draft = api.openChatDraft()
  api.hydrateGatewayChat(draft.id, { session_id: 'runtime', stored_session_id: 'stored', messages: [], execution_generation: 1 })
  api.changeChat(draft.id, { gatewayProfile: 'writer' })
  api.acceptGatewayPrompt(draft.id, { runId: 'turn', text: '打开网页' }, { admission_id: 'a', execution_generation: 2 })
  const frame = { method: 'event', params: { seq: 1, type: 'preview.open', execution_generation: 2,
    admission_id: 'a', payload: { url: 'https://example.com/' } } }
  assert.equal(api.applyGatewayFrame(draft.id, frame, true), true)
  assert.equal(api.getChat(draft.id).browser.visited, 'https://example.com/')
  api.changeChat(draft.id, { gatewayRoom: 'room' })
  assert.equal(api.applyGatewayFrame(draft.id, { ...frame, params: { ...frame.params, seq: 2 } }, true), false)
})

test('a background native close never closes another browser instance', () => {
  const chat = { tabs: ['浏览器:a', '浏览器:b', '文件与产物'], tool: '文件与产物', view: 'split', toolInstances: {
    '浏览器:a': { type: '浏览器', browser: { visited: 'https://example.com/' } },
    '浏览器:b': { type: '浏览器', browser: { visited: 'https://example.org/' } },
  } }
  const patch = desktopEventPatch(chat, 'preview.close', { url: 'https://example.com/' }, false)
  assert.deepEqual(patch.tabs, ['浏览器:b', '文件与产物'])
  assert.equal(patch.tool, '文件与产物')
})

test('live connection authorization URLs remain transient and are never saved to workspace storage', () => {
  let saved
  const api = createWorkspace({ getItem: () => null, setItem: (_key, value) => { saved = value } }, null, { live: true })
  api.login('lin')
  const chat = api.newChat()
  api.changeChat(chat.id, { connectionRequest: { op_id: 'operation', connect_url: 'https://auth.example/?code=one-time-fixture' } })
  assert.ok(api.getChat(chat.id).connectionRequest)
  assert.equal(saved.includes('one-time-fixture'), false)
})
