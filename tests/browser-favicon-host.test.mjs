import test from 'node:test'
import assert from 'node:assert/strict'
import { createPreviewFaviconHandler } from '../scripts/desktop-preview-favicon.mjs'

function fixture() {
  let epoch = 1, active, resolve
  const calls = [], frame = { url: 'http://127.0.0.1:4181/' }, renderer = { mainFrame: frame }
  const session = { async fetch(url) { calls.push(url); return new Response(new Uint8Array([137,80,78,71]), { headers: { 'content-type': 'image/png' } }) } }
  const guest = { id: 7, session, isDestroyed: () => false, getURL: () => 'https://example.com/' }
  const scope = active = { partition: 'owned', session, guests: new Set([guest]), closed: false }
  const icons = { epoch: 1, urls: ['https://example.com/icon.png'] }
  const handle = createPreviewFaviconHandler({ renderer, origin: frame.url, getScope: () => active, getEpoch: () => epoch, getIcons: () => icons })
  return { calls, session, icons, frame, renderer, scope, invoke: (options = {}) => handle(options.event ?? { sender: renderer, senderFrame: frame }, options.partition ?? 'owned', options.id ?? 7, options.url ?? 'https://example.com/'),
    release: () => { active = null }, navigate: () => { epoch++ }, defer() { session.fetch = () => new Promise(done => { resolve = done }); return () => resolve(new Response('icon', { headers: { 'content-type': 'image/png' } })) } }
}

test('favicon reads use the owned guest session and only return bounded inline image data', async () => {
  const f = fixture(), result = await f.invoke()
  assert.equal(result.success, true)
  assert.match(result.favicon, /^data:image\/png;base64,/)
  assert.deepEqual(f.calls, ['https://example.com/icon.png'])
  f.icons.urls = ['file:///etc/passwd', 'https://example.com/new.png']
  assert.equal((await f.invoke()).success, true)
  assert.equal(f.calls.at(-1), 'https://example.com/new.png')
})

test('favicon bridge rejects foreign renderers, frames, accounts and pages without making a request', async () => {
  const f = fixture()
  for (const options of [{ event: { sender: {}, senderFrame: f.frame } }, { event: { sender: f.renderer, senderFrame: {} } }, { partition: 'foreign' }, { id: 8 }, { url: 'https://elsewhere.example/' }]) {
    assert.equal((await f.invoke(options)).success, false)
  }
  assert.deepEqual(f.calls, [])
})

test('late navigation results, oversized images and non-image responses cannot become a tab favicon', async () => {
  const f = fixture(), resolve = f.defer(), pending = f.invoke()
  f.navigate(); resolve()
  assert.equal((await pending).success, false)
  const large = fixture(); large.session.fetch = async () => new Response('x'.repeat(140000), { headers: { 'content-type': 'image/png' } })
  assert.equal((await large.invoke()).favicon, null)
  const html = fixture(); html.session.fetch = async () => new Response('<script>bad</script>', { headers: { 'content-type': 'text/html' } })
  assert.equal((await html.invoke()).favicon, null)
})
