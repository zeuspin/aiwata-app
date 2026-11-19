import { realpath, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { getBotAppearance } from '../src/bot-appearance.mjs'
import { canUseProfileId } from '../src/management.mjs'

const appMeta = 'aiwata-app'
const desktopMeta = 'hermes-bots'
const validProfile = name => typeof name === 'string' && canUseProfileId(name, [])

export async function ownedBotHome(home, profile) {
  if (!validProfile(profile)) throw new Error('无效的 Bot 档案。')
  const expected = resolve(home, 'profiles', profile)
  const actual = await realpath(expected).catch(() => null)
  if (actual !== expected || !(await stat(actual)).isDirectory()) throw new Error('当前账号没有此 Bot 档案。')
  return actual
}

async function botIdentity(path) {
  const { dev, ino, birthtimeNs } = await stat(path, { bigint: true })
  return { identity: createHash('sha256').update([dev, ino, birthtimeNs].join(':')).digest('hex'),
    device: String(dev), inode: String(ino) }
}

export async function botDeletionTarget(connection, home, { profile, identity }) {
  const path = await ownedBotHome(home, profile)
  const target = await botIdentity(path)
  if (identity !== undefined && identity !== target.identity) throw new Error('Bot 档案已变化，请刷新后再删除。')
  const rooms = []
  let offset = 0
  for (;;) {
    const result = await connection.call('groups.list', { limit: 100, offset })
    for (const room of result.rooms) {
      if (room.members.some(member => member.profile === profile || member.target?.profile === profile)) rooms.push(room.name)
    }
    if (result.next_offset == null) return { ...target, path, rooms }
    if (result.next_offset <= offset) throw new Error('无法确认 Bot 的群聊成员关系。')
    offset = result.next_offset
  }
}

export async function gatewayBots(connection, home) {
  const { profiles } = await connection.call('profiles.list', { include_sessions: true })
  const entries = await Promise.all(profiles.map(async row => {
    const path = await ownedBotHome(home, row.name).catch(() => null)
    if (!path || row.path !== path) return null
    const asset = row.has_avatar && await connection.call('profiles.get_asset', { name: row.name, asset: 'avatar' })
    const meta = row.ui_meta ?? {}
    return {
      profile: row.name, name: meta[desktopMeta]?.title || row.display_name || row.name,
      description: row.description, model: row.model, provider: row.provider,
      appearance: meta[appMeta]?.appearance, avatar: asset?.found ? asset.data : '',
      canonicalId: row.canonical_session?.id, revision: row.ui_meta_revisions?.[appMeta] ?? 0,
      desktopRevision: row.ui_meta_revisions?.[desktopMeta] ?? 0,
      identity: (await botIdentity(path)).identity,
    }
  }))
  return entries.filter(Boolean)
}

export async function describeGatewayBot(connection, home, profile) {
  if (profile !== 'default') await ownedBotHome(home, profile)
  return connection.call('profiles.describe', { name: profile })
}

export async function saveGatewayBot(connection, home, input, creations) {
  const { profile, createId, cloneFrom, model, provider, confirmedModel, description, soul, avatar } = input
  const title = typeof input.name === 'string' ? input.name.trim() : ''
  if (!validProfile(profile) || !title || title.length > 80 || typeof description !== 'string' || description.length > 200 ||
      typeof soul !== 'string' || soul.length > 120000 || Boolean(model) !== Boolean(provider) ||
      (avatar !== undefined && (typeof avatar !== 'string' || avatar.length > 350000 ||
        (avatar && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))))) throw new Error('Bot 设置无效。')
  const capabilityFields = ['disabled_skills', 'enabled_toolsets', 'enabled_mcp_servers']
  const capabilities = {}
  for (const field of capabilityFields) {
    const values = input[field]
    if (values === undefined) continue
    if (!Array.isArray(values) || values.length > 1000 || values.some(value => typeof value !== 'string' || value.length > 200)) {
      throw new Error('Bot 能力配置无效。')
    }
    capabilities[field] = values
  }

  if (createId) {
    if (typeof createId !== 'string' || !/^[a-f0-9-]{36}$/i.test(createId)) throw new Error('Bot 创建请求无效。')
    const existing = await ownedBotHome(home, profile).catch(() => null)
    if (!existing) {
      if (cloneFrom) await ownedBotHome(home, cloneFrom)
      const result = await connection.call('profiles.create', {
        name: profile, description, ...(cloneFrom ? { clone_from: cloneFrom } : {}),
        no_alias: true, clone_channels: false, share_auth: true,
      })
      if (!result.ok) throw new Error('无法创建 Bot 档案。')
      creations.set(profile, createId)
      if (creations.size > 128) creations.delete(creations.keys().next().value)
    }
  }
  const path = await ownedBotHome(home, profile)
  const { profiles } = await connection.call('profiles.list', { include_sessions: false })
  const row = profiles.find(entry => entry.name === profile && entry.path === path)
  if (!row) throw new Error('找不到 Bot 档案。')
  const revisions = row.ui_meta_revisions ?? {}
  const revision = revisions[appMeta] ?? 0
  const savedCreation = row.ui_meta?.[appMeta]?.createId
  if (createId && createId !== savedCreation && creations.get(profile) !== createId) throw new Error('此 Profile ID 已被使用。')
  if (!createId && (input.revision !== revision || input.desktopRevision !== (revisions[desktopMeta] ?? 0))) {
    throw new Error('Bot 设置已更新，请重新打开编辑。')
  }

  if (model && (model !== row.model || provider !== row.provider)) {
    if (typeof model !== 'string' || typeof provider !== 'string' || model.length > 200 || provider.length > 80) throw new Error('模型配置无效。')
    const result = await connection.call('profiles.configure', {
      name: profile, model, provider, ...(confirmedModel === true ? { confirm_expensive_model: true } : {}),
    })
    if (result.confirm_required) return { confirmRequired: true, message: result.confirm_message }
    if (!result.ok || !result.applied?.model) throw new Error('模型保存失败。')
  }
  if (avatar !== undefined) {
    const asset = await connection.call('profiles.set_asset', {
      name: profile, asset: 'avatar', ...(avatar ? { data: avatar } : { clear: true }),
    })
    if (!asset.ok) throw new Error('头像保存失败，请重试。')
  }
  const result = await connection.call('profiles.configure', {
    name: profile,
    ...(description === input.originalDescription ? {} : { description }),
    ...(soul === input.originalSoul ? {} : { soul }),
    ...capabilities,
    ui_meta: {
      [desktopMeta]: { ...row.ui_meta?.[desktopMeta], title },
      [appMeta]: { createId: savedCreation ?? createId,
        appearance: getBotAppearance({ id: 'bot:' + profile, appearance: input.appearance }) },
    },
    ui_meta_expected_revisions: { [desktopMeta]: revisions[desktopMeta] ?? 0, [appMeta]: revision },
  })
  if (!result.ok) throw new Error(result.applied?.ui_meta_conflicts ? 'Bot 设置已更新，请重新打开编辑。' : '部分 Bot 设置保存失败，请重试。')
  if (createId) creations.delete(profile)
  return { ok: true, profile }
}
