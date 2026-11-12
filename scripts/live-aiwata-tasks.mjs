import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gatewayTaskPlatform, gatewayTaskRoomId } from '../src/live-tasks.mjs'
import { ownedBotHome } from './live-aiwata-bots.mjs'
import { withoutAmbientChannelCredentials } from './live-aiwata-connectors.mjs'
import { runtimeCompanion } from './live-aiwata-runtime.mjs'

const jobActions = new Set(['save', 'history', 'pause', 'resume', 'run', 'stop', 'remove', 'targets'])
const fields = ['name', 'prompt', 'schedule', 'timezone', 'repeat', 'workdir', 'deliver']

export function taskRequest(input) {
  const { action, profile, id, data, requestId } = input
  if (action === 'list') return { action }
  if (!jobActions.has(action) || typeof profile !== 'string' || profile === 'all' ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile) ||
      (action !== 'targets' && (id == null ? action !== 'save' : typeof id !== 'string' || !/^[a-f0-9]{12}$/.test(id)))) {
    throw new Error('无法识别定时任务或操作。')
  }
  if (action === 'targets') {
    if (Object.keys(input).some(key => !['action', 'profile'].includes(key))) throw new Error('投递目标请求无效。')
    return { action, profile }
  }
  if (action !== 'save') return { action, profile, id }
  if ((!id && (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId))) ||
      !data || Object.keys(data).some(key => !fields.includes(key)) ||
      fields.some(key => typeof data[key] !== 'string') ||
      (data.deliver !== 'local' && !gatewayTaskRoomId(data.deliver) && !gatewayTaskPlatform(data.deliver)) ||
      !data.name.trim() || data.name.length > 100 || !data.prompt.trim() || data.prompt.length > 16000 ||
      !data.schedule.trim() || data.schedule.length > 150 || data.timezone.length > 100) {
    throw new Error('请检查任务名称、执行指令、时间和投递方式。')
  }
  const repeat = data.repeat ? Number(data.repeat) : null
  if (repeat !== null && (!/^\d+$/.test(data.repeat) || !Number.isSafeInteger(repeat) || repeat < 1)) {
    throw new Error('重复次数须为正整数。')
  }
  return { action, profile, id, requestId, data: { ...data, repeat, timezone: data.timezone || null } }
}

async function ownedProfiles(home) {
  const names = await readdir(resolve(home, 'profiles')).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const profiles = await Promise.all(names.map(async name => await ownedBotHome(home, name).catch(() => null) ? name : null))
  return ['default', ...profiles.filter(Boolean)]
}

export function createTaskBridge(source, validateDirectory, wrap) {
  const creations = new Map()
  const native = runtimeCompanion(source, './live_aiwata_tasks.py', '定时任务', withoutAmbientChannelCredentials, undefined,
    (root, client, python, args, request) => request.action === 'run' ? wrap?.(root, client, python, args) : undefined)

  async function execute(client, request, stillSignedIn) {
    if (request.action === 'list') request.profiles = await ownedProfiles(client.home)
    else if (request.profile !== 'default') await ownedBotHome(client.home, request.profile)
    if (request.action === 'save') {
      request.data.workdir = await validateDirectory(client.workspace, request.data.workdir || client.workspace)
    }
    return native(client, { ...request, workspace: client.workspace }, stillSignedIn, request.action === 'run' ? 0 : undefined)
  }

  return async (client, input, stillSignedIn) => {
    const request = taskRequest(input)
    if (request.action !== 'save' || request.id) return execute(client, request, stillSignedIn)
    const key = client.home + ':' + request.requestId
    const previous = creations.get(key)
    if (previous) return previous
    const pending = execute(client, request, stillSignedIn)
    creations.set(key, pending)
    try { return await pending }
    catch (error) { creations.delete(key); throw error }
  }
}
