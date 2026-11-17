import React, { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { ConversationMarker } from './conversation-meta.jsx'
import { Icon, IconButton } from './icons.jsx'
import { hasPromptContent, isLocalAttachment } from './local-attachments.mjs'
import { botHandle } from './room.mjs'
import {
  approvalModes, attachmentSizeLimit, commands, getApprovalMode, getModel, getTrigger,
  models, parseSlash, referenceKinds, referenceText, replaceTrigger, sources,
} from './composer.mjs'
import { useLiveCompletions } from './use-live-completions.jsx'
import { liveCompletionTrigger, liveNavigationCommands } from './live-completions.mjs'
import './composer.css'

export { sources } from './composer.mjs'
const LiveModelPicker = lazy(() => import('./live-model-picker.jsx'))
const LiveApprovalControl = lazy(() => import('./live-approval-control.jsx'))

export function Composer({ chat, project, projectPicker, bot, group, members, onClearReply, autoFocus, compact, api, refresh, send, stop, report, assets, onCommand, onAttachmentPreview, live, liveModel, modelService, onSelectModel, modelDisabled, approvalService, approvalConnected, voiceService, completionService, completionCwd, sendDisabled, stopDisabled }) {
  const [menu, setMenu] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [voice, setVoice] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [caret, setCaret] = useState(chat.draft.length)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState('')
  const [focused, setFocused] = useState(false)
  const [modelPicker, setModelPicker] = useState(false)
  const root = useRef(null)
  const area = useRef(null)
  const picker = useRef(null)
  const projectSearchInput = useRef(null)
  const button = useRef(null)
  const recording = useRef(null)
  const dragDepth = useRef(0)
  const suggestionId = useId()
  const model = getModel(chat)
  const mode = getApprovalMode(api.current()?.approvalMode, chat.permission)
  const canStartCommand = !chat.draft.trim() || /^\s*\/[a-z-]*$/i.test(chat.draft)
  const canSend = !sendDisabled && hasPromptContent({ text: chat.draft, attachments: chat.attachments })
  const trigger = focused && !voice && !menu && (live ? liveCompletionTrigger : getTrigger)(chat.draft, caret)
  const triggerKey = trigger ? JSON.stringify([chat.draft, caret]) : ''
  const nativeCompletions = useLiveCompletions({ live: completionService, chat, trigger, text: chat.draft, cwd: completionCwd, enabled: !!trigger && !group && dismissed !== triggerKey })
  const suggestions = live ? group && trigger?.kind === '@' && dismissed !== triggerKey
    ? completionItems(trigger, assets, project, onCommand, members) : nativeCompletions.items
    : trigger && dismissed !== triggerKey
    ? completionItems(trigger, assets, project, onCommand, group ? members : null)
    : []
  const selected = Math.min(active, suggestions.length - 1)

  useEffect(() => {
    function closeOutside(event) {
      if (!root.current?.contains(event.target)) {
        setMenu('')
        setFocused(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      const job = recording.current
      recording.current = null
      releaseRecording(job)
    }
  }, [])

  useEffect(() => {
    if (selected >= 0) document.getElementById(suggestionId + '-' + selected)?.scrollIntoView({ block: 'nearest' })
  }, [selected, suggestionId, triggerKey])

  const replyTarget = chat.groupReply?.messageId
  useEffect(() => {
    if (replyTarget) focusArea()
  }, [replyTarget])

  function focusArea(position) {
    requestAnimationFrame(() => {
      area.current?.focus()
      if (position !== undefined) area.current?.setSelectionRange(position, position)
    })
  }

  function setDraft(value, position = value.length) {
    api.setDraft(chat.id, value)
    setCaret(position)
    setActive(0)
    setDismissed('')
    refresh()
  }

  function patch(value) {
    api.changeChat(chat.id, value)
    refresh()
    setMenu('')
  }

  function toggleMenu(event, name) {
    button.current = event.currentTarget
    setMenu(menu === name ? '' : name)
  }

  function openProjectPicker(event) {
    if (menu !== 'projects') {
      setProjectSearch('')
      requestAnimationFrame(() => projectSearchInput.current?.focus())
    }
    toggleMenu(event, 'projects')
  }

  function pickApproval(value) {
    if (api.setApprovalMode) api.setApprovalMode(value)
    else api.changeChat(chat.id, { permission: value })
    refresh()
    setMenu('')
  }

  function pickModel(choice) {
    patch({ source: choice.source, provider: choice.provider, model: choice.id })
  }

  function insertSuggestion(item) {
    if (!trigger) return
    const next = replaceTrigger(chat.draft, trigger, item.insert, item.complete)
    const caret = next.caret - (item.caretBack ?? 0)
    setDraft(next.text, caret)
    focusArea(caret)
  }

  function insertStarter(token) {
    const prior = chat.draft
    if (token === '/') {
      const next = prior.trim() || '/'
      setMenu('')
      setDraft(next)
      focusArea(next.length)
      return
    }
    const position = area.current?.selectionStart ?? prior.length
    const before = prior.slice(0, position)
    const start = before && !/\s$/.test(before) ? before + ' ' : before
    const suffix = prior.slice(position)
    const next = start + token + (suffix && !/^\s/.test(suffix) ? ' ' : '') + suffix
    const nextCaret = start.length + token.length
    setMenu('')
    setDraft(next, nextCaret)
    focusArea(nextCaret)
  }

  async function submit() {
    if (voice || !canSend) return
    const parsed = parseSlash(chat.draft)
    if (live && parsed && !group && liveNavigationCommands.has(parsed[0])) {
      const [name, args] = parsed
      if (name === 'help') { setDraft('/'); setDismissed(''); focusArea(1); return }
      if (name === 'model') {
        if (modelDisabled || args) return report('请通过模型选择器选择模型。', true)
        setModelPicker(true); setDraft(''); return
      }
      if (name === 'approvals') {
        if (args) {
          if (!approvalModes.some(option => option.id === args)) return report('审批方式可选 manual、smart 或 off', true)
          try {
            await approvalService.rpc('config.set', { key: 'approvals.mode', value: args }, chat.gatewayProfile)
            if (api.getChat(chat.id)?.draft.trim() === '/approvals ' + args) { setDraft(''); report('审批方式已保存') }
          } catch (problem) { report(problem.message, true) }
        } else { root.current.querySelector('[aria-label="Agent 批准方式"]')?.click(); setDraft('') }
        return
      }
      if (args) return report('此命令请直接使用工作台对应入口。', true)
      if (onCommand?.(name) !== false) setDraft('')
      return
    }
    if (!parsed || live) {
      setMenu('')
      send()
      return
    }
    const [name, args] = parsed
    if (group) { report('群聊不支持斜杠指令。', true); return }
    if (bot && name === 'model') { report('请在 Bot 设置中更改此 Bot 的模型。'); return }
    if (name === 'help') {
      setDraft('/')
      focusArea(1)
    } else if (name === 'approvals') {
      if (args && !approvalModes.some(option => option.id === args)) {
        report('审批方式可选 manual、smart 或 off', true)
        return
      }
      setDraft('')
      if (args) pickApproval(args)
      else {
        button.current = root.current?.querySelector('[aria-label="Agent 批准方式"]')
        setMenu('permission')
      }
    } else if (name === 'model') {
      const [id, provider] = args.toLowerCase().split(/\s+--provider\s+/, 2)
      const choice = models.find(item => (item.id === id || item.label.toLowerCase() === id) && (!provider || item.provider === provider))
      if (args && !choice) {
        report('此模型不在原型的选项中', true)
        return
      }
      setDraft('')
      if (choice) pickModel(choice)
      else {
        button.current = root.current?.querySelector('[aria-label="模型与用量来源"]')
        setMenu('source')
      }
    } else if (onCommand && onCommand(name === 'reset' ? 'new' : name, args) !== false) {
      setDraft('')
      setMenu('')
    } else report('此指令未接入原型 · 输入 /help 查看可用指令', true)
  }

  function addAttachments(entries) {
    const draft = api.getChat(chat.id)
    if (!draft) return
    const names = [...draft.attachments]
    const details = Object.assign(Object.create(null), draft.attachmentDetails)
    let duplicate = false
    let tooLarge = false
    for (const entry of entries) {
      if (entry.size > attachmentSizeLimit) {
        tooLarge = true
      } else if (names.includes(entry.name)) {
        duplicate = true
      } else {
        names.push(entry.name)
        details[entry.name] = entry
      }
    }
    if (names.length !== draft.attachments.length) patch({ attachments: names, attachmentDetails: details })
    if (tooLarge) report('单个附件最多 16 MiB', true)
    else if (duplicate) report('同名附件已添加')
    setMenu('')
    focusArea()
  }

  async function addFiles(files) {
    if (!files.length) return
    setMenu('')
    const result = await api.addLocalAttachments(chat.id, Array.from(files))
    if (result.cancelled || api.getChat(chat.id) !== chat) return
    if (!result.ok) return report('无法保存本地附件，请检查浏览器存储后重试', true)
    refresh()
    if (result.tooLarge) report('单个附件最多 16 MiB', true)
    else if (result.duplicate) report('同名附件已添加')
    focusArea()
  }

  function removeAttachment(name) {
    const details = { ...chat.attachmentDetails }
    delete details[name]
    patch({ attachments: chat.attachments.filter(item => item !== name), attachmentDetails: details })
    focusArea()
  }

  function finishVoice(job, error) {
    if (recording.current !== job) return
    recording.current = null
    releaseRecording(job)
    setVoice(null)
    focusArea()
    if (error) report(error, true)
  }

  async function beginVoice() {
    setMenu('')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      report('此浏览器环境无法录音', true)
      return
    }
    const job = { chunks: [], size: 0, controller: new AbortController(), profile: chat.gatewayProfile || 'default' }
    recording.current = job
    if (voiceService) {
      setVoice({ phase: 'checking' })
      focusVoiceCancel()
      try {
        const status = await voiceService.voiceStatus(job.profile, job.controller.signal)
        if (recording.current !== job) return
        if (!status.available) return finishVoice(job, status.message)
      } catch (error) {
        return finishVoice(job, error.message)
      }
    }
    setVoice({ phase: 'requesting' })
    focusVoiceCancel()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (recording.current !== job) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      job.stream = stream
      const recorder = new MediaRecorder(stream)
      job.recorder = recorder
      recorder.ondataavailable = event => {
        if (!event.data.size) return
        job.size += event.data.size
        if (job.size > 25 * 1024 * 1024) finishVoice(job, '录音超过 25 MiB 转写上限')
        else job.chunks.push(event.data)
      }
      recorder.onerror = () => finishVoice(job, '录音中断，请重试')
      recorder.start(1000)
      const started = Date.now()
      setVoice({ phase: 'recording', seconds: 0 })
      job.clock = setInterval(() => {
        setVoice({ phase: 'recording', seconds: Math.floor((Date.now() - started) / 1000) })
      }, 250)
    } catch (error) {
      finishVoice(job, error.name === 'NotAllowedError' ? '请允许浏览器使用麦克风' : '无法打开麦克风，请检查音频设备')
    }
  }

  function transcribe() {
    const job = recording.current
    if (job?.recorder?.state !== 'recording') return
    clearInterval(job.clock)
    setVoice({ phase: 'transcribing' })
    focusVoiceCancel()
    job.recorder.onstop = async () => {
      job.stream.getTracks().forEach(track => track.stop())
      if (recording.current !== job) return
      const audio = new Blob(job.chunks, { type: job.recorder.mimeType })
      job.chunks.length = 0
      if (!audio.size) {
        finishVoice(job, '未录到音频，请重试')
        return
      }
      function insertTranscript(transcript, notice) {
        if (recording.current !== job) return
        if (!transcript) return finishVoice(job, '未检测到清晰语音，请重试')
        const prior = api.getChat(chat.id)?.draft
        if (prior !== undefined) setDraft([prior, transcript].filter(Boolean).join('\n'))
        finishVoice(job)
        report(notice)
      }
      if (voiceService) {
        try {
          const { transcript } = await voiceService.transcribeVoice(job.profile, audio, job.controller.signal)
          insertTranscript(transcript, '已转写到草稿，请检查后发送')
        } catch (error) {
          finishVoice(job, error.message)
        }
        return
      }
      job.timer = setTimeout(() => {
        insertTranscript('请把这一轮工作整理成清单。', '已插入模拟转写，请检查后发送')
      }, 600)
    }
    job.recorder.stop()
  }

  function focusVoiceCancel() {
    requestAnimationFrame(() => root.current?.querySelector('.voice-row button')?.focus())
  }

  function onComposerKey(event) {
    if (event.key === 'Escape' && (menu || voice)) {
      event.preventDefault()
      event.stopPropagation()
      if (voice) finishVoice(recording.current)
      else {
        setMenu('')
        button.current?.focus()
      }
      return
    }
    if (menu && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      const rows = Array.from(root.current.querySelectorAll('.composer-menu button:not(:disabled)'))
      if (!rows.length) return
      event.preventDefault()
      const index = rows.indexOf(document.activeElement)
      const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1)
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
      rows[next].focus()
    }
  }

  function onTextareaKey(event) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    if (suggestions.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'ArrowDown' ? 1 : -1
      setActive((selected + next + suggestions.length) % suggestions.length)
    } else if (suggestions.length && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setDismissed(triggerKey)
    } else if (suggestions.length && !event.shiftKey && (event.key === 'Tab' || (event.key === 'Enter' && !event.metaKey && !event.ctrlKey))) {
      event.preventDefault()
      insertSuggestion(suggestions[selected])
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return <div className={'composer-wrap ' + (compact ? 'compact' : '')} ref={root}
    onKeyDown={onComposerKey}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setMenu('') } }}>
    {!group && !bot && !compact && !chat.messages.length && <div className="composer-context">
      {projectPicker ? <button type="button" className="control-text composer-project-trigger" aria-label="选择项目"
        aria-expanded={menu === 'projects'} onClick={openProjectPicker}>
        {project ? <ConversationMarker marker={project.marker} /> : <Icon name="folder" size={/* @ai-token sys.icon.size.15 */ 15} />}
        <span>{project?.name ?? '独立会话'}</span><Icon name="chevron" size={/* @ai-token sys.icon.size.13 */ 13} />
      </button> : <span><Icon name="folder" size={/* @ai-token sys.icon.size.15 */ 15} />{project?.name ?? '独立会话'}</span>}
      <span><Icon name="laptop" size={/* @ai-token sys.icon.size.15 */ 15} />此计算机</span>
      {projectPicker && menu === 'projects' && <section className="popover composer-menu project-select-menu" aria-label="项目选项">
        <label className="project-select-search"><Icon name="search" size={/* @ai-token sys.icon.size.15 */ 15} />
          <input ref={projectSearchInput} aria-label="搜索项目" placeholder="搜索项目" value={projectSearch}
            onChange={event => setProjectSearch(event.target.value)} />
        </label>
        {projectPicker.projects.filter(item => item.name.toLowerCase().includes(projectSearch.trim().toLowerCase())).map(item =>
          <button key={item.id} type="button" className="menu-row" aria-pressed={item.id === project?.id} onClick={() => {
            projectPicker.select(item.id)
            setMenu('')
            focusArea()
          }}>
            <ConversationMarker marker={item.marker} /><span>{item.name}</span>
            {item.id === project?.id && <Icon name="check" size={/* @ai-token sys.icon.size.15 */ 15} />}
          </button>)}
        <div className="menu-divider" />
        <button className="menu-row" type="button" onClick={() => { projectPicker.create(); setMenu('') }}>
          <Icon name="add" size={/* @ai-token sys.icon.size.15 */ 15} />新建项目
        </button>
        <button className="menu-row" type="button" aria-pressed={!project} onClick={() => {
          projectPicker.select(null)
          setMenu('')
          focusArea()
        }}><Icon name="close" size={/* @ai-token sys.icon.size.15 */ 15} />不在项目中工作</button>
      </section>}
    </div>}
    <form className={'composer' + (dragging ? ' composer-dragging' : '')} onSubmit={event => { event.preventDefault(); submit() }}
      onDragEnter={event => {
        if (!Array.from(event.dataTransfer.types).includes('Files') || voice) return
        event.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={event => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = voice ? 'none' : 'copy'
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }}
      onDrop={event => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        if (!voice) addFiles(event.dataTransfer.files)
      }}>
      <input type="file" aria-label="选择本地文件" multiple hidden ref={picker} onChange={event => {
        addFiles(event.target.files)
        event.target.value = ''
      }} />
      {voice
        ? <div className="voice-row">
            <IconButton icon="close" label="取消语音输入" onClick={() => finishVoice(recording.current)} />
            <span className="voice-status">
              {voice.phase === 'recording' && <span className="voice-indicator" />}
              <span role="status">{voice.phase === 'checking' ? '正在检查语音转写服务' : voice.phase === 'requesting'
                ? '正在等待麦克风授权' : voice.phase === 'recording' ? '正在录音' : voiceService ? '正在转写' : '正在模拟转写'}</span>
              {voice.phase === 'recording' && <span aria-hidden="true">· {formatRecordingTime(voice.seconds)}</span>}
            </span>
            <IconButton icon="check" label="完成录音" disabled={voice.phase !== 'recording'} onClick={transcribe} />
          </div>
        : <>
            {group && chat.groupReply && <div className="room-quote-draft">
              <blockquote className="room-quote"><strong>回复 {chat.groupReply.author}</strong><span>{chat.groupReply.text}</span></blockquote>
              <IconButton icon="close" label="取消引用回复" onClick={() => { onClearReply(); focusArea() }} />
            </div>}
            {!!chat.attachments.length && <div className="attachment-list">{chat.attachments.map(name => {
              const entry = Object.hasOwn(chat.attachmentDetails ?? {}, name) ? chat.attachmentDetails[name] : null
              const size = entry?.size === undefined ? '' : ' · ' + formatFileSize(entry.size)
              const icon = entry?.kind === 'image' ? 'photo' : 'file'
              return <div className="attachment-chip" key={name} title={name + size}>
                {isLocalAttachment(entry) ? <button type="button" aria-label={'预览附件 ' + name}
                  onClick={() => onAttachmentPreview({ ...entry, name })}><Icon name={icon} size={/* @ai-token sys.icon.size.14 */ 14} /><span>{name}</span></button>
                  : <span className="attachment-chip-name"><Icon name={icon} size={/* @ai-token sys.icon.size.14 */ 14} /><span>{name}</span></span>}
                <button type="button" aria-label={'移除附件 ' + name} onClick={() => removeAttachment(name)}><Icon name="close" size={/* @ai-token sys.icon.size.12 */ 12} /></button>
              </div>
            })}</div>}
            <textarea ref={area} autoFocus={autoFocus} aria-label={group ? '群聊消息' : 'Agent 输入框'} rows={compact ? Math.min(chat.draft.split('\n').length, 4) : 2}
              aria-autocomplete="list" aria-controls={suggestions.length ? suggestionId : undefined}
              aria-activedescendant={suggestions.length ? suggestionId + '-' + selected : undefined}
              value={chat.draft} placeholder={chat.pending ? '添加下一条消息' : group ? '输入消息，或用 @ 指定成员' : bot ? '给' + bot.name + '发消息' : '和 AIWATA 一起工作'}
              onFocus={event => { setFocused(true); setCaret(event.currentTarget.selectionStart) }}
              onBlur={() => setFocused(false)}
              onSelect={event => {
                const position = event.currentTarget.selectionStart
                if (position !== caret) { setCaret(position); setActive(0) }
              }}
              onChange={event => setDraft(event.target.value, event.target.selectionStart)}
              onKeyDown={onTextareaKey}
              onPaste={event => {
                if (!event.clipboardData.files.length || event.clipboardData.getData('text/plain')) return
                event.preventDefault()
                addFiles(event.clipboardData.files)
              }} />
            <div className="composer-toolbar">
              <div className="composer-actions">
                <IconButton icon="add" label="添加素材" aria-expanded={menu === 'attachments'} onClick={event => toggleMenu(event, 'attachments')} />
                {group ? <button type="button" className="control-text" aria-label="提及群成员" onClick={() => insertStarter('@')}>@</button>
                : live && approvalService ? <Suspense fallback={null}><LiveApprovalControl live={approvalService} profile={chat.gatewayProfile}
                    connected={approvalConnected} name={bot?.name} report={report} /></Suspense>
                : !live && <button type="button" className={'control-text ' + (mode.id === 'off' ? 'warning' : '')}
                  aria-label="Agent 批准方式" title={mode.label} aria-expanded={menu === 'permission'} onClick={event => toggleMenu(event, 'permission')}>
                  <Icon name="shield" size={/* @ai-token sys.icon.size.15 */ 15} /><span>{mode.label}</span>
                </button>}
              </div>
              <div className="composer-actions">
                {live && (group ? <span className="control-text muted">成员各自模型</span> :
                  <button type="button" className="control-text composer-model" aria-label="选择会话模型" disabled={modelDisabled}
                    onClick={() => setModelPicker(true)}>
                    <span>{(chat.gatewayId ? chat.model : chat.gatewayModelPick?.model || liveModel) || '档案默认模型'}</span>
                    <Icon name="chevron" size={/* @ai-token sys.icon.size.14 */ 14} />
                  </button>)}
                {!live && !group && !bot && <button type="button" className="control-text composer-model" aria-label="模型与用量来源" title={model.label + ' · ' + model.description}
                  aria-expanded={menu === 'source'} onClick={event => toggleMenu(event, 'source')}>
                  <span>{model.label}</span><Icon name="chevron" size={/* @ai-token sys.icon.size.14 */ 14} />
                </button>}
                {(!live || voiceService) && <IconButton icon="mic" label="语音输入" onClick={beginVoice} />}
                {chat.pending && !chat.gatewayUnknown && !chat.agentRun?.room?.paused && <IconButton icon="stop" label={group ? '停止讨论' : '停止生成'} disabled={stopDisabled} onClick={stop} />}
                <button type="submit" className="send-button" aria-label={chat.pending ? '排队发送消息' : '发送消息'}
                  disabled={!canSend}><Icon name="send" /></button>
              </div>
            </div>
          </>}
      {live && focused && trigger && nativeCompletions.error && <p className="composer-completion-error" role="status">补全暂不可用，可继续输入。{nativeCompletions.error}</p>}
      {!!suggestions.length && <div className="popover composer-menu composer-suggestions" id={suggestionId} role="listbox"
        aria-label={group ? '群成员建议' : trigger.kind === '/' ? '斜杠指令' : '上下文引用'}>
        <div className="popover-caption" aria-hidden="true">{group ? '提及成员' : trigger.kind === '/' ? '斜杠指令' : '上下文引用'} <span>↑ ↓ 选择 · ↵ 插入</span></div>
        {suggestions.map((item, index) => <button type="button" className="menu-row menu-option" role="option" tabIndex={-1}
          id={suggestionId + '-' + index} key={item.insert} aria-selected={index === selected}
          onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => insertSuggestion(item)}>
          <span><strong>{item.label}</strong>{item.args && <em>{item.args}</em>}<small>{item.description}</small></span>
          {item.icon && <Icon name={item.icon} size={/* @ai-token sys.icon.size.15 */ 15} />}
        </button>)}
      </div>}
      {menu === 'permission' && <div className="popover composer-menu" aria-label="批准方式选项">
        <div className="popover-caption">审批方式 · 当前配置档</div>
        {approvalModes.map(option => <button className="menu-row menu-option" type="button" key={option.id}
          aria-pressed={mode.id === option.id} onClick={() => { pickApproval(option.id); button.current?.focus() }}>
          <span>{option.label}<small>{option.description}</small></span>{mode.id === option.id && <Icon name="check" size={/* @ai-token sys.icon.size.15 */ 15} />}
        </button>)}
      </div>}
      {menu === 'source' && <div className="popover composer-menu composer-model-menu align-right" aria-label="模型来源选项">
        <div className="popover-caption">模型与用量来源 · 演示选项</div>
        {sources.map(([id, label, description]) => <div className="composer-menu-section" key={id}>
          <div className="popover-caption">{label} <span>{description}</span></div>
          {models.filter(item => item.source === id).map(item => <button type="button" className="menu-row menu-option" key={item.id}
            aria-pressed={item === model} onClick={() => { pickModel(item); button.current?.focus() }}>
            <span>{item.label}<small>{item.description}</small></span>{item === model && <Icon name="check" size={/* @ai-token sys.icon.size.15 */ 15} />}
          </button>)}
        </div>)}
      </div>}
      {menu === 'attachments' && <div className="popover composer-menu" aria-label="添加素材选项">
        <button className="menu-row" type="button" onClick={() => picker.current?.click()}>
          <Icon name="attach" size={/* @ai-token sys.icon.size.15 */ 15} />选择本地文件
        </button>
        {!group && <button className="menu-row" type="button" onClick={() => insertStarter('@')}><span className="composer-menu-symbol">@</span>引用上下文</button>}
        {!group && <button className="menu-row" type="button" disabled={!canStartCommand} onClick={() => insertStarter('/')}>
          <span className="composer-menu-symbol">/</span>斜杠指令
        </button>}
        {!!assets.length && <>
          <div className="popover-caption">从素材库添加</div>
          {assets.slice(0, 5).map(name => <button className="menu-row" type="button" key={name}
            onClick={() => addAttachments([{ name, kind: 'asset' }])}><Icon name="file" size={/* @ai-token sys.icon.size.15 */ 15} /><span>{name}</span></button>)}
        </>}
      </div>}
    </form>
    {modelPicker && modelService && <Suspense fallback={null}>
      <LiveModelPicker chat={chat} live={modelService} onSelect={onSelectModel} onClose={() => setModelPicker(false)} />
    </Suspense>}
  </div>
}

