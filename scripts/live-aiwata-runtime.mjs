import { execFile } from 'node:child_process'
import { access,realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const bootstrap = 'import runpy, sys; sys.path.insert(0, sys.argv[1]); import hermes_bootstrap; runpy.run_path(sys.argv[2], run_name="__main__")'

// Ask the installed launcher and PM; never install or guess ~/.aiwata versus ~/.hermes.
export async function nativeInstallation(source, installHome) {
  const root = await realpath(source)
  try{await access(resolve(root,'.hermes/bin/hermes'),constants.X_OK)}
  catch{throw new Error('此源码尚未注册已安装的 AIWATA 环境；只读发现不会自动安装。')}
  const env = Object.fromEntries(['HOME', 'USERPROFILE', 'PATH', 'SystemRoot', 'SYSTEMROOT', 'LANG', 'TMPDIR', 'TEMP']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]))
  const { stdout } = await run(resolve(root, 'aiwata'), ['--print-runtime-command'], { cwd: root, env, timeout: 8000 })
  const [python] = JSON.parse(stdout)
  const code = 'import sys,json;from pathlib import Path;sys.path.insert(0,sys.argv[1]);import hermes_bootstrap;from pm.environments import store_root,install_key,owning_home_root,install_state_dir;root=Path(sys.argv[1]);store=store_root(root,honor_runtime_override=False);owner=owning_home_root(root);state=owner/"installs"/install_key(root) if owner else install_state_dir(root);print(json.dumps({"store":str(store),"state":str(state),"key":install_key(root)}))'
  const result = await run(python, ['-I', '-B', '-c', code, root], { cwd: root, env, timeout: 8000 })
  const { store, state, key } = JSON.parse(result.stdout.trim())
  return { python: await realpath(python), toolStore: await realpath(installHome ? resolve(installHome, 'tools') : store),
    dependencies: await realpath(installHome ? resolve(installHome, 'installs', key) : state) }
}

export function nativeHostEnvironment(home, toolStore, ambient = process.env) {
  const keys = ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'SystemRoot', 'COMSPEC',
    'PATH', 'PATHEXT', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SHELL', 'TMPDIR', 'TMP', 'TEMP',
    'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR'];
  return { ...Object.fromEntries(keys.filter(key => typeof ambient[key] === 'string').map(key => [key, ambient[key]])),
    AIWATA_HOME: home, HERMES_HOME: home, HERMES_RUNTIME_DIR: toolStore,
    HERMES_GATEWAY_DETACHED: '1', PYTHONDONTWRITEBYTECODE: '1' }
}


export function profileWriteQueue() {
  const writes = new Map()
  return async (home, operation) => {
    const prior = writes.get(home) ?? Promise.resolve()
    const pending = prior.catch(() => {}).then(operation)
    writes.set(home, pending)
    try { return await pending }
    finally { if (writes.get(home) === pending) writes.delete(home) }
  }
}

export function runtimeCompanion(source, script, label, filterEnv = env => env, maxBuffer = 4 * 1024 * 1024, wrap) {
  const companion = fileURLToPath(new URL(script, import.meta.url))
  return async (client, request, stillSignedIn, timeout = 25000, signal) => {
    const root = await realpath(source)
    const store = client.toolStore ?? (await nativeInstallation(root)).toolStore
    const env = { ...filterEnv(nativeHostEnvironment(client.home, store)),
      AIWATA_HOME: client.home, HERMES_HOME: client.home, HERMES_RUNTIME_DIR: store }
    const { stdout } = await run(resolve(root, 'aiwata'), ['--print-runtime-command'], { cwd: root, env, timeout: 8000, signal })
    const [python] = JSON.parse(stdout)
    const args = ['-I', '-B', '-c', bootstrap, root, companion]
    const launch = await wrap?.(root, client, python, args, request) ?? { executable: python, args, env }
    if (!stillSignedIn() || signal?.aborted) throw new Error('当前工作区请求已结束。')
    return new Promise((resolveResult, reject) => {
      const child = execFile(launch.executable, launch.args, {
        cwd: client.workspace, env: launch.env, timeout, maxBuffer, signal,
      }, (error, output) => {
        try {
          if (error) throw error
          const payload = JSON.parse(output.trimEnd().split('\n').at(-1))
          if (payload.error) return reject(new Error(payload.error))
          resolveResult(payload.result)
        } catch { reject(new Error('无法读取 AIWATA ' + label + '服务响应。')) }
      })
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify(launch.input ? { ...launch.input, request } : request))
    })
  }
}
