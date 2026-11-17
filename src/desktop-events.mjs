import { messageReactionPatch } from './message-reactions.mjs'
import { browserState, toolType } from './tool-tabs.mjs'
import { webPreviewAddress } from './web-preview.mjs'
import { mergeConnectionRequest } from './connection-request.mjs'

export function desktopEventPatch(chat, type, payload = {}, viewed) {
  if (viewed && ((type === 'pane.reveal' && ['chat', 'files', 'terminal', 'review', 'sessions'].includes(payload.pane)) ||
      (type === 'tip.show' && typeof payload.selector === 'string' && typeof payload.text === 'string'))) {
    return { desktopEffect: { type, payload } }
  }
  if (type === 'agent.terminal.output' && typeof payload.process_id === 'string' && /^[\w-]{1,100}$/.test(payload.process_id) && typeof payload.chunk === 'string') {
    const id = '终端:agent:' + payload.process_id
    const previous = chat.toolInstances?.[id]
    return { tabs: chat.tabs.includes(id) ? chat.tabs : [...chat.tabs, id],
      toolInstances: { ...chat.toolInstances, [id]: { ...previous, type: '终端', agentProcess: {
        id: payload.process_id, output: ((previous?.agentProcess?.output ?? '') + payload.chunk).slice(-256000),
      } } } }
  }
  if (type === 'terminal.close' || type === 'preview.close') {
    const address = payload.url ? webPreviewAddress(payload.url) : null
    if (type === 'preview.close' && payload.url && !address) return null
    const tabs = chat.tabs.filter(id => type === 'terminal.close'
      ? chat.toolInstances?.[id]?.agentProcess?.id !== payload.process_id
      : toolType(chat, id) !== '浏览器' || (address && browserState(chat, id).visited !== address))
    const tool = tabs.includes(chat.tool) ? chat.tool : tabs.at(-1) ?? null
    return { tabs, tool, view: tabs.length ? chat.view : 'hidden', toolInstances: chat.toolInstances }
  }
  if (type === 'connection.request' || type === 'connection.update') {
    const next = mergeConnectionRequest(chat.connectionRequest, payload, { replace: type === 'connection.request' })
    return next && next !== chat.connectionRequest ? { connectionRequest: next } : null
  }
  if (type === 'message.reaction') return messageReactionPatch(chat, payload)
  return null
}
