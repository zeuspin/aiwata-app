import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { transform } from 'esbuild'

// Explicit source snapshot; runtime never imports the sibling frontend.
const root = resolve(process.argv[2] || '../aiwata')
const revision = '6631a6af2c58fc498ef01fa5cc4b222fc8682683'
const output = new URL('../src/vendor/aiwata-tour/', import.meta.url)
await mkdir(output, { recursive: true })
const files = []
for (const name of ['engine', 'collect-targets']) {
  const path = `apps/desktop/src/lib/tour/${name}.ts`
  const source = execFileSync('git', ['-C', root, 'show', `${revision}:${path}`], { encoding: 'utf8' })
  const { code } = await transform(source, { loader: 'ts', target: 'es2022', format: 'esm' })
  await writeFile(new URL(name + '.mjs', output), '// Native AIWATA source; see provenance.json.\n' + code)
  files.push({ path, sha256: createHash('sha256').update(source).digest('hex') })
}
const driverRoot = resolve(root, 'apps/desktop/node_modules/driver.js')
const version = JSON.parse(await readFile(resolve(driverRoot, 'package.json'), 'utf8')).version
for (const name of ['driver.js.mjs', 'driver.js.iife.js', 'driver.css']) {
  const contents = await readFile(resolve(driverRoot, 'dist', name))
  await writeFile(new URL(name, output), contents)
  files.push({ path: `driver.js@${version}/dist/${name}`, sha256: createHash('sha256').update(contents).digest('hex') })
}
await writeFile(new URL('DRIVER-LICENSE', output), await readFile(resolve(driverRoot, 'license')))
await writeFile(new URL('LICENSE', output), execFileSync('git', ['-C', root, 'show', `${revision}:LICENSE`]))
await writeFile(new URL('provenance.json', output), JSON.stringify({ revision, driverVersion: version, adaptations: 'TypeScript erasure only; host wiring outside vendored modules.', files }, null, 2)+'\n')
