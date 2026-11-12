import test from 'node:test'
import assert from 'node:assert/strict'
import { createFolderPicker } from '../scripts/desktop-folder-picker.mjs'

test('native directory dialog supports multiple folders and new folder, cancels stale account results', async () => {
  const scope = { account: 'lin', closed: false }; let current = scope; let options
  const picker = createFolderPicker({ trusted: () => true, scope: () => current,
    show: async value => { options = value; current = { account: 'qiao' }; return { filePaths: ['/Users/lin/project'], canceled: false } } })
  await assert.rejects(picker({}, 'lin'), /已切换/)
  assert.deepEqual(options.properties, ['openDirectory', 'createDirectory', 'multiSelections'])
})
test('native directory selection rejects other account and handles cancellation without upload', async () => {
  let called = false
  const owner = { account: 'lin' }
  const picker = createFolderPicker({ trusted: event => event === 'trusted', scope: () => owner,
    show: async () => { called = true; return { canceled: true, filePaths: [] } } })
  await assert.rejects(picker('trusted', 'qiao'))
  assert.equal(called, false)
  await assert.rejects(picker('guest', 'lin'))
  assert.deepEqual(await picker('trusted', 'lin'), { available: true, paths: [] })
})
