import assert from 'node:assert/strict'
import test from 'node:test'
import { modelSwitchWarning } from '../src/session-model-warning.mjs'
import { React, act, harness } from './helpers/native-react-harness.mjs'

const contextWarning = { kind: 'context_cache', message: '!!! LARGE CONTEXT MODEL SWITCH !!!', context_tokens: 102868 }

test('explains the next reply charge in the system language', () => {
  const refusal = { warnings: [contextWarning] }
  assert.match(modelSwitchWarning(refusal, ['zh-CN']), /约 102,868 个 token.*按全价计费/)
  assert.match(modelSwitchWarning(refusal, ['zh-Hant-HK']), /約 102,868 個 token.*按全價計費/)
  assert.match(modelSwitchWarning(refusal, ['en-GB']), /about 102,868 tokens.*full input rate/)
  assert.match(modelSwitchWarning(refusal, ['fr-FR']), /按全价计费/)
})

test('preserves other guards and supports gateway versions without the context count', () => {
  const other = { kind: 'data_policy', message: 'This model may train on your data.' }
  const refusal = { warnings: [other, { ...contextWarning, context_tokens: undefined }] }
  const body = modelSwitchWarning(refusal, ['zh-CN'])
  assert.match(body, /This model may train on your data\./)
  assert.match(body, /第一次回复.*按全价计费/)
  assert.doesNotMatch(body, /LARGE CONTEXT|102,868/)
  assert.equal(modelSwitchWarning({ confirm_message: 'Another guard' }, ['zh-CN']), 'Another guard')
})

test('the live picker asks in the system language before resending the confirmation', async t => {
  const { LiveModelPicker, element, render } = await harness(t, "export { default as LiveModelPicker } from './src/live-model-picker.jsx'")
  const language = Object.getOwnPropertyDescriptor(navigator, 'languages')
  Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] })
  t.after(() => {
    if (language) Object.defineProperty(navigator, 'languages', language)
    else delete navigator.languages
  })
  const chat = { id: 'chat', gatewayId: 'session', gatewayProfile: 'default' }
  const live = { async rpc() {
    return { model: 'glm-5.3', provider: 'zai', providers: [{ name: 'GLM', slug: 'zai', models: ['glm-5.3'] }] }
  } }
  const confirmation = { warnings: [contextWarning], params: { payload: { confirm: 'owner-token' } } }
  const calls = []
  await render(React.createElement(LiveModelPicker, { chat, live, onClose() {}, async onSelect(selection, approved) {
    calls.push([selection, approved])
    return approved ? { selected: true } : { confirmation }
  } }))
  const form = () => element.querySelector('dialog form')
  const submit = () => act(async () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await submit()
  assert.deepEqual(calls, [[{ model: 'glm-5.3', provider: 'zai' }, null]])
  assert.match(element.querySelector('.model-confirmation').textContent, /102,868.*按全价计费/)
  await submit()
  assert.equal(calls[1][1], confirmation)
})
