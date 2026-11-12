import { projectMarker } from './conversation-meta.mjs'
import { addFilePreview, artifactReference } from './file-previews.mjs'
import { addWebPreview, webPreviewReference } from './web-preview.mjs'
import { extractNativeAttachments } from './native-artifacts.mjs'

const endpoint = '/__aiwata/'

function attachmentData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('无法读取本地附件。'))
    reader.readAsDataURL(blob)
  })
}

async function post(path, body, token, signal) {
  const response = await fetch(endpoint + path, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw Object.assign(new Error(payload?.error ?? '无法连接 AIWATA 本机联调服务。'), { status: response.status })
  }
  return response
}

export async function connectLiveAiwata(account) {
  const { token, executionMode, capabilities } = await (await post('login', { account })).json()
  const request = async (path, params = {}, signal) => (await post(path, params, token, signal)).json()
  let stopped = false
  let controller

  async function readFrames(onFrame, onStatus, signal) {
    let retry = 400
    while (!stopped && !signal.aborted) {
      try {
        const response = await post('events', {}, token, signal)
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        onStatus('connected')
        retry = 400
        let pending = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done || stopped || signal.aborted) break
          const lines = (pending + value).split('\n')
          pending = lines.pop()
          for (const line of lines) if (line) onFrame(JSON.parse(line))
        }
      } catch (error) {
        if (stopped || signal.aborted) return
        if (error.status === 401) { onStatus('expired'); return }
      }
      if (stopped || signal.aborted) return
      onStatus('reconnecting')
      await new Promise(resolve => setTimeout(resolve, retry))
      retry = Math.min(retry * 2, 5000)
    }
  }

  const profileClients = new Map()
  const client = {
    executionMode, capabilities,
    rpc: (method, params = {}, profile) => request('rpc', { method, params, profile }),
    sessions: () => request('sessions'),
    capability: (method, profile = 'default', params = {}) => request('capabilities', { method, profile, params }),
    submission: (session_id, submission_id, profile) => request('submission', { session_id, submission_id, profile }),
    bots: () => request('bots'),
    botDetails: profile => request('bots/describe', { profile }),
    saveBot: settings => request('bots/save', settings),
    deleteBot: (profile, identity) => request('bots/delete', { profile, identity }),
    openBot: profile => request('bots/open', { profile }),
    task: (action, params = {}) => request('tasks', { action, ...params }),
    image: (action, session_id, params = {}, signal) => request('images', { action, session_id, ...params }, signal),
    editImage: async (session_id, blob, params) =>
      request('images', { action: 'edit', session_id, ...params, source: await attachmentData(blob) }),
    video: (action, session_id, params = {}, signal) => request('video', { action, session_id, ...params }, signal),
    skill: (action, profile, params = {}) => request('skills', { action, profile, ...params }),
    memory: (action, profile, params = {}) => request('memory', { action, profile, ...params }),
    connector: (action, profile, params = {}) => request('connectors', { action, profile, ...params }),
    room: (method, params = {}) => request('rooms', { method, params }),
    async rooms() {
      const rooms = []
      let offset = 0
      do {
        const page = await request('rooms', { method: 'groups.list', params: { offset, limit: 100 } })
        rooms.push(...page.rooms)
        if (page.next_offset == null) return rooms
        if (page.next_offset <= offset) throw new Error('群聊列表游标无效。')
        offset = page.next_offset
      } while (true)
    },
    async uploadRoom(room_id, entry, blob) {
      if (!blob.size || blob.size > 15_000_000) throw new Error('群聊附件必须在 1 到 15,000,000 字节之间。')
      const mime = blob.type || 'application/octet-stream'
      const kind = mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'file'
      const data_base64 = (await attachmentData(blob)).split(',', 2)[1]
      const { attachment_id, size } = await request('rooms/upload', {
        room_id, upload_id: entry.blobId, name: entry.name, mime, kind, data_base64,
      })
      return { attachment_id, name: entry.name, mime, kind, size }
    },
    async downloadRoom(room_id, entry) {
      const result = await request('rooms', { method: 'groups.attachment.download', params: {
        room_id, event_id: entry.roomEvent, attachment_id: entry.roomAttachment,
      } })
      return new Blob([Uint8Array.fromBase64(result.data_base64)], { type: result.mime })
    },
    folders: () => request('folders'),
    async pickFolders(signal) {
      if (!window.aiwataPreview?.selectPaths) return { available: false }
      const result = await window.aiwataPreview.selectPaths(account)
      signal?.throwIfAborted()
      if (stopped) throw new Error('已退出当前工作区。')
      return request('folders/pick', { paths: result.paths }, signal)
    },
    createFolder: name => request('folders/create', { name }),
    files: (action, session_id, root, parts, signal) => request('files', { action, session_id, root, parts }, signal),
    git: (params, signal) => request('git', params, signal),
    terminalOpen: (session_id, cols, rows, signal, instance_id) => post('terminal', { action: 'open', session_id, cols, rows, ...(instance_id ? { instance_id } : {}) }, token, signal),
    terminalControl: (params, signal) => request('terminal', params, signal),
    voiceStatus: (profile, signal) => request('audio', { action: 'status', profile }, signal),
    async transcribeVoice(profile, audio, signal) {
      const dataBase64 = (await attachmentData(audio)).split(',', 2)[1]
      signal.throwIfAborted()
      return request('audio', { action: 'transcribe', profile, mimeType: audio.type, dataBase64 }, signal)
    },
    locateFile: (session_id, target, signal) => request('files', { action: 'locate', session_id, target }, signal),
    upload: async (session_id, entry, blob, profile) => request('upload', {
      session_id, profile, name: entry.name, blobId: entry.blobId, dataUrl: await attachmentData(blob),
    }),
    reply: (id, result, profile) => request('reply', { id, result, profile }),
    previewReply: (id, session_id, result, profile) => request('preview/reply', { id, session_id, result, profile }),
    desktopReply: (id, session_id, result, profile = '', error) => request('desktop/reply', {
      id, session_id, profile, ...(error ? { error } : { result }),
    }),
    computerStatus: (profile = '') => request('computer/status', { profile }),
    computerPermissions: (profile = '') => request('computer/permissions', { profile }),
    computerPermissionStatus: (profile = '') => request('computer/permission-status', { profile }),
    watch(onFrame, onStatus) {
      controller?.abort()
      const current = controller = new AbortController()
      void readFrames(onFrame, onStatus, current.signal)
      return () => current.abort()
    },
    async close() {
      stopped = true
      controller?.abort()
      await request('logout').catch(() => {})
    },
  }
  client.forProfile = (profile = '') => {
    if (typeof profile !== 'string') throw new Error('工具 Profile 无效。')
    if (!profile) return client
    if (!profileClients.has(profile)) profileClients.set(profile, {
      ...client,
      files: (action, session_id, root, parts, signal) => request('files', { action, session_id, root, parts, profile }, signal),
      git: (params, signal) => request('git', { ...params, profile }, signal),
      terminalOpen: (session_id, cols, rows, signal, instance_id) => post('terminal', {
        action: 'open', session_id, cols, rows, ...(instance_id ? { instance_id } : {}), profile,
      }, token, signal),
      terminalControl: (params, signal) => request('terminal', { ...params, profile }, signal),
      locateFile: (session_id, target, signal) => request('files', { action: 'locate', session_id, target, profile }, signal),
    })
    return profileClients.get(profile)
  }
  return client
}

