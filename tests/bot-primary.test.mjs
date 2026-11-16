import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspace } from '../src/workspace.mjs'
import { seedAccount } from '../src/fixtures.mjs'
import { getBotAppearance } from '../src/bot-appearance.mjs'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
}

test('a new demo account has one primary Bot and keeps the existing room roster', () => {
  const api = createWorkspace()
  api.login('lin')
  const record = api.current()
  const primary = record.bots.filter(bot => bot.isDefault)
  assert.equal(primary.length, 1)
  assert.equal(primary[0].name, 'AIWATA')
  assert.equal(record.chats[primary[0].id].projectId, null)
  assert.deepEqual(record.groups[0].members, ['editor', 'designer'])
  assert.equal(record.bots.find(bot => bot.id === 'editor').isDefault, undefined)
})

test('legacy demo login adds its primary once without replacing chats, group membership or edited identity', () => {
  const storage = memoryStorage()
  const legacy = seedAccount('lin')
  for (const bot of legacy.bots.filter(bot => bot.isDefault)) delete legacy.chats[bot.id]
  legacy.bots = legacy.bots.filter(bot => !bot.isDefault)
  delete legacy.groups[0].members
  legacy.chats.editor.messages.push({ role: 'user', text: '保留旧聊天' })
  storage.setItem('aiwata-ui-prototype:v1:accounts', JSON.stringify({ lin: legacy }))
  const api = createWorkspace(storage)
  api.login('lin')
  const primary = api.current().bots.find(bot => bot.isDefault)
  assert.ok(primary)
  assert.equal(api.removeBotEntity('bot', primary.id), false)
  assert.equal(api.saveBotEntity('bot', { id: primary.id, name: '我的主助手', avatar: '/my-photo.png', isDefault: false }), true)
  assert.equal(api.current().bots.find(bot => bot.id === primary.id).isDefault, true)
  api.logout()
  const reopened = createWorkspace(storage)
  reopened.login('lin')
  assert.equal(reopened.current().bots.filter(bot => bot.isDefault).length, 1)
  assert.equal(reopened.current().bots.find(bot => bot.isDefault).name, '我的主助手')
  assert.equal(reopened.current().bots.find(bot => bot.isDefault).avatar, '/my-photo.png')
  assert.deepEqual(reopened.current().groups[0].members, ['editor', 'designer'])
  assert.equal(reopened.current().chats.editor.messages[0].text, '保留旧聊天')
  reopened.login('qiao')
  assert.equal(reopened.current().bots.find(bot => bot.isDefault).name, 'AIWATA')
})

test('live login never seeds a demo primary Bot', () => {
  const api = createWorkspace(null, null, { live: true })
  api.login('lin')
  assert.deepEqual(api.current().bots, [])
  assert.deepEqual(api.current().chats, {})
})

test('the primary fallback is black and square while saved appearance and uploaded photos retain their identity', () => {
  const primary = { id: 'bot:company', isDefault: true }
  assert.deepEqual(getBotAppearance(primary), { mode: 'character', shape: 'boxy', bodyColor: '#141414', eyeColor: '#ffffff', eyeStyle: 'pill' })
  const appearance = { mode: 'character', shape: 'sun', bodyColor: '#aa2233', eyeColor: '#123456', eyeStyle: 'round' }
  assert.deepEqual(getBotAppearance({ ...primary, appearance }), appearance)
  assert.equal(getBotAppearance({ ...primary, avatar: '/uploaded.png' }).mode, 'photo')
  const namedOnly = getBotAppearance({ id: 'ordinary', name: 'AIWATA' })
  assert.notEqual(namedOnly.bodyColor, '#141414')
})
