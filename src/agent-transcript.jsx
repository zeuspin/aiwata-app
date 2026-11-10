import React, { useLayoutEffect, useRef, useState } from 'react'
import { demoPrompts } from './agent-session.mjs'
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

export function AgentRequest({ request, onRespond }) {
  const [answers, setAnswers] = useState({})
  if (request.method === 'approval') {
    return <section className="agent-request" aria-label="Agent 审批请求">
      <h3><Icon name="shield" />需要批准</h3>
      <div className="agent-request-content">
        <p>{request.params.description}</p>
        <pre>{request.params.command}</pre>
      </div>
      <div className="agent-card-actions">{request.params.choices.map(choice =>
        <button type="button" key={choice} className={choice === 'deny' ? 'secondary' : 'primary'}
          onClick={() => onRespond(request, choice)}>{choices[choice]}</button>)}</div>
    </section>
  }
  const questions = request.params.questions
  return <form className="agent-request" aria-label="Agent 追问" onSubmit={event => {
    event.preventDefault()
    onRespond(request, { answers, outcome: 'submitted' })
  }}>
    <h3>Agent 需要你确认</h3>
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

function Message({ message, index, onPreview, onRetry, canRetry, onAttachmentPreview }) {
  return <article className={'message ' + message.role} data-message-index={index}>
    {message.author && <strong>{message.author}</strong>}
    {!!message.attachments?.length && <div className="message-files">{message.attachments.map((name, index) => {
      const entry = Object.hasOwn(message.attachmentDetails ?? {}, name) ? message.attachmentDetails[name] : null
      return <React.Fragment key={name}>{index > 0 && ' · '}{isLocalAttachment(entry)
        ? <button type="button" aria-label={'预览已发送附件 ' + name} onClick={() => onAttachmentPreview({ ...entry, name })}>{name}</button>
        : name}</React.Fragment>
    })}</div>}
    {message.role === 'agent' && <Activity turn={message} />}
    {message.text && <p>{message.text}</p>}
    {message.preview && <button type="button" className="secondary agent-preview-link"
      onClick={() => onPreview(message.preview)}><Icon name="browser" />{message.preview.label || '打开预览'}</button>}
    {message.status === 'interrupted' && <p className="muted">生成已停止</p>}
    {message.status === 'error' && <div className="agent-error">
      <p role="alert">{message.error || '本轮执行失败'}</p>
      {canRetry && message.recoverable && <button type="button" className="secondary" onClick={onRetry}>取回重试内容</button>}
    </div>}
    {message.usage && <small className="agent-usage">{message.usage.input ?? message.usage.input_tokens ?? 0} 输入 · {message.usage.output ?? message.usage.output_tokens ?? 0} 输出 tokens</small>}
  </article>
}

export function Transcript({ chat, project, visible, onPositionChange, onRetry, onPreview, onScenario, onAttachmentPreview }) {
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

  return <div className="transcript agent-transcript" ref={scroll} aria-label="会话消息" onScroll={savePosition}>
    {!chat.messages.length
      ? <div className="welcome">
          <img className="welcome-banner" src="/aiwata-banner.svg" alt="AIWATA" />
          <h2>{project ? '我们应该在' + project.name + '中做些什么？' : '我们要构建什么？'}</h2>
        </div>
      : <div className="message-list">{chat.messages.map((message, index) =>
          <Message key={message.id ?? index} message={message} index={index} onRetry={onRetry}
            onPreview={onPreview} onAttachmentPreview={onAttachmentPreview}
            canRetry={index === chat.messages.length - 1 && !chat.pending && !hasPromptContent({ text: chat.draft, attachments: chat.attachments })} />)}
        {chat.pending && <article className="message agent">
          {run && <Activity turn={run} />}
          {run?.text && <p data-streaming="true">{run.text}</p>}
          {run?.preview && <button className="secondary agent-preview-link" onClick={() => onPreview(run.preview)}>打开{run.preview.label || '预览'}</button>}
          {!request && !run?.text && <div className="thinking" role="status"><span className="spinner" />Agent 正在工作</div>}
        </article>}
      </div>}
    {!chat.pending && <div className="agent-demo-picker"><label>
      <span>演示场景</span>
      <select value="" onChange={event => { if (event.target.value) onScenario(event.target.value) }}>
        <option value="">填入示例提示词</option>
        {demoPrompts.map(([label, prompt]) => <option key={label} value={prompt}>{label}</option>)}
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
