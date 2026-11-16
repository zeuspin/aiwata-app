import { useEffect, useRef, useState } from 'react'
import { createBotInventorySync, ensureBotManagementSkill } from './bot-inventory-sync.mjs'
import { submitLivePrompt } from './submit-live-prompt.mjs'
import { createDesktopRequestDispatcher } from './desktop-requests.mjs'

export function useLiveWorkbench({ live, api, accountId, chatId, refresh, report, onAccepted, onPreviewRequest, onDesktopRequest, onDesktopEvent, onNativeEvent }) {
  const profileKey = profile => profile === live?.route?.profile ? '' : (profile ?? '')
  const [status, setStatus] = useState('connecting')
  const [model, setModel] = useState(null)
  const [sending, setSending] = useState(null)
  const [resolving, setResolving] = useState(null)
  const [changingModel, setChangingModel] = useState(null)
  const [desktopRequestState, setDesktopRequests] = useState(() => ({ accountId, requests: [] }))
  const [desktopRequestBusy, setDesktopRequestBusy] = useState(null)
  const [desktopRequestError, setDesktopRequestError] = useState('')
  const desktopDispatcher = useRef(null)
  const operations = useRef(new Map())
  const sendingId = useRef(null)
  const modelChange = useRef(null)
  const currentSend = useRef(null)
  const watching = useRef(false)
  const connection = useRef(live)
  connection.current = live
  const syncBots = useRef(null)
  const currentChat = useRef(chatId)
  const reportError = useRef(report)
  const afterAcceptance = useRef(onAccepted)
  const inspectPreview = useRef(onPreviewRequest)
  const inspectDesktop = useRef(onDesktopRequest)
  const desktopEvent = useRef(onDesktopEvent)
  const nativeEvent = useRef(onNativeEvent)
  currentChat.current = chatId
  reportError.current = report
  afterAcceptance.current = onAccepted
  inspectPreview.current = onPreviewRequest
  inspectDesktop.current = onDesktopRequest
  desktopEvent.current = onDesktopEvent
  nativeEvent.current = onNativeEvent
  const active = () => watching.current && api.accountId === accountId && connection.current === live
  const call = (chat, method, params) => live.rpc(method, params, chat.gatewayProfile)
  const resume = chat => call(chat, 'session.resume', { session_id: chat.gatewayStoredId, ...(live.native ? { source: 'desktop' } : {}) })

  async function checkModel() {
    try {
      const result = await live.rpc('setup.runtime_check')
      if (active()) setModel(result)
    } catch (error) {
      if (active()) setModel({ error: error.message })
    }
  }

  function apply(id, frame, notifyDesktop = true) {
    if (!active() || !api.applyGatewayFrame(id, frame, currentChat.current === id)) return false
    refresh()
    const event = frame.params
    if (event?.type === 'message.complete') void syncBots.current?.()
    const session = api.getChat(id)
    if (notifyDesktop && active() && currentChat.current === id && session &&
        profileKey(session.gatewayProfile) === profileKey(frame.profile) &&
        (event?.execution_generation == null || event.execution_generation === session.gatewayGeneration) &&
        ['preview.open', 'preview.close', 'pane.reveal', 'tip.show', 'terminal.close', 'agent.terminal.output', 'message.reaction'].includes(event?.type)) {
      try { desktopEvent.current?.(session, event.type, event.payload ?? {}) }
      catch { reportError.current('无法显示这个桌面事件，请重新打开会话后重试。', true) }
    }
    return true
  }

  async function replay(id) {
    const chat = api.getChat(id)
    if (!chat?.gatewayId || !chat.pending || !active()) return
    const frames = await call(chat, 'session.events.since', {
      session_id: chat.gatewayId, last_seen: chat.gatewaySeq ?? 0, replay_epoch: chat.gatewayEpoch,
    })
    if (!active() || api.getChat(id) !== chat) return
    for (const event of frames.events ?? []) {
      const frame = { method: 'event', params: event, profile: chat.gatewayProfile ?? '' }
      desktopDispatcher.current?.handle(frame)
      apply(id, frame, false)
    }
    for (const request of frames.open_requests ?? []) {
      const frame = { ...request, profile: chat.gatewayProfile ?? '' }
      if (!desktopDispatcher.current?.handle(frame)) apply(id, frame, false)
    }
  }

  async function restoreReceipt(chat, attempt, receipt) {
    const snapshot = await resume(chat)
    if (!active() || api.getChat(chat.id) !== chat || !api.recoverGatewayPrompt(chat.id, attempt, receipt, snapshot)) return false
    api.changeChat(chat.id, { gatewaySkill: null })
    try {
      afterAcceptance.current(chat.id); refresh()
      if (chat.pending) await replay(chat.id)
    } catch { if (active()) reportError.current('消息已由原生后端接收，但视图同步失败；重新打开会话可恢复。', true) }
    return true
  }

  async function recoverSubmission(chat) {
    const attempt = chat?.gatewaySubmission
    if (!attempt?.input || !chat.gatewayStoredId || !active()) return false
    const receipt = await live.submission(chat.gatewayStoredId, attempt.id, chat.gatewayProfile, attempt.wireSubmission)
    return Boolean(receipt?.admission_id && await restoreReceipt(chat, attempt, receipt))
  }

  async function open(id) {
    const existing = operations.current.get(id)
    if (existing) return existing
    const chat = api.getChat(id)
    if (!live || !chat || !(chat.gatewayStoredId || chat.gatewayProfile) || !active()) return
    if (sendingId.current === id) return
    let canonicalCreated = false
    const job = (async () => {
      if (chat.gatewaySubmission?.input && await recoverSubmission(chat)) return
      const snapshot = chat.gatewayProfile ? await live.openBot(chat.gatewayProfile) : await resume(chat)
      if (!active() || api.getChat(id) !== chat) return
      api.hydrateGatewayChat(id, snapshot)
      canonicalCreated = snapshot.botCanonicalCreated === true
      refresh()
      if (chat.pending) await replay(id)
    })().finally(() => {
      operations.current.delete(id)
      if (!live.afterBotHydrated || !chat.gatewayProfile) return
      const isCurrent = () => active() && currentChat.current === id && api.getChat(id) === chat && !chat.pending && !chat.gatewaySubmission
      void live.afterBotHydrated({ chat, created: canonicalCreated, isCurrent,
        probe: () => live.rpc('setup.runtime_check', { profile: chat.gatewayProfile }),
        send: (target, input) => currentSend.current(target, undefined, input),
      }).then(result => {
        if (!isCurrent()) return
        if (result?.needsModel) reportError.current('Bot 已创建，请先为它配置可用模型。', true)
        else if (result?.ok === false) reportError.current('Bot 已创建，自我介绍未完成；可直接发送消息。', true)
      }).catch(() => { if (isCurrent()) reportError.current('Bot 已创建，自我介绍未完成；可直接发送消息。', true) })
    })
    operations.current.set(id, job)
    return job
  }

  useEffect(() => {
    if (!live) return
    watching.current = true
    let currentInventory = true
    const inventoryActive = () => currentInventory && active()
    const refreshInventory = createBotInventorySync({ live, api, active: inventoryActive, refresh, report: (...args) => reportError.current(...args) })
    syncBots.current = refreshInventory
    void ensureBotManagementSkill(live, inventoryActive).catch(error => {
      if (inventoryActive()) reportError.current('主 Bot 创建技能未就绪：' + error.message, true)
    })
    setDesktopRequestBusy(null)
    setDesktopRequestError('')
    const resolveSession = frame => {
      const gatewayId = frame.params?.session_id
      if (!gatewayId) return null
      const record = api.current()
      return [...Object.values(record.chats), ...Object.values(record.gatewayCaptureDrafts ?? {}), record.newChatDraft].find(item => item &&
        profileKey(item.gatewayProfile) === profileKey(frame.profile) &&
        (item.gatewayId === gatewayId || item.gatewayStoredId === gatewayId)) ?? null
    }
    const dispatcher = createDesktopRequestDispatcher({
      active, currentChatId: () => currentChat.current, resolveSession,
      invoke: (session, method, params, signal) => {
        const callback = inspectDesktop.current ?? (method.startsWith('preview.') ? inspectPreview.current : null)
        if (!callback) throw new Error('当前桌面宿主没有实现这个能力。')
        return callback(session, method, params, signal)
      },
      reply: ({ id, sessionId, profile, result, error }) => {
        if (!live.desktopReply) throw new Error('当前连接没有桌面请求回复接口。')
        return live.desktopReply(id, sessionId, result, profile, error)
      },
      onLegacy: (session, frame) => { if (session) apply(session.id, frame) },
      onWithdraw: (session, frame) => {
        const request = session?.agentRun?.request
        if (request && (request.wireId === frame.id || request.id === frame.id || request.id === frame.params?.request_id)) {
          api.resolveAgentRequest(session.id, request.id)
          refresh()
        }
      },
      onChange: requests => { if (active()) setDesktopRequests({ accountId, requests }) },
      onError: message => { if (active()) setDesktopRequestError(message) },
    })
    desktopDispatcher.current = dispatcher
    const stopWatching = live.watch(frame => {
      if (!active()) return
      nativeEvent.current?.(frame)
      const chat = resolveSession(frame)
      if (dispatcher.handle(frame)) return
      if (chat) apply(chat.id, frame)
    }, next => {
      if (!active()) return
      setStatus(next)
      if (next !== 'connected') dispatcher.disconnect()
      if (next === 'connected') {
        void refreshInventory()
        void checkModel()
        const { chats, newChatDraft, gatewayCaptureDrafts = {} } = api.current()
        const ids = new Set([currentChat.current, newChatDraft?.gatewaySubmission ? newChatDraft.id : null,
          ...[...Object.values(chats), ...Object.values(gatewayCaptureDrafts)].filter(chat => chat.pending || chat.gatewaySubmission).map(chat => chat.id)])
        for (const id of ids) if (id) void open(id)?.catch(error => reportError.current(error.message, true))
      }
    })
    return () => {
      dispatcher.dispose()
      if (desktopDispatcher.current === dispatcher) desktopDispatcher.current = null
      currentInventory = false
      watching.current = false
      if (syncBots.current === refreshInventory) syncBots.current = null
      stopWatching()
    }
  }, [live, api, accountId, refresh])

  const selectedChat = api.getChat(chatId)
  useEffect(() => { desktopDispatcher.current?.contextChanged() }, [chatId, selectedChat?.gatewayGeneration])
  const browserTurnSettled = Boolean(selectedChat && !selectedChat.pending && sending !== chatId &&
    (selectedChat.browser?.visited || selectedChat.messages.at(-1)?.webPreviews?.length))
  useEffect(() => {
    if (live && chatId && status === 'connected' && !api.getChat(chatId)?.pending) {
      void open(chatId)?.catch(error => reportError.current(error.message, true))
    }
  }, [live, chatId, status, browserTurnSettled, selectedChat?.gatewayStoredId])

  async function mutate(chat, operation, payload) {
    if (!active() || !chat?.gatewayStoredId) throw new Error('找不到已保存的会话。')
    if (status !== 'connected') throw new Error('AIWATA 正在重连，请稍后重试。')
    const snapshot = await live.rpc('session.resume', { session_id: chat.gatewayStoredId })
    if (!active()) return null
    return live.rpc('session.mutate', {
      session_id: snapshot.session_id, request_id: crypto.randomUUID(), expected_revision: snapshot.revision,
      ...(operation === 'workspace' || operation === 'delete' ? { expected_generation: snapshot.execution_generation } : {}),
      operation, payload,
    })
  }

  async function send(chat, folder, externalInput) {
    const declined = message => ({ ok: false, code: 'submit-rejected', message, retryable: true })
    if (!chat || !active() || sendingId.current || modelChange.current || status !== 'connected') return declined('AIWATA 正在连接或处理其他操作。')
    const waiting = desktopDispatcher.current?.requests().some(row => row.chatId === chat.id && ['theme.pick', 'setup_beat'].includes(row.method))
    if (waiting && externalInput) return declined('请先完成当前引导卡片。')
    if (waiting && chat.draft.trim()) {
      const answer = await desktopDispatcher.current.answerComposer(chat, chat.draft)
      if (answer === 'consumed') { api.changeChat(chat.id, { draft: '' }); refresh(); return }
      if (answer === 'failed') return report('未能提交当前引导卡片。', true)
    }
    if (chat.pending) {
      if (!externalInput) report('请等待本轮完成。', true)
      return declined('请等待本轮完成。')
    }
    if (!externalInput && !chat.draft.trim() && !chat.attachments.length) return declined('消息为空。')
    if (!externalInput && chat.attachments.length > 10) { report('每条消息最多附带 10 个文件。', true); return declined('附件过多。') }
    const id = chat.id
    sendingId.current = id; setSending(id)
    try {
      const result = await submitLivePrompt({ live, api, chat, folder, active, operations: operations.current,
        externalInput, resume, recoverSubmission, restoreReceipt, replay,
        onAccepted: id => afterAcceptance.current(id), refresh,
        onReconcileError: () => { if (active()) report('消息已由原生后端接收，但视图同步失败；重新打开会话可恢复。', true) } })
      if (!result.ok && active() && !externalInput) report(result.message, true)
      return result
    } finally {
      if (sendingId.current === id) { sendingId.current = null; if (active()) setSending(null) }
    }
  }

  currentSend.current = send

  async function selectModel(chat, selection, confirmation) {
    if (!active() || status !== 'connected' || !chat || api.getChat(chat.id) !== chat) throw new Error('当前会话已变化，请重新打开模型选项。')
    if (chat.pending || chat.gatewaySubmission || sendingId.current || modelChange.current) throw new Error('请等待当前操作完成后再切换模型。')
    const record = api.current()
    const isCurrent = () => active() && api.current() === record && api.getChat(chat.id) === chat
    modelChange.current = chat.id
    setChangingModel(chat.id)
    try {
      await operations.current.get(chat.id)
      if (!isCurrent()) throw new Error('当前会话已变化。')
      if (!chat.gatewayStoredId && chat.gatewayCreation) {
        const snapshot = await live.rpc('session.create', chat.gatewayCreation)
        if (!isCurrent()) throw new Error('当前会话已变化。')
        api.hydrateGatewayChat(chat.id, snapshot, { gatewayCreation: null, gatewayModelPick: null })
        refresh()
      }
      if (!chat.gatewayStoredId && record.newChatDraft === chat) {
        api.changeChat(chat.id, { gatewayModelPick: selection })
        refresh()
        return { selected: true }
      }
      let params = confirmation?.params
      if (params && (confirmation.chatId !== chat.id || JSON.stringify(confirmation.selection) !== JSON.stringify(selection))) {
        throw new Error('模型确认已失效，请重新选择。')
      }
      if (!params) {
        const snapshot = await resume(chat)
        params = { session_id: snapshot.session_id, request_id: crypto.randomUUID(), expected_revision: snapshot.revision,
          expected_generation: snapshot.execution_generation,
          operation: 'model', payload: selection ?? { model: 'reset' } }
      }
      if (!isCurrent()) throw new Error('当前会话已变化。')
      const result = await call(chat, 'session.mutate', params)
      if (!isCurrent()) throw new Error('当前会话已变化。')
      if (result.confirm_required) {
        if (confirmation) throw new Error('模型确认已变化，请重新选择。')
        return { confirmation: { chatId: chat.id, selection, message: result.confirm_message,
          params: { ...params, payload: { ...params.payload, confirm: result.confirm } } } }
      }
      const snapshot = await resume(chat)
      if (!isCurrent()) throw new Error('当前会话已变化。')
      api.hydrateGatewayChat(chat.id, snapshot, { gatewayModelPick: null })
      refresh()
      return { selected: true }
    } finally {
      modelChange.current = null
      if (active()) setChangingModel(null)
    }
  }

  async function stop(chat) {
    if (!chat?.gatewayId) return
    desktopDispatcher.current?.abortSession(chat)
    try {
      const snapshot = await resume(chat)
      if (!active()) return
      if (snapshot.running || snapshot.pending?.length || snapshot.prompts?.length) {
        await call(chat, 'session.interrupt', { session_id: snapshot.session_id, execution_generation: snapshot.execution_generation })
      }
      if (active()) await open(chat.id)
    }
    catch (error) { if (active()) report(error.message, true) }
  }

  async function resolveInterrupted(chat) {
    if (!active() || !chat?.gatewayUnknown) return
    setResolving(chat.id)
    try {
      await operations.current.get(chat.id)
      if (!active() || !chat.gatewayUnknown) return
      const { admissionId, generation } = chat.gatewayUnknown
      await call(chat, 'prompt.resolve_unknown', {
        session_id: chat.gatewayId, admission_id: admissionId, execution_generation: generation,
      })
      if (active()) await open(chat.id)
    } catch (error) { if (active()) report(error.message, true) }
    finally { if (active()) setResolving(null) }
  }

  async function respond(chat, request, value) {
    const current = chat?.agentRun?.request
    if (!active() || api.getChat(chat?.id) !== chat || currentChat.current !== chat.id ||
        current?.id !== request?.id || current?.wireId !== request?.wireId) return
    try {
      const control = { session_id: chat.gatewayId, prompt_id: request.id,
        execution_generation: request.params.execution_generation ?? chat.gatewayGeneration }
      if (request.method === 'approval') {
        await call(chat, 'approval.respond', { ...control, choice: value })
      } else if (request.wireId && request.params.questions.length > 1) {
        await live.reply(request.wireId, value, chat.gatewayProfile)
      } else {
        await call(chat, 'clarify.respond', { ...control, answer: Object.values(value.answers ?? {})[0] ?? '' })
      }
      if (active()) {
        desktopDispatcher.current?.settle(request.wireId ?? request.id, chat.gatewayProfile ?? '')
        api.resolveAgentRequest(chat.id, request.id)
        refresh()
      }
    } catch (error) { if (active()) report(error.message, true) }
  }

  async function respondDesktop(request, value, beforeReply) {
    const dispatcher = desktopDispatcher.current
    if (!dispatcher || !active()) return false
    setDesktopRequestBusy(request.id)
    setDesktopRequestError('')
    try { return await dispatcher.respond(request, value, beforeReply) }
    finally { if (active()) setDesktopRequestBusy(previous => previous === request.id ? null : previous) }
  }

  return { desktopRequests: desktopRequestState.accountId === accountId
    ? desktopRequestState.requests.filter(request => request.chatId === null || request.chatId === chatId) : [],
    desktopRequestBusy, desktopRequestError, respondDesktop,
    status, model, checkModel, sending, resolving, changingModel, selectModel, open, mutate, send, stop, respond, resolveInterrupted }
}
