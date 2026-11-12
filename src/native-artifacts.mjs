function unquote(value) {
  return value.length > 1 && ['"', "'", '`'].includes(value[0]) && value.at(-1) === value[0] ? value.slice(1, -1) : value
}

export function nativeArtifactPath(target) {
  if (typeof target !== 'string' || !target || /[\p{Cc}]/u.test(target)) throw new Error('产物文件路径无效。')
  let path = target
  if (path.startsWith('#media:')) path = decodeURIComponent(path.slice(7))
  if (/^file:/i.test(path)) {
    const url = new URL(path)
    if (url.hostname && url.hostname !== 'localhost') throw new Error('产物文件路径不属于本机。')
    path = decodeURIComponent(url.pathname)
  } else if (/^[a-z][\w+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) throw new Error('产物必须是原生文件路径。')
  if (!path || /[\p{Cc}]/u.test(path) || path.startsWith('//')) throw new Error('产物文件路径无效。')
  return path
}

export function resolvedArtifactPath(target, cwd) {
  const path = nativeArtifactPath(target)
  if (path.startsWith('~/') || /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\')) return path
  const absolute = path.startsWith('/') ? path : cwd ? cwd.replace(/\/$/, '') + '/' + path : null
  if (!absolute) throw new Error('此会话没有可解析相对文件的工作目录。')
  const parts = []
  for (const part of absolute.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop(); else parts.push(part)
  }
  return '/' + parts.join('/')
}

function artifactBlob(response) {
  if (response && typeof response !== 'string' && response.error) throw new Error(response.message || response.error)
  const data = typeof response === 'string' ? response : response?.dataUrl
  const match = /^data:([^;,]*)(?:;[^,]*)?;base64,([\s\S]*)$/i.exec(data || '')
  if (!match) throw new Error('原生文件读取未返回可预览的文件。')
  let bytes
  try { bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0)) } catch { throw new Error('原生文件内容无效。') }
  return new Blob([bytes], { type: match[1] || 'application/octet-stream' })
}

export function createNativeArtifactReader({ rpc, api, host, route, check = () => {} }) {
  const owner = Object.freeze({ ...route })
  return async (session, target, signal, { foregroundUserClick = false } = {}) => {
    const current = () => { check(); signal?.throwIfAborted() }
    current()
    if (!foregroundUserClick) throw new Error('请点击会话中的产物或附件后读取。')
    if (typeof session !== 'string' || !session.trim()) throw new Error('缺少产物所属会话。')
    const path = nativeArtifactPath(target)
    const snapshot = await rpc('session.resume', { session_id: session, omit_messages: true })
    current()
    const connection = await host?.getConnectionFor?.(owner)
    current()
    let response
    if (connection?.mode === 'local' && host?.readFileDataUrl) {
      let localPath = resolvedArtifactPath(path, snapshot.info?.cwd)
      if (host.normalizePreviewTarget) {
        const normalized = await host.normalizePreviewTarget(path, snapshot.info?.cwd || undefined)
        current()
        if (normalized?.kind !== 'file' || !normalized.path || normalized.previewKind === 'directory' || normalized.previewKind === 'missing') throw new Error('此产物文件已不存在或无法预览。')
        localPath = normalized.path
      }
      response = await host.readFileDataUrl(localPath)
    } else {
      response = await api('/api/fs/read-data-url?path=' + encodeURIComponent(path) + '&session_id=' + encodeURIComponent(session), { signal })
    }
    current()
    return artifactBlob(response)
  }
}

export function extractNativeAttachments(text) {
  const refs = []
  const add = (kind, raw) => {
    const nativePath = unquote(raw.trim())
    try { nativeArtifactPath(nativePath) } catch { return false }
    refs.push({ kind: kind === 'image' ? 'image' : 'file', nativePath })
    return true
  }
  let body = text
  const suffix = /\n\n((?:\[Image attached(?: at)?: [^\n]+\]\n)+)((?:\[screenshot\](?:\n|$))+)$/.exec(body)
  if (suffix) {
    const paths = [...suffix[1].matchAll(/^\[Image attached(?: at)?: (.+)\]$/gm)].map(row => row[1])
    if (paths.length === suffix[2].split('[screenshot]').length - 1 && paths.every(path => { try { nativeArtifactPath(path); return true } catch { return false } })) {
      paths.forEach(path => add('image', path)); body = body.slice(0, suffix.index)
    }
  }
  body = body.replace(/^@image:([^\n]*)\n?/gm, (line, path) => add('image', path) ? '' : line)
  const imageRefs = refs.splice(0)
  const lines = body.split('\n')
  while (lines.length) {
    const match = /^@file:("[^"\n]+"|'[^'\n]+'|`[^`\n]+`|\S+)\s*$/.exec(lines[0])
    if (!match || !add('file', match[1])) break
    lines.shift()
  }
  body = lines.join('\n')
  refs.push(...imageRefs)
  if (refs.some(row => row.kind === 'image')) body = body.replace(/^\[screenshot\]\n?/gm, '')
  const attachments = [], attachmentDetails = Object.create(null)
  for (const ref of refs) {
    if (Object.values(attachmentDetails).some(row => row.nativePath === ref.nativePath)) continue
    const basename = nativeArtifactPath(ref.nativePath).split(/[\\/]/).at(-1) || '附件'
    let name = basename, index = 2
    while (Object.hasOwn(attachmentDetails, name)) name = basename + ' (' + index++ + ')'
    attachments.push(name); attachmentDetails[name] = { ...ref, name }
  }
  return attachments.length ? { text: body.trim(), attachments, attachmentDetails } : { text }
}

export async function readPreviewAttachment({ api, live, chatId, sessionId, entry, signal }) {
  signal?.throwIfAborted()
  const file = entry.roomAttachment ? await live.downloadRoom(chatId, entry)
    : entry.blobId ? await api.readLocalAttachment(chatId, entry.blobId)
      : entry.nativePath ? await live.readArtifact(sessionId, entry.nativePath, signal, { foregroundUserClick: true }) : null
  signal?.throwIfAborted()
  if (!file) throw new Error('当前无法读取原文件。')
  return file
}
