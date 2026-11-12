import test from 'node:test'
import assert from 'node:assert/strict'

test('native host separates Profile data from the installation tool store and preserves OS home', async () => {
  const m = await import('../scripts/live-aiwata-host.mjs').catch(() => ({}))
  assert.equal(typeof m.nativeHostEnvironment, 'function')
  const env = m.nativeHostEnvironment('/data/lin/runtime/profiles/bot', '/install/tools', {
    HOME: '/Users/owner', PATH: '/usr/bin:/custom/bin', LANG: 'zh_CN.UTF-8', SHELL: '/bin/zsh',
    GLM_API_KEY: 'other-profile-secret', TELEGRAM_BOT_TOKEN: 'other-profile-channel',
    HERMES_HOME: '/foreign', HERMES_RUNTIME_DIR: '/foreign/tools', PYTHONPATH: '/foreign/python',
  })
  assert.equal(env.HOME, '/Users/owner')
  assert.equal(env.HERMES_HOME, '/data/lin/runtime/profiles/bot')
  assert.equal(env.AIWATA_HOME, '/data/lin/runtime/profiles/bot')
  assert.equal(env.HERMES_RUNTIME_DIR, '/install/tools')
  assert.equal(env.PATH, '/usr/bin:/custom/bin')
  for (const key of ['GLM_API_KEY', 'TELEGRAM_BOT_TOKEN', 'PYTHONPATH']) assert.equal(env[key], undefined)
})

test('two native account environments never reuse another account Profile binding', async () => {
  const m = await import('../scripts/live-aiwata-host.mjs').catch(() => ({}))
  assert.equal(typeof m.nativeHostEnvironment, 'function')
  const lin = m.nativeHostEnvironment('/data/lin/runtime', '/install/tools', { HOME: '/host' })
  const qiao = m.nativeHostEnvironment('/data/qiao/runtime', '/install/tools', lin)
  assert.equal(qiao.HERMES_HOME, '/data/qiao/runtime')
  assert.equal(qiao.HOME, '/host')
  assert.equal(qiao.HERMES_RUNTIME_DIR, lin.HERMES_RUNTIME_DIR)
})

test('installation discovery uses the native launcher and PM store instead of a branded default home', async () => {
  const { nativeInstallation } = await import('../scripts/live-aiwata-runtime.mjs')
  assert.equal(typeof nativeInstallation, 'function')
  const { fileURLToPath } = await import('node:url')
  const { stat } = await import('node:fs/promises')
  const installation = await nativeInstallation((process.env.AIWATA_TEST_INSTALLED_SOURCE || fileURLToPath(new URL('../../aiwata', import.meta.url))))
  assert.equal((await stat(installation.python)).isFile(), true)
  assert.equal((await stat(installation.dependencies)).isDirectory(), true)
  assert.equal((await stat(installation.toolStore)).isDirectory(), true)
  assert.match(installation.dependencies, /[/\\]installs[/\\][0-9a-f]{16}$/)
})

test('native PTY starts with installed dependencies and returns real shell output', { timeout: 15000 }, async t => {
  const { nativeInstallation } = await import('../scripts/live-aiwata-runtime.mjs')
  const { createNativeGateway } = await import('../scripts/live-aiwata-host.mjs')
  const { fileURLToPath } = await import('node:url')
  const { mkdtemp, mkdir, symlink, rm } = await import('node:fs/promises')
  const { join, basename } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { createInterface } = await import('node:readline')
  const source = (process.env.AIWATA_TEST_INSTALLED_SOURCE || fileURLToPath(new URL('../../aiwata', import.meta.url)))
  const installation = await nativeInstallation(source)
  const directory = await mkdtemp(join(tmpdir(), 'aiwata-native-pty-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'installs'))
  await symlink(installation.dependencies, join(directory, 'installs', basename(installation.dependencies)), 'dir')
  const host = createNativeGateway(source)
  const child = await host.terminal({ ...installation, home: directory }, directory, 80, 24, () => true)
  t.after(() => { child.stdin.end(); child.kill(); host.close() })
  let output = ''
  await new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => {
      const frame = JSON.parse(line)
      if (frame.type === 'ready') child.stdin.write(JSON.stringify({ action: 'write', data: "printf 'NATIVE_%s\\n' PTY_OK\n" })+'\n')
      if (frame.type === 'output') {
        output += Buffer.from(frame.data, 'base64').toString()
        if (output.includes('NATIVE_PTY_OK')) resolve()
      }
      if (frame.type === 'error') reject(new Error(frame.message))
    })
    child.once('error', reject)
    child.once('close', () => { if (!output.includes('NATIVE_PTY_OK')) reject(new Error('Native PTY exited before returning shell output')) })
  })
  assert.match(output, /NATIVE_PTY_OK/)
})

test('native companions retain pinned Profile and tool store after a legacy environment filter', async t => {
  const { nativeInstallation, runtimeCompanion } = await import('../scripts/live-aiwata-runtime.mjs')
  const { fileURLToPath, pathToFileURL } = await import('node:url')
  const { mkdtemp, mkdir, symlink, writeFile, rm } = await import('node:fs/promises')
  const { join, basename } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const source = (process.env.AIWATA_TEST_INSTALLED_SOURCE || fileURLToPath(new URL('../../aiwata', import.meta.url)))
  const installation = await nativeInstallation(source)
  const home = await mkdtemp(join(tmpdir(), 'aiwata-companion-scope-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, 'installs'))
  await symlink(installation.dependencies, join(home, 'installs', basename(installation.dependencies)), 'dir')
  const script = join(home, 'scope.py')
  await writeFile(script, 'import os,json\nprint(json.dumps({"result": {key:os.environ.get(key) for key in ["HERMES_HOME","HERMES_RUNTIME_DIR"]}}))\n')
  const call = runtimeCompanion(source, pathToFileURL(script).href, 'scope fixture', ({HOME,PATH,HERMES_HOME}) => ({HOME,PATH,HERMES_HOME}))
  assert.deepEqual(await call({ ...installation, home, workspace: home }, {}, () => true), {
    HERMES_HOME: home, HERMES_RUNTIME_DIR: installation.toolStore,
  })
})
