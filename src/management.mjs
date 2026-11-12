export const managedSections = new Set(['project-settings', 'bot-settings', 'tasks', 'skills', 'connectors', 'memory'])

export const defaultProfile = 'default'

export const groupRouting = {
  auto: '自动分派',
  everyone: '全员参与',
  lead: '由主导 Bot 协调',
}

export const platforms = {
  weixin: { name: '微信', icon: 'wechat', fields: [['account', '微信 Bot 账号'], ['allowlist', '允许的用户标识（可选）']], credential: '配对凭据样例' },
  telegram: { name: 'Telegram', icon: 'link', fields: [['allowlist', '允许的用户 ID（可选）']], credential: 'Bot Token 样例' },
  discord: { name: 'Discord', icon: 'link', fields: [['allowlist', '允许的用户 ID（可选）']], credential: 'Bot Token 样例' },
  slack: { name: 'Slack', icon: 'link', fields: [['allowlist', '允许的用户 ID（可选）']], credential: 'Bot Token 样例' },
  email: { name: '电子邮件', icon: 'mail', fields: [['account', '邮箱地址'], ['imap', 'IMAP 主机'], ['smtp', 'SMTP 主机']], credential: '应用密码样例' },
}

export const skillCatalog = [
  { id: 'visual-review', name: '视觉对照', category: '设计', source: '工作区样例', description: '对照产品截图，检查布局、字号与间距。', installed: true, enabled: true },
  { id: 'session-summary', name: '会话总结', category: '效率', source: '工作区样例', description: '提炼会话要点并形成交付清单。', installed: true, enabled: true },
  { id: 'asset-organizer', name: '素材整理', category: '效率', source: '目录样例', description: '按用途归类素材，标出待处理项。' },
  { id: 'copy-review', name: '文案审阅', category: '写作', source: '目录样例', description: '审查用语、可读性与术语一致性。' },
  { id: 'browser', name: '网页操作', category: '研究', source: '内置样例', description: '在网页中查找内容、操作控件并记录结果。' },
]

const taskDefaults = {
  digest: { schedule: '0 9 * * 1', prompt: '整理本周项目进展、下一步与待决问题。' },
  reading: { schedule: '0 17 * * 5', prompt: '整理本周的阅读清单。' },
}

const scheduleDays = new Set([
  'day', 'daily', 'everyday', 'weekday', 'weekdays', 'weekend', 'weekends',
  'sun', 'sunday', 'mon', 'monday', 'tue', 'tues', 'tuesday', 'wed', 'weds', 'wednesday',
  'thu', 'thur', 'thurs', 'thursday', 'fri', 'friday', 'sat', 'saturday',
])

export const memoryTypes = {
  memory: { icon: 'book', name: '工作记忆', source: 'MEMORY.md' },
  user: { icon: 'file', name: '用户偏好', source: 'USER.md' },
  skill: { icon: 'spark', name: '学习技能', source: 'SKILL.md' },
}

export const memorySettings = [
  ['memoryEnabled', '长期工作记忆', '在新会话中提供 MEMORY.md 里的工作上下文。'],
  ['userProfileEnabled', '用户偏好', '在新会话中提供 USER.md 里的偏好和背景。'],
  ['writeApproval', '记忆写入需批准', '在 Agent 写入记忆前请求确认。'],
]

const defaultMemory = {
  memoryEnabled: true, userProfileEnabled: true, writeApproval: false, curatorPaused: false, lastReview: null,
}

const memorySamples = {
  lin: [
    { id: 'memory:project-review', type: 'memory', title: '项目评审', content: '评审发布素材时，先给清单，再标出还需确认的文件。' },
    { id: 'user:language', type: 'user', title: '表达偏好', content: '工作总结用中文，保留产品名与文件名的原文。' },
    { id: 'skill:session-summary', type: 'skill', title: '会话总结', content: '# 会话总结\n\n先归纳结论，然后列出行动项与尚未决定的事项。' },
  ],
  qiao: [
    { id: 'memory:docs-nav', type: 'memory', title: '文档导航', content: '文档站按快速开始、操作指南和参考分组。' },
    { id: 'user:language', type: 'user', title: '表达偏好', content: '说明步骤时使用短句。' },
  ],
}

export function getManagement(record) {
  const saved = record.management ?? {}
  const legacyConnectors = { wechat: 'weixin', mail: 'email' }
  const tasks = saved.tasks ?? record.tasks.map(task => ({
    profile: defaultProfile, history: [], deliver: 'local', workdir: '', timezone: '', ...task, ...taskDefaults[task.id],
  }))
  const connectors = Object.entries(platforms).map(([id, platform]) => {
    const legacy = record.connectors.find(item => (legacyConnectors[item.id] ?? item.id) === id)
    return {
      id, name: platform.name, enabled: legacy?.enabled ?? false, configured: !!legacy,
      fields: {}, logs: [], legacyRuns: legacy?.runs ?? 0,
      ...saved.connectors?.find(item => item.id === id),
    }
  })
  return {
    ...saved, tasks, connectors, skills: saved.skills ?? {}, memory: saved.memory ?? {}, projectFolders: saved.projectFolders ?? {},
  }
}

export function getProfileSkills(management, profile) {
  return skillCatalog.map(skill => ({ ...skill, ...management.skills[profile]?.[skill.id] }))
}

export function getProfileMemory(accountId, management, profile) {
  return {
    ...defaultMemory, nodes: profile === defaultProfile ? memorySamples[accountId] ?? [] : [],
    ...management.memory[profile],
  }
}

export function canUseProfileId(value, bots, currentId) {
  if (currentId && bots.some(bot => bot.id === currentId && (bot.profile ?? bot.id) === value)) return true
  const reserved = ['default', 'hermes', 'aiwata', 'test', 'tmp', 'root', 'sudo', 'all', 'everyone']
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) && !reserved.includes(value)
    && !bots.some(bot => bot.id !== currentId && (bot.profile ?? bot.id) === value)
}

export function resolveGroupMembers(group, bots) {
  if (!group) return []
  const ids = group.members ?? bots.filter(bot => group.description?.split(' · ').includes(bot.name)).map(bot => bot.id)
  return ids.filter(id => groupMember(group,bots,id))
}

export function groupMember(group,bots,id) {
  return bots.find(bot=>bot.id===id) ?? group?.memberDetails?.find(member=>member.id===id)
}

export function isScheduleInput(value) {
  const schedule = value.trim()
  const duration = /^(?:every\s+|in\s+)?(\d*)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)$/i.exec(schedule)
  if (duration) return Number(duration[1] || 1) > 0
  if (/^\d{4}-\d\d-\d\d(?:[T ]\d\d:\d\d|$)/.test(schedule)) return Number.isFinite(Date.parse(schedule))
  const natural = /^(?:every\s+)?(.+?)\s+(?:at\s+)?(?:noon|midday|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i.exec(schedule)
  if (natural && natural[1].toLowerCase().split(/\s*,\s*|\s+and\s+/).every(day => scheduleDays.has(day))) return true
  const fields = schedule.split(/\s+/)
  if (fields.length < 5 || fields.length > 6) return false
  fields[3] = fields[3].replace(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/gi, '1')
  fields[4] = fields[4].replace(/sun|mon|tue|wed|thu|fri|sat/gi, '1')
  return fields.every(field => /^[\d*,/\-]+$/.test(field))
}

export function replaceEntry(entries, item) {
  return entries.some(entry => entry.id === item.id)
    ? entries.map(entry => entry.id === item.id ? item : entry)
    : [...entries, item]
}
