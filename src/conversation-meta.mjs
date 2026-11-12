export const markerColors = [
  ['red', '红色', '#c55c55'],
  ['orange', '橙色', '#cf803e'],
  ['yellow', '黄色', '#c9a334'],
  ['green', '绿色', '#59966a'],
  ['teal', '青色', '#3f9791'],
  ['blue', '蓝色', '#5b84c4'],
  ['purple', '紫色', '#8969ba'],
  ['gray', '灰色', '#858986'],
]

export function markerDetails(marker) {
  if (marker?.kind !== 'color') return undefined
  const preset = markerColors.find(([value]) => value === marker.value)
  if (preset) return preset
  if (/^#[0-9a-f]{6}$/i.test(marker.value ?? '')) return [marker.value, '自定义颜色 ' + marker.value, marker.value]
}

export function randomProjectMarker(projects = []) {
  const used = new Set(projects.map(project => project.marker?.value))
  const available = markerColors.filter(([value]) => !used.has(value))
  const choices = available.length ? available : markerColors
  return { kind: 'color', value: choices[Math.floor(Math.random() * choices.length)][0] }
}

// Legacy gateway records need a stable fallback across reloads and windows.
export function projectMarker(color, id) {
  const marker = { kind: 'color', value: color }
  if (markerDetails(marker)) return marker
  let hash = 0
  for (const char of String(id)) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return { kind: 'color', value: markerColors[hash % markerColors.length][0] }
}

export const statusLabels = {
  working: '运行中',
  'needs-input': '等待你处理',
  background: '后台运行',
  stalled: '运行中，暂时无更新',
  unread: '未读',
  draft: '草稿',
  idle: '空闲',
}

export function conversationStatus(chat) {
  const { activity, pending, unread, messages } = chat
  // Hermes only treats a quiet turn as stalled while it is still running.
  if (activity?.needsInput) return 'needs-input'
  if (pending || activity?.working) return activity?.stalled ? 'stalled' : 'working'
  if (activity?.queuePaused) return 'needs-input'
  if (activity?.background) return 'background'
  if (unread) return 'unread'
  return messages.length ? 'idle' : 'draft'
}

export const showsRunningArc = status => ['working', 'stalled', 'background'].includes(status)
