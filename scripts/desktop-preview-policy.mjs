import { webPreviewAddress } from '../src/web-preview.mjs'

const localHosts = new Set(['127.0.0.1', '[::1]', 'localhost'])
export function previewLocalOrigins(config, account, workbenchOrigin) {
  const entries = config[account] ?? []
  if (!Array.isArray(entries)) throw new Error('本地网页预览地址必须按账号提供。')
  const workbenchPort = new URL(workbenchOrigin).port
  return new Set(entries.map(value => {
    const address = webPreviewAddress(value)
    const url = address && new URL(address)
    if (!url || !localHosts.has(url.hostname) || url.href !== url.origin + '/' || url.port === workbenchPort) {
      throw new Error('本地预览需要单独的本机服务来源。')
    }
    return url.origin
  }))
}

// Native desktop navigation supports local development and LAN pages. Account
// scope lives in the browsing partition and trusted IPC, not a separate DNS sandbox.
export async function previewRequestAllowed(value) {
  return Boolean(webPreviewAddress(value))
}

function bundledDevToolsRequest(details, ownsDevToolsContents) {
  try {
    const url = new URL(details.url)
    return url.protocol === 'devtools:' && url.hostname === 'devtools' && !url.username && !url.password && !url.port &&
      url.pathname.startsWith('/bundled/') && !/%(?:2f|5c)/i.test(url.pathname) && !url.pathname.includes('\\') &&
      Number.isSafeInteger(details.webContentsId) && details.webContentsId > 0 && ownsDevToolsContents(details.webContentsId)
  } catch { return false }
}

export function configurePreviewSession(browsing, localOrigins, active, ownsDevToolsContents = () => false) {
  browsing.setPermissionCheckHandler(() => false)
  browsing.setPermissionRequestHandler((_contents, _permission, reply) => reply(false))
  browsing.webRequest.onBeforeRequest((details, reply) => {
    // Chromium's bundled frontend is local application chrome. Only the actual
    // DevTools webContents of a live guest may load it; guest pages cannot.
    if (active() && bundledDevToolsRequest(details, ownsDevToolsContents)) {
      reply({ cancel: false })
      return
    }
    const url = details.url.replace(/^ws(s?):/i, 'http$1:')
    void previewRequestAllowed(url).then(allowed => reply({ cancel: !active() || !allowed }))
  })
  return browsing.setProxy({ mode: 'system' })
}
