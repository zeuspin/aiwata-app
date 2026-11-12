import React, { useLayoutEffect, useRef, useState } from 'react'
import { demoPrompts } from './agent-session.mjs'
import { BotFace } from './bot-avatar.jsx'
import { botPresence, botPresenceLabels, roomMemberPresence } from './bot-presence.mjs'
import { botHandle } from './room.mjs'
import { Icon } from './icons.jsx'
import { hasPromptContent, isLocalAttachment } from './local-attachments.mjs'
import './agent-transcript.css'

const taskStatus = { pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }
const choices = { once: '允许一次', session: '本会话允许', always: '始终允许', deny: '拒绝' }

function Activity({ turn }) {
  const tools = Object.values(turn.tools ?? {})
  const children = Object.values(turn.children ?? {})
  if (!tools.length && !children.length && !turn.todos?.length) return null
  return <div className="agent-activity">
    {!!turn.todos?.length && <details className="agent-detail" open={!turn.status || undefined}>
      <summary>任务进度 · {turn.todos.filter(item => item.status === 'completed').length}/{turn.todos.length}</summary>
      <ul>{turn.todos.map(item => <li key={item.id}><span>{item.content}</span><small>{taskStatus[item.status]}</small></li>)}</ul>
    </details>}
    {tools.map(tool => <details className="agent-detail" key={tool.tool_id}>
      <summary>{tool.complete ? '工具已完成' : '工具运行中'} · <code>{tool.name}</code></summary>
      {tool.summary && <p>{tool.summary}</p>}
      {tool.args && <pre aria-label="工具输入">{JSON.stringify(tool.args, null, 2)}</pre>}
      {tool.result != null && <pre aria-label="工具输出">{JSON.stringify(tool.result, null, 2)}</pre>}
    </details>)}
    {!!children.length && <details className="agent-detail" open={!turn.status || undefined}>
      <summary>子 Agent · {children.filter(child => child.complete).length}/{children.length} 已完成</summary>
      <ul>{children.map(child => <li key={child.subagent_id}>
        <span>{child.goal}{child.summary && <small>{child.summary}</small>}</span>
        <small>{child.complete ? '已返回' : '执行中'}</small>
      </li>)}</ul>
    </details>}
  </div>
}

export function AgentRequest({ request, onRespond, disabled }) {
  const [answers, setAnswers] = useState({})
  if (request.method === 'approval') {
    return <section className="agent-request" aria-label="Agent 审批请求">
      <h3><Icon name="shield" />{request.params.member_name ? request.params.member_name + '请求批准' : '需要批准'}</h3>
      <div className="agent-request-content">
        <p>{request.params.description}</p>
        <pre>{request.params.command}</pre>
      </div>
      <div className="agent-card-actions">{request.params.choices.map(choice =>
        <button type="button" key={choice} className={choice === 'deny' ? 'secondary' : 'primary'} disabled={disabled}
          onClick={() => onRespond(request, choice)}>{choices[choice]}</button>)}</div>
    </section>
  }
  const questions = request.params.questions
  return <form className="agent-request" aria-label="Agent 追问" onSubmit={event => {
    event.preventDefault()
    onRespond(request, { answers, outcome: 'submitted' })
  }}>
    <h3>{request.params.member_name ?? 'Agent'}需要你确认</h3>
    <div className="agent-request-content">{questions.map(question => <label key={question.qid}>
      {question.question}
      {question.choices?.length ? <select value={answers[question.qid] ?? ''} required
        onChange={event => setAnswers({ ...answers, [question.qid]: event.target.value })}>
        <option value="">请选择</option>
        {question.choices.map(option => <option key={option}>{option}</option>)}
      </select> : <input required value={answers[question.qid] ?? ''}
        onChange={event => setAnswers({ ...answers, [question.qid]: event.target.value })} />}
    </label>)}</div>
    <div className="agent-card-actions">
      <button type="submit" className="primary">提交答复</button>
      <button type="button" className="secondary" onClick={() => onRespond(request, { outcome: 'cancelled' })}>跳过</button>
    </div>
  </form>
}

