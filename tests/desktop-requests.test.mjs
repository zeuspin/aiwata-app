import test from 'node:test'
import assert from 'node:assert/strict'
import { createDesktopRequestDispatcher } from '../src/desktop-requests.mjs'

function fixture(invoke = async () => ({ success: true })) {
  const session = { id: 'chat', gatewayId: 'runtime', gatewayStoredId: 'stored', gatewayProfile: 'bot', gatewayGeneration: 3 }
  let selected = 'chat'
  let live = true
  const replies = []
  const legacy = []
  const withdrawn = []
  let cards = []
  const dispatcher = createDesktopRequestDispatcher({
    active: () => live, currentChatId: () => selected,
    resolveSession: frame => frame.params.session_id === 'runtime' && (frame.profile ?? '') === 'bot' ? session : null,
    invoke, reply: async response => { replies.push(response) },
    onLegacy: (_, frame) => legacy.push(frame.id), onWithdraw: (_, frame) => withdrawn.push(frame.id),
    onChange: next => { cards = next },
  })
  const frame = (id, method, params = {}) => ({ id, method, profile: 'bot', params: { session_id: 'runtime', ...params } })
  return { dispatcher, replies, legacy, withdrawn, frame, session, cards: () => cards,
    select: value => { selected = value }, logout: () => { live = false } }
}

const flush = () => new Promise(resolve => setImmediate(resolve))

test('automatic native requests use ValueResult and replay never repeats the operation', async () => {
  let called = 0
  const f = fixture(async () => { called++; return { success: true, title: 'Owned page' } })
  const frame = f.frame('request-1', 'preview.act', { action: 'click', ref: 'btn-save' })
  assert.equal(f.dispatcher.handle(frame), true)
  f.dispatcher.handle(frame)
  await flush()
  assert.equal(called, 1)
  assert.deepEqual(f.replies[0].result, { value: '{"success":true,"title":"Owned page"}' })
  f.dispatcher.handle(frame)
  await flush()
  assert.equal(called, 1)
})

test('a foreign or hidden native pane request declines without reading the focused pane', async () => {
  let called = 0
  const f = fixture(async () => { called++; return {} })
  f.select('other-chat')
  f.dispatcher.handle(f.frame('hidden', 'terminal.read'))
  f.dispatcher.handle({ ...f.frame('foreign', 'preview.read'), profile: 'other-profile' })
  await flush()
  assert.equal(called, 0)
  assert.deepEqual(f.replies.map(response => response.error.code), [4404, 4404])
})

test('unknown native methods fail explicitly and thrown handlers do not claim success', async () => {
  const f = fixture(async () => { throw new Error('Host unavailable') })
  f.dispatcher.handle(f.frame('unknown', 'unimplemented.request'))
  f.dispatcher.handle(f.frame('unavailable', 'window.read'))
  await flush()
  assert.deepEqual(f.replies.map(response => response.error.code).sort((a, b) => a - b), [-32603, -32601])
})

test('cancel aborts only its correlated action and drops its late result', async () => {
  let finish
  let signal
  const f = fixture(async (_, __, ___, current) => { signal = current; return new Promise(resolve => { finish = resolve }) })
  f.dispatcher.handle(f.frame('cancel-me', 'preview.act', { action: 'type', ref: 'inp-name', text: 'hello' }))
  await flush()
  f.dispatcher.handle({ method: 'event', profile: 'bot', params: { session_id: 'runtime', type: 'request.cancel', payload: { id: 'cancel-me', reason: 'timeout' } } })
  assert.equal(signal.aborted, true)
  finish({ success: true })
  await flush()
  assert.equal(f.replies.length, 0)
})

