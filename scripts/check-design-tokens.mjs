import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { designTokens } from '../src/design/aiwata-tokens.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export function verifyDesignTokens({ core = resolve(root, '../aiwata') } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'src/design/aiwata-tokens.manifest.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.tokenCount !== Object.keys(designTokens).length) throw Error('Invalid design token manifest')
  for (const [path, expected] of Object.entries(manifest.artifacts)) {
    const actual = createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')
    if (actual !== expected) throw Error(`Stale design artifact: ${path}`)
  }
  for (const path of manifest.inlineSources) {
    const text = readFileSync(resolve(root, path), 'utf8')
    for (const [, name, value] of text.matchAll(/\/\* @ai-token ([a-z0-9.-]+) \*\/\s*("(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?)/g)) {
      if (String(JSON.parse(value)) !== designTokens[name]) throw Error(`Stale inline design token: ${path}: ${name}`)
    }
  }
  for (const path of manifest.querySources) {
    const text = readFileSync(resolve(root, path), 'utf8')
    for (const [, name, value] of text.matchAll(/\/\* @ai-query ([a-z0-9.-]+) \*\/\s*([^{};]+)(?=[{;])/g)) {
      if (value.trim() !== designTokens[name]) throw Error(`Stale design query: ${path}: ${name}`)
    }
  }
  for (const path of manifest.htmlSources || []) {
    const html = readFileSync(resolve(root, path), 'utf8')
    for (const [, name, value] of html.matchAll(/<!-- @ai-meta ([a-z0-9.-]+) -->\s*<meta name="theme-color" content="([^"]*)"/g)) {
      if (value !== designTokens[name]) throw Error(`Stale HTML design token: ${path}: ${name}`)
    }
  }
  const generator = resolve(core, 'scripts/build/design-tokens.mjs')
  if (existsSync(generator)) {
    const result = spawnSync(process.execPath, [generator, '--check', '--frontend', root], { cwd: core, encoding: 'utf8' })
    if (result.status !== 0) throw Error(result.stderr || result.stdout || 'Shared design token check failed')
  }
  return manifest.tokenCount
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Checked ${verifyDesignTokens({ core: process.env.AIWATA_APP_SOURCE || resolve(root, '../aiwata') })} design tokens`)
}
