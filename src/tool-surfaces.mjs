import { nextBrowserAnnotationNumber, pendingBrowserAnnotations } from './browser-annotation-state.mjs'
export { annotationDestination, nextBrowserAnnotationNumber, pendingBrowserAnnotations } from './browser-annotation-state.mjs'

export const demoBrowser = 'https://preview.aiwata.local'
export const imageAspectRatios = { square: '1:1 方形', landscape: '16:9 横向', portrait: '9:16 纵向' }
export const maxImageBytes = 8_000_000
export const emptyBrowserState = {
  visited: '', history: [''], historyIndex: 0,
  annotations: [], annotationDrafts: {}, agentActions: [], playbackOpen: false, replayIndex: null,
}

export const emptyAnnotationDraft = { open: false, target: '', text: '' }

export function editBrowserAnnotation(state, url, patch) {
  const annotationDrafts = { ...state.annotationDrafts }
  const draft = { ...emptyAnnotationDraft, ...annotationDrafts[url], ...patch }
  if (draft.open || draft.target || draft.text || draft.capture) annotationDrafts[url] = draft
  else delete annotationDrafts[url]
  return { ...state, annotationDrafts }
}

export function saveBrowserAnnotation(state, url, { continueMarking = false } = {}) {
  const draft = state.annotationDrafts?.[url]
  if (!draft || (!draft.text.trim() && !draft.capture)) return state
  const existing = draft.id ? state.annotations.find(pin => pin.id === draft.id && pin.url === url) : null
  const next = nextBrowserAnnotationNumber(state, url)
  const number = existing?.number ?? draft.capture?.number ?? next
  if (draft.capture && (!Number.isSafeInteger(number) || number <= 0 || (!existing && number < next) ||
    pendingBrowserAnnotations(state, url).some(pin => pin.number === number && pin.id !== existing?.id))) return state
  const pin = { ...(existing ?? {}), url, target: draft.target || '整个页面', text: draft.text.trim(),
    ...(draft.capture ? { id: existing?.id ?? draft.id ?? crypto.randomUUID(), number, capture: { ...draft.capture, number } } : {}) }
  const annotationDrafts = { ...state.annotationDrafts }
  delete annotationDrafts[url]
  if (continueMarking) annotationDrafts[url] = { ...emptyAnnotationDraft, open: true }
  const annotations = existing ? state.annotations.map(item => item === existing ? pin : item) : [...state.annotations, pin]
  return { ...state, annotations, annotationDrafts,
    ...(draft.capture ? { annotationBatchNumbers: { ...state.annotationBatchNumbers, [url]: Math.max(number, state.annotationBatchNumbers?.[url] ?? 0) } } : {}) }
}

export function browserAnnotationPrompt(url, pins) {
  return ['请查看以下网页批注', url, ...pins.map((pin, index) => (index + 1) + '. ' + pin.target + ' · ' + pin.text)].join('\n')
}

export const toolEditDefaults = {
  notes: [], setting: 50, imageProvider: null, imageEditSource: '样例图像',
  imageEditPrompt: '', imageEditedFile: null, clipBounds: [0, 15], elapsed: 0,
  videoProvider: 'none', videoUrl: '', videoEditPrompt: '',
  prompt: '', aspect: 'square', generated: '', generatedFile: null,
  terminalLog: [], worktrees: [], activeWorktreePath: null,
  gitStaged: {}, gitFilter: '全部', gitSelected: null,
  fileFilter: '全部', selectedFile: null,
  readingPositions: {},
}

export const emptyToolData = {
  playing: false, artifacts: [],
}

export function browserAddress(input) {
  const value = input.trim()
  if (!value) return ''
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value)
  const hasHost = /^(?:localhost|[^\s/:]+\.[^\s/:]+)(?::\d+)?(?:[/?#]|$)/i.test(value)
  if (!hasScheme && !hasHost) return demoBrowser + '/search?q=' + encodeURIComponent(value)

  try {
    const url = new URL(!hasScheme || hasHost ? 'https://' + value : value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export function navigateBrowser(state, input) {
  const visited = browserAddress(input)
  if (visited === null) return state
  if (visited === state.visited) return state.replayIndex === null ? state : { ...state, replayIndex: null }
  const history = [...state.history.slice(0, state.historyIndex + 1), visited]
  return { ...state, visited, page: null, history, historyIndex: history.length - 1, replayIndex: null }
}

export function moveBrowser(state, by) {
  const historyIndex = state.historyIndex + by
  const visited = state.history[historyIndex]
  return visited === undefined ? state : { ...state, visited, page: null, historyIndex, replayIndex: null }
}

export function recordBrowserAction(state, action) {
  const url = typeof action.url === 'string' ? browserAddress(action.url) : null
  if (!url) return state
  return {
    ...navigateBrowser(state, url),
    agentActions: [...state.agentActions, { action: 'navigate', label: action.label, url }].slice(-40),
  }
}

export const mediaProviders = {
  image: {
    managed: { name: '托管 · Krea 3', generate: true, edit: true, managed: true },
    kreaStyle: { name: 'Krea 2 · 自有额度', generate: true, edit: false, styleOnly: true },
    openai: { name: 'OpenAI · 自有额度', generate: true, edit: true },
    meta: { name: 'Meta · 自有额度', generate: true, edit: false },
    none: { name: '未配置图片供应商' },
  },
  video: {
    none: { name: '未配置视频供应商' },
    fal: { name: 'fal · 自有额度', edit: false },
    xai: { name: 'xAI · 自有额度', edit: true },
  },
}

export const gitChanges = [
  { path: 'src/workspace.js', summary: '+2 −1', patch: ['@@ -1,2 +1,3 @@', ' export const workspace = {', '-  preview: false,', '+  preview: true,', '+  layout: "split",', ' }'] },
  { path: 'README.md', summary: '+3', patch: ['@@ -1,2 +1,5 @@', ' # 项目工作区', '+', '+## 本地预览', '+从会话右侧工具区打开浏览器。'] },
]

export function terminalOutput(command, cwd, branch, staged, files) {
  const commands = {
    help: '可用命令：pwd、ls、git status、clear、help',
    pwd: cwd,
    ls: files.join('  ') || '（空目录）',
    'git status': branch ? [
      'On branch ' + branch,
      ...gitChanges.map(({ path }) => (staged.includes(path) ? '  staged:   ' : '  modified: ') + path),
    ].join('\n') : 'fatal: 当前目录没有 Git 仓库',
  }
  return Object.hasOwn(commands, command) ? commands[command] : '演示终端不支持此命令。输入 help 查看可用命令。'
}
