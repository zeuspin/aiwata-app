import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, realpath, stat, symlink, readlink, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { accounts } from '../src/fixtures.mjs'
import { attachmentSizeLimit } from '../src/composer.mjs'
import { botDeletionTarget, describeGatewayBot, gatewayBots, ownedBotHome, saveGatewayBot } from './live-aiwata-bots.mjs'
import { createCapabilityBridge } from './live-aiwata-capabilities.mjs'
import { callRoom } from './live-aiwata-rooms.mjs'
import { createTaskBridge } from './live-aiwata-tasks.mjs'
import { createImageBridge, imageEditor, imageRequestLimit } from './live-aiwata-images.mjs'
import { createVideoBridge, videoEditor } from './live-aiwata-video.mjs'
import { createSkillBridge } from './live-aiwata-skills.mjs'
import { createMemoryBridge } from './live-aiwata-memory.mjs'
import { createConnectorBridge, withoutAmbientChannelCredentials } from './live-aiwata-connectors.mjs'
import { nativeInstallation, profileWriteQueue, runtimeCompanion } from './live-aiwata-runtime.mjs'
import { createFileBridge } from './live-aiwata-files.mjs'
import { createGitBridge } from './live-aiwata-git.mjs'
import { claimRuntimeMode, createNativeGateway } from './live-aiwata-host.mjs'
import { createTerminalBridge, terminalRequest } from './live-aiwata-terminal.mjs'
import { audioRequestLimit, createAudioBridge } from './live-aiwata-audio.mjs'
import { selectedWorkspaceFolders } from './live-aiwata-folders.mjs'
import { previewMethods, previewReply } from '../src/web-preview.mjs'
import { createDesktopRequestLedger, allowedSessionControlCall, sessionControlFields, desktopReplyBodyLimit } from './live-aiwata-requests.mjs'

import { profileToolClient, profileToolRequest } from './live-aiwata-profile-tools.mjs'
import { nativeComputerRequest, nativeReadRequest } from './live-aiwata-native-http.mjs'

const run = promisify(execFile)
const prefix = '/__aiwata/'
const sessionListLimit = 200
const botSessionCalls = new Set(['session.resume', 'session.events.since', 'session.interrupt', 'prompt.submit',
  'prompt.receipt', 'prompt.resolve_unknown', 'approval.respond', 'clarify.respond', 'setup.runtime_check', 'model.options', 'session.mutate', 'config.get', 'config.set', ...Object.keys(sessionControlFields)])
const allowedParams = new Map(Object.entries({
  ...sessionControlFields,
  'projects.list': [], 'projects.create': ['name', 'folders', 'color', 'icon'],
  'projects.update': ['id', 'name', 'color', 'icon'], 'projects.get': ['id'],
  'projects.add_folder': ['id', 'path'], 'projects.remove_folder': ['id', 'path'],
  'projects.set_primary': ['id', 'path'], 'projects.delete': ['id'],
  'session.list': ['scope', 'limit'], 'session.create': ['request_id', 'cwd', 'model', 'provider'],
  'session.resume': ['session_id'], 'session.events.since': ['session_id', 'last_seen', 'replay_epoch'],
  'session.mutate': ['session_id', 'request_id', 'expected_revision', 'expected_generation', 'operation', 'payload'],
  'session.interrupt': ['session_id', 'execution_generation'], 'prompt.submit': ['session_id', 'submission_id', 'text', 'uploads'],
  'prompt.receipt': ['session_id', 'admission_id', 'include_result'],
  'prompt.resolve_unknown': ['session_id', 'admission_id', 'execution_generation'],
  'approval.respond': ['session_id', 'prompt_id', 'choice', 'execution_generation'],
  'clarify.respond': ['session_id', 'prompt_id', 'answer', 'execution_generation'],
  'setup.runtime_check': [],
  'model.options': ['session_id', 'explicit_only', 'include_unconfigured', 'refresh'],
  'config.get': ['key'], 'config.set': ['key', 'value'],
}))

const validModel = value => typeof value === 'string' && Boolean(value.trim()) && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value)

export function allowedGatewayCall(method, params) {
  const fields = allowedParams.get(method)
  if (!fields || !params || typeof params !== 'object' || Array.isArray(params) ||
      Object.keys(params).some(key => !fields.includes(key))) return false
  if (Object.hasOwn(sessionControlFields, method)) return allowedSessionControlCall(method, params)
  switch (method) {
    case 'session.mutate': return allowedSessionMutation(params)
    case 'session.create': return (params.model === undefined || validModel(params.model)) &&
      (params.provider === undefined || validModel(params.provider))
    case 'model.options': return (params.session_id === undefined || (typeof params.session_id === 'string' &&
      Boolean(params.session_id) && params.session_id.length <= 200)) &&
      ['explicit_only', 'include_unconfigured', 'refresh'].every(key => params[key] === undefined || typeof params[key] === 'boolean')
    case 'config.get': return params.key === 'approvals.mode'
    case 'config.set': return params.key === 'approvals.mode' && ['manual', 'smart', 'off'].includes(params.value)
    default: return true
  }
}

