export const demoBrowser = 'https://preview.aiwata.local'
export const emptyBrowserState = {
  visited: '', history: [''], historyIndex: 0,
  annotations: [], annotationDrafts: {}, agentActions: [], playbackOpen: false, replayIndex: null,
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
  return { ...state, visited, history, historyIndex: history.length - 1, replayIndex: null }
}

export function moveBrowser(state, by) {
  const historyIndex = state.historyIndex + by
  const visited = state.history[historyIndex]
  return visited === undefined ? state : { ...state, visited, historyIndex, replayIndex: null }
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
