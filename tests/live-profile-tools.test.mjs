import test from 'node:test'
import assert from 'node:assert/strict'
import { profileToolClient, profileToolRequest } from '../scripts/live-aiwata-profile-tools.mjs'
import { connectLiveAiwata } from '../src/live-aiwata.mjs'

test('profile tool clients keep exact Bot home, account sandbox and terminal maps separate', async () => {
  const client = { home: '/account', workspace: '/workspace', terminals: new Map(), profileClients: new Map() }
  const options = { ownedHome: async (home, profile) => home + '/profiles/' + profile, available() {}, active: () => true }
  assert.equal(await profileToolClient(client, '', options), client)
  const bot = await profileToolClient(client, 'bot', options)
  assert.equal(bot, await profileToolClient(client, 'bot', options))
  assert.equal(bot.home, '/account/profiles/bot')
  assert.equal(bot.accountHome, '/account')
  assert.equal(bot.workspace, '/workspace')
  assert.notEqual(bot.terminals, client.terminals)
  const other = await profileToolClient(client, 'other', options)
  assert.notEqual(other.terminals, bot.terminals)
  const foreign = { ...client, home: '/other-account', profileClients: new Map() }
  assert.notEqual(await profileToolClient(foreign, 'bot', options), bot)
  assert.deepEqual(profileToolRequest({ profile: 'bot', action: 'status', session_id: 's' }), {
    profile: 'bot', request: { action: 'status', session_id: 's' },
  })
  assert.throws(() => profileToolRequest({ profile: {}, action: 'status' }))
  await assert.rejects(profileToolClient(client, 'bot', { ...options, ownedHome: async () => { throw new Error('foreign profile') } }), /foreign/)
  await assert.rejects(profileToolClient(client, 'bot', { ...options, active: () => false }), /退出/)
})

test('forProfile caches tool wrappers and pins the profile after caller input', async () => {
  const previous = globalThis.fetch, calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    return new Response(JSON.stringify(url.endsWith('login') ? { token: 'login-token' } : { ok: true }))
  }
  try {
    const live = await connectLiveAiwata('lin'), bot = live.forProfile('bot')
    assert.equal(live.forProfile(''), live)
    assert.equal(live.forProfile('bot'), bot)
    assert.notEqual(live.forProfile('other'), bot)
    await bot.files('list', 's', 'root', [])
    await bot.git({ action: 'status', session_id: 's', profile: 'foreign' })
    await bot.terminalOpen('s', 80, 24, undefined, 'instance')
    await bot.terminalControl({ action: 'close', session_id: 's', profile: 'foreign' })
    await bot.locateFile('s', '/path')
    for (const call of calls.slice(1)) assert.equal(call.body.profile, 'bot')
    await live.git({ action: 'status', session_id: 's' })
    assert.equal(calls.at(-1).body.profile, undefined)
    assert.throws(() => live.forProfile({}), /Profile/)
  } finally { globalThis.fetch = previous }
})

test('Bot tool directory lookup can read its owned hidden GUI session without exposing archived or foreign sources', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { DatabaseSync } = await import('node:sqlite')
  const { gatewaySessionDirectory } = await import('../scripts/live-aiwata-gateway.mjs')
  const home = await mkdtemp(join(tmpdir(), 'aiwata-bot-tool-test-'))
  try {
    const db = new DatabaseSync(join(home, 'state.db'))
    db.exec('CREATE TABLE sessions(id TEXT,chat_id TEXT,cwd TEXT,source TEXT,hidden INTEGER,archived INTEGER,started_at INTEGER)')
    const insert = db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)')
    insert.run('bot', 'bot', '/workspace', 'gui', 1, 0, 1)
    insert.run('archived', 'archived', '/workspace', 'gui', 1, 1, 2)
    insert.run('cron', 'cron', '/workspace', 'cron', 1, 0, 3)
    db.close()
    assert.equal(await gatewaySessionDirectory(home, 'bot'), undefined)
    assert.equal(await gatewaySessionDirectory(home, 'bot', { allowHidden: true }), '/workspace')
    assert.equal(await gatewaySessionDirectory(home, 'archived', { allowHidden: true }), undefined)
    assert.equal(await gatewaySessionDirectory(home, 'cron', { allowHidden: true }), undefined)
  } finally { await rm(home, { recursive: true, force: true }) }
})