function allowedSessionMutation({ session_id, request_id, expected_revision, expected_generation, operation, payload }) {
  const validCounter = value => Number.isSafeInteger(value) && value >= 0
  if (typeof session_id !== 'string' || !session_id || typeof request_id !== 'string' || !request_id ||
      !validCounter(expected_revision) || !payload || typeof payload !== 'object' || Array.isArray(payload) ||
      (expected_generation !== undefined && !validCounter(expected_generation))) return false
  const keys = Object.keys(payload)
  switch (operation) {
    case 'model': return validCounter(expected_generation) && keys.every(key => ['model', 'provider', 'confirm'].includes(key)) && validModel(payload.model) &&
      (payload.provider === undefined || validModel(payload.provider)) &&
      (payload.confirm === undefined || (typeof payload.confirm === 'string' && /^[a-f0-9]{64}$/.test(payload.confirm)))
    case 'rename': return keys.length === 1 && typeof payload.title === 'string' && Boolean(payload.title.trim()) && payload.title.length <= 80
    case 'archive': return keys.length === 1 && typeof payload.archived === 'boolean'
    case 'workspace': return validCounter(expected_generation) && keys.length === 1 && typeof payload.cwd === 'string'
    case 'delete': return validCounter(expected_generation) && keys.length === 0
    default: return false
  }
}

export class GatewayConnection {
  #sequence = 0
  #pending = new Map()

  constructor(socket, onFrame) {
    this.socket = socket
    let ready
    let fail
    this.ready = new Promise((resolve, reject) => { ready = resolve; fail = reject })
    const startup = setTimeout(() => { fail(new Error('等待 AIWATA 网关就绪超时。')); socket.close() }, 12000)
    socket.addEventListener('message', event => {
      let frame
      try { frame = JSON.parse(event.data) } catch { return }
      if (frame.method) {
        if (frame.params?.type === 'gateway.ready') {
          clearTimeout(startup)
          if (frame.params.payload?.session_authority === true) { this.sessionAuthority = true; ready() }
          else { fail(new Error('当前 AIWATA 网关未提供会话协议。')); socket.close() }
        }
        onFrame(frame, this)
        return
      }
      const pending = this.#pending.get(frame.id)
      if (!pending) return
      this.#pending.delete(frame.id)
      clearTimeout(pending.timeout)
      if (frame.error) pending.reject(Object.assign(new Error(frame.error.message ?? 'AIWATA 请求失败。'), { code: frame.error.code, data: frame.error.data }))
      else pending.resolve(frame.result)
    })
    const disconnected = () => {
      clearTimeout(startup)
      const error = new Error('AIWATA 网关连接已断开。')
      fail(error)
      for (const pending of this.#pending.values()) { clearTimeout(pending.timeout); pending.reject(error) }
      this.#pending.clear()
    }
    socket.addEventListener('error', disconnected)
    socket.addEventListener('close', disconnected, { once: true })
  }

  get connected() { return this.socket.readyState === 1 }

  call(method, params, timeoutMs = 35000) {
    if (!this.connected) return Promise.reject(new Error('AIWATA 网关连接已断开。'))
    const id = ++this.#sequence
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error('AIWATA 未在期限内确认请求。'))
      }, timeoutMs)
      this.#pending.set(id, { resolve, reject, timeout })
      try { this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })) }
      catch (error) { clearTimeout(timeout); this.#pending.delete(id); reject(error) }
    })
  }

  async advertiseCapabilities() {
    await this.ready
    this.nativeCapabilities = await this.call('client.capabilities', { server_requests: true })
    // Pinned AIWATA 6631a6af2c advertises sidecar declines_not_shown globally, but its canonical
    // session_server_requests.resolve consumes every error. Never let a bystander win there.
    this.capabilities = { ...this.nativeCapabilities, ...(this.sessionAuthority ? { declines_not_shown: false } : {}) }
    return this.capabilities
  }

  reply(id, result, error) {
    if (!this.connected) throw new Error('AIWATA 网关连接已断开。')
    this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) }))
  }

  close() { this.socket.close() }
}

