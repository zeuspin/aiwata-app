import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeAuxiliaryWindow } from '../src/native-window-entry.mjs'

test('native auxiliary windows retain the host window identity', () => {
  for (const kind of ['quick', 'overlay', 'wake', 'hud', 'secondary', 'browser']) {
    assert.equal(nativeAuxiliaryWindow('?win=' + kind, true), kind)
  }
  assert.equal(nativeAuxiliaryWindow('?win=hud&profile=work&connectionId=office', true), 'hud')
  assert.equal(nativeAuxiliaryWindow('?profile=work&win=secondary&watch=1', true), 'secondary')
})

test('ordinary windows and nonnative previews keep the new workbench', () => {
  for (const search of ['', '?peer=1&profile=work', '?win=unknown', '?win=', '?tab=browser']) {
    assert.equal(nativeAuxiliaryWindow(search, true), null)
  }
  for (const kind of ['quick', 'overlay', 'wake', 'hud', 'secondary', 'browser']) {
    assert.equal(nativeAuxiliaryWindow('?win=' + kind, false), null)
  }
})

test('allowlisted native surfaces select the original full boot only on an owner-pinned peer', () => {
  for (const name of ['settings', 'artifacts', 'capabilities', 'cron', 'messaging', 'webhooks', 'session-import']) {
    const search = '?peer=1&profile=writer&connectionId=office&nativeSurface=' + name
    assert.equal(nativeAuxiliaryWindow(search, true), 'native-surface')
    assert.equal(nativeAuxiliaryWindow(search, false), null)
  }
  for (const search of ['?nativeSurface=settings', '?peer=1&nativeSurface=settings', '?peer=1&profile=writer&connectionId=office&nativeSurface=https%3A%2F%2Fevil.example', '?peer=1&profile=writer&connectionId=office&nativeSurface=../settings']) {
    assert.equal(nativeAuxiliaryWindow(search, true), null)
  }
})
