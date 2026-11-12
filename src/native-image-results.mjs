// Resolve the original image.generate result through its existing native readers.
export async function resolveGeneratedImage(result, { api, host, route }) {
  if (!result.success) throw new Error(result.error || '原生图像生成未完成。')
  let data = result.image_data
  if (!data) {
    const reference = String(result.image || '')
    if (!reference) throw new Error('原生后端未返回可读取的图像产物。')
    if (reference.startsWith('data:image/')) data = reference
    else if (/^https?:\/\//i.test(reference)) {
      const response = await api('/api/media/proxy?url=' + encodeURIComponent(reference))
      data = typeof response === 'string' ? response : response.dataUrl
    } else {
      const path = reference.startsWith('file:') ? decodeURIComponent(new URL(reference).pathname) : reference
      const response = route?.connectionId === 'local' && host?.readFileDataUrl
        ? await host.readFileDataUrl(path) : await api('/api/fs/read-data-url?path=' + encodeURIComponent(path))
      if (typeof response !== 'string' && response.error) throw new Error(response.message || response.error)
      data = typeof response === 'string' ? response : response.dataUrl
    }
  }
  const match = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(data || '')
  if (!match) throw new Error('原生图像产物无法读取，或返回内容不是图像。')
  return { imageData: data, mime: match[1].toLowerCase() }
}
