import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Load from the selected core only in native builds. Browser/Sites previews
// must not acquire a dependency on the core checkout or its renderer packages.
export async function nativeAuxiliaryBuild(core, frontend) {
  const desktop = resolve(core, 'apps/desktop')
  const requireCore = createRequire(join(desktop, 'package.json'))
  const { default: tailwindcss } = await import(pathToFileURL(requireCore.resolve('@tailwindcss/vite')).href)
  const react = dirname(requireCore.resolve('react/package.json'))
  const reactDom = dirname(requireCore.resolve('react-dom/package.json'))
  const driver = dirname(requireCore.resolve('driver.js'))
  const stylesheet = join(desktop, 'src/styles.css')
  const files = new Map()
  const publicRoot = join(desktop, 'public')
  for (const entry of readdirSync(publicRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = join(entry.parentPath, entry.name)
    const name = relative(publicRoot, file).split('\\').join('/')
    if (!existsSync(join(frontend, 'public', name))) files.set(name, file)
  }
  const emoji = dirname(requireCore.resolve('emojibase-data/package.json'))
  for (const name of ['data.json', 'messages.json', 'shortcodes/emojibase.json']) {
    files.set('emojibase/en/' + name, join(emoji, 'en', name))
  }
  const types = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' }
  return {
    fsAllow: [join(desktop, 'node_modules'), join(core, 'node_modules')].filter(existsSync).map(file => realpathSync(file)),
    // Keep markdown's mutually dependent ESM modules in Rollup's natural graph.
    // Splitting property-information from hastscript creates a TDZ at startup.
    // Mirror the remaining dependency families without allowing a
    // lazy highlighter/diagram chunk to absorb the auxiliary app entry.
    output: {
      onlyExplicitManualChunks: true,
      manualChunks(id) {
        const groups = [
          ['native-react', /node_modules[\\/](react|react-dom|scheduler|react-router|@tanstack[\\/]react-query)[\\/]/],
          ['native-util', /node_modules[\\/](lodash-es|es-toolkit|dayjs|d3-array|d3-color|d3-force|d3-interpolate|d3-time[^\\/]*|dompurify)[\\/]/],
          ['native-shiki', /node_modules[\\/](shiki|@shikijs|react-shiki|@streamdown[\\/]code|oniguruma-to-es|oniguruma-parser|regex(-[^\\/]+)?)[\\/]/],
          ['native-katex', /node_modules[\\/]katex[\\/]/],
        ]
        return groups.find(([, pattern]) => pattern.test(id))?.[0]
      },
    },
    alias: {
      '#native-auxiliary': join(desktop, 'src/entry.ts'),
      '@/debug/dev-only': join(desktop, 'src/debug/dev-only.noop.ts'),
      '@hermes/plugin-sdk': join(desktop, 'src/sdk/index.ts'),
      '@hermes/shared/billing': resolve(core, 'apps/shared/src/billing-types.ts'),
      '@hermes/shared/color': resolve(core, 'apps/shared/src/color.ts'),
      'driver.js/dist/driver.js.iife.js?raw': join(driver, 'driver.js.iife.js') + '?raw',
      'driver.js/dist/driver.js.iife.js': join(driver, 'driver.js.iife.js'),
      react,
      'react-dom': reactDom,
      'react-router': dirname(requireCore.resolve('react-router/package.json')),
      '@tanstack/react-query': dirname(requireCore.resolve('@tanstack/react-query/package.json')),
      'react/jsx-dev-runtime': join(react, 'jsx-dev-runtime.js'),
      'react/jsx-runtime': join(react, 'jsx-runtime.js'),
    },
    plugins: [{
      name: 'aiwata-native-auxiliary-assets',
      enforce: 'pre',
      transform(code, id) {
        if (id === stylesheet) return code + '\n@source "' + join(desktop, 'src').split('\\').join('/') + '";\n'
      },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const name = new URL(request.url, 'http://localhost').pathname.slice(1)
          const file = files.get(name)
          if (!file) return next()
          const extension = name.slice(name.lastIndexOf('.'))
          response.setHeader('Content-Type', types[extension] || 'application/octet-stream')
          response.end(readFileSync(file))
        })
      },
      generateBundle() {
        for (const [fileName, file] of files) this.emitFile({ type: 'asset', fileName, source: readFileSync(file) })
      },
    }, ...tailwindcss()],
  }
}
