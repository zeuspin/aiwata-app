import { ownedBotHome } from './live-aiwata-bots.mjs'
import { runtimeCompanion } from './live-aiwata-runtime.mjs'

const actions = {
  read: [], detail: ['id'], setting: ['key', 'value'], pause: ['value'], review: ['preview'],
  add: ['target', 'content'], edit: ['id', 'content', 'revision'], remove: ['id', 'revision'],
  approve: ['id', 'revision'], reject: ['id', 'revision'],
}
const settingKeys = ['memoryEnabled', 'userProfileEnabled', 'writeApproval']
const nodeId = /^(?:memory:(?:memory|profile):\d+:[0-9a-f]{12}|[a-z0-9][a-z0-9._-]{0,63})$/

export function memoryRequest(input) {
  const { action, profile, id, value, key, content, target, revision, preview } = input
  const fields = typeof action === 'string' && Object.hasOwn(actions, action) && actions[action]
  const idPattern = ['approve', 'reject'].includes(action) ? /^[0-9a-f]{8}$/ : nodeId
  if (!fields || typeof profile !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile) ||
      Object.keys(input).some(field => !['action', 'profile', ...fields].includes(field)) ||
      (fields.includes('id') && (typeof id !== 'string' || !idPattern.test(id))) ||
      (fields.includes('value') && typeof value !== 'boolean') ||
      (action === 'setting' && !settingKeys.includes(key)) ||
      (action === 'review' && typeof preview !== 'boolean') ||
      (action === 'add' && !['memory', 'user'].includes(target)) ||
      (fields.includes('content') && (typeof content !== 'string' || !content.trim() || content.length > 100000 ||
        ((action === 'add' || id.startsWith('memory:')) && /(?:^|\n)§(?:\r?\n|$)/.test(content)))) ||
      (fields.includes('revision') && (typeof revision !== 'string' || !/^[0-9a-f]{64}$/.test(revision)))) {
    throw new Error('无法识别记忆操作、Profile 或记录内容。')
  }
  return input
}

export function createMemoryBridge(source, write, wrap) {
  const native = runtimeCompanion(source, './live_aiwata_memory.py', '记忆与学习', undefined, undefined,
    (root, client, python, args, request) => request.action === 'review' ? wrap?.(root, client, python, args) : undefined)
  return async (client, input, stillSignedIn) => {
    const request = memoryRequest(input)
    const profileHome = request.profile === 'default' ? client.home : await ownedBotHome(client.home, request.profile)
    const call = () => native(client, { ...request, profileHome }, stillSignedIn,
      request.action === 'review' && !request.preview ? 0 : undefined)
    return ['read', 'detail'].includes(request.action) ? call() : write(profileHome, call)
  }
}