function completionItems(trigger, assets, project, onCommand, members) {
  const query = trigger.query.toLowerCase()
  if (members) return trigger.kind === '@' ? members
    .filter(bot => bot.name.toLowerCase().includes(query) || botHandle(bot).toLowerCase().startsWith(query))
    .map(bot => ({ label: bot.name, insert: '@' + botHandle(bot), description: '@' + botHandle(bot), icon: 'bot', complete: true })) : []
  if (trigger.kind === '/') {
    return commands.filter(command => (onCommand || ['help', 'model', 'approvals'].includes(command.name))
      && (command.name.startsWith(query) || command.description.includes(query)))
      .map(command => ({ ...command, label: '/' + command.name, insert: '/' + command.name, complete: true }))
  }

  const folder = project?.folder && {
    insert: referenceText('folder', project.folder), label: project.name, icon: 'folder',
    description: project.folder + ' · 演示工作区', complete: true,
  }
  const assetItems = assets.slice(0, 5).map(name => ({
    insert: referenceText('file', name), label: name, icon: 'file', description: '演示文件引用', complete: true,
  }))
  const kinds = referenceKinds.map(([kind, label, icon]) => ({
    insert: '@' + kind + ':', label: '@' + kind + ':', description: label, icon, complete: false,
  }))
  const git = ['diff', 'staged'].map((kind, index) => ({
    insert: '@' + kind, label: '@' + kind, description: index ? '已暂存的 Git 变更' : '未暂存的 Git 变更',
    icon: 'file', complete: true,
  }))
  return [folder, ...assetItems, ...kinds, ...git].filter(item =>
    item && (item.insert.slice(1).toLowerCase().startsWith(query) || item.label.toLowerCase().includes(query)))
}

function releaseRecording(job) {
  if (!job) return
  job.controller.abort()
  clearInterval(job.clock)
  clearTimeout(job.timer)
  if (job.recorder) {
    job.recorder.onstop = null
    job.recorder.ondataavailable = null
    job.recorder.onerror = null
    if (job.recorder.state !== 'inactive') job.recorder.stop()
  }
  job.stream?.getTracks().forEach(track => track.stop())
  job.chunks.length = 0
}

function formatRecordingTime(seconds) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MiB'
}
