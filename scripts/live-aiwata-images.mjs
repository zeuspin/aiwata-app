import { contains, validFileSession } from './live-aiwata-files.mjs'
import { runtimeCompanion } from './live-aiwata-runtime.mjs'
import { maxImageBytes } from '../src/tool-surfaces.mjs'

export const imageRequestLimit = Math.ceil(maxImageBytes / 3) * 4 + 24576
const ratios = ['square', 'landscape', 'portrait']

function rasterData(imageData) {
  if (typeof imageData !== 'string' || imageData.length > Math.ceil(maxImageBytes / 3) * 4 + 32) return null
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageData)
  if (!match || match[2].length % 4 !== 0) return null
  const [, mime, encoded] = match
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > maxImageBytes) return null
  const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : mime === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  return valid ? { imageData, mime } : null
}

export function imageEditor(source, wrap) {
  return runtimeCompanion(source, './live_aiwata_images.py', '图像编辑',
    ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }) => ({ HOME, PATH, AIWATA_HOME, HERMES_HOME }), imageRequestLimit, wrap)
}

export function createImageBridge(sessionDirectory, editNative) {
  const generating = new Set()
  return async (client, gateway, input, signedIn) => {
    const { action, session_id, aspect_ratio } = input ?? {}
    const probe = action === 'probe' || action === 'edit-status'
    const editing = action === 'edit' || action === 'edit-status'
    const allowed = probe ? ['action', 'session_id'] : ['action', 'session_id', 'prompt', 'aspect_ratio', ...(editing ? ['source'] : [])]
    const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : ''
    if (!validFileSession(session_id) || Object.keys(input).some(key => !allowed.includes(key)) ||
        (editing && !editNative) || (!probe && (!['generate', 'edit'].includes(action) ||
          !prompt || prompt.length > 4000 || !ratios.includes(aspect_ratio)))) {
      throw new Error('请检查图像请求。')
    }
    const source = action === 'edit' ? rasterData(input.source) : null
    if (action === 'edit' && !source) throw new Error('请选择不超过 8 MB 的 PNG、JPEG 或 WebP 源图。')
    const cwd = await sessionDirectory(client.home, session_id)
    if (!signedIn() || !contains(client.workspace, cwd)) throw new Error('当前用户没有这条可用的会话。')
    if (probe) {
      const result = editing ? await editNative(client, { action }, signedIn)
        : await gateway.call('image.generate', { probe: true })
      if (!signedIn()) throw new Error('已退出当前工作区。')
      return { available: result.available === true, ...(editing ? { editable: result.editable === true } : {}) }
    }
    if (generating.has(client.home)) throw new Error('当前账号已有生图任务在运行。')
    generating.add(client.home)
    try {
      const result = editing
        ? await editNative(client, { action, prompt, aspect_ratio, source: source.imageData, max_bytes: maxImageBytes }, signedIn, 120000)
        : await gateway.call('image.generate', { prompt, aspect_ratio, max_bytes: maxImageBytes }, 120000).catch(() => null)
      if (!signedIn() || await sessionDirectory(client.home, session_id) !== cwd || !signedIn()) {
        throw new Error('原会话已退出或移动。')
      }
      if (result?.available === false) throw new Error('当前 AIWATA 工作区未配置可用的生图供应商。')
      if (editing && result?.editable !== true) throw new Error('当前供应商或模型未提供图像编辑。')
      if (result?.success !== true) throw new Error('AIWATA 未返回生图结果，请检查供应商状态。')
      const image = rasterData(result.image_data)
      if (!image) throw new Error('AIWATA 生成了图像，但未返回可预览的 PNG、JPEG 或 WebP。')
      return image
    } finally {
      generating.delete(client.home)
    }
  }
}
