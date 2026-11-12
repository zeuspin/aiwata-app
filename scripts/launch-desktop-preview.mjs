import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const electron = process.env.AIWATA_APP_ELECTRON ||
  resolve(process.env.AIWATA_APP_SOURCE || '../aiwata', 'apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
try { await access(electron) }
catch { throw new Error('找不到已安装的 Electron，请用 AIWATA_APP_ELECTRON 指定可执行文件。') }

const entry = fileURLToPath(new URL('./desktop-preview.mjs', import.meta.url))
const child = spawn(electron, [entry], { stdio: 'inherit' })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
