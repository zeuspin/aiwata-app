import test from 'node:test'
import assert from 'node:assert/strict'
import { gatewayTranscript } from '../src/live-aiwata.mjs'
import { createWorkspace } from '../src/workspace.mjs'

// The 044 history contracts from live-gateway.test.mjs run here without
// importing the legacy gateway/runtime installer entry point.
test('attachment lifting preserves reused call-ID occurrences and each turn input/result pair', () => {
  const raw = [
    { role: 'user', content: '@image:/profile/images/first.png\nfirst' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call-one', function: { name: 'terminal', arguments: '{"command":"printf first"}' } }] },
    { role: 'tool', tool_call_id: 'call-one', tool_name: 'terminal', content: '{"output":"first","exit_code":0}' },
    { role: 'assistant', content: 'first answer' },
    { role: 'user', content: '@file:/profile/uploads/second.txt\nsecond' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call-one', function: { name: 'read_file', arguments: '{"path":"note.txt"}' } }] },
    { role: 'tool', tool_call_id: 'call-one', tool_name: 'read_file', content: 'plain file content' },
    { role: 'assistant', content: 'second answer' },
  ]
  const display = raw.filter(row => row.role !== 'assistant' || row.content).map(row => row.role === 'tool'
    ? { role: 'tool', name: row.tool_name, tool_call_id: row.tool_call_id } : row)
  for (const display_messages of [undefined, display]) {
    const snapshot = { session_id: 'native', messages: raw, ...(display_messages ? { display_messages } : {}) }
    const api = createWorkspace(null, null, { live: true })
    api.login('lin')
    const chat = api.openChatDraft()
    api.hydrateGatewayChat(chat.id, snapshot)
    const replies = api.getChat(chat.id).messages.filter(row => row.role === 'agent')
    assert.deepEqual(replies.map(row => Object.values(row.tools ?? {})), [
      [{ tool_id: 'call-one', name: 'terminal', args: { command: 'printf first' }, result: { output: 'first', exit_code: 0 }, complete: true }],
      [{ tool_id: 'call-one', name: 'read_file', args: { path: 'note.txt' }, result: 'plain file content', complete: true }],
    ])
    assert.deepEqual(replies.map(row => row.text), ['first answer', 'second answer'])
    assert.equal(gatewayTranscript(snapshot).messages.flatMap(row => Object.keys(row.tools ?? {})).length, 2)
  }
})
test('unfinished native attachment turns retain completed tool details until settlement', () => {
  const api = createWorkspace(null, null, { live: true })
  api.login('lin')
  const chat = api.openChatDraft()
  const snapshot = { session_id: 'native', running: true, messages: [
    { role: 'user', content: '@image:/profile/images/a.png\ninspect' },
    { role: 'assistant', tool_calls: [{ id: 'finished', function: { name: 'terminal', arguments: '{"command":"pwd"}' } },
      { id: 'unfinished', function: { name: 'terminal', arguments: '{"command":"sleep 5"}' } }] },
    { role: 'tool', tool_call_id: 'internal', tool_name: 'terminal', display_kind: 'hidden', content: 'internal background result' },
    { role: 'tool', tool_call_id: 'finished', tool_name: 'terminal', content: '{"output":"/workspace"}' },
  ] }
  api.hydrateGatewayChat(chat.id, snapshot)
  assert.deepEqual(Object.values(api.getChat(chat.id).agentRun.tools), [
    { tool_id: 'finished', name: 'terminal', args: { command: 'pwd' }, result: { output: '/workspace' }, complete: true },
  ])
  assert.equal(api.getChat(chat.id).messages.flatMap(row => Object.keys(row.tools ?? {})).length, 0)
  api.hydrateGatewayChat(chat.id, { ...snapshot, running: false })
  const settled = api.getChat(chat.id)
  assert.equal(settled.agentRun, null)
  assert.deepEqual(settled.messages.at(-1).tools.finished.result, { output: '/workspace' })
  assert.equal(Object.hasOwn(settled.messages.at(-1).tools, 'unfinished'), false)
})
