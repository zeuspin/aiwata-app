export const botHandle = bot => bot.profile || bot.id

export function routeRoomMessage(members, group, text, replyMemberId) {
  const matches = [...text.matchAll(/(?<![\p{L}\p{N}_.@-])@([\p{L}\p{N}_-]+)/gu)]
  const mentions = new Set(matches.map(match => match[1].toLowerCase()))
  if (mentions.has('all') || mentions.has('everyone')) return members
  const addressedIds = new Set()
  for (const mention of mentions) {
    const handleMatch = members.find(bot => botHandle(bot).toLowerCase() === mention)
    const nameMatches = handleMatch ? [handleMatch] : members.filter(bot => bot.name.toLowerCase() === mention)
    if (nameMatches.length === 1) addressedIds.add(nameMatches[0].id)
  }
  const addressed = members.filter(bot => addressedIds.has(bot.id))
  if (addressed.length) return addressed
  const repliedTo = members.find(bot => bot.id === replyMemberId)
  if (repliedTo) return [repliedTo]
  if (group.routing === 'lead') {
    const lead = members.find(bot => bot.id === group.lead)
    if (lead) return [lead, ...members.filter(bot => bot !== lead).slice(0, 1)]
  }
  if (group.routing === 'auto') {
    const matching = members.filter(bot => text.toLowerCase().includes(bot.name.toLowerCase()))
    return matching.length ? matching : members.slice(0, 1)
  }
  return members
}
