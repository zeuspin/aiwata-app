import test from 'node:test'
import assert from 'node:assert/strict'
import { makeTerminalReader } from '../src/terminal-reader.mjs'
test('terminal reader returns native line ranges from the owned xterm buffer', () => {
  const lines = ['old', '当前目录', 'output', '', '']
  const terminal = { rows: 3, buffer: { active: { length: lines.length, baseY: 2, cursorY: 0,
    getLine: row => ({ translateToString: () => lines[row] }) } } }
  assert.deepEqual(makeTerminalReader(terminal)(), { total_lines: 5, start: 2, end: 5, viewport_rows: 3, cursor_row: 2, text: 'output' })
  assert.equal(makeTerminalReader(terminal)({ start: 1, count: 1 }).text, '当前目录')
  assert.equal(makeTerminalReader(terminal)({ start: -10, count: 1 }).text, 'old')
})
