import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { ownedBotHome } from './live-aiwata-bots.mjs'
import { runtimeCompanion } from './live-aiwata-runtime.mjs'

const maxAudioBytes = 25 * 1024 * 1024
const maxAudioBase64 = Math.ceil(maxAudioBytes / 3) * 4
export const audioRequestLimit = maxAudioBase64 + 4096

const audioTypes = new Set([
  'audio/aac', 'audio/flac', 'audio/m4a', 'audio/mp3', 'audio/mp4', 'audio/mpeg', 'audio/ogg',
  'audio/wav', 'audio/wave', 'audio/webm', 'audio/x-m4a', 'audio/x-wav', 'video/webm',
])

export function audioRequest(input) {
  const { action, profile, mimeType, dataBase64 } = input ?? {}
  const fields = action === 'status' ? ['action', 'profile'] : ['action', 'profile', 'mimeType', 'dataBase64']
  if (!['status', 'transcribe'].includes(action) || typeof profile !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile) || Object.keys(input).some(key => !fields.includes(key))) {
    throw new Error('无法识别语音操作或 Profile。')
  }
  if (action === 'status') return { action, profile }
  const mime = typeof mimeType === 'string' && mimeType.length <= 256 ? mimeType.split(';', 1)[0].trim().toLowerCase() : ''
  if (!audioTypes.has(mime) || typeof dataBase64 !== 'string' || !dataBase64 || dataBase64.length > maxAudioBase64 ||
      dataBase64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64) ||
      Buffer.byteLength(dataBase64, 'base64') > maxAudioBytes) {
    throw new Error('语音录音格式无效或超过 25 MiB。')
  }
  return { action, profile, mimeType: mime, dataBase64 }
}

const voiceEnvironment = ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }) => ({ HOME, PATH, AIWATA_HOME, HERMES_HOME })

export function createAudioBridge(source, wrap, native = runtimeCompanion(
  source, './live_aiwata_audio.py', '语音转写', voiceEnvironment, 512 * 1024, wrap,
)) {
  const transcribing = new Set()
  return async (client, input, signedIn, signal) => {
    const request = audioRequest(input)
    const profileHome = request.profile === 'default' ? client.home : await ownedBotHome(client.home, request.profile)
    if (request.action === 'status') return native(client, { ...request, profileHome }, signedIn, undefined, signal)
    if (transcribing.has(client.home)) throw new Error('当前账号正在转写，请稍后重试。')
    transcribing.add(client.home)
    let temporary
    try {
      temporary = await mkdtemp(join(client.home, 'dictation-'))
      return await native(client, { ...request, profileHome, temporary }, signedIn, 330000, signal)
    } finally {
      try { if (temporary) await rm(temporary, { recursive: true, force: true }) }
      finally { transcribing.delete(client.home) }
    }
  }
}
