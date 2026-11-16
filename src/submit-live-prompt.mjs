import { parseSlash } from './composer.mjs'
import { gatewayDraftFingerprint } from './live-aiwata.mjs'
import { botCreationCommand } from './bot-creation-command.mjs'
import { ensureBotManagementSkill } from './bot-inventory-sync.mjs'

const rejected = message => ({ ok: false, code: 'submit-rejected', message, retryable: true })
const unknown = message => ({ ok: false, code: 'timeout', message, retryable: false })
const accepted = chat => ({ ok: true, runtimeSessionId: chat.gatewayId, sessionId: chat.gatewayStoredId })

/** Shared composer/capture admission. External text never becomes the composer
 * draft. Native submission identity and exact wire request survive lost replies. */
export async function submitLivePrompt({ live, api, chat, folder, active, operations,
  onAccepted, refresh, recoverSubmission, restoreReceipt, replay, resume, externalInput, onReconcileError = () => {} }) {
  const id = chat.id, external = Boolean(externalInput)
  const text = (external ? externalInput.text : chat.draft).trim()
  const attachments = external ? [] : chat.attachments
  const attachmentDetails = external ? {} : chat.attachmentDetails
  const current = () => active() && !externalInput?.signal?.aborted && api.getChat(id) === chat
  const unchanged = () => current() && !chat.pending && (external || chat.draft.trim() === text && chat.attachments === attachments)
  let dispatched = false
  try {
    if (operations.has(id)) await operations.get(id)
    if (!unchanged()) return rejected('The target session is no longer available.')
    if (chat.gatewaySubmission) {
      if (external && chat.gatewaySubmission.id !== externalInput.runId) return rejected('The target session has an unresolved submission.')
      if (await recoverSubmission(chat)) return accepted(chat)
      if (external) return unknown('The previous native submission is still unconfirmed.')
    }
    if (!current()) return unknown('The owning workspace changed.')
    // Stored targets are resumed on their existing profile and proven BEFORE a
    // captured prompt is dispatched; an absent binding is not an identity proof.
    if (external && chat.gatewayStoredId || chat.gatewayStoredId && api.current().newChatDraft === chat) {
      const snapshot = await resume(chat)
      if (!current()) return unknown('The owning workspace changed.')
      if (externalInput?.expectedStoredId && (snapshot.stored_session_id ?? snapshot.session_id) !== externalInput.expectedStoredId) {
        return { ok: false, code: 'submit-identity-mismatch', retryable: false, message: 'The resumed session did not match the requested stored session.' }
      }
      if (external) api.hydrateGatewayChat(id, snapshot)
      else api.changeChat(id, { gatewayId: snapshot.session_id })
    } else if (!chat.gatewayId) {
      if (!chat.gatewayProfile && !chat.gatewayStoredId && !chat.gatewayCreation) {
        api.changeChat(id, { gatewayCreation: { request_id: id, ...(folder ? { cwd: folder } : {}), ...(chat.gatewayModelPick ?? {}) } })
      }
      const snapshot = chat.gatewayProfile ? await live.openBot(chat.gatewayProfile) : chat.gatewayStoredId
        ? await resume(chat) : await live.rpc('session.create', { ...chat.gatewayCreation, ...(live.native ? { source: 'desktop' } : {}) })
      if (!current()) return unknown('The owning workspace changed.')
      api.hydrateGatewayChat(id, snapshot, { gatewayCreation: null, gatewayModelPick: null })
    }
    if (!unchanged() || !chat.gatewayId) return rejected('The target session is busy or unavailable.')
    let wireText = text
    const explicitCommand = parseSlash(text)
    const automaticCommand = explicitCommand ? null : botCreationCommand(live, chat, text)
    const command = explicitCommand || automaticCommand
    if (command) {
      const saved = chat.gatewaySkill
      if (saved?.text === text && saved.sessionId === chat.gatewayId) wireText = saved.message
      else {
        if (automaticCommand) {
          await ensureBotManagementSkill(live, current)
          if (!unchanged()) return rejected('The target session changed before dispatch.')
        }
        const expansion = await live.capability('skill.expand', chat.gatewayProfile || 'default', { session_id: chat.gatewayId, name: command[0], arg: command[1] })
        if (!unchanged()) return rejected('The target session changed before dispatch.')
        wireText = expansion.message
        api.changeChat(id, { gatewaySkill: { text, sessionId: chat.gatewayId, message: wireText } })
      }
    }
    if (command && wireText !== text && !chat.gatewayPromptDisplays?.some(item => item.wireText === wireText)) {
      api.changeChat(id, { gatewayPromptDisplays: [...(chat.gatewayPromptDisplays ?? []), { wireText, text }] })
    }
    const uploads = []
    for (const name of attachments) {
      const entry = attachmentDetails?.[name]
      const blob = entry?.blobId && await api.readLocalAttachment(id, entry.blobId)
      if (!blob) throw new Error('无法读取附件「' + name + '」，请重新添加。')
      if (!current()) return unknown('The owning workspace changed.')
      const upload = await live.upload(chat.gatewayId, entry, blob, chat.gatewayProfile)
      uploads.push(upload.id)
    }
    if (!unchanged()) return rejected('The target session changed before dispatch.')
    const fingerprint = gatewayDraftFingerprint(text, attachments, attachmentDetails)
    const runId = external ? externalInput.runId : chat.gatewaySubmission?.fingerprint === fingerprint ? chat.gatewaySubmission.id : crypto.randomUUID()
    const input = { runId, text, attachments, attachmentDetails, ...(external ? { preserveDraft: true } : {}) }
    const submitted = { session_id: chat.gatewayId, submission_id: runId, text: wireText || '请查看附件。', ...(uploads.length ? { uploads } : {}) }
    const wireSubmission = live.native ? live.prepareUploads(submitted, chat.gatewayProfile) : null
    const attempt = { id: runId, fingerprint, input, ...(wireSubmission ? { wireSubmission } : {}) }
    api.changeChat(id, { gatewaySubmission: attempt })
    dispatched = true
    const receipt = await live.rpc('prompt.submit', wireSubmission ?? submitted, chat.gatewayProfile)
    if (!current()) return unknown('The owning workspace changed.')
    if (!receipt?.admission_id) return receipt?.admitted === false ? rejected(receipt.message || 'The prompt was not admitted.') : unknown('Native acceptance was not confirmed.')
    if (live.native && (receipt.submission_id !== runId || !['queued', 'started', 'terminal', 'unknown'].includes(receipt.status))) return unknown('Native acceptance did not confirm this submission identity.')
    if (receipt.session_id && receipt.session_id !== chat.gatewayId || receipt.stored_session_id && receipt.stored_session_id !== chat.gatewayStoredId) {
      return { ok: false, code: 'submit-identity-mismatch', retryable: false, message: 'Native acceptance identified another session.' }
    }
    if (['terminal', 'unknown'].includes(receipt.status) && await restoreReceipt(chat, attempt, receipt)) return accepted(chat)
    if (!api.acceptGatewayPrompt(id, input, receipt)) return unknown('Native acceptance could not be reconciled with the workspace.')
    api.changeChat(id, { gatewaySkill: null })
    // Backend admission is already proven. A presentation/replay failure must
    // be surfaced separately and must not invite duplicate delivery.
    try { onAccepted(id); refresh(); await replay(id) } catch (error) { onReconcileError(error) }
    return accepted(chat)
  } catch (error) {
    if (current() && dispatched && await recoverSubmission(chat).catch(() => false)) return accepted(chat)
    return dispatched ? unknown('Native acceptance is unknown; the exact submission was retained for recovery.')
      : rejected(error instanceof Error ? error.message : 'The prompt could not be prepared.')
  }
}
