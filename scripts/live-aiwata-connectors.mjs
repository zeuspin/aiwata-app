import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { ownedBotHome } from './live-aiwata-bots.mjs'
import { runtimeCompanion } from './live-aiwata-runtime.mjs'

const platformIds = ['weixin', 'telegram', 'discord', 'slack', 'email']
const relayPlatforms = ['telegram', 'discord', 'slack']
const envName = /^[A-Z][A-Z0-9_]{1,63}$/
const controlChars = /[\u0000-\u001f\u007f]/
const actionFields = {
  read: [], apply: [], save: ['platform', 'enabled', 'env', 'clear'], test: ['platform'],
  approve: ['platform', 'id'], revoke: ['platform', 'id'],
  telegramStart: [], telegramStatus: ['id'], telegramApply: ['id', 'allowedUserIds'], telegramCancel: ['id'],
  relayRead: ['platform'], relayStart: ['platform'], relayStatus: ['platform', 'id'],
  relayDismiss: ['platform', 'id'], relayUnlink: ['platform', 'id'],
}
const isTelegramSetup = action => action.startsWith('telegram')
const isRelaySetup = action => action.startsWith('relay')
const telegramUserId = /^[0-9]{3,20}$/
const unavailablePairing = '此 Telegram 配对已结束，请重新生成二维码。'
const unavailableLink = '此 Team Gateway 绑定已结束，请重新生成命令。'

export function withoutAmbientChannelCredentials(env) {
  const channelEnv = /^(?:WEIXIN|TELEGRAM|DISCORD|SLACK|EMAIL|MATTERMOST|MATRIX|WHATSAPP|SIGNAL|BLUEBUBBLES|TWILIO|DINGTALK|FEISHU|GOOGLE_CHAT|WECOM|QQBOT|YUANBAO|LINE|TEAMS|SIMPLEX|GATEWAY_RELAY)_/
  return Object.fromEntries(Object.entries(env).filter(([key]) => key !== 'GATEWAY_ALLOW_ALL_USERS' && !channelEnv.test(key)))
}

export function connectorRequest(input) {
  const { action, profile, platform, id, enabled, env, clear } = input
  const fields = typeof action === 'string' && Object.hasOwn(actionFields, action) && actionFields[action]
  if (!fields || typeof profile !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile) ||
      Object.keys(input).some(key => !['action', 'profile', ...fields].includes(key)) ||
      (fields.includes('platform') && !platformIds.includes(platform)) ||
      (action === 'approve' && (typeof id !== 'string' || !/^[a-f0-9]{16}$/i.test(id))) ||
      (action === 'revoke' && (typeof id !== 'string' || !id || id.length > 255 || controlChars.test(id)))) {
    throw new Error('无法识别连接器操作或 Profile。')
  }
  if (action === 'save' && (typeof enabled !== 'boolean' || !env || typeof env !== 'object' || Array.isArray(env) ||
      !Array.isArray(clear) || clear.length > 30 || Object.keys(env).length > 30 ||
      clear.some(key => typeof key !== 'string' || !envName.test(key) || Object.hasOwn(env, key)) ||
      Object.entries(env).some(([key, value]) => !envName.test(key) || typeof value !== 'string' || !value.trim() ||
        value.length > 4096 || controlChars.test(value) || value.startsWith('«redacted:') || value === '***'))) {
    throw new Error('请检查配置字段和凭据，单个字段只能选择替换或清除。')
  }
  if (isTelegramSetup(action) && fields.includes('id') &&
      (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) throw new Error(unavailablePairing)
  if (isRelaySetup(action) && (profile !== 'default' || !relayPlatforms.includes(platform) ||
      (fields.includes('id') && (typeof id !== 'string' || !id || id.length > 255 || controlChars.test(id))) ||
      (['relayStatus', 'relayDismiss'].includes(action) && !/^[0-9a-f-]{36}$/.test(id)))) {
    throw new Error('Team Gateway 操作只适用于当前账号的默认 Profile。')
  }
  if (action === 'telegramApply') {
    const { allowedUserIds } = input
    if (!Array.isArray(allowedUserIds) || !allowedUserIds.length || allowedUserIds.length > 30 ||
        allowedUserIds.some(value => typeof value !== 'string' || !telegramUserId.test(value))) {
      throw new Error('请输入 1 到 30 个有效的 Telegram 用户 ID。')
    }
  }
  return input
}

