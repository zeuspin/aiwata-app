export const accounts = [
  { id: 'lin', name: '林晓', initial: '林', color: '#a84732' },
  { id: 'qiao', name: '乔安', initial: '乔', color: '#566582' },
]

export const tools = ['浏览器', '无限画布', '修图工具', '剪辑工具', '生图工具', '文件与产物', '终端', 'Git']

export function createChat(id, title, projectId = null) {
  return {
    id, title, projectId, draft: '', attachments: [], messages: [], tabs: [],
    tool: null, view: 'hidden', source: 'managed', permission: '请求批准', model: 'AIWATA 托管',
    pending: null,
  }
}

export function seedAccount(id) {
  const isLin = id === 'lin'
  const projects = isLin
    ? [
        { id: 'studio', name: '品牌工作台', folder: '~/Projects/brand-studio' },
        { id: 'aiwata', name: 'AIWATA', folder: '~/Projects/aiwata' },
        { id: 'lab', name: '设计实验室', folder: '~/Projects/design-lab' },
        { id: 'work', name: '个人工作区', folder: '~/Projects/workspace' },
      ]
    : [
        { id: 'atlas', name: 'Atlas 文档站', folder: '~/Projects/atlas' },
        { id: 'week', name: '每周观察', folder: '~/Projects/weekly' },
      ]
  const starter = createChat(isLin ? 'plan' : 'atlas-chat', isLin ? '整理发布素材' : '搭建文档导航', projects[0].id)
  starter.messages = [
    { role: 'user', text: isLin ? '把这一轮发布素材整理成一份清单。' : '先整理文档站的导航结构。' },
    { role: 'agent', text: isLin
      ? '可以。我们先把发布素材按用途分组，再逐项确认交付状态。\n\n1. 产品截图 · 主工作台、会话和工具分栏\n2. 宣传素材 · 横版海报、方形封面和一组短片\n3. 发布文案 · 功能摘要、更新说明和使用入口'
      : '我会先按「快速开始」「操作指南」「参考」三组整理，再为每组列出页面和顺序。' },
  ]
  const seedChats = isLin ? [
    ['review', '校对产品截图', 'studio'],
    ['cover', '制作发布封面', 'studio'],
    ['research', '整理视觉参考', 'studio'],
    ['workspace', '工作台交互原型', 'aiwata'],
    ['handoff', '规划会话与工具联动', 'aiwata'],
    ['notes', '记录交互细节', 'aiwata'],
    ['canvas', '探索无限画布', 'lab'],
    ['image', '调整图片色调', 'lab'],
    ['weekly', '本周工作整理', 'work'],
  ] : [['notes-q', '整理工作札记', 'week']]
  const chats = Object.fromEntries(seedChats.map(([chatId, title, projectId]) => [chatId, createChat(chatId, title, projectId)]))
  chats[starter.id] = starter

  const bots = isLin
    ? [{ id: 'editor', name: '文案助手', description: '整理内容与发布文案' }, { id: 'designer', name: '设计助手', description: '跟进视觉与素材' }]
    : [{ id: 'researcher', name: '研究助手', description: '整理文档与参考资料' }]
  const groups = isLin ? [{ id: 'release', name: '发布协作群', description: '文案助手 · 设计助手' }] : []
  for (const item of [...bots, ...groups]) chats[item.id] = createChat(item.id, item.name)

  return {
    projects, chats, bots, groups,
    credits: isLin ? 1280 : 0,
    usage: [],
    tasks: isLin
      ? [{ id: 'digest', name: '每周项目摘要', schedule: '每周一 09:00', enabled: true, runs: 0 }]
      : [{ id: 'reading', name: '阅读清单整理', schedule: '每周五 17:00', enabled: true, runs: 0 }],
    connectors: isLin
      ? [{ id: 'wechat', name: '微信', schedule: '消息触发', enabled: true, runs: 0 }]
      : [{ id: 'mail', name: '电子邮件', schedule: '消息触发', enabled: true, runs: 0 }],
    assets: isLin ? ['产品截图清单.md', 'AIWATA 品牌指南.pdf', '发布文案初稿.md'] : ['Atlas 站点地图.md'],
  }
}
