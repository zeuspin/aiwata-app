const keepTab = {
  one: (index, target) => index !== target,
  others: (index, target) => index === target,
  right: (index, target) => index <= target,
  all: () => false,
}

export function insertTab(tabs, id, after) {
  if (tabs.includes(id)) return tabs
  const index = tabs.indexOf(after)
  return index < 0 ? [...tabs, id] : [...tabs.slice(0, index + 1), id, ...tabs.slice(index + 1)]
}

export function closeTabs(tabs, active, target, strategy = 'one') {
  const targetIndex = tabs.indexOf(target)
  const keep = keepTab[strategy]
  if (targetIndex < 0 || !keep) return { remaining: tabs, active }
  const remaining = tabs.filter((_, index) => keep(index, targetIndex))
  if (remaining.includes(active)) return { remaining, active }
  const index = tabs.indexOf(active)
  const next = tabs.find((_, candidate) => candidate > index && keep(candidate, targetIndex))
  return { remaining, active: next ?? remaining.at(-1) ?? null }
}

export function conversationSection(record, id) {
  return [...record.bots, ...record.groups].some(item => item.id === id) ? 'bots' : 'projects'
}
