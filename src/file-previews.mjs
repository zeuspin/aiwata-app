export function artifactReference(payload) {
  const { url, label } = payload ?? {}
  const target = typeof url === 'string' ? url.trim() : ''
  if (!target || target.length > 4096 || /[\\\p{Cc}]/u.test(target) || target.startsWith('//') ||
      (/^[a-z][\w+.-]*:/i.test(target) && !/^file:\/\/(?:localhost)?\//i.test(target))) return null
  const name = target.split('/').at(-1)
  if (!name || name === '.' || name === '..') return null
  const title = typeof label === 'string' ? label.trim() : ''
  return { target, label: (title || name).slice(0, 100) }
}

export function addFilePreview(previews = [], preview) {
  if (!preview || previews.some(item => item.target === preview.target)) return previews
  return [...previews, preview].slice(-12)
}
