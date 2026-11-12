import { closeTabs } from './tabs.mjs'
import { tools } from './fixtures.mjs'
import { emptyBrowserState } from './tool-surfaces.mjs'

// Legacy tabs use their type as an ID; new multi-instance tabs have stable IDs.
export function toolType(chat, id) {
  return chat?.toolInstances?.[id]?.type ?? (tools.includes(id) ? id : null)
}

export function browserTabId(chat) {
  if (toolType(chat, chat?.tool) === '浏览器' && chat?.tabs?.includes(chat.tool)) return chat.tool
  return chat?.tabs?.findLast(id => toolType(chat, id) === '浏览器') ?? null
}

export function browserState(chat, id = browserTabId(chat)) {
  return id && id !== '浏览器' ? chat?.toolInstances?.[id]?.browser ?? emptyBrowserState : chat?.browser ?? emptyBrowserState
}

export function browserPatch(chat, browser, id = browserTabId(chat)) {
  return id && id !== '浏览器'
    ? { toolInstances: { ...chat.toolInstances, [id]: { ...chat.toolInstances[id], browser } } }
    : { browser }
}

export function toolEditsFor(chat, id) {
  return chat?.toolInstances?.[id]?.toolEdits ?? (toolType(chat, id) === '终端' && id !== '终端' ? {} : chat?.toolEdits)
}

export function toolChat(chat, id) {
  if (!chat || (!chat.toolInstances?.[id] && toolType(chat, id) !== '浏览器')) return chat
  return { ...chat, sourceChat: chat, toolInstanceId: id, browser: browserState(chat, id), toolEdits: toolEditsFor(chat, id) }
}

export function terminalInstanceId(id) {
  return id?.startsWith('终端:') ? id.slice('终端:'.length) : undefined
}

// A snapshot is the whole session log. Keep stable ownership so replaying it
// cannot turn a newly opened blank browser into the previous browser's replay.
export function restoreBrowserActions(chat, actions) {
  const open = (chat.tabs ?? []).filter(id => toolType(chat, id) === '浏览器')
  const owners = { ...chat.browserActionOwners }
  const known = new Set([...open, ...(chat.browser ? ['浏览器'] : [])])
  for (const id of known) {
    for (const action of browserState(chat, id).agentActions) {
      if (action.id && !owners[action.id]) owners[action.id] = id
    }
  }
  const destination = browserTabId(chat) ?? '浏览器'
  for (const action of actions) {
    if (!owners[action.id]) {
      owners[action.id] = destination
      known.add(destination)
    }
  }
  let patch = { browserActionOwners: Object.fromEntries(actions.map(action => [action.id, owners[action.id]])) }
  for (const id of known) {
    const browser = browserState(chat, id)
    const agentActions = actions.filter(action => owners[action.id] === id)
    if (!agentActions.length && !browser.agentActions.length) continue
    const selected = browser.agentActions[browser.replayIndex]?.id
    const replayIndex = selected ? agentActions.findIndex(action => action.id === selected) : -1
    patch = { ...patch, ...browserPatch({ ...chat, ...patch }, {
      ...browser, agentActions, replayIndex: replayIndex < 0 ? null : replayIndex,
    }, id) }
  }
  return patch
}

// Capture exact IDs before awaiting native termination. Failed closes retain
// their tab; a new tab opened while awaiting acknowledgement is never removed.
export async function closeToolInstances(api, chatId, target, strategy, closeTerminal) {
  const record = api.current()
  const chat = record?.chats[chatId]
  if (!chat) return { closed: [], failed: [] }
  const { remaining } = closeTabs(chat.tabs, chat.tool, target, strategy)
  const targets = chat.tabs.filter(id => !remaining.includes(id))
  const results = await Promise.allSettled(targets.map(async id => {
    if (closeTerminal && toolType(chat, id) === '终端') {
      const result = await closeTerminal(id)
      if (!result?.ok) throw new Error('终端尚未确认关闭，请重试。')
    }
    return id
  }))
  if (api.current() !== record || api.getChat(chatId) !== chat) return { closed: [], failed: [] }
  const closed = [], failed = []
  results.forEach((result, index) => {
    if (result.status === 'rejected') failed.push({ id: targets[index], error: result.reason })
    else if (chat.tabs.includes(result.value) && api.closeTools(chatId, result.value, 'one')) closed.push(result.value)
  })
  return { closed, failed }
}
