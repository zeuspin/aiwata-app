import { useCallback, useEffect, useRef, useState } from 'react'
import { gatewayDraftFingerprint } from './live-aiwata.mjs'
import { mergeRoomEvents, projectRoom } from './live-room-state.mjs'
import { botHandle } from './room.mjs'

async function userEventId(id) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
  return 'user:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function useLiveRooms({ live, api, accountId, roomId, connected, refresh, report }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const reads = useRef(new Map())
  const cache = useRef(new Map())
  const writing = useRef(null)
  const selected = useRef(roomId)
  selected.current = roomId

  const read = useCallback(async id => {
    const previousRead = reads.current.get(id)
    if (previousRead) return previousRead
    const record = api.current()
    const chat = api.getChat(id)
    if (!live || api.accountId !== accountId || !chat?.gatewayRoom) return
    const job = (async () => {
      const snapshot = await live.room('groups.state', { room_id: id })
      const last = cache.current.get(id)
      const epoch = snapshot.room.authority_epoch
      const latest = snapshot.room.latest_seq
      let events = last?.epoch === epoch && (latest == null || latest >= (last.events.at(-1)?.seq ?? 0)) ? last.events : []
      let cursor = events.at(-1)?.seq ?? 0
      if (!last || latest !== cursor) {
        for (;;) {
          const page = await live.room('groups.log', { room_id: id, since_seq: cursor, limit: 100 })
          events = mergeRoomEvents(events, page.events)
          if (!page.has_more) break
          const next = events.at(-1)?.seq
          if (!(next > cursor)) throw new Error('群聊日志游标无效。')
          cursor = next
        }
      }
      if (api.current() !== record || api.getChat(id) !== chat) return
      const signature = JSON.stringify([snapshot.room.revision, snapshot.room.name, snapshot.context, snapshot.driver_status])
      const attempt = chat.gatewayRoomSubmission
      const confirmed = attempt && events.some(event => event.event_id === attempt.wireId)
      if (last?.events !== events || last.signature !== signature) {
        api.applyGatewayRoom(id, snapshot, projectRoom(snapshot, events), selected.current === id)
      }
      if (confirmed) api.acceptGatewayRoomSend(id, attempt)
      if (confirmed || last?.events !== events || last.signature !== signature) refresh()
      cache.current.set(id, { epoch, events, signature })
      if (selected.current === id) setError('')
    })().finally(() => reads.current.delete(id))
    reads.current.set(id, job)
    return job
  }, [live, api, accountId, refresh])

  useEffect(() => {
    if (!live || !connected) return
    let cancelled = false
    let timer
    setError('')
    async function poll() {
      const ids = new Set([selected.current, ...Object.values(api.current()?.chats ?? {})
        .filter(chat => chat.gatewayRoom && (chat.pending || chat.gatewayRoomSubmission)).map(chat => chat.id)])
      await Promise.all([...ids].filter(Boolean).map(id => read(id).catch(problem => {
        if (!cancelled && selected.current === id) setError(problem.message)
      })))
      if (!cancelled) timer = setTimeout(() => void poll(), 1800)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [live, api, roomId, connected, read])

  async function act(id, operation) {
    if (!connected || writing.current || api.accountId !== accountId || !api.getChat(id)?.gatewayRoom) return
    const record = api.current()
    writing.current = id
    setBusy(id)
    try {
      await operation()
      await reads.current.get(id)
      if (api.current() === record) await read(id)
    } catch (problem) { if (api.current() === record) report(problem.message, true) }
    finally { writing.current = null; setBusy(null) }
  }

  function send(chat, members) {
    if (!chat?.roomReady) return
    return act(chat.id, async () => {
      const record = api.current()
      await reads.current.get(chat.id)
      if (api.current() !== record || api.getChat(chat.id) !== chat) return
      let attempt = chat.gatewayRoomSubmission
      if (!attempt) {
        const { attachments, attachmentDetails, groupReply, draft } = chat
        const id = crypto.randomUUID()
        const fingerprint = gatewayDraftFingerprint(draft, attachments, attachmentDetails)
        const manifest = []
        for (const name of attachments) {
          const entry = attachmentDetails?.[name]
          const blob = entry?.blobId && await api.readLocalAttachment(chat.id, entry.blobId)
          if (!blob) throw new Error('无法读取附件「' + name + '」。')
          if (api.current() !== record) return
          manifest.push(await live.uploadRoom(chat.id, entry, blob))
        }
        if (api.current() !== record || api.getChat(chat.id) !== chat || chat.groupReply !== groupReply ||
            gatewayDraftFingerprint(chat.draft, chat.attachments, chat.attachmentDetails) !== fingerprint) return
        const member = members.find(bot => bot.id === groupReply?.memberId)
        const text = draft.trim()
        const addressed = member && !text.startsWith('@') ? '@' + botHandle(member) + ' ' + text : text
        const wireId = await userEventId(id)
        if (api.current() !== record || api.getChat(chat.id) !== chat) return
        attempt = { id, wireId, fingerprint, replyId: groupReply?.messageId,
          payload: { text: addressed, thread_id: groupReply?.threadId ?? id, ...(manifest.length ? { attachments: manifest } : {}) } }
        api.changeChat(chat.id, { gatewayRoomSubmission: attempt })
      }
      const result = await live.room('groups.send', { room_id: chat.id, event_id: attempt.id, payload: attempt.payload })
      if (!result.accepted || result.event?.event_id !== attempt.wireId) throw new Error('网关尚未确认发送，可重试原请求。')
      if (api.current() === record && api.acceptGatewayRoomSend(chat.id, attempt)) refresh()
    })
  }

  const control = (id, method, params) => act(id, () => live.room(method, { room_id: id, ...params }))
  return { busy, error, send, control }
}
