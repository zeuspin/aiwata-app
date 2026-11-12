import test from 'node:test'
import assert from 'node:assert/strict'
import { appearanceChange } from '../src/desktop-appearance.mjs'

test('appearance validates the full request before any account preference changes', () => {
  const prior = { mode: 'light', accent: 'green' }
  assert.equal(appearanceChange(prior, { accent: 'red', layout: 'unavailable' }).success, false)
  assert.deepEqual(prior, { mode: 'light', accent: 'green' })
  const next = appearanceChange(prior, { accent: '#AbCdEF', mode: 'dark' })
  assert.deepEqual(next.applied, { mode: 'dark', accent: 'custom:#abcdef' })
  assert.equal(next.preferences.accent, 'custom:#abcdef')
  assert.equal(appearanceChange({}, { accent: 'theme' }).applied.accent, null)
})

test('setup offers only real layouts and non-name beats never submit unsupported free text', async () => {
  const m = await import('../src/desktop-choice.mjs').catch(() => ({}))
  assert.equal(typeof m.desktopChoiceOptions, 'function')
  const layout = { method: 'setup_beat', params: { beat: 'layout', card: { options: [
    { id: 'sidebar-left', label: 'Basic' }, { id: 'terminal-deck', label: 'Elite' },
  ] } } }
  assert.deepEqual(m.desktopChoiceOptions(layout).map(row => row.id), ['sidebar-left'])
  assert.equal(m.desktopChoiceAllowsText(layout), false)
  assert.equal(m.desktopChoiceAllowsText({ method: 'setup_beat', params: { beat: 'theme' } }), false)
  assert.equal(m.desktopChoiceAllowsText({ method: 'setup_beat', params: { beat: 'name' } }), true)
  assert.equal(m.desktopChoiceAllowsText({ method: 'theme.pick', params: { picker: 'accent' } }), true)
  const theme = m.desktopChoiceOptions({ method: 'setup_beat', params: { beat: 'theme' } })
  assert.deepEqual(theme.find(row => row.id === 'violet').answer, { answer: { accent: 'violet' } })
})
