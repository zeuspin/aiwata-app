import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'

const tailLimit = 1024 * 1024
const retainFor = 5 * 60 * 1000
const sessionKey = /^[a-zA-Z0-9_-]{1,128}$/
const instanceKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const viewerKey = /^[0-9a-f-]{36}$/
const fields = {
  open: ['cols', 'rows'], resize: ['viewer_id', 'cols', 'rows'],
  write: ['viewer_id', 'data'], close: [],
}

export function terminalRequest(input) {
  if (!input || typeof input !== 'object') throw new Error('无法识别终端请求。')
  const allowed = Object.hasOwn(fields, input.action) ? fields[input.action] : null
  if (!allowed || typeof input.session_id !== 'string' || !sessionKey.test(input.session_id) ||
      Object.keys(input).some(key => !['action', 'session_id', 'instance_id', ...allowed].includes(key)) ||
      (Object.hasOwn(input, 'instance_id') && (typeof input.instance_id !== 'string' || !instanceKey.test(input.instance_id))) ||
      (allowed.includes('viewer_id') && (typeof input.viewer_id !== 'string' || !viewerKey.test(input.viewer_id))) ||
      (allowed.includes('cols') && (!Number.isInteger(input.cols) || input.cols < 2 || input.cols > 512 ||
        !Number.isInteger(input.rows) || input.rows < 1 || input.rows > 256)) ||
      (input.action === 'write' && (typeof input.data !== 'string' || !input.data || Buffer.byteLength(input.data) > 65536))) {
    throw new Error('无法识别终端请求。')
  }
  return input
}

const terminalMapKey = request => request.instance_id ? JSON.stringify([request.session_id, request.instance_id]) : request.session_id

export function createTerminalBridge(launch, sessionDirectory, validateDirectory) {
  async function directory(client, id) {
    const cwd = await sessionDirectory(client.home, id)
    if (!cwd) throw new Error('当前用户没有这条可用的会话。')
    return validateDirectory(client.workspace, cwd)
  }

  function publish(entry, frame) {
    const stream = entry.viewer?.stream
    if (!stream || stream.destroyed || stream.writableEnded) return
    if (stream.writableLength > tailLimit + 90000) stream.destroy()
    else stream.write(JSON.stringify(frame) + '\n')
  }

  function retire(client, id) {
    const entry = client.terminals.get(id)
    if (!entry) return
    client.terminals.delete(id)
    clearTimeout(entry.idle)
    entry.viewer?.stream.end()
    if (!entry.child) return
    entry.child.stdin.end()
    const stop = setTimeout(() => entry.child.kill('SIGTERM'), 5000).unref()
    entry.child.once('exit', () => clearTimeout(stop))
  }

  async function start(client, entry, request, signedIn) {
    const key = terminalMapKey(request)
    const current = () => signedIn() && client.terminals.get(key) === entry
    const child = entry.child = await launch(client, entry.cwd, request.cols, request.rows, current)
    entry.idle = setTimeout(() => retire(client, key), retainFor).unref()
    child.stdin.on('error', () => {})
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => {
      if (line.length > 90000) return
      let frame
      try { frame = JSON.parse(line) } catch { return }
      if (frame.type === 'ready') entry.ready = true
      if (frame.type === 'output') {
        entry.tail.push(frame)
        entry.bytes += JSON.stringify(frame).length
        while (entry.bytes > tailLimit) entry.bytes -= JSON.stringify(entry.tail.shift()).length
      }
      publish(entry, frame)
    })
    child.once('error', () => publish(entry, { type: 'error', message: '无法启动 AIWATA 交互终端。' }))
    child.once('close', () => {
      publish(entry, { type: 'exit' })
      if (current()) {
        client.terminals.delete(key)
        clearTimeout(entry.idle)
        entry.viewer?.stream.end()
      }
    })
  }

  return {
    async open(client, request, stream, signedIn) {
      const id = terminalMapKey(request)
      const cwd = await directory(client, request.session_id).catch(error => {
        retire(client, id)
        throw error
      })
      if (!signedIn() || stream.destroyed) return stream.end()
      let entry = client.terminals.get(id)
      if (entry && entry.cwd !== cwd) {
        retire(client, id)
        entry = null
      }
      if (!entry) {
        if (client.terminals.size >= 4) throw new Error('请先关闭一个终端。')
        entry = { id: randomUUID(), sessionId: request.session_id, cwd, tail: [], bytes: 0, ready: false }
        client.terminals.set(id, entry)
        entry.start = start(client, entry, request, signedIn).catch(error => {
          if (client.terminals.get(id) === entry) retire(client, id)
          throw error
        })
      }
      await entry.start
      if (!signedIn() || client.terminals.get(id) !== entry || stream.destroyed) return stream.end()
      clearTimeout(entry.idle)
      entry.viewer?.stream.end()
      const viewer = entry.viewer = { id: randomUUID(), stream }
      stream.once('close', () => {
        if (entry.viewer !== viewer || client.terminals.get(id) !== entry) return
        entry.viewer = null
        entry.idle = setTimeout(() => retire(client, id), retainFor).unref()
      })
      stream.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' })
      publish(entry, { type: 'open', terminal_id: entry.id, viewer_id: viewer.id, cwd: entry.cwd, ready: entry.ready })
      for (const frame of entry.tail) publish(entry, frame)
      publish(entry, { type: 'replay-end' })
    },
    async control(client, request) {
      const { action, session_id, instance_id, viewer_id, ...input } = request
      const id = terminalMapKey(request)
      if (action === 'close') {
        retire(client, id)
        return { ok: true }
      }
      const entry = client.terminals.get(id)
      if (!entry?.ready || entry.viewer?.id !== viewer_id || entry.child.stdin.destroyed) {
        throw new Error('终端已断开，请重新连接。')
      }
      if (entry.child.stdin.writableLength > 128 * 1024) throw new Error('终端输入正在处理中。')
      await new Promise((resolve, reject) => {
        entry.child.stdin.write(JSON.stringify({ action, ...input }) + '\n', error => {
          if (error) reject(new Error('终端已断开，请重新连接。'))
          else resolve()
        })
      })
      return { ok: true }
    },
    close(client) {
      for (const id of client.terminals.keys()) retire(client, id)
    },
    async revalidate(client) {
      await Promise.all([...client.terminals].map(async ([id, entry]) => {
        const cwd = await directory(client, entry.sessionId).catch(() => null)
        if (cwd !== entry.cwd && client.terminals.get(id) === entry) retire(client, id)
      }))
    },
  }
}
