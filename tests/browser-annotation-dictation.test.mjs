import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnnotationDictation } from '../src/browser-annotation-dictation.mjs'

function fixture(service) {
  let stopped = 0, requested = 0, recorder
  const received = [], errors = [], states = []
  class Recorder {
    mimeType = 'audio/webm'; state = 'inactive'
    constructor() { recorder = this }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['voice']) }); this.onstop?.() }
  }
  const controller = createAnnotationDictation({ service, profile: 'owned-bot',
    mediaDevices: { async getUserMedia() { requested++; return { getTracks: () => [{ stop() { stopped++ } }] } } }, Recorder,
    isCurrent: () => true, onState: state => states.push(state), onTranscript: text => received.push(text), onError: error => errors.push(error) })
  return { controller, received, errors, states, stopped: () => stopped, requested: () => requested, recorder: () => recorder }
}

test('annotation voice checks the owning Profile, transcribes without saving or sending, and releases microphone', async () => {
  const f = fixture({ async voiceStatus(profile) { assert.equal(profile, 'owned-bot'); return { available: true } },
    async transcribeVoice(profile, audio) { assert.equal(profile, 'owned-bot'); assert.ok(audio.size); return { transcript: '增加留白' } } })
  await f.controller.start()
  assert.equal(f.recorder().state, 'recording')
  await f.controller.finish()
  assert.deepEqual(f.received, ['增加留白'])
  assert.equal(f.stopped(), 1)
  assert.deepEqual(f.errors, [])
})

test('cancelled or unavailable dictation never inserts late text or opens an unconfigured microphone', async () => {
  let resolve, started
  const transcribing = new Promise(done => { started = done })
  const f = fixture({ async voiceStatus() { return { available: true } },
    transcribeVoice: () => new Promise(done => { resolve = done; started() }) })
  await f.controller.start()
  const finishing = f.controller.finish()
  await transcribing
  f.controller.cancel()
  resolve({ transcript: 'late private text' }); await finishing
  assert.deepEqual(f.received, [])
  const unavailable = fixture({ async voiceStatus() { return { available: false, message: '请配置语音转写' } } })
  await unavailable.controller.start()
  assert.equal(unavailable.requested(), 0)
  assert.deepEqual(unavailable.errors, ['请配置语音转写'])
})
