import { contains, sessionFileScope, validFileRoot, validFileSession, validParts } from './live-aiwata-files.mjs'
import { relative, resolve } from 'node:path'

export function gitRequest(input) {
  const { action, session_id, root, path, scope } = input ?? {}
  if (!validFileSession(session_id) || (root !== undefined && !validFileRoot(root))) throw new Error('Git 请求无效。')
  const fields = Object.keys(input)
  if (action === 'status' && fields.every(key => ['action', 'session_id', 'root'].includes(key))) return input
  if (action === 'diff' && root && typeof path === 'string' && validParts(path.split('/')) &&
      ['all', 'staged', 'worktree'].includes(scope) &&
      fields.every(key => ['action', 'session_id', 'root', 'path', 'scope'].includes(key))) return input
  throw new Error('Git 请求无效。')
}

export function createGitBridge(source, sessionDirectory, readNative) {
  return async (client, connection, input, stillSignedIn) => {
    const request = gitRequest(input)
    const { cwd, roots } = await sessionFileScope(client, connection, sessionDirectory, request.session_id)
    const selected = request.root === undefined ? roots[0] : roots.find(root => root.id === request.root)
    if (!selected) throw new Error('此会话的项目目录已变化。')
    const read = (action, params) => readNative(client, action, params, stillSignedIn)
    const { root: repo } = await read('gitRoot', { path: contains(selected.path, cwd) ? cwd : selected.path })
    if (!repo) return { repository: null, root: selected.id, roots: roots.map(({ id, label }) => ({ id, label })) }
    const status = await read('gitStatus', { path: repo })
    let result
    if (request.action === 'status') result = { repository: { ...status, path: relative(selected.path, repo) || '.', truncated: status.changed > status.files.length } }
    else {
      const file = status?.files.find(file => file.path === request.path)
      if (!file) throw new Error('此文件已不在当前变更列表中，请刷新后重试。')
      const patches = []
      const patch = async (staged, kind) => {
        const { diff } = await read('gitDiff', { path: repo, file: resolve(repo, file.path), scope: 'uncommitted', staged: String(staged) })
        patches.push({ kind, text: diff.slice(0, 250000), truncated: diff.length > 250000 })
      }
      if (request.scope !== 'worktree' && file.staged) await patch(true, 'staged')
      if (request.scope !== 'staged' && (file.unstaged || file.untracked || file.conflicted)) await patch(false, file.untracked ? 'untracked' : file.conflicted ? 'conflicted' : 'worktree')
      result = { patches }
    }
    if (!stillSignedIn()) throw new Error('已退出当前工作区。')
    return request.action === 'status'
      ? { ...result, root: selected.id, roots: roots.map(({ id, label }) => ({ id, label })) }
      : result
  }
}
