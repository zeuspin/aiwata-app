import { contains, validFileSession } from './live-aiwata-files.mjs'
import { runtimeCompanion } from './live-aiwata-runtime.mjs'
import { attachmentSizeLimit } from '../src/composer.mjs'
import { publicVideoAddress } from '../src/web-preview.mjs'

const base64Limit = Math.ceil(attachmentSizeLimit / 3) * 4

export function videoEditor(source, wrap) {
  return runtimeCompanion(source, './live_aiwata_video.py', '视频编辑',
    ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }) => ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }), base64Limit + 4096, wrap)
}

export function createVideoBridge(sessionDirectory, native) {
  const active = new Set()
  return async (client, input, signedIn) => {
    const { action, session_id } = input ?? {}
    const probe = action === 'status'
    const allowed = probe ? ['action', 'session_id'] : ['action', 'session_id', 'prompt', 'source']
    const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : ''
    const source = publicVideoAddress(input?.source)
    if (!validFileSession(session_id) || Object.keys(input).some(key => !allowed.includes(key)) ||
        (!probe && (action !== 'edit' || !prompt || prompt.length > 2000 || !source))) {
      throw new Error('请输入公开的 HTTPS 视频链接和编辑要求。')
    }
    const cwd = await sessionDirectory(client.home, session_id)
    if (!signedIn() || !contains(client.workspace, cwd)) throw new Error('当前用户没有这条可用的会话。')
    if (probe) {
      const status = await native(client, { action }, signedIn)
      if (!signedIn()) throw new Error('已退出当前工作区。')
      return { available: status.available === true }
    }
    if (active.has(client.home)) throw new Error('当前账号已有视频编辑在运行。')
    active.add(client.home)
    try {
      const result = await native(client, { action, prompt, source, max_bytes: attachmentSizeLimit }, signedIn, 375000)
      if (!signedIn() || await sessionDirectory(client.home, session_id) !== cwd || !signedIn()) {
        throw new Error('原会话已退出或移动。')
      }
      if (!result.available) throw new Error('当前工作区未配置可用的 xAI 视频供应商。')
      const { video } = result
      if (typeof video !== 'string' || video.length > base64Limit || video.length % 4 !== 0 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(video) || Buffer.byteLength(video, 'base64') > attachmentSizeLimit ||
          Buffer.from(video.slice(0, 16), 'base64').toString('ascii', 4, 8) !== 'ftyp') {
        throw new Error('AIWATA 未返回可保存的 MP4 视频。')
      }
      return { video }
    } finally {
      active.delete(client.home)
    }
  }
}
