export const sources = [
  ['managed', 'AIWATA 托管', '每轮演示消耗 12 积分'],
  ['byok', '自带 API Key', '使用自有供应商额度'],
  ['local', '本地模型', '使用本机模型服务'],
]

export const models = [
  { source: 'managed', provider: 'zai', id: 'glm-5.3', label: 'GLM-5.3', description: '智谱 · AIWATA 托管' },
  { source: 'byok', provider: 'openai', id: 'gpt-5.4', label: 'GPT-5.4', description: 'OpenAI · 需要配置 API Key' },
  { source: 'byok', provider: 'anthropic', id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Anthropic · 需要配置 API Key' },
  { source: 'local', provider: 'custom', id: 'qwen3:8b', label: 'Qwen3 8B', description: 'Ollama · 需要安装本地模型' },
]

export const approvalModes = [
  { id: 'manual', label: '手动审批', description: '执行需要审批的操作前询问' },
  { id: 'smart', label: '智能审批', description: '自动评估需要审批的操作，并在需要时询问' },
  { id: 'off', label: '关闭审批', description: '跳过审批提示，仍受运行环境权限约束' },
]

const oldApprovalModes = { '请求批准': 'manual', '帮我批准': 'smart', '完全访问权限': 'off' }

export const commands = [
  { name: 'help', description: '查看原型中的指令' },
  { name: 'new', description: '开始一条新会话' },
  { name: 'title', args: '<名称>', description: '重命名当前会话' },
  { name: 'compact', description: '查看上下文压缩演示' },
  { name: 'status', description: '查看当前会话状态' },
  { name: 'journey', description: '打开工作台记忆面板' },
  { name: 'skills', description: '浏览可用技能' },
  { name: 'resume', args: '<会话 ID>', description: '按 ID 继续已有会话' },
  { name: 'tools', description: '查看当前工作台工具' },
  { name: 'cron', description: '查看计划任务' },
  { name: 'model', args: '[模型]', description: '选择本会话的模型与用量来源' },
  { name: 'approvals', args: '[manual|smart|off]', description: '查看或更改配置档的审批方式' },
]

export const referenceKinds = [
  ['file', '文件路径', 'file'],
  ['folder', '文件夹路径', 'folder'],
  ['url', '网页链接', 'link'],
  ['image', '图片路径', 'photo'],
  ['git', 'Git 对象', 'file'],
]

export const attachmentSizeLimit = 16 * 1024 * 1024

export function getModel(chat) {
  return models.find(model => model.source === chat.source && model.id === chat.model && model.provider === chat.provider)
    ?? models.find(model => model.source === chat.source)
    ?? models[0]
}

export function getApprovalMode(profileMode, legacyMode) {
  return approvalModes.find(mode => mode.id === (profileMode || oldApprovalModes[legacyMode] || legacyMode))
    ?? approvalModes[0]
}

export function getTrigger(value, caret) {
  const head = value.slice(0, caret)
  const slash = /^\s*(\/([\p{L}\p{N}_:\/-]*))$/u.exec(head)
  const mention = /(?:^|\s)(@([^\s@]*))$/.exec(head)
  const match = slash ?? mention
  if (!match) return null
  const tail = value.slice(caret).match(slash ? /^[\p{L}\p{N}_:\/-]*/u : /^[^\s@]*/)[0]
  return { kind: slash ? '/' : '@', query: match[2], start: caret - match[1].length, end: caret + tail.length }
}

export function replaceTrigger(value, trigger, insert, complete) {
  const suffix = value.slice(trigger.end)
  const space = complete && !/^\s/.test(suffix) ? ' ' : ''
  const text = value.slice(0, trigger.start) + insert + space + suffix
  const caret = trigger.start + insert.length + (complete ? 1 : 0)
  return { text, caret }
}

export function referenceText(kind, value) {
  const quote = /[\s()[\]{}<>"'`]/.test(value) && ['`', '"', "'"].find(delimiter => !value.includes(delimiter))
  return '@' + kind + ':' + (quote ? quote + value + quote : value)
}

export function isSlashCommandName(value) {
  return typeof value === 'string' && value.length <= 200 &&
    /^(?:[\p{L}\p{N}_-]+:)?[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(value)
}

export function parseSlash(value) {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(value.trim())
  return match && isSlashCommandName(match[1]) ? [match[1].toLowerCase(), match[2] ?? ''] : null
}
