import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, mkdir, open, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseEnv, promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { nativeHostEnvironment, runtimeCompanion } from './live-aiwata-runtime.mjs'

const exec = promisify(execFile)
const modelScope = fileURLToPath(new URL('./live_aiwata_model_scope.py', import.meta.url))
const terminalScript = fileURLToPath(new URL('./live_aiwata_terminal.py', import.meta.url))
const modelBootstrap = 'import runpy,sys; sys.path.insert(0,sys.argv[1]); sys._hermes_pin_default_home=True; import hermes_bootstrap; runpy.run_path(sys.argv[2],run_name="__main__")'
const terminalBootstrap = 'import runpy,sys; sys.path.insert(0,sys.argv[1]); import hermes_bootstrap; runpy.run_path(sys.argv[2],run_name="__main__")'
const running = child => child?.pid && child.exitCode === null && child.signalCode === null

export function ownedGateway(home, child, receipt) {
  return Boolean(running(child) && receipt.ownerHome === home && receipt.ownerPid === child.pid)
}

export async function claimRuntimeMode(root, isolated) {
  const mode = isolated ? 'isolated\n' : 'live\n'
  const marker = join(root, '.aiwata-app-mode')
  const draft = marker + '.' + randomUUID()
  await writeFile(draft, mode, { mode: 0o600, flag: 'wx' })
  try { await link(draft, marker) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  finally { await unlink(draft) }
  const file = await open(marker, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size !== mode.length || await file.readFile('utf8') !== mode) {
      throw new Error('本机联调和普通联调必须使用不同的数据目录。')
    }
  } finally { await file.close() }
}

export { nativeHostEnvironment } from './live-aiwata-runtime.mjs'