function FilePreviews({ previews, onOpen }) {
  if (!onOpen || !previews?.length) return null
  return <div className="agent-card-actions">{previews.map(file =>
    <button key={file.target} type="button" className="secondary agent-preview-link" onClick={() => onOpen(file)}>
      <Icon name="file" />打开{file.label}
    </button>)}</div>
}

function WebPreviews({ previews, onOpen }) {
  if (!onOpen || !previews?.length) return null
  return <div className="agent-card-actions">{previews.map(page =>
    <button key={page.url} type="button" className="secondary agent-preview-link" title={page.url} onClick={() => onOpen(page)}>
      <Icon name="browser" />打开{page.label}
    </button>)}</div>
}

function MentionText({ text, members }) {
  return text.split(/((?<![\p{L}\p{N}_.@-])@[\p{L}\p{N}_-]+)/gu).map((part, index) => {
    const member = part.startsWith('@') && members.find(member => botHandle(member).toLowerCase() === part.slice(1).toLowerCase())
    return member ? <span className="conversation-mention" title={part} key={index}>@{member.name}</span> : part
  })
}

function SpeakerAvatar({ bot, name, user, account, active = false, state = 'idle' }) {
  return <span className="conversation-avatar" role="img" aria-label={name + (active ? '正在回复' : '的头像')}>
    {user ? <span className="conversation-user-avatar">{account?.initial || '你'}</span>
      : bot ? <BotFace bot={bot} size="activity" still={!active} state={state} /> : <Icon name="botChat" />}
  </span>
}