export function createConnectorBridge(source, write, {
  reload, relayOwner,
  native = runtimeCompanion(source, './live_aiwata_connectors.py', '消息连接器', withoutAmbientChannelCredentials),
} = {}) {
  const pairings = new Map()
  const links = new Map()

  function clearLink(id) {
    const current = links.get(id)
    if (current) clearTimeout(current.timer)
    links.delete(id)
  }

  async function relay(client, request, stillSignedIn) {
    const { action, id, platform } = request
    const current = links.get(id)
    const ownsLink = current?.client === client && current.platform === platform
    if (!stillSignedIn()) throw new Error(unavailableLink)
    if (action === 'relayDismiss') {
      if (ownsLink) clearLink(id)
      return { ok: true }
    }
    if (action === 'relayStatus' && !ownsLink) throw new Error(unavailableLink)
    const expectedPid = await relayOwner?.(client, stillSignedIn)
    const result = await native(client, { ...request, expectedPid,
      ...(action === 'relayStatus' ? { code: current.code } : {}),
    }, stillSignedIn, 42000)
    if (!stillSignedIn()) throw new Error(unavailableLink)
    if (action === 'relayStart') {
      const expiry = Date.parse(result.expiresAt)
      if (!result.code || (Number.isFinite(expiry) && expiry <= Date.now())) throw new Error(unavailableLink)
      for (const [id, link] of links) if (link.client === client && link.platform === platform) clearLink(id)
      const id = randomUUID()
      const lifetime = Number.isFinite(expiry) ? Math.min(expiry - Date.now(), 30 * 60_000) : 15 * 60_000
      const timer = setTimeout(() => clearLink(id), lifetime).unref()
      links.set(id, { client, platform, code: result.code, timer })
      return { id, command: result.command, expiresAt: result.expiresAt, botUrl: result.botUrl }
    }
    if (action === 'relayStatus') {
      if (result.state !== 'pending') clearLink(id)
      return { state: result.state }
    }
    return result
  }

  function clearPairing(home) {
    const current = pairings.get(home)
    if (current) clearTimeout(current.timer)
    pairings.delete(home)
  }

  async function telegram(client, request, stillSignedIn) {
    const { profileHome, action, id, allowedUserIds } = request
    const current = pairings.get(profileHome)
    const { dev, ino, birthtimeNs } = await stat(profileHome, { bigint: true })
    const identity = [dev, ino, birthtimeNs].join(':')
    if (!stillSignedIn()) throw new Error(unavailablePairing)
    if (action === 'telegramStart') {
      if (current?.identity === identity && current.client !== client) throw new Error('此 Profile 已有正在进行的 Telegram 配对。')
      clearPairing(profileHome)
      const result = await native(client, request, stillSignedIn)
      const link = new URL(result.deepLink)
      const expires = Date.parse(result.expiresAt)
      if (link.origin !== 'https://t.me' || link.username || link.password || link.pathname === '/' ||
          !Number.isFinite(expires) || expires <= Date.now() || expires - Date.now() > 30 * 60_000 || !result.pairing) {
        throw new Error('AIWATA 返回的 Telegram 配对链接无效或已过期。')
      }
      if (!stillSignedIn()) throw new Error(unavailablePairing)
      const id = randomUUID()
      const timer = setTimeout(() => clearPairing(profileHome), expires - Date.now()).unref()
      pairings.set(profileHome, { id, client, identity, timer, expires, pairing: result.pairing })
      return { id, deepLink: link.href, expiresAt: result.expiresAt }
    }
    if (current?.id !== id || current.client !== client || current.identity !== identity || current.expires <= Date.now()) {
      if (action === 'telegramCancel') return { ok: true }
      throw new Error(unavailablePairing)
    }
    if (action === 'telegramCancel') {
      clearPairing(profileHome)
      return { ok: true }
    }
    if (action === 'telegramApply' && !current.pairing.bot_token) throw new Error('请先完成 Telegram 扫码确认。')
    const result = await native(client, { ...request, pairing: current.pairing, identity,
      ...(allowedUserIds ? { allowedUserIds: [...new Set(allowedUserIds)] } : {}),
    }, stillSignedIn)
    if (!stillSignedIn()) throw new Error(unavailablePairing)
    if (action === 'telegramApply') {
      clearPairing(profileHome)
      return { hot_served: result.hot_served === true }
    }
    if (result.status === 'expired') clearPairing(profileHome)
    if (result.status === 'ready') {
      current.pairing = result.pairing
      return { status: 'ready', username: result.username, ownerId: result.ownerId }
    }
    return { status: result.status }
  }

  const bridge = async (client, input, stillSignedIn) => {
    const request = connectorRequest(input)
    const resolveProfile = () => request.profile === 'default' ? client.home : ownedBotHome(client.home, request.profile)
    const profileHome = await resolveProfile()
    const call = async () => {
      const payload = { ...request, profileHome, accountHome: client.home }
      if (isTelegramSetup(request.action)) {
        await resolveProfile()
        return telegram(client, payload, stillSignedIn)
      }
      if (isRelaySetup(request.action)) return relay(client, payload, stillSignedIn)
      if (reload && request.action === 'apply') {
        // Resolve again after the write lock in case this Bot was deleted while waiting.
        if (request.profile !== 'default') await ownedBotHome(client.home, request.profile)
        await reload(client, profileHome, stillSignedIn)
        payload.managedApplyComplete = true
      }
      const result = await native(client, payload, stillSignedIn, request.action === 'apply' ? 80000 : undefined)
      if (request.action === 'save' && request.platform === 'telegram') clearPairing(profileHome)
      return result
    }
    return ['read', 'relayRead'].includes(request.action) ? call() : write(profileHome, call)
  }
  bridge.close = client => {
    for (const [home, pairing] of pairings) if (pairing.client === client) clearPairing(home)
    for (const [id, link] of links) if (link.client === client) clearLink(id)
  }
  return bridge
}
