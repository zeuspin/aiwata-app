import { createHash } from 'node:crypto'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { artifactReference } from '../src/file-previews.mjs'

export function validParts(parts) {
  return Array.isArray(parts) && parts.length <= 40 && parts.every(part =>
    typeof part === 'string' && part && part !== '.' && part !== '..' &&
    Buffer.byteLength(part) <= 255 && !/[/\\\p{Cc}]/u.test(part))
}

export const validFileSession = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
export const validFileRoot = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)

export function fileRequest(input) {
  const { action, session_id, root, parts, target } = input ?? {}
  if (!validFileSession(session_id)) throw new Error('文件请求无效。')
  if (action === 'locate') {
    if (Object.keys(input).some(key => !['action', 'session_id', 'target'].includes(key)) || !artifactReference({ url: target })) {
      throw new Error('此预览目标不是可用的项目文件。')
    }
    return input
  }
  if (Object.keys(input).some(key => !['action', 'session_id', 'root', 'parts'].includes(key)) ||
      !['list', 'preview', 'read'].includes(action) || !validParts(parts) ||
      (root === undefined ? action !== 'list' || parts.length > 0 : !validFileRoot(root)) ||
      (action !== 'list' && parts.length === 0)) {
    throw new Error('文件请求无效。')
  }
  return input
}

export function contains(root, path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) return false
  const tail = relative(root, path)
  return tail !== '..' && !tail.startsWith('..' + sep) && !isAbsolute(tail)
}

export async function sessionFileScope(client, connection, sessionDirectory, id) {
  const cwd = await sessionDirectory(client.home, id)
  if (!cwd) throw new Error('当前用户没有这条可用的会话。')
  const { projects } = await connection.call('projects.list', {})
  return { cwd, roots: projectFileRoots(client.workspace, cwd, projects) }
}

export function projectFileRoots(workspace, cwd, projects) {
  if (!contains(cwd, cwd)) throw new Error('此会话没有有效的绝对目录。')
  let match
  for (const project of projects) {
    if (project.archived) continue
    for (const folder of project.folders) {
      const { path } = folder
      if (!contains(path, cwd)) continue
      const primary = path === project.primary_path
      if (!match || path.length > match.length || (path.length === match.length && primary && !match.primary)) {
        match = { project, length: path.length, primary }
      }
    }
  }
  const folders = match ? [match.project.primary_path, ...match.project.folders.map(folder => folder.path)] : [cwd]
  return [...new Set(folders)]
    .filter(path => contains(path, path))
    .map(path => ({
      path,
      id: createHash('sha256').update(path).digest('hex').slice(0, 32),
      label: contains(workspace, path) ? relative(workspace, path) || basename(workspace) : path,
    }))
}

export function artifactLocation(cwd, roots, url) {
  const reference = artifactReference({ url })
  if (!reference) throw new Error('此预览目标不是可用的项目文件。')
  const target = reference.target
  let path
  try {
    if (/^file:/i.test(target)) {
      const file = new URL(target)
      if (file.search || file.hash || file.host) throw new Error()
      path = fileURLToPath(file)
    } else path = target.startsWith('~/') ? resolve(homedir(), target.slice(2)) : resolve(cwd, target)
  } catch { throw new Error('此预览目标不是可用的项目文件。') }
  const folder = roots.reduce((best, root) => contains(root.path, path) && (!best || root.path.length > best.path.length) ? root : best, null)
  if (!folder) throw new Error('预览文件不在此会话授权的目录内。')
  const parts = relative(folder.path, path).split(sep)
  if (!validParts(parts)) throw new Error('此预览目标不是可用的项目文件。')
  return { root: folder.id, parts }
}

export function createFileBridge(source, sessionDirectory, readNative) {
  return async (client, connection, input, stillSignedIn) => {
    const request = fileRequest(input)
    const { cwd, roots } = await sessionFileScope(client, connection, sessionDirectory, request.session_id)
    const location = request.action === 'locate' ? artifactLocation(cwd, roots, request.target) : request
    const selected = location.root === undefined ? roots[0] : roots.find(root => root.id === location.root)
    if (!selected) throw new Error('此会话的文件夹已变化，请重新选择。')
    const path = resolve(selected.path, ...(location.parts ?? []))
    const read = (action, params) => readNative(client, action, params, stillSignedIn)
    let result
    if (request.action === 'list') {
      const listing = await read('fileList', { path })
      if (listing.error) throw new Error('无法读取目录：' + listing.error)
      result = { entries: listing.entries.slice(0, 500).map(row => ({ name: row.name, directory: row.isDirectory, size: row.byteSize ?? 0 })), truncated: listing.entries.length > 500 }
    } else {
      const info = await read('fileText', { path, session_id: request.session_id })
      result = { name: basename(path), size: info.byteSize, mime: info.mimeType }
      if (request.action === 'read' || request.action === 'preview' && info.mimeType?.startsWith('image/')) {
        const file = await read('fileData', { path, session_id: request.session_id })
        const data = file.dataUrl
        if (!/^data:[^,]*;base64,/.test(data) || info.byteSize > 16 * 1024 * 1024) throw new Error('文件超过 16 MB 或无法读取。')
        if (request.action === 'read') result.data_base64 = data.slice(data.indexOf(',') + 1)
        else result.image = data
      } else if (!info.binary) Object.assign(result, { text: info.text, truncated: info.truncated })
    }
    if (!stillSignedIn()) throw new Error('已退出当前工作区。')
    if (request.action === 'locate') return location
    return request.action === 'list'
      ? { ...result, root: selected.id, roots: roots.map(({ id, label }) => ({ id, label })) }
      : result
  }
}
