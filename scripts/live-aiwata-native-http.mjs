// Thin adapter for the existing AIWATA desktop REST contract. It never starts a
// driver, changes a provider, loads runtime config, or executes Computer Use.
const operations = {
  status: ['GET', '/api/tools/computer-use/status'],
  permissions: ['POST', '/api/tools/computer-use/permissions/grant'],
  permissionStatus: ['GET', '/api/actions/computer-use-grant/status'],
}

const reads = {
  fileList: ['/api/fs/list', ['path']],
  fileText: ['/api/fs/read-text', ['path', 'session_id']],
  fileData: ['/api/fs/read-data-url', ['path', 'session_id']],
  gitRoot: ['/api/fs/git-root', ['path']],
  gitStatus: ['/api/git/status', ['path']],
  gitDiff: ['/api/git/review/diff', ['path', 'file', 'scope', 'staged']],
}
export function nativeComputerRequest(context) {
  if (!Object.hasOwn(operations, context.action)) return Promise.reject(new Error('电脑操作请求无效。'))
  return nativeRequest(context)
}
export function nativeReadRequest(context) {
  const operation = reads[context.action]
  if (!operation || !context.params || Object.keys(context.params).some(key => !operation[1].includes(key)) ||
      Object.values(context.params).some(value => typeof value !== 'string' || value.length > 8192 || value.includes('\0'))) return Promise.reject(new Error('原生读取请求无效。'))
  return nativeRequest(context, ['GET', operation[0]], (context.action === 'fileData' ? 24 : 4) * 1024 * 1024)
}
async function nativeRequest({ action, params = {}, profile = '', grant, active }, operation = operations[action], limit = 256 * 1024) {
  if (typeof profile !== 'string' ||
      profile && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(profile)) throw new Error('电脑操作请求无效。')
  if (!active()) throw new Error('当前账号已退出。')
  const target = await grant()
  if (!active()) throw new Error('当前账号已退出。')
  let origin
  try { origin = new URL(target?.origin) } catch {}
  if (!origin || origin.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(origin.hostname) ||
      !origin.port || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password ||
      typeof target.ticket !== 'string' || !target.ticket || target.ticket.length > 4096) throw new Error('无法确认原生接口地址或授权。')
  const [method, path] = operation
  const url = new URL(path, origin)
  url.searchParams.set('profile', profile || 'default')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'X-Hermes-Gateway-Ticket': target.ticket } }).catch(() => { throw new Error('无法连接原生电脑操作接口。') })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel()
    throw new Error('原生电脑操作接口未接受请求。')
  }
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('原生电脑操作响应过大。')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  if (!active()) throw new Error('当前账号已退出。')
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new Error('原生电脑操作响应无效。') }
}
