const clean = path => path.replace(/\/+$/, '') || '/'
const validPath = path => typeof path === 'string' && path.startsWith('/') && !path.includes('\0')

/** The original remote-picker FS API, bound to one existing native client.
 * A picker promise always settles on replacement, cancel, logout or disposal. */
export function createNativeRemoteFolderPicker({ live, isCurrent, onChange }) {
  let disposed = false, generation = 0, pending, state = { open: false }
  const active = () => !disposed && isCurrent()
  const publish = () => { if (active()) onChange() }
  function cancel() {
    generation++
    pending?.resolve([]); pending = null
    state = { open: false }; publish()
  }
  async function open(path) {
    if (!active() || !pending) return
    if (!validPath(path)) { state.error = '请输入远端绝对目录路径。'; publish(); return }
    const ownGeneration = ++generation, pathValue = clean(path)
    state = { ...state, path: pathValue, loading: true, verified: false, error: null, entries: [] }; publish()
    try {
      const result = await live.api('/api/fs/list?path=' + encodeURIComponent(pathValue))
      if (!active() || ownGeneration !== generation) return
      if (result.error) throw new Error(result.error)
      const entries = (result.entries ?? []).filter(row => row.isDirectory && validPath(row.path)).map(row => ({ name: row.name, path: row.path }))
      state = { ...state, entries, verified: true }
    } catch (error) { if (active() && ownGeneration === generation) state.error = error instanceof Error ? error.message : '远端目录读取失败。' }
    finally { if (active() && ownGeneration === generation) { state.loading = false; publish() } }
  }
  return {
    snapshot: () => active() ? state : { open: false }, open,
    pick(options = {}) {
      cancel()
      if (!active()) return Promise.resolve([])
      const result = new Promise(resolve => { pending = { resolve } })
      state = { open: true, id: crypto.randomUUID(), title: options.title || '选择远端目录', path: options.defaultPath || '/', entries: [], loading: true, verified: false }
      publish()
      const selection = pending
      if (validPath(options.defaultPath)) void open(options.defaultPath)
      else void live.api('/api/fs/default-cwd').then(value => {
        if (active() && pending === selection) return open(validPath(value.cwd) ? value.cwd : '/')
      }, () => { if (active() && pending === selection) return open('/') })
      return result
    },
    select() {
      if (!active() || !pending || !state.verified || state.loading || state.error) return
      const resolve = pending.resolve, path = state.path
      pending = null; generation++; state = { open: false }; publish(); resolve([path])
    },
    async create(rawName) {
      if (!active() || !pending || state.loading || state.creating) return
      const name = rawName.trim()
      if (!name || ['.', '..'].includes(name) || /[/\\\0]/.test(name)) { state.error = '新目录名称只能包含一个路径段。'; publish(); return }
      const ownGeneration = generation, parent = state.path
      state.creating = true; publish()
      try {
        const result = await live.api('/api/files/mkdir', { method: 'POST', body: { path: clean(parent) + (parent === '/' ? '' : '/') + name } })
        if (!active() || ownGeneration !== generation) return
        if (result.error) throw new Error(result.error)
        await open(result.path || clean(parent) + (parent === '/' ? '' : '/') + name)
      } catch (error) { if (active() && ownGeneration === generation) { state.error = error instanceof Error ? error.message : '新目录创建失败。'; publish() } }
      finally { if (active() && pending) { state.creating = false; publish() } }
    },
    cancel,
    dispose() { if (disposed) return; disposed = true; cancel() },
  }
}
