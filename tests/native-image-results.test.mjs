import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveGeneratedImage } from '../src/native-image-results.mjs'

const data = 'data:image/png;base64,Zml4dHVyZQ=='
test('native generation failure preserves its real provider error before reading any artifact', async () => {
  await assert.rejects(resolveGeneratedImage({ success: false, error: 'provider quota exhausted' }, { api: () => assert.fail('must not read') }), /provider quota exhausted/)
  assert.deepEqual(await resolveGeneratedImage({ success: true, image_data: data }, {}), { imageData: data, mime: 'image/png' })
})
test('successful URL fallback uses the original gateway media proxy rather than browser CORS/provider reimplementation', async () => {
  const calls = []
  const result = await resolveGeneratedImage({ success: true, image: 'https://cdn.example/result.png' }, { api: async (...args) => { calls.push(args); return { dataUrl: data } } })
  assert.deepEqual(result, { imageData: data, mime: 'image/png' })
  assert.deepEqual(calls, [['/api/media/proxy?url=https%3A%2F%2Fcdn.example%2Fresult.png']])
})
test('successful local/remote path fallbacks read only their native owner', async () => {
  const local = [], remote = []
  const host = { readFileDataUrl: async path => { local.push(path); return data } }
  await resolveGeneratedImage({ success: true, image: 'file:///Users/test/out%20one.png' }, { host, route: { connectionId: 'local' }, api: () => assert.fail('wrong reader') })
  assert.deepEqual(local, ['/Users/test/out one.png'])
  await resolveGeneratedImage({ success: true, image: '/srv/out.png' }, { host, route: { connectionId: 'ssh' }, api: async (...args) => { remote.push(args); return data } })
  assert.deepEqual(remote, [['/api/fs/read-data-url?path=%2Fsrv%2Fout.png']])
  assert.equal(local.length, 1)
})
test('missing or unreadable artifacts never become an undefined image or an invented success', async () => {
  await assert.rejects(resolveGeneratedImage({ success: true }, {}), /产物/)
  await assert.rejects(resolveGeneratedImage({ success: true, image: '/missing.png' }, { route: { connectionId: 'local' }, host: { readFileDataUrl: async () => ({ error: 'ENOENT', message: 'file missing' }) } }), /file missing/)
  await assert.rejects(resolveGeneratedImage({ success: true, image: 'https://cdn.example/out.png' }, { api: async () => ({ dataUrl: 'data:text/html;base64,eA==' }) }), /图像/)
})
