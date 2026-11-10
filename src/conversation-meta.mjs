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

export const markerEmojis = [
  ['⭐', '星星'], ['📌', '图钉'], ['🚩', '旗帜'], ['🎯', '目标'],
  ['💡', '灵感'], ['🎨', '设计'], ['🧪', '实验'], ['📝', '笔记'],
  ['📚', '资料'], ['🛠️', '工具'], ['🚀', '发布'], ['🐛', '缺陷'],
  ['🔍', '排查'], ['🧩', '拼图'], ['📦', '交付'], ['🤝', '协作'],
  ['❤️', '收藏'], ['🔥', '热门'], ['💬', '讨论'], ['🌱', '想法'],
]

const markerOptions = { color: markerColors, emoji: markerEmojis }

export function markerDetails(marker) {
  if (!Object.hasOwn(markerOptions, marker?.kind)) return undefined
  return markerOptions[marker.kind].find(([value]) => value === marker.value)
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
