import { ownedBotHome } from './live-aiwata-bots.mjs'

const fields = new Map(Object.entries({
  'groups.list': ['limit', 'offset'], 'groups.capabilities': [], 'groups.state': ['room_id'],
  'groups.log': ['room_id', 'since_seq', 'limit'], 'groups.create': ['room_id', 'name', 'members'],
  'groups.rename': ['room_id', 'event_id', 'name'],
  'groups.context': ['room_id', 'event_id', 'purpose', 'notes', 'routing', 'lead_member_id'],
  'groups.send': ['room_id', 'event_id', 'payload'], 'groups.stop': ['room_id', 'cancel_id'],
  'groups.disband': ['room_id', 'cancel_id'], 'groups.continue': ['room_id', 'discussion_event_id'],
  'groups.approve': ['room_id', 'member_id', 'task_id', 'execution_generation', 'choice', 'request_id'],
  'groups.retry': ['room_id', 'member_id', 'task_id', 'execution_generation'],
  'groups.discard': ['room_id', 'member_id', 'task_id', 'execution_generation'],
  'groups.attachment.upload': ['room_id', 'upload_id', 'kind', 'name', 'mime', 'data_base64'],
  'groups.attachment.download': ['room_id', 'event_id', 'attachment_id'],
}))

export async function callRoom(connection, home, register, { method, params }) {
  const allowed = fields.get(method)
  if (!allowed || !params || typeof params !== 'object' || Array.isArray(params) ||
      Object.keys(params).some(key => !allowed.includes(key))) throw new Error('该操作不适用于群聊。')
  if (method !== 'groups.create') return connection.call(method, params)

  const { members, room_id, name } = params
  if (!Array.isArray(members) || members.length < 2 || members.length > 6 ||
      typeof room_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(room_id) ||
      typeof name !== 'string' || !name.trim() || name.length > 80) throw new Error('请选择 2 至 6 位 Bot 和有效的群名。')
  const profiles = new Set(members.map(member => member?.profile))
  if (profiles.size !== members.length) throw new Error('请选择不同的 Bot。')
  const roster = []
  for (const member of members) {
    if (!member || typeof member.name !== 'string' || !member.name.trim() || member.name.length > 80) throw new Error('群成员无效。')
    const profile = member.profile
    const path = await ownedBotHome(home, profile)
    roster.push({ member_id: profile, profile, handle: profile, display_name: member.name.trim(), target: { kind: 'local', profile }, path })
  }
  const capabilities = await connection.call('groups.capabilities', {})
  if (!capabilities.driver) throw new Error('AIWATA 群聊驱动暂不可用。')
  for (const { profile, path } of roster) {
    if (!capabilities.seatable_profiles?.includes(profile)) await register(profile, path)
  }
  return connection.call(method, { room_id, name: name.trim(), members: roster.map(({ path, ...member }) => member) })
}
