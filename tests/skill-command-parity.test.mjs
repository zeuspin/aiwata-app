import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { getTrigger, parseSlash, replaceTrigger } from '../src/composer.mjs'
import { nativeCompletionItems } from '../src/live-completions.mjs'
import { capabilityRequest, createCapabilityBridge } from '../scripts/live-aiwata-capabilities.mjs'

test('qualified skill completion remains discoverable and parses into a native invocation', () => {
  for (const [input, query, completed, name] of [
    ['/writer:', 'writer:', 'writer:review', 'writer:review'],
    ['/project/re', 'project/re', 'project/review', 'project/review'],
    ['/小说', '小说', '小说拆条', '小说拆条'],
  ]) {
    const trigger = getTrigger(input, input.length)
    assert.equal(trigger?.query, query)
    const [item] = nativeCompletionItems({ items: [{ text: completed + ' ', kind: 'skill' }] }, trigger)
    const inserted = replaceTrigger(input, trigger, item.insert, item.complete)
    assert.deepEqual(parseSlash(inserted.text + '检查原文'), [name, '检查原文'])
  }
  assert.deepEqual(parseSlash(' /MODEL  '), ['model', ''])
  assert.deepEqual(parseSlash('/approvals manual'), ['approvals', 'manual'])
})

test('skill command syntax rejects malformed namespaces and control-bearing names', () => {
  for (const name of ['plugin::review', ':review', 'plugin:', 'plugin:review:extra',
    'plugin//review', '../review', 'project/../review', 'project/', '/review',
    'plugin\\review', 'plugin\u0000:review', 'plugin:review\u007f', 'plugin:review;reset']) {
    assert.equal(parseSlash('/' + name), null, name)
    assert.throws(() => capabilityRequest({ method: 'skill.expand', params: { session_id: 'mine', name, arg: '' } }), undefined, name)
  }
  assert.throws(() => capabilityRequest({ method: 'skill.expand', params: { session_id: 'mine', name: 'plugin\n:review', arg: '' } }))
})

test('qualified skill input receives the authoritative expansion from its owning Profile session', async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-skill-command-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  const calls = []
  const bridge = createCapabilityBridge({
    connect: async (_client, profile) => {
      assert.equal(profile, 'writer')
      return { home, connection: { call: async (method, params) => {
        calls.push([method, params])
        if (method === 'session.resume') {
          assert.equal(params.session_id, 'mine')
          return { session_id: 'mine', info: { cwd: home } }
        }
        if (method === 'complete.slash') return { items: [{ text: params.text.slice(1) + ' ', kind: 'skill' }] }
        if (method === 'command.resolve') return { canonical: null }
        if (method === 'command.dispatch') return { type: 'skill', name: params.name, display: '/' + params.name, message: 'native scoped instructions: ' + params.arg }
        assert.fail('Unexpected native method: ' + method)
      } } }
    },
    directoryFor: async (root, path) => { assert.equal(root, home); assert.equal(path, home); return path },
    writeProfile: async (_home, operation) => operation(),
  })
  for (const name of ['writer:review', 'project/review', '小说拆条']) {
    calls.length = 0
    const parsed = parseSlash('/' + name + ' 保留原文\n第二行')
    assert.ok(parsed, 'The composer recognizes the native skill command')
    const result = await bridge({ home, workspace: home }, { method: 'skill.expand', profile: 'writer',
      params: { session_id: 'mine', name: parsed[0], arg: parsed[1] } }, () => true)
    assert.equal(result.message, 'native scoped instructions: 保留原文\n第二行')
    assert.deepEqual(calls, [
      ['session.resume', { session_id: 'mine' }],
      ['complete.slash', { session_id: 'mine', text: '/' + name }],
      ['command.resolve', { name }],
      ['command.dispatch', { session_id: 'mine', name, arg: '保留原文\n第二行' }],
    ])
  }
})

test('skill expansion never dispatches controls, unknown path identifiers or foreign sessions', async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-skill-command-scope-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  let dispatched = false
  const bridge = createCapabilityBridge({
    connect: async () => ({ home, connection: { call: async (method, params) => {
      if (method === 'session.resume') {
        if (params.session_id !== 'mine') throw new Error('not_found')
        return { session_id: 'mine', info: { cwd: home } }
      }
      if (method === 'complete.slash') return { items: params.text === '/unknown/path' ? [] : [{ text: params.text.slice(1), kind: 'skill' }] }
      if (method === 'command.resolve') return { canonical: 'reset' }
      if (method === 'command.dispatch') { dispatched = true; return { type: 'exec', output: 'reset' } }
      assert.fail('Unexpected native method: ' + method)
    } } }),
    directoryFor: async (_root, path) => path,
    writeProfile: async (_home, operation) => operation(),
  })
  for (const params of [
    { session_id: 'mine', name: 'reset', arg: '' },
    { session_id: 'mine', name: 'unknown/path', arg: '' },
    { session_id: 'foreign', name: 'writer:review', arg: '' },
  ]) await assert.rejects(() => bridge({ home, workspace: home }, { method: 'skill.expand', params }, () => true))
  assert.equal(dispatched, false)
})
