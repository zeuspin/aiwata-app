// Child clients route tool reads to the Bot's session database while retaining the account's
// data scope and workspace. A profile is resolved afresh on every request, never accepted as a path.
export function profileToolRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('工具请求无效。')
  const { profile = '', ...request } = body
  if (typeof profile !== 'string') throw new Error('工具 Profile 无效。')
  return { profile, request }
}

export async function profileToolClient(client, profile = '', { ownedHome, available, active }) {
  if (typeof profile !== 'string') throw new Error('工具 Profile 无效。')
  if (!active()) throw new Error('已退出当前工作区。')
  if (!profile) return client
  available(client, profile)
  const home = await ownedHome(client.home, profile)
  if (!active()) throw new Error('已退出当前工作区。')
  available(client, profile)
  client.profileClients ??= new Map()
  let child = client.profileClients.get(profile)
  if (!child || child.home !== home) {
    child = { ...client, home, accountHome: client.home, profile, terminals: new Map(), profileClients: undefined }
    client.profileClients.set(profile, child)
  }
  return child
}
