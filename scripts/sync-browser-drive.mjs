import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { transform } from 'esbuild'

// Explicit build-time snapshot only: runtime code never imports the sibling checkout.
const upstream = resolve(process.argv[2] || fileURLToPath(new URL('../../aiwata', import.meta.url)))
const revision = process.argv[3] || '6631a6af2c58fc498ef01fa5cc4b222fc8682683'
const commit = execFileSync('git', ['-C', upstream, 'rev-parse', `${revision}^{commit}`], { encoding: 'utf8' }).trim()
const directory = new URL('../src/vendor/aiwata-preview-drive/', import.meta.url)
const modules = ['act-in-page', 'identity', 'naming', 'visibility', 'watch-in-page', 'preview-drive', 'preview-act']
const files = []
await mkdir(directory, { recursive: true })
for (const name of modules) {
  const path = `apps/desktop/src/${name.startsWith('preview-') ? 'app/chat/right-rail' : 'lib/preview-act'}/${name}.ts`
  const original = execFileSync('git', ['-C', upstream, 'show', `${commit}:${path}`], { encoding: 'utf8' })
  let source = original
  const adaptations = []
  if (name === 'preview-act') {
    // Ownership and channel acquisition belong to this host. Keep the native
    // action implementation intact, with explicit per-request channels instead.
    const start = source.indexOf('export async function actOnActivePreview(')
    const end = source.indexOf('async function actWithChannels(', start)
    if (start < 0 || end < 0) throw new Error('Native driver entry point changed; review the snapshot adapter.')
    source = source.slice(0, start) + source.slice(end).replace('async function actWithChannels(', 'export async function actWithChannels(')
    source = source.replace(/^import \{ activePreviewInput.*\n/gm, '').replace(/^import \{ activePreviewNav.*\n/gm, '').replace(/^import \{ activePreviewScriptRunner.*\n/gm, '')
    source = source.replace(/if \(import\.meta\.hot\) \{[\s\S]*$/, '')
    source = source.replace('pointerPlaced()', 'pointerPlaced(input)')
    adaptations.push('Export native actWithChannels; remove upstream store/host entry point and HMR; pass input to per-guest pointer lookup.')
  }
  if (name === 'preview-drive') {
    source = source.replace("import { isMacPlatform } from '@/lib/platform'", "const isMacPlatform = () => process.platform === 'darwin'")
    source = source.replace('let pointer: DrivePoint = { x: 0, y: 0 }\nlet placed = false',
      'const pointers = new WeakMap<object, { point: DrivePoint; placed: boolean }>()\nconst pointerKey = (input: object) => (input as { pointerKey?: object }).pointerKey ?? input\nconst pointerFor = (input: object) => pointers.get(pointerKey(input)) ?? { point: { x: 0, y: 0 }, placed: false }')
    source = source.replace('export function pointerPlaced(): boolean {\n  return placed', 'export function pointerPlaced(input: object): boolean {\n  return pointerFor(input).placed')
    source = source.replace('const from = pointer', 'const from = pointerFor(input).point')
    source = source.replace('pointer = to\n  placed = true', 'pointers.set(pointerKey(input), { point: to, placed: true })')
    source = source.replace(/(export async function (?:clickAt|wheelBy)\([^\n]+\): Promise<void> \{)/g, '$1\n  const pointer = pointerFor(input).point')
    adaptations.push('Resolve platform in native host; scope pointer state to input handle with WeakMap instead of module-global pointer.')
  }
  source = source.replaceAll("'@/lib/preview-act/act-in-page'", "'./act-in-page'").replaceAll("'@/lib/preview-act/watch-in-page'", "'./watch-in-page'")
  const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022', legalComments: 'inline' })
  const output = `// Generated from AIWATA ${commit}:${path}; run node scripts/sync-browser-drive.mjs to update.\n` +
    code.replace(/from "\.\/(\w[\w-]*)"/g, 'from "./$1.mjs"')
  await writeFile(new URL(`${name}.mjs`, directory), output)
  files.push({ path, sourceSha256: createHash('sha256').update(original).digest('hex'), output: `${name}.mjs`, outputSha256: createHash('sha256').update(output).digest('hex'), ...(adaptations.length ? { adaptations } : {}) })
}
const license = execFileSync('git', ['-C', upstream, 'show', `${commit}:LICENSE`], { encoding: 'utf8' })
await writeFile(new URL('LICENSE.upstream.txt', directory), license)
await writeFile(new URL('provenance.json', directory), JSON.stringify({ repository: 'zeuspin/aiwata', commit, license: { path: 'LICENSE.upstream.txt', sha256: createHash('sha256').update(license).digest('hex') }, modules: files, sync: 'node scripts/sync-browser-drive.mjs [upstream-checkout] [commit]' }, null, 2) + '\n')
console.log(`Snapshotted ${files.length} AIWATA browser drive modules at ${commit}.`)