async function nativeProcess(source, client, python, { bridgeScript, terminal, useModelSource = true } = {}) {
  // The installation owns dependencies; each account/Profile owns only its data.
  // Use PM's supported runtime-store selection, not a custom driver/provider override.
  const toolStore = client.toolStore ?? await realpath(join(dirname(dirname(client.dependencies)), 'tools'))
  const env = nativeHostEnvironment(client.home, toolStore)
  const interpreter = python ?? await runtimePython(source, client)
  if (terminal) {
    const shell = process.platform === 'win32' ? [env.COMSPEC || 'cmd.exe', '/Q']
      : [env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'), '-l']
    return { executable: interpreter, args: ['-I', '-B', '-c', terminalBootstrap, source, terminalScript, ...terminal, ...shell], env }
  }
  const args = ['-I', '-B', '-c', modelBootstrap, source]
  if (!useModelSource) return { executable: interpreter, args: [...args, bridgeScript], env }
  const defaults = await readFile(join(source, '.aiwata-distribution', '.env'), 'utf8').then(parseEnv, error => {
    if (error.code === 'ENOENT') return {}
    throw error
  })
  const modelEnvValues = { ...defaults, ...process.env }
  const credentials = Object.fromEntries(['GLM_API_KEY', 'ZAI_API_KEY', 'Z_AI_API_KEY']
    .filter(key => typeof modelEnvValues[key] === 'string' && modelEnvValues[key].trim()).map(key => [key, modelEnvValues[key]]))
  return { executable: interpreter, args: [...args, modelScope, ...(bridgeScript ? ['--companion', bridgeScript] : ['--gateway'])],
    env, input: { credentials } }
}

async function runtimePython(source, client) {
  const { stdout } = await exec(join(source, 'aiwata'), ['--print-runtime-command'], {
    cwd: source, timeout: 8000, env: { ...process.env, AIWATA_HOME: client.home, HERMES_HOME: client.home },
  })
  const [python] = JSON.parse(stdout)
  return python
}

async function spawnGateway(source, client) {
  const python = await runtimePython(source, client)
  const launch = await nativeProcess(source, client, python)
  const log = await open(join(client.home, 'native-gateway.log'),
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
  try {
    const metadata = await log.stat()
    if (!metadata.isFile() || metadata.nlink !== 1) throw new Error('本机网关日志不是独立文件。')
    const child = spawn(launch.executable, launch.args, {
      cwd: source, env: launch.env,
      stdio: ['pipe', log.fd, log.fd],
    })
    child.on('error', () => {})
    child.stdin.on('error', () => {})
    try {
      child.stdin.end(JSON.stringify(launch.input))
    } catch (error) { child.stdin.end(); child.kill(); throw error }
    return child
  } finally { await log.close() }
}

export function createNativeGateway(source) {
  const entries = new Map()
  const reloads = new Map()
  let closed = false
  const inspect = runtimeCompanion(source, './live_aiwata_host_ticket.py', '本机网关',
    ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }) => ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }))
  const prepareModel = runtimeCompanion(source, './live_aiwata_model_scope.py', '模型授权', undefined, undefined,
    (root, client, python, args) => nativeProcess(root, client, python, { bridgeScript: args.at(-1) }))

  async function ensure(client) {
    if (closed) throw new Error('本机联调已结束。')
    const previous = entries.get(client.home)
    if (previous?.ready) return previous.ready
    if (running(previous?.child)) return previous.child
    const entry = {}
    entries.set(client.home, entry)
    entry.ready = (async () => {
      const initial = await inspect(client, { profileHome: client.home }, () => !closed)
      if (initial.state !== 'absent') throw new Error('此数据目录已有网关，无法确认它属于本次本机联调。')
      const root = await realpath(source)
      if (closed) throw new Error('本机联调已结束。')
      entry.child = await spawnGateway(root, client)
      if (closed) { entry.child.kill(); throw new Error('本机联调已结束。') }
      const deadline = Date.now() + 35000
      while (running(entry.child) && Date.now() < deadline && !closed) {
        const receipt = await inspect(client, { profileHome: client.home, expectedPid: entry.child.pid }, () => !closed)
        if (receipt.state === 'ready' && ownedGateway(client.home, entry.child, receipt)) return entry.child
        if (receipt.state === 'foreign') break
        await delay(450)
      }
      if (running(entry.child)) entry.child.kill()
      throw new Error('无法确认原生 AIWATA 网关已启动。请检查此账号的 native-gateway.log。')
    })().finally(() => { entry.ready = null })
    return entry.ready
  }

  async function reloadGateway(client, profileHome, stillSignedIn) {
    const child = await ensure(client)
    const receipt = await inspect(client, { profileHome, expectedPid: child.pid, reload: true }, stillSignedIn)
    // An accepted pause can terminate the old process before the companion returns.
    if (receipt.ownerHome !== client.home || receipt.ownerPid !== child.pid || !receipt.reloaded) {
      throw new Error('当前账号的本机网关未确认重载。')
    }
    if (profileHome !== client.home) return
    const deadline = Date.now() + 35000
    while (running(child) && Date.now() < deadline && !closed) await delay(250)
    if (running(child)) throw new Error('当前账号的网关仍在退出，请稍后重新连接。')
    const replacement = await ensure(client)
    const current = await inspect(client, { profileHome, expectedPid: replacement.pid }, () => !closed)
    if (!ownedGateway(client.home, replacement, current) || current.instance === receipt.instance) {
      throw new Error('无法确认当前账号的新网关已就绪。')
    }
  }

  async function connectionGateway(client) {
    if (client.accountHome) client = { ...client, home: client.accountHome }
    await reloads.get(client.home)?.catch(() => {})
    return ensure(client)
  }

  return {
    async relayOwner(client, stillSignedIn) {
      const child = await connectionGateway(client)
      if (!stillSignedIn() || !running(child)) throw new Error('当前账号的网关未就绪。')
      return child.pid
    },
    async terminal(client, cwd, cols, rows, signedIn) {
      if (closed) throw new Error('当前桌面宿主已关闭。')
      const root = await realpath(source)
      const launch = await nativeProcess(root, client, null, { terminal: [cwd, String(cols), String(rows)] })
      if (closed || !signedIn()) throw new Error('已退出当前工作区。')
      return spawn(launch.executable, launch.args, { cwd: root, env: launch.env, stdio: ['pipe', 'pipe', 'ignore'] })
    },
    async prepareProfile(client, profileHome, stillSignedIn) {
      const child = await connectionGateway(client)
      await prepareModel(client, { profileHome }, stillSignedIn)
      const receipt = await inspect(client, { profileHome, expectedPid: child.pid, serve: true }, stillSignedIn)
      if (!stillSignedIn() || !ownedGateway(client.home, child, receipt) || !receipt.served) {
        throw new Error('Bot 配置已保存，本机网关尚未确认就绪。请稍后重试。')
      }
    },
    async reload(client, profileHome, stillSignedIn) {
      const prior = reloads.get(client.home) ?? Promise.resolve()
      const pending = prior.catch(() => {}).then(() => {
        if (!stillSignedIn()) throw new Error('已退出当前工作区。')
        return reloadGateway(client, profileHome, stillSignedIn)
      })
      reloads.set(client.home, pending)
      try { await pending }
      finally { if (reloads.get(client.home) === pending) reloads.delete(client.home) }
    },
    async wrap(root, client, python, args) {
      const child = await connectionGateway(client)
      const owner = client.accountHome ? { ...client, home: client.accountHome } : client
      const receipt = await inspect(owner, { profileHome: client.home, expectedPid: child.pid }, () => !closed)
      if (!ownedGateway(owner.home, child, receipt)) throw new Error('无法确认当前账号的本机网关。')
      const endpoint = new URL(receipt.origin)
      if (endpoint.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname) || !endpoint.port) {
        throw new Error('本机网关没有可用的本机任务端口。')
      }
      return nativeProcess(root, client, python, { bridgeScript: args.at(-1), gatewayPort: endpoint.port })
    },
    async withoutModelSource(root, client, python, args) {
      if (closed) throw new Error('本机联调已结束。')
      return nativeProcess(root, client, python, { bridgeScript: args.at(-1), useModelSource: false })
    },
    async ticket(client, profileHome, stillSignedIn) {
      const child = await connectionGateway(client)
      const receipt = await inspect(client, { profileHome, expectedPid: child.pid, ticket: true }, stillSignedIn)
      if (!stillSignedIn() || !ownedGateway(client.home, child, receipt) || !receipt.target) {
        throw new Error('未能从当前账号的本机网关取得连接。')
      }
      return receipt.target
    },
    async httpTicket(client, profileHome, stillSignedIn) {
      const child = await connectionGateway(client)
      const receipt = await inspect(client, { profileHome, expectedPid: child.pid, nativeHttp: true }, stillSignedIn)
      if (!stillSignedIn() || !ownedGateway(client.home, child, receipt) || !receipt.target) {
        throw new Error('未能从当前账号的原生网关取得接口授权。')
      }
      return receipt.target
    },
    close() {
      closed = true
      for (const { child } of entries.values()) {
        if (running(child)) child.kill()
      }
    },
  }
}
