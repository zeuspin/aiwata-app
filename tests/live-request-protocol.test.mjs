import test from 'node:test'
import assert from 'node:assert/strict'
import { createDesktopRequestLedger, validDesktopResult, allowedSessionControlCall } from '../scripts/live-aiwata-requests.mjs'

const frame = (method = 'sudo', id = 'srq-000000000001', params = {}) => ({ id, method, params: { session_id: 's', ...params } })
const fake = (declines_not_shown = true) => ({ capabilities: { declines_not_shown }, replies: [], reply(id, result, error) { this.replies.push({ id, ...(error ? { error } : { result }) }) } })
const answer = (result = { value: 'private' }, extra = {}) => ({ id: 'srq-000000000001', session_id: 's', profile: 'bot', result, ...extra })

test('native request ownership rejects foreign sessions and profiles without consuming the request', () => {
  const ledger = createDesktopRequestLedger({ profile: 'bot' }); const connection = fake()
  assert.equal(ledger.track(frame()), 'new')
  for (const body of [answer(undefined, { session_id: 'other' }), answer(undefined, { profile: '' })]) assert.equal(ledger.reply(connection, body), false)
  assert.equal(ledger.reply(connection, answer()), true)
  assert.deepEqual(connection.replies[0], { id: 'srq-000000000001', result: { value: 'private' } })
  assert.equal(ledger.reply(connection, answer()), false)
  assert.equal(JSON.stringify(ledger.snapshot()).includes('private'), false)
})

test('duplicate delivery and reconnect replay keep the original deadline; cancelled/expired requests cannot revive', () => {
  let now = 0; const ledger = createDesktopRequestLedger({ profile: 'bot', now: () => now }); const connection = fake()
  assert.equal(ledger.track(frame()), 'new'); now = 119000
  assert.equal(ledger.track(frame()), 'duplicate'); now = 120001
  assert.equal(ledger.reply(connection, answer()), false)
  assert.equal(ledger.track(frame()), 'retired')
  const second = frame('clarify', 'srq-000000000002', { questions: [{ qid: 'q', question: '?' }] })
  assert.equal(ledger.track(second), 'new')
  ledger.cancel({ method: 'event', params: { session_id: 'other', type: 'request.cancel', payload: { id: second.id } } })
  assert.equal(ledger.track(second), 'duplicate')
  ledger.cancel({ method: 'event', params: { session_id: 's', type: 'request.cancel', payload: { id: second.id } } })
  assert.equal(ledger.track(second), 'retired')
  assert.equal(ledger.reply(connection, answer({}, { id: second.id })), false)
  const unseen = frame('sudo', 'srq-000000000003')
  ledger.cancel({ method: 'event', params: { session_id: 's', type: 'request.cancel', payload: { id: unseen.id } } })
  assert.equal(ledger.track(unseen), 'retired')
})

test('unknown native methods fail explicitly; bounded ledger refuses overflow without evicting live requests', () => {
  const ledger = createDesktopRequestLedger({ profile: 'bot', limit: 1 }); const connection = fake()
  assert.equal(ledger.receive(frame('new.unsupported'), connection), false)
  assert.equal(connection.replies[0].error.code, -32601)
  assert.equal(ledger.receive(frame('sudo', 'srq-000000000002'), connection), true)
  assert.equal(ledger.receive(frame('secret', 'srq-000000000003'), connection), false)
  assert.equal(connection.replies.at(-1).error.code, -32000)
  assert.equal(ledger.reply(connection, answer({ value: '' }, { id: 'srq-000000000002' })), true)
})

test('NOT_SHOWN is an error envelope and is withheld from old canonical owners that settle first error', () => {
  for (const supported of [false, true]) {
    const ledger = createDesktopRequestLedger({ profile: 'bot' }); const connection = fake(supported)
    ledger.track(frame('preview.read'))
    const { result, ...body } = answer()
    assert.equal(ledger.reply(connection, { ...body, error: { code: 4404, message: 'Not shown' } }), true)
    assert.deepEqual(connection.replies, supported ? [{ id: body.id, error: { code: 4404, message: 'Not shown' } }] : [])
  }
})

