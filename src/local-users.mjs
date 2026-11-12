// Demo-only registration. Native identity and data deletion always belong to the host.
const registryKey = 'aiwata-app:local-users:v1'
const workspaceKey = 'aiwata-ui-prototype:v1:accounts'
export function localUserAppearance(user) {
  let hash = 0
  for (const char of user.id) hash = (hash * 31 + char.codePointAt(0)) >>> 0
  return { ...user, initial: [...user.name][0], color: ['#a84732', '#566582', '#66794a', '#825a85'][hash % 4] }
}
export function createBrowserLocalUsers(storage, attachments) {
  function read() {
    const raw = storage.getItem(registryKey)
    if (raw === null) {
      const initial = { version: 1, users: [{ id: 'lin', name: '用户一' }, { id: 'qiao', name: '用户二' }] }
      storage.setItem(registryKey, JSON.stringify(initial))
      return initial
    }
    let record
    try { record = JSON.parse(raw) } catch { throw new Error('本机用户登记无法读取，请检查存储。') }
    if (record?.version !== 1 || !Array.isArray(record.users) || record.users.some(user => !user?.id || typeof user.name !== 'string') || new Set(record.users.map(user => user.id)).size !== record.users.length) throw new Error('本机用户登记格式损坏。')
    return record
  }
  function write(record) { storage.setItem(registryKey, JSON.stringify(record)) }
  return {
    async list() { return { users: read().users.map(localUserAppearance), currentUserId: null } },
    async create(input) {
      const name = input.trim().normalize('NFC')
      if (!name || [...name].length > 40 || /[\p{Cc}]/u.test(name)) throw new Error('请输入 1–40 个字符的用户名。')
      const record = read()
      if (record.users.some(user => user.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('用户名已存在。')
      const user = { id: 'user-' + crypto.randomUUID(), name }
      write({ ...record, users: [...record.users, user] })
      return localUserAppearance(user)
    },
    async remove(id) {
      const record = read()
      if (!record.users.some(user => user.id === id)) throw new Error('此用户不存在。')
      await attachments?.removeAccount?.(id)
      const latest = read()
      const raw = storage.getItem(workspaceKey)
      const workspaces = raw ? JSON.parse(raw) : {}
      delete workspaces[id]
      storage.setItem(workspaceKey, JSON.stringify(workspaces))
      write({ ...latest, users: latest.users.filter(user => user.id !== id) })
      return { ok: true }
    },
    async activate(id) {
      if (!read().users.some(user => user.id === id)) throw new Error('此用户不存在。')
      return { ok: true, current: true }
    },
  }
}