function Message({ message, index, bot, members, account, conversational, onPreview, onFilePreview, onRetry, canRetry, onReply, onAttachmentPreview }) {
  const speaker = message.memberId ? members.find(member => member.id === message.memberId) : bot
  const user = message.role === 'user'
  const author = user ? (message.scheduled ? message.author || '定时任务' : '你') : message.author || speaker?.name || 'Bot'
  const timestamp = Number.isFinite(message.timestamp) && Math.abs(message.timestamp) <= 8.64e15 ? new Date(message.timestamp) : null
  const reply = onReply && message.threadId && message.text && <button type="button" className={conversational ? 'conversation-reply' : 'secondary room-reply'}
    title="引用回复" aria-label={'引用回复 ' + (message.author ?? (user ? '你的消息' : author))} onClick={() => onReply(message.id)}>
    {conversational ? <Icon name="reply" /> : '引用回复'}</button>
  return <article className={'message ' + message.role + (conversational ? ' conversation-message' : '')} data-message-index={index}>
    {conversational && <SpeakerAvatar bot={speaker} name={author} user={user} account={account} />}
    <div className="message-content">
    {conversational ? <header className="conversation-message-heading">
      <strong>{author}</strong>
      {message.scheduled && <small className="room-scheduled">定时任务</small>}
      {timestamp && <time dateTime={timestamp.toISOString()} title={timestamp.toLocaleString('zh-CN')}>
        {timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </time>}
      {reply}
    </header> : <>{message.author && <strong>{message.author}</strong>}{message.scheduled && <small className="room-scheduled">定时任务</small>}</>}
    <div className="message-body">
    {message.reply && <blockquote className="room-quote"><strong>{message.reply.author}</strong> · {message.reply.text}</blockquote>}
    {!!message.attachments?.length && <div className="message-files">{message.attachments.map((name, index) => {
      const entry = Object.hasOwn(message.attachmentDetails ?? {}, name) ? message.attachmentDetails[name] : null
      return <React.Fragment key={name}>{index > 0 && ' · '}{isLocalAttachment(entry)
        ? <button type="button" aria-label={'预览已发送附件 ' + name} onClick={() => onAttachmentPreview({ ...entry, name })}>{name}</button>
        : name}</React.Fragment>
    })}</div>}
    {message.role === 'agent' && <Activity turn={message} />}
    {message.text && <p>{conversational ? <MentionText text={message.text} members={members} /> : message.text}</p>}
    {conversational && message.memberId && /^[（(]\s*通过\s*[）)]$/.test(message.text?.trim() ?? '') &&
      <small className="conversation-reply-note" title="模型返回的原始文字；系统未将其判定为审批通过或验收通过。">Bot 原文，非验收状态</small>}
    {message.preview && <button type="button" className="secondary agent-preview-link"
      onClick={() => onPreview(message.preview)}><Icon name="browser" />{message.preview.label || '打开预览'}</button>}
    <FilePreviews previews={message.filePreviews} onOpen={onFilePreview} />
    <WebPreviews previews={message.webPreviews} onOpen={onPreview} />
    {message.status === 'interrupted' && <p className="muted">生成已停止</p>}
    {message.status === 'error' && <div className="agent-error">
      <p role="alert">{message.error || '本轮执行失败'}</p>
      {canRetry && message.recoverable && <button type="button" className="secondary" onClick={onRetry}>{onReply ? '重试本轮' : '取回重试内容'}</button>}
    </div>}
    {message.usage && <small className="agent-usage">{message.usage.input ?? message.usage.input_tokens ?? 0} 输入 · {message.usage.output ?? message.usage.output_tokens ?? 0} 输出 tokens</small>}
    {!conversational && reply}
    </div>
    </div>
  </article>
}

function GroupTyping({ members, chat }) {
  const statuses = chat.agentRun?.room?.statuses ?? {}
  const active = members.filter(member => ['queued', 'running', 'waiting'].includes(statuses[member.id]))
  return active.length ? active.map(member => <div className="conversation-typing" key={member.id} role="status">
    <SpeakerAvatar bot={member} name={member.name} active state={roomMemberPresence(chat, member.id)} />
    <span><strong>{member.name}</strong><span className="conversation-typing-label">
      <span className="conversation-typing-dots" aria-hidden="true"><i /><i /><i /></span>
      {statuses[member.id] === 'queued' ? '等待回复' : statuses[member.id] === 'waiting' ? '等待确认' : '正在回复'}
    </span></span>
  </div>) : <div className="thinking" role="status"><span className="spinner" />正在等待群成员回复</div>
}

export function Transcript({ chat, project, bot, group, members = [], account, visible, onPositionChange, onRetry, onReply, onPreview, onFilePreview, onScenario, onAttachmentPreview }) {
  const scroll = useRef(null)
  const position = useRef(chat.transcriptPosition ?? { follow: true, top: 0 })
  const appliedTop = useRef(null)
  const run = chat.agentRun
  const request = run?.request

  useLayoutEffect(() => {
    if (!visible) return
    const el = scroll.current
    function restorePosition() {
      if (!el.clientHeight) return
      const { follow, top, messageIndex, offset } = position.current
      const anchor = Number.isInteger(messageIndex) && el.querySelector(`[data-message-index="${messageIndex}"]`)
      if (follow) el.scrollTop = el.scrollHeight
      else el.scrollTop = anchor ? anchor.offsetTop + Math.min(offset, anchor.offsetHeight - 1) : top
      appliedTop.current = el.scrollTop
    }
    restorePosition()
    const resize = new ResizeObserver(restorePosition)
    resize.observe(el)
    return () => resize.disconnect()
  }, [visible])

  useLayoutEffect(() => {
    if (!visible || !position.current.follow) return
    const el = scroll.current
    el.scrollTop = el.scrollHeight
    appliedTop.current = el.scrollTop
  }, [visible, chat.messages, chat.pending, run])

  function savePosition(event) {
    const el = event.currentTarget
    const top = el.scrollTop
    if (!visible || !el.clientHeight || top === appliedTop.current) return
    appliedTop.current = null
    const follow = el.scrollHeight - top - el.clientHeight <= 2
    const next = { follow, top }
    if (!follow) {
      const anchor = Array.from(el.querySelectorAll('[data-message-index]'))
        .find(message => message.offsetTop + message.offsetHeight > top)
      if (anchor) {
        next.messageIndex = Number(anchor.dataset.messageIndex)
        next.offset = top - anchor.offsetTop
      }
    }
    position.current = next
    onPositionChange(next)
  }

  return <div className={'transcript agent-transcript' + (bot || group ? ' conversation-transcript' : '')} ref={scroll} aria-label="会话消息" onScroll={savePosition}>
    {!chat.messages.length
      ? <div className="welcome">
          <img className="welcome-banner" src="./aiwata-banner.svg" alt="AIWATA" />
          <h2>{bot ? '和' + bot.name + '开始工作' : group ? '在群里开始讨论'
            : project ? '我们应该在' + project.name + '中做些什么？' : '我们要构建什么？'}</h2>
          {(bot?.description || group) && <p className="conversation-welcome-copy">{bot?.description || '发送消息，或用 @ 邀请指定成员回复。'}</p>}
        </div>
      : <div className="message-list">{chat.messages.map((message, index) =>
          <Message key={message.id ?? index} message={message} index={index} onRetry={onRetry}
            bot={bot} members={members} account={account} conversational={Boolean(bot || group)}
            onPreview={onPreview} onFilePreview={onFilePreview} onAttachmentPreview={onAttachmentPreview} onReply={onReply}
            canRetry={!chat.pending && (group ? message.id === chat.lastInput?.runId + ':outcome'
              : index === chat.messages.length - 1 && !hasPromptContent({ text: chat.draft, attachments: chat.attachments }))} />)}
        {chat.pending && !chat.gatewayUnknown && !run?.room?.paused && (group ? <GroupTyping members={members} chat={chat} /> : <article className={'message agent' + (bot ? ' conversation-message' : '')}>
          {bot && <SpeakerAvatar bot={bot} name={bot.name} active state={botPresence(chat)} />}
          <div className="message-content">
          {bot && <header className="conversation-message-heading"><strong>{bot.name}</strong><small>{botPresenceLabels[botPresence(chat)]}</small></header>}
          {run && <Activity turn={run} />}
          {run?.text && <p data-streaming="true">{run.text}</p>}
          {run?.preview && <button className="secondary agent-preview-link" onClick={() => onPreview(run.preview)}>打开{run.preview.label || '预览'}</button>}
          <FilePreviews previews={run?.filePreviews} onOpen={onFilePreview} />
          <WebPreviews previews={run?.webPreviews} onOpen={onPreview} />
          {!request && !run?.text && <div className="thinking" role={bot ? undefined : 'status'}>
            {!bot && <span className="spinner" />}
            {bot ? botPresenceLabels[botPresence(chat)] : group ? '群成员正在处理' : 'Agent 正在工作'}
          </div>}
          </div>
        </article>)}
      </div>}
    {!chat.pending && onScenario && <div className="agent-demo-picker"><label>
      <span>演示场景</span>
      <select value="" onChange={event => { if (event.target.value) onScenario(event.target.value) }}>
        <option value="">填入示例提示词</option>
        {demoPrompts.map(([label, prompt]) => <option key={label} value={prompt}>{label}</option>)}
        {group && <option value="演示轮次上限：分轮核对发布清单">达到轮次上限后继续</option>}
      </select>
    </label></div>}
  </div>
}

export function AgentQueue({ chat, onEdit, onResume }) {
  const [edit, setEdit] = useState(null)
  if (!chat.queue?.length) return null
  const paused = chat.activity?.queuePaused
  return <section className="agent-queue" aria-label="消息队列">
    <header><strong>消息队列 · {chat.queue.length}{paused ? ' · 已暂停' : ''}</strong>
      {paused && <button type="button" className="secondary" onClick={onResume}>继续队列</button>}</header>
    <ul>{chat.queue.map(item => <li key={item.runId}>
      {edit?.id === item.runId ? <form onSubmit={event => {
        event.preventDefault()
        onEdit(item.runId, edit.text)
        setEdit(null)
      }}>
        <input aria-label="编辑排队消息" required value={edit.text} onChange={event => setEdit({ ...edit, text: event.target.value })} />
        <button className="secondary" type="submit">保存</button>
        <button className="secondary" type="button" onClick={() => setEdit(null)}>取消</button>
      </form> : <>
        <span title={item.text || item.attachments?.join(' · ')}>{item.text || item.attachments?.join(' · ')}</span>
        <button className="secondary" type="button" onClick={() => setEdit({ id: item.runId, text: item.text })}>编辑</button>
        <button className="secondary" type="button" onClick={() => onEdit(item.runId, null)}>移除</button>
      </>}
    </li>)}</ul>
  </section>
}
