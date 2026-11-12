import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionRequestSnapshot, mergeConnectionRequest, connectionTargetAnswer, sendConnectionTarget, safeConnectionURL } from '../src/connection-request.mjs'

const request = (extra = {}) => ({ op_id: 'op', seq: 1, deadline_at: 2000, timeout_seconds: 600, targets: [
  { name: 'example', kind: 'mcp', action: 'install', state: 'pending', required_env: [
    { name: 'TOKEN', required: true, secret: true, default: 'must-not-survive' },
    { name: 'REGION', required: false, secret: false, default: 'cn' },
  ], launch: { kind: 'stdio', target: 'example-server', env: ['TOKEN'] } },
], ...extra })

test('connection snapshots preserve native facts while removing undeclared fields and secret defaults', () => {
  const snapshot = connectionRequestSnapshot(request({ arbitrary_secret: 'private' }))
  assert.equal(snapshot.targets[0].launch.target, 'example-server')
  assert.equal(snapshot.targets[0].required_env[0].default, '')
  assert.equal(snapshot.targets[0].required_env[1].default, 'cn')
  assert.equal(JSON.stringify(snapshot).includes('private'), false)
  assert.equal(JSON.stringify(snapshot).includes('must-not-survive'), false)
  for (const malformed of [null, request({ seq: -1 }), request({ targets: [{ name: 'x', state: 'connected' }] }), request({ targets: [...request().targets, ...request().targets] })]) {
    assert.equal(connectionRequestSnapshot(malformed), null)
  }
})

test('only a newer native snapshot can update the same operation; replacing operations requires an opening event', () => {
  const initial = connectionRequestSnapshot(request())
  assert.equal(mergeConnectionRequest(initial, request()), initial)
  assert.equal(mergeConnectionRequest(initial, request({ seq: 0 })), initial)
  assert.equal(mergeConnectionRequest(initial, request({ op_id: 'foreign', seq: 3 })), initial)
  const next = mergeConnectionRequest(initial, request({ seq: 2, settled: true, settled_by: 'continue' }))
  assert.equal(next.settled, true)
  assert.equal(next.timeout_seconds, 600)
  assert.equal(mergeConnectionRequest(initial, request({ op_id: 'next' }), { replace: true }).op_id, 'next')
})

test('approval and skip answers use native statuses and only declared credential inputs', () => {
  const snapshot = connectionRequestSnapshot(request())
  assert.deepEqual(connectionTargetAnswer(snapshot, 'example', 'approved', { TOKEN: 'private', REGION: 'us' }, 1000), {
    targets: [{ name: 'example', status: 'approved', env: { TOKEN: 'private', REGION: 'us' } }],
  })
  assert.deepEqual(connectionTargetAnswer(snapshot, 'example', 'skipped', {}, 1000), { targets: [{ name: 'example', status: 'skipped' }] })
  for (const [name, status, values, now] of [['other', 'approved', { TOKEN: 'x' }, 1000], ['example', 'connected', {}, 1000],
    ['example', 'approved', {}, 1000], ['example', 'approved', { TOKEN: 'x', EXTRA: 'leak' }, 1000], ['example', 'approved', { TOKEN: 'x' }, 2000]]) {
    assert.equal(connectionTargetAnswer(snapshot, name, status, values, now), null)
  }
  assert.equal(connectionTargetAnswer({ ...snapshot, settled: true }, 'example', 'approved', { TOKEN: 'x' }, 1000), null)
})

test('credential input is cleared before the callback runs, including callback failure', async () => {
  let values = { TOKEN: 'private' }
  await assert.rejects(sendConnectionTarget({ request: connectionRequestSnapshot(request()), name: 'example', status: 'approved', values,
    now: 1000, clear: () => { values = {} }, send: async answer => {
      assert.deepEqual(values, {})
      assert.equal(answer.targets[0].env.TOKEN, 'private')
      throw new Error('native refusal')
    } }), /native refusal/)
  assert.deepEqual(values, {})
})

test('authorization URLs accept only credential-free HTTPS links', () => {
  assert.equal(safeConnectionURL('https://example.com/authorize?token=opaque'), 'https://example.com/authorize?token=opaque')
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com', '/relative', 'file:///etc/passwd']) assert.equal(safeConnectionURL(url), null)
})