test('secure native values are sent once, remain transient, and replay cannot retain credentials', async () => {
  const f = fixture()
  const frame = f.frame('secret-1', 'secret', { env_var: 'SERVICE_KEY', prompt: 'Enter key' })
  f.dispatcher.handle(frame)
  const request = f.cards()[0]
  assert.equal(request.method, 'secret')
  await f.dispatcher.respond(request, 'private-test-value')
  assert.deepEqual(f.replies[0].result, { value: 'private-test-value' })
  assert.equal(f.cards().length, 0)
  f.dispatcher.handle(frame)
  await flush()
  assert.equal(f.replies.length, 1)
  assert.equal(JSON.stringify(f.dispatcher.requests()).includes('private-test-value'), false)
})

test('vault login answers follow the native JSON string contract and cancel is an empty value', async () => {
  const f = fixture()
  f.dispatcher.handle(f.frame('login', 'vault.save_login', { site: 'Example', origin: 'https://example.com' }))
  await f.dispatcher.respond(f.cards()[0], { identifier: 'person', password: 'test-password' })
  assert.deepEqual(f.replies[0].result, { value: '{"identifier":"person","password":"test-password"}' })
  f.dispatcher.handle(f.frame('code', 'vault.code'))
  await f.dispatcher.respond(f.cards()[0], null)
  assert.deepEqual(f.replies[1].result, { value: '' })
})

test('legacy approvals retain their projection and cancellation withdraws the matching wire request', async () => {
  const f = fixture()
  f.dispatcher.handle(f.frame('wire-old', 'approval', { request_id: 'approval-old' }))
  f.dispatcher.handle(f.frame('wire-new', 'clarify', { questions: [{ qid: 'q1', question: 'Continue?' }] }))
  f.dispatcher.handle({ method: 'event', profile: 'bot', params: { session_id: 'runtime', type: 'request.cancel', payload: { id: 'wire-old' } } })
  assert.deepEqual(f.legacy, ['wire-old', 'wire-new'])
  assert.deepEqual(f.withdrawn, ['wire-old'])
})

test('disconnect aborts mutation and replays its refusal instead of executing it again', async () => {
  let invoked = 0
  let finish
  const f = fixture(async () => { invoked++; return new Promise(resolve => { finish = resolve }) })
  const frame = f.frame('mutation', 'preview.act', { action: 'click', ref: 'btn-save' })
  f.dispatcher.handle(frame)
  await flush()
  f.dispatcher.disconnect()
  finish({ success: true })
  await flush()
  f.dispatcher.handle(frame)
  await flush()
  assert.equal(invoked, 1)
  assert.equal(f.replies[0].error.code, -32603)
})

test('navigation, generation changes and logout reject stale secret submission', async () => {
  const f = fixture()
  f.dispatcher.handle(f.frame('secret', 'sudo'))
  const request = f.cards()[0]
  f.select('other')
  assert.equal(await f.dispatcher.respond(request, 'password'), false)
  f.select('chat')
  f.session.gatewayGeneration = 4
  assert.equal(await f.dispatcher.respond(request, 'password'), false)
  f.dispatcher.dispose()
  assert.equal(f.cards().length, 0)
  f.logout()
  assert.equal(await f.dispatcher.respond(request, 'password'), false)
  assert.equal(f.replies.length, 0)
})

test('a completed response cannot replay data after its generation changed', async () => {
  const f = fixture(async () => ({ text: 'Old page' }))
  const frame = f.frame('read-old', 'preview.read')
  f.dispatcher.handle(frame)
  await flush()
  f.session.gatewayGeneration = 4
  f.dispatcher.handle(frame)
  await flush()
  assert.equal(f.replies[1].result, undefined)
  assert.equal(f.replies[1].error.code, -32603)
})

test('navigation withdraws in-flight native work and immediately declines its request', async () => {
  let signal
  const f = fixture(async (_, __, ___, current) => { signal = current; return new Promise(() => {}) })
  f.dispatcher.handle(f.frame('old-page', 'preview.act', { action: 'hover', ref: 'btn-save' }))
  f.select('other')
  f.dispatcher.contextChanged()
  await flush()
  assert.equal(signal.aborted, true)
  assert.equal(f.replies[0]?.error.code, 4404)
})

