const activityTime = value => typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value) || 0

export function conversationPreview(chat, item) {
  const latest = chat?.messages?.findLast(message => ['user', 'agent', 'assistant'].includes(message.role) && message.text?.trim())
  const localTime = typeof latest?.timestamp === 'number' ? latest.timestamp : Date.parse(latest?.timestamp) || 0
  const nativeNewer = item.preview && (!latest || localTime > 0 && activityTime(item.lastActive) > localTime)
  return ((nativeNewer ? item.preview : latest?.text) || item.preview || item.description || '开始对话').replace(/\s+/g, ' ').trim()
}

export function directorySections(record, directory = {}, search = '') {
  const categories = directory.categories ?? []
  const placements = directory.placements ?? {}
  const pinned = directory.pinned ?? []
  const query = search.trim().toLocaleLowerCase()
  const entries = [...record.bots.filter(bot => !bot.isDefault).map(bot => ({ ...bot, kind: 'bot' })),
    ...record.groups.map(group => ({ ...group, kind: 'group' }))]
  return [...categories, { id: '', name: '未分组' }].map(category => ({ ...category,
    items: entries.filter(item => {
      const assigned = categories.some(row => row.id === placements[item.id]) ? placements[item.id] : ''
      return assigned === category.id && (!query || (item.name + ' ' + conversationPreview(record.chats[item.id], item)).toLocaleLowerCase().includes(query))
    }).sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id))),
  })).filter(category => !query || category.items.length)
}

export function updateDirectory(directory = {}, action) {
  const categories = directory.categories ?? []
  const placements = directory.placements ?? {}
  const pinned = directory.pinned ?? []
  switch (action.type) {
    case 'save-category': {
      const name = action.name.trim()
      if (!name) throw Error('请输入分类名称。')
      if (categories.some(row => row.id !== action.id && row.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('此分类名称已存在。')
      const next = { id: action.id, name }
      return { ...directory, categories: categories.some(row => row.id === action.id)
        ? categories.map(row => row.id === action.id ? next : row) : [...categories, next] }
    }
    case 'remove-category':
      return { ...directory, categories: categories.filter(row => row.id !== action.id),
        placements: Object.fromEntries(Object.entries(placements).filter(([, category]) => category !== action.id)) }
    case 'move':
      return { ...directory, placements: { ...placements, [action.id]: action.category } }
    case 'pin':
      return { ...directory, pinned: pinned.includes(action.id) ? pinned.filter(id => id !== action.id) : [...pinned, action.id] }
    default: return directory
  }
}
