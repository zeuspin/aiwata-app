import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { transform } from 'esbuild'

// Explicit build-time snapshot only. Runtime code does not read sibling trees.
const upstream = resolve(process.argv[2] || fileURLToPath(new URL('../../aiwata', import.meta.url)))
const revision = process.argv[3] || '6631a6af2c58fc498ef01fa5cc4b222fc8682683'
const commit = execFileSync('git', ['-C', upstream, 'rev-parse', `${revision}^{commit}`], { encoding: 'utf8' }).trim()
const directory = new URL('./vendor/aiwata-window/', import.meta.url)
const files = []
await mkdir(directory, { recursive: true })
for (const name of ['window-below', 'hyprland']) {
  const path = `apps/desktop/electron/${name}.ts`
  const source = execFileSync('git', ['-C', upstream, 'show', `${commit}:${path}`], { encoding: 'utf8' })
  const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022', legalComments: 'inline' })
  const output = `// Generated from AIWATA ${commit}:${path}; run node scripts/sync-desktop-window.mjs to update.\n` +
    code.replace(/from "\.\/(\w[\w-]*)"/g, 'from "./$1.mjs"')
  await writeFile(new URL(`${name}.mjs`, directory), output)
  files.push({ path, sourceSha256: createHash('sha256').update(source).digest('hex'), output: `${name}.mjs`, outputSha256: createHash('sha256').update(output).digest('hex') })
}
const manifest = JSON.parse(execFileSync('git', ['-C', upstream, 'show', `${commit}:apps/desktop/package.json`], { encoding: 'utf8' }))
const version = manifest.optionalDependencies?.['get-windows'] ?? manifest.dependencies?.['get-windows']
if (!version) throw new Error('Pinned native window provider dependency is missing; review the snapshot.')
const license = execFileSync('git', ['-C', upstream, 'show', `${commit}:LICENSE`], { encoding: 'utf8' })
await writeFile(new URL('LICENSE.upstream.txt', directory), license)
await writeFile(new URL('provenance.json', directory), JSON.stringify({ repository: 'zeuspin/aiwata', commit,
  license: { path: 'LICENSE.upstream.txt', sha256: createHash('sha256').update(license).digest('hex') },
  modules: files, dependencies: { 'get-windows': version },
  sync: 'node scripts/sync-desktop-window.mjs [upstream-checkout] [commit]',
}, null, 2) + '\n')
console.log(`Snapshotted ${files.length} AIWATA native window modules at ${commit} (get-windows ${version}).`)
