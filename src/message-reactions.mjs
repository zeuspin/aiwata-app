export function messageReactions(metadata) {
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata) } catch { return [] }
  }
  return Array.isArray(metadata?.reactions) ? metadata.reactions.filter(item => item && typeof item.emoji === 'string' && item.emoji) : []
}

export function messageReactionPatch(chat, payload) {
  if (!Number.isSafeInteger(payload.row_id) || payload.row_id < 1 || !Array.isArray(payload.reactions)) return null
  const id = String(payload.row_id), reactions = messageReactions(payload)
  const known = chat.messages.findIndex(message => String(message.id) === id)
  const role = payload.role === 'assistant' ? 'agent' : 'user'
  const index = known < 0 ? chat.messages.findLastIndex(message => message.role === role && message.id == null) : known
  return {
    // A turn-end resume can contain the pre-reaction in-memory transcript. Keep
    // this session's live result until it is hydrated from durable metadata.
    gatewayReactions: { ...chat.gatewayReactions, [id]: reactions },
    messages: chat.messages.map((message, position) => position === index ? { ...message, id, reactions } : message),
  }
}
