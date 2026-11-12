import { ownedBotHome } from './live-aiwata-bots.mjs'
import { runtimeCompanion } from './live-aiwata-runtime.mjs'

const segment = /^[a-z0-9][a-z0-9._-]{0,63}$/
const actions = {
  list: [], catalog: [], install: ['id'], content: ['id'], remove: ['id'],
  toggle: ['id', 'value'], lock: ['id', 'value'],
  create: ['id', 'content'], edit: ['id', 'content', 'revision'],
}

export function skillRequest(input) {
  const { action, profile, id, value, content, revision } = input
  const fields = typeof action === 'string' && Object.hasOwn(actions, action) && actions[action]
  const parts = typeof id === 'string' ? id.split('/') : []
  if (!fields || typeof profile !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile) ||
      Object.keys(input).some(key => !['action', 'profile', ...fields].includes(key)) ||
      (fields.includes('id') && (!parts.length || parts.length > 6 || !parts.every(part => segment.test(part)))) ||
      (action === 'create' && parts.length !== 1) ||
      (action === 'install' && (parts.length < 3 || parts[0] !== 'official')) ||
      (fields.includes('value') && typeof value !== 'boolean') ||
      (fields.includes('content') && (typeof content !== 'string' || !content.trim() || content.length > 100000)) ||
      (action === 'edit' && (typeof revision !== 'string' || !/^[0-9a-f]{64}$/.test(revision)))) {
    throw new Error('无法识别技能操作、Profile 或技能内容。')
  }
  return input
}

export function createSkillBridge(source, write) {
  const native = runtimeCompanion(source, './live_aiwata_skills.py', '技能')
  return async (client, input, stillSignedIn) => {
    const request = skillRequest(input)
    const profileHome = request.profile === 'default' ? client.home : await ownedBotHome(client.home, request.profile)
    const call = () => native(client, { ...request, profileHome }, stillSignedIn, request.action === 'install' ? 90000 : undefined)
    if (['list', 'catalog', 'content'].includes(request.action)) return call()
    return write(profileHome, call)
  }
}
