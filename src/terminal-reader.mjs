// Native contract: AIWATA apps/desktop/src/app/right-sidebar/terminal/buffer.ts.
export function makeTerminalReader(terminal) {
  return ({ start, count } = {}) => {
    const buffer = terminal.buffer.active
    const total = buffer.length
    const from = Math.max(0, Math.min(Number.isSafeInteger(start) ? start : buffer.baseY, total))
    const to = Math.max(from, Math.min(from + Math.max(1, Math.min(Number.isSafeInteger(count) ? count : terminal.rows, 1500)), total))
    const lines = []
    for (let row = from; row < to; row++) lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
    while (lines.length && !lines.at(-1).trim()) lines.pop()
    return { total_lines: total, start: from, end: to, viewport_rows: terminal.rows,
      cursor_row: buffer.baseY + buffer.cursorY, text: lines.join('\n') }
  }
}