async function writeNew(path, contents) {
  try { await writeFile(path, contents, { mode: 0o600, flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
}

async function isolatedHome(account, source, dataRoot, installHome, isolated) {
  const root = resolve(dataRoot, account.id)
  const home = resolve(root, 'runtime')
  const workspace = resolve(root, 'projects')
  const starter = resolve(workspace, '验收项目')
  await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  const realDataRoot = await realpath(dataRoot)
  await claimRuntimeMode(realDataRoot, isolated)
  for (const directory of [root, home, workspace, starter, resolve(home, 'installs')]) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (await realpath(directory) !== resolve(realDataRoot, relative(dataRoot, directory))) {
      throw new Error('用户数据目录不能通过符号链接指向其他工作区。')
    }
  }
  const key = createHash('sha256').update(source).digest('hex').slice(0, 16)
  const installation = await nativeInstallation(source, installHome)
  const { dependencies, toolStore } = installation
  const dependencyLink = resolve(home, 'installs', key)
  if (!(await stat(dependencies).catch(() => null))?.isDirectory()) throw new Error('找不到 AIWATA 已安装的依赖。')
  // Repair only the known, now-dangling borrowed dependency link. User data never moves.
  const oldLink = await readlink(dependencyLink).catch(() => null)
  if (oldLink && !(await stat(dependencyLink).catch(() => null)) &&
      [resolve(homedir(), '.aiwata', 'installs', key), resolve(homedir(), '.hermes', 'installs', key)].includes(oldLink)) {
    await unlink(dependencyLink)
  }
  try { await symlink(dependencies, dependencyLink, 'dir') }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  if (await realpath(dependencyLink) !== await realpath(dependencies)) throw new Error('AIWATA 依赖目录不匹配。')
  const config = resolve(home, 'config.yaml')
  const terminal = 'terminal:\n  backend: local\n  cwd: .\n'
  const defaults = '_config_version: 12\nmodel:\n  provider: zai\n  default: glm-5.3\n  base_url: https://open.bigmodel.cn/api/coding/paas/v4\n' + terminal
  await writeNew(config, defaults)
  if (await readFile(config, 'utf8') === terminal) await writeFile(config, defaults)
  await writeNew(resolve(starter, 'README.md'), `# ${account.name}的验收项目\n\n验收标记：${account.id}-aiwata-workspace\n`)
  return { home: await realpath(home), workspace: await realpath(workspace), starter: await realpath(starter),
    dependencies: await realpath(dependencies), toolStore }
}

async function connectNative(source, home, onFrame, ticket) {
  let target
  if (ticket) target = await ticket()
  else try {
    const { stdout } = await run(resolve(source, 'aiwata'), ['--run-module', 'ui-tui.scripts.gateway_bootstrap', '--start'], {
      cwd: source, timeout: 45000, env: { ...withoutAmbientChannelCredentials(process.env), AIWATA_HOME: home, HERMES_HOME: home },
    })
    target = JSON.parse(stdout.trim().split('\n').at(-1))
  } catch { throw new Error('AIWATA 网关启动失败。请检查本机安装与用户运行目录。') }
  const url = new URL(target.url)
  if (target.profile_id !== home || url.protocol !== 'ws:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    !target.protocols?.includes('hermes-gateway-v1')) throw new Error('AIWATA 返回的网关身份与当前用户不符。')
  const connection = new GatewayConnection(new WebSocket(url, target.protocols), onFrame)
  await connection.ready
  try { await connection.advertiseCapabilities() }
  catch (error) { connection.close(); throw error }
  return connection
}

async function directoryFor(workspace, path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('请选择有效的绝对目录路径。')
  const actual = await realpath(path).catch(() => null)
  if (!actual || !(await stat(actual)).isDirectory()) {
    throw new Error('请选择有效的目录。')
  }
  return actual
}

async function sanitize(workspace, method, params) {
  if (!allowedGatewayCall(method, params)) throw new Error('这个操作不在当前联调范围内。')
  if (method === 'session.create') return { ...params, cwd: await directoryFor(workspace, params.cwd ?? workspace), source: 'gui' }
  if (method === 'session.resume') return { ...params, display_projection: true }
  if (method === 'session.mutate' && params.operation === 'workspace') {
    return { ...params, payload: { cwd: await directoryFor(workspace, params.payload.cwd) } }
  }
  if (method === 'projects.create') {
    if (!Array.isArray(params.folders) || !params.folders.length || params.folders.length > 12) throw new Error('请选择有效的项目目录。')
    const folders = await Promise.all(params.folders.map(path => directoryFor(workspace, path)))
    return { ...params, folders }
  }
  if (method === 'projects.add_folder') return { ...params, path: await directoryFor(workspace, params.path) }
  return params
}

async function withSessionDatabase(home, read) {
  const file = resolve(await realpath(home), 'state.db')
  const actual = await realpath(file).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  if (!actual) return null
  if (actual !== file) throw new Error('会话数据库必须位于当前用户的运行目录。')
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(actual, { readOnly: true })
  try { return read(db) }
  finally { db.close() }
}

export async function readGatewaySessionInventory(home) {
  return (await withSessionDatabase(home, db => {
    // The gateway picker omits archived flags and cwd. Read this local projection while keeping all writes on the authority.
    return db.prepare(`WITH conversations AS (
      SELECT COALESCE(NULLIF(s.chat_id, ''), s.id) AS id,
        COALESCE(NULLIF(owner.title, ''), s.title, '') AS title,
        s.cwd, s.model, s.source, COALESCE(owner.archived, s.archived, 0) AS archived,
        SUM(s.message_count) OVER (PARTITION BY COALESCE(NULLIF(s.chat_id, ''), s.id)) AS message_count,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(s.chat_id, ''), s.id) ORDER BY s.started_at DESC) AS position,
        s.started_at
      FROM sessions s LEFT JOIN sessions owner ON owner.id = s.chat_id
      WHERE s.source IN ('gui', 'local') AND COALESCE(s.hidden, 0) = 0 AND COALESCE(owner.hidden, 0) = 0
    ) SELECT id, title, cwd, model, source, archived, message_count FROM conversations
      WHERE position = 1 AND message_count > 0 ORDER BY started_at DESC LIMIT ?`).all(sessionListLimit + 1)
      .map(row => ({ ...row, archived: Boolean(row.archived) }))
  })) ?? []
}

export async function gatewaySessionDirectory(home, id, { allowHidden = false } = {}) {
  return withSessionDatabase(home, db => db.prepare(`SELECT s.cwd
    FROM sessions s LEFT JOIN sessions owner ON owner.id = s.chat_id
    WHERE (s.chat_id = ? OR s.id = ?) AND COALESCE(NULLIF(s.chat_id, ''), s.id) = ?
      AND s.source IN ('gui', 'local') AND (? = 1 OR (COALESCE(s.hidden, 0) = 0 AND COALESCE(owner.hidden, 0) = 0))
      AND COALESCE(owner.archived, s.archived, 0) = 0
    ORDER BY s.started_at DESC LIMIT 1`).get(id, id, id, allowHidden ? 1 : 0)?.cwd)
}

async function findAdmissionId(home, session, submission) {
  return withSessionDatabase(home, db => db.prepare(`SELECT admission_id FROM session_admissions
    WHERE target_session_id = ? AND request_id = ?`).get(session, submission)?.admission_id)
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(payload))
}

async function readBody(req, limit = 262144) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('请求超过本机联调限制。')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const imageMime = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

async function stageUpload(client, connection, profile, { session_id, blobId, name, dataUrl }) {
  if (typeof session_id !== 'string' || typeof name !== 'string' || name.length > 255 || /[/\\\p{Cc}]/u.test(name) ||
    typeof blobId !== 'string' || !/^[a-f0-9-]{36}$/i.test(blobId) || typeof dataUrl !== 'string') {
    throw new Error('附件信息无效。')
  }
  const match = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl)
  if (!match || Buffer.byteLength(match[2], 'base64') > attachmentSizeLimit) throw new Error('附件格式无效或超出大小限制。')
  const key = [profile, session_id, blobId].join('\n')
  const hash = createHash('sha256').update(dataUrl).digest('hex')
  const existing = client.uploads.get(key)
  if (existing?.hash === hash && existing.name === name) return { id: key }
  const image = imageMime.has(match[1])
  const staged = image ? await connection.call('image.attach_bytes', { session_id, filename: name, content_base64: match[2] })
    : await connection.call('file.attach', { session_id, name, data_url: dataUrl })
  if (!staged?.attached || (image ? !staged.path || !imageMime.has(staged.mime) : !staged.ref_text)) throw new Error('AIWATA 未能保存附件。')
  client.uploads.set(key, { hash, name, profile, sessionId: session_id,
    ...(image ? { image: { path: staged.path, mime: staged.mime } } : { ref: staged.ref_text }) })
  if (client.uploads.size > 512) client.uploads.delete(client.uploads.keys().next().value)
  return { id: key }
}

function promptWithUploads(client, profile, { uploads, ...params }) {
  if (uploads === undefined) return params
  if (!Array.isArray(uploads) || uploads.length > 10 || new Set(uploads).size !== uploads.length) throw new Error('每条消息最多附带 10 个文件。')
  const staged = uploads.map(id => client.uploads.get(id))
  if (staged.some(item => item?.sessionId !== params.session_id || item.profile !== profile)) throw new Error('附件不属于当前会话，请重新添加。')
  const refs = staged.flatMap(item => item.ref ? [item.ref] : [])
  const images = staged.flatMap(item => item.image ? [item.image] : [])
  return { ...params, text: [params.text, ...refs].filter(Boolean).join('\n\n'), ...(images.length ? { attachments: images } : {}) }
}

export function liveAiwata({ source, dataRoot, installHome, isolated = false }) {
  const clients = new Map()
  const initializations = new Map()
  const uploads = new Map(accounts.map(account => [account.id, new Map()]))
  const botCreations = new Map(accounts.map(account => [account.id, new Map()]))
  const savingBots = new Set()
  const deletingBots = new Set()
  const deletedBots = new Map()
  const roomRegistrations = new Map()
  const host = createNativeGateway(source)
  const nativeHttpTicket = runtimeCompanion(source, './live_aiwata_host_ticket.py', '原生接口授权',
    ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }) => ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }))
  const toolSessionDirectory = (home, id) => gatewaySessionDirectory(home, id, { allowHidden: [...clients.values()].some(client =>
    [...(client.profileClients?.values() ?? [])].some(profile => profile.home === home)) })
  const terminals = host && createTerminalBridge(host.terminal, toolSessionDirectory, directoryFor)
  const audio = createAudioBridge(source, host?.withoutModelSource)
  const callTasks = createTaskBridge(source, directoryFor, host?.wrap)
  const callImages = createImageBridge(gatewaySessionDirectory, host && imageEditor(source, host.withoutModelSource))
  const callVideo = host && createVideoBridge(gatewaySessionDirectory, videoEditor(source, host.withoutModelSource))
  const writeProfile = profileWriteQueue()
  const writeRoster = profileWriteQueue()
  const callSkills = createSkillBridge(source, writeProfile)
  const callMemory = createMemoryBridge(source, writeProfile, host?.wrap)
  const callConnectors = createConnectorBridge(source, writeProfile, { reload: host?.reload, relayOwner: host?.relayOwner })
  const draftCompletion = runtimeCompanion(source, './live_aiwata_draft_completion.py', '草稿目录补全', withoutAmbientChannelCredentials, undefined, host?.withoutModelSource)
  const providerCatalog = runtimeCompanion(source, './live_aiwata_provider_catalog.py', '模型提供方目录', withoutAmbientChannelCredentials)
  const callCapabilities = createCapabilityBridge({ connect: reconnect, writeProfile, providerCatalog, directoryFor, draftCompletion })
  const callFiles = createFileBridge(source, toolSessionDirectory, nativeRead)
  const callGit = createGitBridge(source, toolSessionDirectory, nativeRead)
  function nativeRead(scoped, action, params, active) {
    const owner = scoped.accountHome ? { ...scoped, home: scoped.accountHome } : scoped
    return nativeReadRequest({ action, params, profile: scoped.profile ?? '', active,
      grant: () => host.httpTicket(owner, scoped.home, active) })
  }
  let picker = null
  const deleteNativeBot = runtimeCompanion(source, './live_aiwata_bot_delete.py', 'Bot 删除', withoutAmbientChannelCredentials)
  const botKey = (client, profile) => client.home + ':' + profile

  function requireAvailableBot(client, profile) {
    if (typeof profile === 'string' && deletingBots.has(botKey(client, profile))) throw new Error('此 Bot 正在删除。')
  }

  async function deleteBot(client, { profile, identity }) {
    if (typeof identity !== 'string' || !/^[a-f0-9]{64}$/.test(identity) || typeof profile !== 'string') {
      throw new Error('请刷新 Bot 列表后再删除。')
    }
    const key = botKey(client, profile)
    const receipt = deletedBots.get(key + ':' + identity)
    if (receipt) return receipt
    const path = await ownedBotHome(client.home, profile)
    if (savingBots.has(key) || deletingBots.has(key)) throw new Error('此 Bot 正在保存或删除，请稍后再试。')
    deletingBots.add(key)
    try {
      return await writeRoster(client.home, () => writeProfile(path, async () => {
        const { connection } = await reconnect(client)
        const { rooms, path, device, inode } = await botDeletionTarget(connection, client.home, { profile, identity })
        if (rooms.length) throw new Error('此 Bot 仍属于群聊「' + rooms.join('」「') + '」。请先解散相关群聊。')
        const result = await deleteNativeBot(client, { profile, path, device, inode }, () => clients.has(client.token), 90000)
        if (!result.ok) throw new Error('AIWATA 未确认删除 Bot。')
        deletedBots.set(key + ':' + identity, result)
        if (deletedBots.size > 128) deletedBots.delete(deletedBots.keys().next().value)
        client.botCreations.delete(profile)
        for (const [id, upload] of client.uploads) if (upload.profile === profile) client.uploads.delete(id)
        for (const other of clients.values()) {
          if (other.home !== client.home) continue
          const route = other.routes.get(profile)
          other.routes.delete(profile)
          route?.connection?.close()
          const toolClient = other.profileClients?.get(profile)
          if (toolClient) terminals?.close(toolClient)
          other.profileClients?.delete(profile)
        }
        return result
      }))
    } finally { deletingBots.delete(key) }
  }

  async function registerRoomMember(home, profile, path) {
    const previous = roomRegistrations.get(home) ?? Promise.resolve()
    const pending = previous.catch(() => {}).then(async () => {
      const root = await realpath(source)
      await run(resolve(root, 'aiwata'), ['config', 'set', 'hosted_rooms.profiles.' + profile, path], {
        cwd: root, timeout: 30000, env: { ...process.env, AIWATA_HOME: home, HERMES_HOME: home },
      })
    })
    roomRegistrations.set(home, pending)
    try { await pending }
    catch { throw new Error('无法将 Bot 注册到当前账号的群聊驱动。') }
    finally { if (roomRegistrations.get(home) === pending) roomRegistrations.delete(home) }
  }

  function close(client) {
    clients.delete(client.token)
    callConnectors.close(client)
    callCapabilities.close(client)
    terminals?.close(client)
    for (const child of client.profileClients?.values() ?? []) terminals?.close(child)
    client.profileClients?.clear()
    for (const request of client.audioRequests) request.abort()
    if (picker?.client === client) picker.controller.abort()
    client.stream?.end()
    for (const entry of client.routes.values()) entry.connection?.close()
  }

  async function toolsFor(client, body) {
    const { profile, request } = profileToolRequest(body)
    const scoped = await profileToolClient(client, profile, { ownedHome: ownedBotHome, available: requireAvailableBot,
      active: () => clients.has(client.token) })
    const { connection } = await reconnect(client, profile)
    return { scoped, connection, profile, request, active: () => clients.has(client.token) &&
      (!profile || client.profileClients?.get(profile) === scoped) && !deletingBots.has(botKey(client, profile)) }
  }

  async function reconnect(client, profile = '') {
    requireAvailableBot(client, profile)
    const home = profile ? await ownedBotHome(client.home, profile) : client.home
    requireAvailableBot(client, profile)
    const entry = client.routes.get(profile) ?? { home, desktopRequests: createDesktopRequestLedger({ profile }) }
    client.routes.set(profile, entry)
    if (entry.connection?.connected) return entry
    const ticket = host ? () => host.ticket(client, home, () => clients.has(client.token)) : undefined
    entry.connecting ??= realpath(source).then(path => connectNative(path, home, (frame, nativeConnection) => {
      if (!clients.has(client.token)) return
      entry.desktopRequests.cancel(frame)
      if (!entry.desktopRequests.receive(frame, nativeConnection)) return
      if (!client.stream && ['preview.read', 'preview.act', 'terminal.read', 'window.read', 'tour', 'theme.apply'].includes(frame.method)) {
        entry.desktopRequests.reply(nativeConnection, { id: frame.id, session_id: frame.params.session_id, profile,
          error: { code: 4404, message: 'No workbench window is showing this session.' } })
        return
      }
      const routedFrame = profile ? { ...frame, profile } : frame
      if (client.stream && !client.stream.write(JSON.stringify(routedFrame) + '\n')) client.stream.end()
    }, ticket)).then(connection => {
      if (!clients.has(client.token)) { connection.close(); throw new Error('已退出当前工作区。') }
      if (deletingBots.has(botKey(client, profile))) { connection.close(); throw new Error('此 Bot 正在删除。') }
      entry.connection = connection
      connection.socket.addEventListener('close', () => {
        if (clients.has(client.token) && entry.connection === connection) client.stream?.end()
      }, { once: true })
      return entry
    }).finally(() => { entry.connecting = null })
    return entry.connecting
  }

  return {
    name: 'local-aiwata-gateway',
    configureServer(server) {
      const expiration = setInterval(() => {
        const now = Date.now()
        for (const client of clients.values()) if (!client.stream && now - client.lastSeen > 120000) close(client)
      }, 30000).unref()
      server.httpServer?.once('close', () => {
        clearInterval(expiration)
        for (const client of clients.values()) close(client)
        host?.close()
      })
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next()
        const port = req.socket.localPort
        const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`]
        if (req.method !== 'POST' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
          !origins.includes(req.headers.origin) || req.headers.origin !== `http://${req.headers.host}` ||
          !req.headers['content-type']?.startsWith('application/json')) {
          return json(res, 403, { error: 'AIWATA 联调只接受本机工作台请求。' })
        }
        try {
          const route = req.url.slice(prefix.length)
          const upload = route === 'upload'
          const voice = route === 'audio'
          const images = route === 'images'
          const authorization = req.headers.authorization
          if ((upload || voice || images) && (!authorization?.startsWith('Bearer ') || !clients.has(authorization.slice(7)))) {
            return json(res, 401, { error: '请重新选择用户。' })
          }
          const body = await readBody(req, upload ? Math.ceil(attachmentSizeLimit * 4 / 3) + 8192
            : voice ? audioRequestLimit : images ? imageRequestLimit : route === 'desktop/reply' ? desktopReplyBodyLimit : route === 'bots/save' ? 600000 : route === 'rooms/upload' ? 20010000
              : ['skills', 'memory', 'connectors', 'terminal'].includes(route) ? 450000 : undefined)
          if (route === 'login') {
            const account = accounts.find(entry => entry.id === body.account)
            if (!account) return json(res, 400, { error: '请选择有效用户。' })
            let setup = initializations.get(account.id)
            if (!setup) {
              setup = realpath(source).then(path => isolatedHome(account, path, dataRoot, installHome, isolated))
              initializations.set(account.id, setup)
              setup.catch(() => initializations.delete(account.id))
            }
            const client = { ...await setup, token: randomUUID(), lastSeen: Date.now(), routes: new Map(),
              uploads: uploads.get(account.id), botCreations: botCreations.get(account.id), terminals: new Map(), profileClients: new Map(), audioRequests: new Set() }
            clients.set(client.token, client)
            try {
              const { connection } = await reconnect(client)
              let inventory = await connection.call('projects.list', {})
              if (!inventory.projects.length) {
                try { await connection.call('projects.create', { name: '验收项目', folders: [client.starter], color: '#6b806d' }) }
                catch (error) {
                  inventory = await connection.call('projects.list', {})
                  if (!inventory.projects.length) throw error
                }
              }
              return json(res, 200, { token: client.token, executionMode: 'native', capabilities: { terminal: true, files: true, git: true, images: true, video: true } })
            } catch (error) { close(client); throw error }
          }

          const token = req.headers.authorization?.slice('Bearer '.length)
          const client = clients.get(token)
          if (!client || !req.headers.authorization?.startsWith('Bearer ')) return json(res, 401, { error: '请重新选择用户。' })
          client.lastSeen = Date.now()
          if (route === 'logout') { close(client); return json(res, 200, { ok: true }) }
          if (route === 'terminal') {
            if (!terminals) return json(res, 404, { error: '交互终端需要 原生桌面运行环境。' })
            const { scoped, request: input, active } = await toolsFor(client, body)
            const request = terminalRequest(input)
            if (request.action === 'open') return await terminals.open(scoped, request, res, active)
            return json(res, 200, await terminals.control(scoped, request))
          }
          if (route === 'bots/delete') return json(res, 200, await deleteBot(client, body))
          requireAvailableBot(client, body.profile)
          if (voice) {
            const controller = new AbortController()
            const abort = () => controller.abort()
            res.once('close', abort)
            client.audioRequests.add(controller)
            try {
              const result = await audio(client, body, () => clients.has(token), controller.signal)
              if (!controller.signal.aborted) return json(res, 200, result)
            } catch (error) {
              if (!controller.signal.aborted) throw error
            } finally {
              client.audioRequests.delete(controller)
              res.off('close', abort)
            }
            if (!res.destroyed) return json(res, 401, { error: '已退出当前工作区。' })
            return
          }
          if (route === 'tasks') {
            const result = await callTasks(client, body, () => clients.has(client.token))
            return json(res, 200, result)
          }
          if (['computer/status', 'computer/permissions', 'computer/permission-status'].includes(route)) {
            if (Object.keys(body).some(key => key !== 'profile') || body.profile !== undefined && typeof body.profile !== 'string') {
              throw new Error('电脑操作请求无效。')
            }
            const profile = body.profile ?? ''
            const { home } = await reconnect(client, profile)
            const active = () => clients.has(token) && !deletingBots.has(botKey(client, profile))
            const result = await nativeComputerRequest({
              action: { 'computer/status': 'status', 'computer/permissions': 'permissions',
                'computer/permission-status': 'permissionStatus' }[route], profile, active,
              grant: async () => {
                if (host) return host.httpTicket(client, home, active)
                const receipt = await nativeHttpTicket(client, { profileHome: home, nativeHttp: true }, active)
                if (!receipt.target) throw new Error('未能取得当前账号的原生接口授权。')
                return receipt.target
              },
            })
            return json(res, 200, result)
          }
          if (route === 'images') {
            if (!host) return json(res, 404, { error: '生图工具需要 原生桌面运行环境。' })
            const { connection } = await reconnect(client)
            return json(res, 200, await callImages(client, connection, body, () => clients.has(token)))
          }
          if (route === 'video') {
            if (!callVideo) return json(res, 404, { error: '视频编辑需要 原生桌面运行环境。' })
            return json(res, 200, await callVideo(client, body, () => clients.has(token)))
          }
          if (route === 'skills') {
            const result = await callSkills(client, body, () => clients.has(client.token))
            return json(res, 200, result)
          }
          if (route === 'memory') {
            const result = await callMemory(client, body, () => clients.has(client.token))
            return json(res, 200, result)
          }
          if (route === 'connectors') {
            requireAvailableBot(client, body.profile)
            const result = await callConnectors(client, body, () => clients.has(client.token))
            return json(res, 200, result)
          }
          if (route === 'sessions') {
            const sessions = await readGatewaySessionInventory(client.home)
            return json(res, 200, { sessions: sessions.slice(0, sessionListLimit), complete: sessions.length <= sessionListLimit })
          }
          if (route === 'files') {
            const { scoped, connection, request, active } = await toolsFor(client, body)
            return json(res, 200, await callFiles(scoped, connection, request, active))
          }
          if (route === 'git') {
            const { scoped, connection, request, active } = await toolsFor(client, body)
            return json(res, 200, await callGit(scoped, connection, request, active))
          }
          if (route === 'folders') {
            const folders = await readdir(client.workspace, { withFileTypes: true })
            return json(res, 200, folders.filter(folder => folder.isDirectory()).map(folder => ({ name: folder.name, path: resolve(client.workspace, folder.name) })))
          }
          if (route === 'folders/pick') {
            if (Object.keys(body).some(key => key !== 'paths')) throw new Error('系统目录选择请求无效。')
            if (!body.paths) return json(res, 200, { available: false })
            const paths = await selectedWorkspaceFolders(client.workspace, body.paths, directoryFor)
            if (!clients.has(token)) return json(res, 401, { error: '已退出当前工作区。' })
            return json(res, 200, { available: true, paths })
          }
          if (route === 'folders/create') {
            const name = typeof body.name === 'string' ? body.name.trim() : ''
            if (!name || name.length > 100 || name === '.' || name === '..' || /[/\\\p{Cc}]/u.test(name)) {
              return json(res, 400, { error: '请输入有效的文件夹名称。' })
            }
            const path = resolve(client.workspace, name)
            try { await mkdir(path, { mode: 0o700 }) }
            catch (error) {
              if (error.code === 'EEXIST') return json(res, 409, { error: '当前工作区已有同名文件夹。' })
              throw error
            }
            return json(res, 200, { name, path })
          }
          if (route === 'capabilities') return json(res, 200, await callCapabilities(client, body, () => clients.has(client.token)))
          if (route === 'rooms' || route === 'rooms/upload') {
            const { connection } = await reconnect(client)
            const input = route === 'rooms/upload' ? { method: 'groups.attachment.upload', params: body } : body
            const call = () => callRoom(connection, client.home,
              (profile, path) => registerRoomMember(client.home, profile, path), input)
            const result = input.method === 'groups.create' ? await writeRoster(client.home, async () => {
              if (!clients.has(client.token)) throw new Error('已退出当前工作区。')
              return call()
            }) : await call()
            return json(res, 200, result)
          }
          if (route === 'bots' || route === 'bots/describe' || route === 'bots/save') {
            const { connection } = await reconnect(client)
            if (route === 'bots') return json(res, 200, { bots: await gatewayBots(connection, client.home) })
            if (route === 'bots/describe') return json(res, 200, await describeGatewayBot(connection, client.home, body.profile))
            const key = botKey(client, body.profile)
            requireAvailableBot(client, body.profile)
            if (savingBots.has(key)) return json(res, 409, { error: '此 Bot 正在保存，请稍后重试。' })
            savingBots.add(key)
            try {
              const result = await saveGatewayBot(connection, client.home, body, client.botCreations)
              if (host && result.ok) {
                const profileHome = await ownedBotHome(client.home, body.profile)
                await writeProfile(profileHome, () => host.prepareProfile(client, profileHome, () => clients.has(client.token)))
              }
              return json(res, 200, result)
            }
            finally { savingBots.delete(key) }
          }
          if (route === 'bots/open') {
            if (typeof body.profile !== 'string' || !body.profile) return json(res, 400, { error: '请选择 Bot。' })
            const { connection } = await reconnect(client, body.profile)
            const chat = await connection.call('session.create', {
              title: 'Bot Chat', source: 'gui', cwd: client.workspace, hidden: true, follow_profile_config: true,
            })
            return json(res, 200, await connection.call('session.resume', { session_id: chat.session_id, display_projection: true }))
          }
          const profile = ['rpc', 'upload', 'submission', 'reply', 'preview/reply', 'desktop/reply'].includes(route) ? (body.profile ?? '') : ''
          if (typeof profile !== 'string' || (profile && route === 'rpc' && (!botSessionCalls.has(body.method) ||
              (body.method === 'session.mutate' && body.params?.operation !== 'model')))) {
            return json(res, 400, { error: '该操作不适用于 Bot 私聊。' })
          }
          const { connection, home, desktopRequests } = await reconnect(client, profile)
          if (route === 'submission') {
            const { session_id, submission_id } = body
            if (typeof session_id !== 'string' || !session_id || session_id.length > 200 ||
                typeof submission_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(submission_id)) {
              return json(res, 400, { error: '无法识别发送记录。' })
            }
            const admission_id = await findAdmissionId(home, session_id, submission_id)
            if (!clients.has(client.token)) return json(res, 401, { error: '已退出当前工作区。' })
            const receipt = admission_id ? await connection.call('prompt.receipt', { session_id, admission_id }) : null
            return json(res, 200, receipt)
          }
          if (upload) return json(res, 200, await stageUpload(client, connection, profile, body))
          if (route === 'desktop/reply' || route === 'reply' || route === 'preview/reply') {
            if (!clients.has(client.token)) return json(res, 401, { error: '已退出当前工作区。' })
            let reply = body
            const request = desktopRequests.get(body.id)
            if (route === 'reply') reply = { ...body, session_id: body.session_id ?? request?.sessionId }
            if (route === 'preview/reply') {
              const result = previewMethods.includes(request?.method) ? previewReply(body, request) : null
              if (!result) return json(res, 400, { error: '这个网页预览请求已经失效。' })
              reply = { id: body.id, session_id: body.session_id, profile, result }
            }
            if (!desktopRequests.reply(connection, reply, route === 'reply' ? { method: 'clarify' } : {})) {
              return json(res, 400, { error: '这个桌面请求已经失效或不属于当前会话。' })
            }
            return json(res, 200, { ok: true })
          }
          if (route === 'events') {
            client.stream?.end()
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' })
            res.flushHeaders()
            client.stream = res
            const heartbeat = setInterval(() => {
              if (!connection.connected || !res.write('\n')) res.end()
            }, 2000)
            res.once('close', () => {
              clearInterval(heartbeat)
              if (client.stream !== res) return
              client.stream = null
            })
            return
          }
          if (route === 'rpc') {
            const params = await sanitize(client.workspace, body.method, body.params)
            if (!clients.has(client.token)) return json(res, 401, { error: '已退出当前工作区。' })
            requireAvailableBot(client, profile)
            const result = await connection.call(body.method, body.method === 'prompt.submit' ? promptWithUploads(client, profile, params) : params)
            if (['session.resume', 'session.events.since'].includes(body.method) && Array.isArray(result?.open_requests)) {
              for (const request of result.open_requests) desktopRequests.receive(request, connection)
            }
            if (terminals && body.method === 'session.mutate' && ['archive', 'workspace', 'delete'].includes(params.operation)) {
              await Promise.all([...clients.values()].filter(other => other.home === client.home)
                .map(other => profile ? other.profileClients?.get(profile) : other)
                .filter(Boolean).map(other => terminals.revalidate(other)))
            }
            return json(res, 200, result)
          }
          return json(res, 404, { error: '联调入口不存在。' })
        } catch (error) {
          if (!res.headersSent && !res.destroyed) json(res, 502, { error: error.message || 'AIWATA 请求失败。' })
        }
      })
    },
  }
}