export function gatewayDraftFingerprint(text, attachments, details) {
  return JSON.stringify([text.trim(), attachments.map(name => [name, details?.[name]?.blobId])])
}

export function gatewayProject(project) {
  const marker = projectMarker(project.color, project.id)
  return { id: project.id, name: project.name, folder: project.primary_path ?? '', marker,
    folders: (project.folders ?? []).map(folder => folder.path), archived: Boolean(project.archived) }
}

function toolPreview(message) {
  if (message.role !== 'tool' || (message.tool_name ?? message.name) !== 'desktop_preview') return null
  let result = message.content
  if (typeof result === 'string') {
    if (result.length > 8192) return null
    try { result = JSON.parse(result) } catch { return null }
  }
  return result?.success === true ? (webPreviewReference(result) ?? artifactReference(result)) : null
}

function toolValue(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

export function gatewayTranscript(snapshot, { pending = snapshot.running, files = true } = {}) {
  const raw = snapshot.messages ?? []
  const calls = new Map(), results = new Map()
  for (const row of raw) {
    for (const call of row.tool_calls ?? []) calls.set(call.id, call.function)
    if (row.role !== 'tool' || !row.tool_call_id || row.display_kind === 'hidden') continue
    const entries = results.get(row.tool_call_id) ?? []
    entries.push({ row, call: calls.get(row.tool_call_id) })
    results.set(row.tool_call_id, entries)
  }
  const messages = []
  let previews = []
  let pages = []
  let tools = {}
  const links = () => ({
    ...(previews.length ? { filePreviews: previews } : {}),
    ...(pages.length ? { webPreviews: pages } : {}),
    ...(Object.keys(tools).length ? { tools } : {}),
  })
  function flushPreviews() {
    if (previews.length || pages.length || Object.keys(tools).length) messages.push({ role: 'agent', text: '', ...links() })
    previews = []
    pages = []
    tools = {}
  }
  for (const [index, message] of (snapshot.display_messages ?? raw).entries()) {
    if (message.role === 'tool') {
      if (message.display_kind === 'hidden') continue
      const id = message.tool_call_id ?? 'history-tool:' + (message.row_id ?? index)
      const matched = results.get(message.tool_call_id)?.shift()
      const result = matched?.row ?? message
      const call = matched?.call
      tools = { ...tools, [id]: { tool_id: id, name: result.tool_name ?? message.name ?? call?.name ?? 'tool',
        ...(message.args !== undefined || call?.arguments !== undefined ? { args: message.args ?? toolValue(call?.arguments) } : {}),
        ...(result.content !== undefined ? { result: toolValue(result.content) } : {}), complete: true } }
      if (files) {
        const preview = toolPreview(result) ?? toolPreview(message)
        if (preview?.url) pages = addWebPreview(pages, preview)
        else previews = addFilePreview(previews, preview)
      }
      continue
    }
    if (!['user', 'assistant', 'agent'].includes(message.role)) continue
    if (message.role === 'user') flushPreviews()
    const content = message.text ?? message.content
    const rawText = typeof content === 'string' ? content : Array.isArray(content)
      ? content.filter(part => part?.type === 'text').map(part => part.text).join('\n') : ''
    const authored = message.role === 'user' ? extractNativeAttachments(rawText) : { text: rawText }
    if (!authored.text && !authored.attachments?.length) continue
    messages.push({ role: message.role === 'user' ? 'user' : 'agent', ...authored,
      ...(message.row_id != null ? { id: String(message.row_id) } : {}),
      ...links() })
    previews = []
    pages = []
    tools = {}
  }
  if (!pending) flushPreviews()
  return { messages, pendingFiles: previews, pendingPages: pages, pendingTools: tools }
}

export function gatewayRequest(kind, params, wireId) {
  const id = params.prompt_id ?? params.request_id ?? wireId
  if (!id || !['approval', 'clarify'].includes(kind)) return null
  const details = kind === 'approval' ? { choices: params.choices?.length ? params.choices : ['once', 'deny'] }
    : { questions: params.questions ?? [{ qid: id, question: params.question, choices: params.choices }] }
  return { id, method: kind, wireId, params: { ...params, ...details } }
}

export function gatewayEvent(event) {
  const data = event.payload ?? {}
  if (event.type === 'message.complete') {
    const status = data.status === 'error' || data.error ? 'error'
      : ['interrupted', 'cancelled', 'canceled', 'aborted'].includes(data.status) ? 'interrupted' : 'complete'
    return { type: event.type, data: { ...data, status, text: typeof data.text === 'string' ? data.text : '' } }
  }
  return { type: event.type, data }
}