test('method-specific result envelopes reject malformed, oversized and unrelated answers', () => {
  assert.equal(validDesktopResult('sudo', { value: '', password: 'leak' }), false)
  assert.equal(validDesktopResult('sudo', { value: 'x'.repeat(65537) }), false)
  assert.equal(validDesktopResult('preview.read', { value: JSON.stringify({ success: true }) }), true)
  assert.equal(validDesktopResult('clarify', { answers: { other: 'no' } }, { qids: ['q'] }), false)
  assert.equal(validDesktopResult('clarify', { answers: { q: null }, outcome: 'submitted' }, { qids: ['q'] }), true)
  assert.equal(validDesktopResult('theme.pick', { picked: { mode: 'invalid' } }), false)
  assert.equal(validDesktopResult('setup_beat', { answer: { build: 'foreign' } }, { beat: 'build', options: ['one'] }), false)
  assert.equal(validDesktopResult('setup_beat', { answer: { build: 'one' } }, { beat: 'build', options: ['one'] }), true)
})

test('session control whitelist requires exact session ownership and canonical parameter shapes', () => {
  for (const method of ['tools.show', 'process.list', 'process.stop', 'subagent.list']) {
    assert.equal(allowedSessionControlCall(method, { session_id: 's' }), true)
    assert.equal(allowedSessionControlCall(method, {}), false)
    assert.equal(allowedSessionControlCall(method, { session_id: 's', profile: 'foreign' }), false)
  }
  assert.equal(allowedSessionControlCall('subagent.steer', { session_id: 's', subagent_id: 'child', text: 'help' }), true)
  assert.equal(allowedSessionControlCall('process.kill', { session_id: 's', process_id: 'p', all: true }), false)
  const owner = { type: 'session', session_id: 's' }
  assert.equal(allowedSessionControlCall('connectors.operation.status', { owner, op_id: 'op' }), true)
  assert.equal(allowedSessionControlCall('connectors.operation.status', { owner: { type: 'account' }, op_id: 'op' }), false)
  assert.equal(allowedSessionControlCall('connection.respond', { owner, op_id: 'op', result: { targets: [{ name: 'mcp', status: 'approved', env: { TOKEN: 'secret' } }] } }), true)
  assert.equal(allowedSessionControlCall('connectors.connect', { owner, connectors: ['slack'], reconnect: true }), true)
  assert.equal(allowedSessionControlCall('connectors.connect', { owner, connectors: ['slack'] }), false)
  assert.equal(allowedSessionControlCall('shell.exec', { session_id: 's', command: 'echo no' }), false)
})

test('automatic desktop replies accept bounded full inventories while credentials remain at64KiB', () => {
  const inventory = { value: JSON.stringify({ elements: Array.from({ length: 1000 }, (_, ref) => ({ ref, label: '界面'.repeat(70), selector: '.item'.repeat(20) })) }) }
  for (const method of ['preview.read', 'preview.act', 'terminal.read']) assert.equal(validDesktopResult(method, inventory), true)
  for (const method of ['sudo', 'secret', 'vault.code', 'vault.save_login', 'vault.unlock_prompt']) assert.equal(validDesktopResult(method, inventory), false)
  assert.equal(validDesktopResult('preview.act', { value: 'x'.repeat(1024 * 1024 + 1) }), false)
})

test('setup free-text answers are accepted only for the native name beat', async () => {
  const { validDesktopResult } = await import('../scripts/live-aiwata-requests.mjs')
  assert.equal(validDesktopResult('setup_beat', { said: '紫色' }, { beat: 'theme' }), false)
  assert.equal(validDesktopResult('setup_beat', { said: '小林' }, { beat: 'name' }), true)
  assert.equal(validDesktopResult('setup_beat', { wrote_instead: true }, { beat: 'theme' }), true)
})