test('generation changes while a read is pending return an error without stale page data', async () => {
  let finish
  const f = fixture(async () => new Promise(resolve => { finish = resolve }))
  f.dispatcher.handle(f.frame('generation-read', 'preview.read'))
  f.session.gatewayGeneration = 4
  finish({ text: 'Old private page' })
  await flush()
  assert.equal(f.replies[0]?.result, undefined)
  assert.equal(f.replies[0]?.error.code, -32603)
})

test('retiring old response bodies never makes a long-session mutation executable again', async () => {
  let invoked = 0
  const f = fixture(async () => { invoked++; return { success: true } })
  const first = f.frame('first-action', 'preview.act', { action: 'click', ref: 'btn-save' })
  f.dispatcher.handle(first)
  await flush()
  for (let index = 0; index < 520; index++) {
    f.dispatcher.handle(f.frame('read-' + index, 'preview.read'))
    await flush()
  }
  f.dispatcher.handle(first)
  await flush()
  assert.equal(invoked, 521)
  assert.equal(f.replies.at(-1).error.code, -32603)
})


test('large native inventories preserve the one MiB UTF-8 envelope and oversize results settle explicitly', async () => {
  const valid = fixture(async () => ({ inventory: '字'.repeat(200000) }))
  valid.dispatcher.handle(valid.frame('large', 'preview.read'))
  await flush()
  assert.equal(valid.replies[0].error, undefined)
  assert.equal(JSON.parse(valid.replies[0].result.value).inventory.length, 200000)
  const huge = fixture(async () => ({ inventory: '字'.repeat(400000) }))
  huge.dispatcher.handle(huge.frame('oversize', 'preview.read'))
  await flush()
  assert.equal(huge.replies[0].result, undefined)
  assert.equal(huge.replies[0].error.code, -32603)
})

test('theme and onboarding cards park and return native structured replies instead of unsupported or string wrappers', async () => {
  const session = { id: 'chat', gatewayId: 'session', gatewayGeneration: 1 }
  const replies = []; let cards = []
  const dispatcher = createDesktopRequestDispatcher({ active: () => true, currentChatId: () => 'chat', resolveSession: () => session,
    invoke: () => assert.fail('interactive request must await a user answer'), reply: frame => { replies.push(frame) },
    onChange: rows => { cards = rows } })
  dispatcher.handle({ id: 'theme', method: 'theme.pick', params: { session_id: 'session', picker: 'accent' } })
  assert.equal(cards.length, 1)
  assert.equal(await dispatcher.respond(cards[0], { picked: { accent: 'green' } }), true)
  assert.deepEqual(replies[0].result, { picked: { accent: 'green' } })
  dispatcher.handle({ id: 'setup', method: 'setup_beat', params: { session_id: 'session', beat: 'name' } })
  assert.equal(cards.length, 1)
  assert.equal(await dispatcher.respond(cards[0], { said: '小林' }), true)
  assert.deepEqual(replies[1].result, { said: '小林' })
})

test('interactive appearance commits only for a live request and before its native acknowledgement', async () => {
  const f = fixture()
  f.dispatcher.handle(f.frame('layout-card', 'setup_beat', { beat: 'layout' }))
  let applied = false
  await f.dispatcher.respond(f.cards()[0], { answer: { layout: 'sidebar-left' } }, () => {
    assert.equal(f.replies.length, 0); applied = true
  })
  assert.equal(applied, true)
  assert.deepEqual(f.replies[0].result, { answer: { layout: 'sidebar-left' } })
  f.dispatcher.handle(f.frame('stale-layout-card', 'setup_beat', { beat: 'layout' }))
  const stale = f.cards()[0]
  f.select('other-chat')
  await f.dispatcher.respond(stale, { answer: { layout: 'sidebar-left' } }, () => assert.fail('stale request cannot repaint'))
})
