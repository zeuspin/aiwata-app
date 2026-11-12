// Same Chinese kickoff as the original Bot Mode locale (bot.kickoff).
const kickoffText = '你好，介绍一下你自己吧！'
export function createBotBirths({ nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) } = {}) {
  const pending = new Map()
  return {
    queue(profile, creationId) { pending.set(profile, creationId) },
    clear() { pending.clear() },
    async afterHydrate({ chat, created, isCurrent, probe, send }) {
      const creationId = pending.get(chat.gatewayProfile)
      if (!creationId || !isCurrent()) return
      // Consume before awaiting: reopening or concurrent mount cannot repeat a
      // model call. Adoption never earns a birth prompt, even for an empty row.
      pending.delete(chat.gatewayProfile)
      if (!created || chat.messages?.length) return
      const readiness = await probe().catch(() => null)
      if (!isCurrent()) return
      if (readiness?.ok === false) return { needsModel: true }
      await nextPaint()
      if (!isCurrent()) return
      return send(chat, { text: kickoffText, runId: 'bot-birth:' + creationId,
        expectedStoredId: chat.gatewayStoredId })
    },
  }
}
