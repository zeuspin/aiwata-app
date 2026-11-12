import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { nativeInstallation } from '../scripts/live-aiwata-runtime.mjs'

const run = promisify(execFile)

test('the installed AIWATA keeps workbench model authorization inside the account and out of tool environments', async t => {
  const source = await realpath(process.env.AIWATA_TEST_INSTALLED_SOURCE || process.env.AIWATA_APP_SOURCE || fileURLToPath(new URL('../../aiwata', import.meta.url)))
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'aiwata-native-model-test-')))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const home = join(directory, 'runtime')
  await mkdir(join(home, 'installs'), { recursive: true })
  const key = createHash('sha256').update(source).digest('hex').slice(0, 16)
  const installation = await nativeInstallation(source, process.env.AIWATA_APP_INSTALL_HOME)
  await symlink(installation.dependencies, join(home, 'installs', key), 'dir')
  const modelKeys = ['GLM_API_KEY', 'ZAI_API_KEY', 'Z_AI_API_KEY']
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !modelKeys.includes(name))),
    AIWATA_HOME: home, HERMES_HOME: home, HERMES_RUNTIME_DIR: installation.toolStore, HERMES_MANAGED_DIR: join(directory, 'no-managed-config'),
  }
  const { stdout } = await run(resolve(source, 'aiwata'), ['--print-runtime-command'], { env, timeout: 8000 })
  const [python] = JSON.parse(stdout)
  const bootstrap = 'import runpy,sys;sys.path.insert(0,sys.argv[1]);import hermes_bootstrap;runpy.run_path(sys.argv[2],run_name="__main__")'
  const script = fileURLToPath(new URL('./live-model-scope.test.py', import.meta.url))
  try {
    const result = await run(python, ['-I', '-B', '-c', bootstrap, source, script], { env, timeout: 25000 })
    assert.match(result.stderr, /Ran 9 tests/)
    assert.match(result.stderr, /\nOK\s*$/)
  } catch (error) {
    assert.fail(error.stderr || error.message)
  }
})
