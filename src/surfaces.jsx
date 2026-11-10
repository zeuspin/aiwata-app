import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { tools } from './fixtures.mjs'
import { Icon, IconButton, toolIcons } from './icons.jsx'
import { isLocalAttachment } from './local-attachments.mjs'
import { browserAddress, demoBrowser, emptyBrowserState, gitChanges, mediaProviders, moveBrowser, navigateBrowser, terminalOutput, toolEditDefaults } from './tool-surfaces.mjs'
import './tool-surfaces.css'

export function ProjectDialog({ onClose, onCreate }) {
  const dialog = useRef(null)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    dialog.current.showModal()
  }, [])

  return <dialog ref={dialog} className="project-dialog" onCancel={onClose} aria-labelledby="project-heading">
    <header><h2 id="project-heading">{confirming ? '确认项目目录' : '创建项目'}</h2><IconButton icon="close" label="关闭" onClick={onClose} /></header>
    <form onSubmit={event => {
      event.preventDefault()
      if (confirming) onCreate(name, folder, event.nativeEvent.submitter?.value === 'trusted')
      else setConfirming(true)
    }}>
      {confirming ? <p>将 <strong>{folder}</strong> 设为项目的工作目录。这里保存演示信任状态，工具批准方式可在会话输入区另行选择。</p>
        : <>
            <label>项目名称<input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="例如 品牌工作台" /></label>
            <label>源文件夹<input required value={folder} onChange={e => setFolder(e.target.value)} placeholder="例如 ~/Projects/brand-studio" /></label>
            <small>演示路径 · 此计算机</small>
          </>}
      <footer>
        <button className="secondary" type="button" onClick={confirming ? () => setConfirming(false) : onClose}>{confirming ? '上一步' : '取消'}</button>
        {confirming && <button className="secondary" value="linked">仅关联并创建</button>}
        <button className="primary" value="trusted" disabled={!name.trim() || !folder.trim()}>{confirming ? '信任并创建' : '创建项目'}</button>
      </footer>
    </form>
  </dialog>
}

export { emptyToolData } from './tool-surfaces.mjs'

function BrowserHome({ openTool, navigate }) {
  return <div className="tool-home">
    <div className="tool-title browser-home-heading"><h3>工具</h3>
      <button type="button" className="tool-text-button" onClick={() => navigate(demoBrowser)}>演示站点</button></div>
    <div className="tool-launchers">{tools.filter(item => item !== '浏览器').map(item => <button type="button" key={item} onClick={() => openTool(item)}>
      <Icon name={toolIcons[item]} size={17} />{item}
    </button>)}</div>
    <h3 className="tool-section-title">推荐</h3>
    <div className="recommended">
      <button onClick={() => openTool('无限画布')}><span><Icon name="canvas" size={24} /></span>无限画布</button>
      <button onClick={() => openTool('生图工具')}><span><Icon name="photo" size={24} /></span>生图工具</button>
      <button onClick={() => openTool('修图工具')}><span><Icon name="retouch" size={24} /></span>修图工具</button>
    </div>
  </div>
}

const browserPages = {
  '/': ['工作台预览', '在同一个空间里，从对话走到交付。', '围绕项目组织会话、打开工具、把工作成果带回 Agent。'],
  '/workbench': ['工作台功能', '会话、浏览器与文件。', '在保留草稿的同时，打开浏览器检查页面，或把产物附加到会话。'],
  '/docs': ['使用指南', '开始你的第一个项目。', '打开项目目录，选择一个会话，然后在工具栏打开浏览器或终端。'],
  '/release': ['发布清单', '发布前的最后检查。', '核对产品截图、宣传素材和发布文案的交付状态。'],
}
const pageLinks = [['/workbench', '工作台'], ['/docs', '使用指南'], ['/release', '发布清单']]
const emptyAnnotationDraft = { open: false, target: '', text: '' }

function BrowserPage({ url, navigate, annotating, selectTarget, selection }) {
  const pageUrl = new URL(url)
  const internal = pageUrl.hostname === new URL(demoBrowser).hostname
  const query = internal ? pageUrl.searchParams.get('q') : ''
  const [title, heading, description] = internal
    ? browserPages[pageUrl.pathname] ?? ['站内预览', query ? '搜索 · ' + query : '这个页面可用于演示。', '从下方入口打开工作台、使用指南或发布清单。']
    : ['站点预览', pageUrl.hostname, '这是该地址的本地演示页。页面内容可用于体验导航和批注。']
  function target(label, href) {
    if (annotating) selectTarget(label)
    else if (href) navigate(demoBrowser + href)
  }

  return <article className={'browser-demo-page' + (annotating ? ' annotating' : '')} aria-label="网页预览">
    <header><img src="/aiwata.svg" alt="" /><strong>{title}</strong><span className="tool-badge">本地样例</span></header>
    <div className="browser-demo-hero">
      <span className="browser-demo-kicker">AIWATA WORKSPACE</span>
      {annotating
        ? <button className="browser-demo-heading" aria-pressed={selection === heading} onClick={() => target(heading)}>{heading}</button>
        : <h3 className="browser-demo-heading">{heading}</h3>}
      {annotating
        ? <button className="browser-demo-description" aria-pressed={selection === description} onClick={() => target(description)}>{description}</button>
        : <p className="browser-demo-description">{description}</p>}
    </div>
    <nav aria-label="演示网页导航">{pageLinks.map(([path, label]) => <button key={path}
      aria-current={!annotating && internal && pageUrl.pathname === path ? 'page' : undefined}
      aria-pressed={annotating ? selection === label : undefined} onClick={() => target(label, path)}>
      {label}<Icon name="next" size={14} />
    </button>)}</nav>
  </article>
}

function BrowserTool({ openTool, chat, api, refresh, report, preview }) {
  const [addressDraft, setAddressDraft] = useState(null)
  const [reload, setReload] = useState(0)
  const data = chat.browser ?? emptyBrowserState
  const { agentActions, playbackOpen, replayIndex } = data
  const url = agentActions[replayIndex]?.url ?? data.visited
  const address = addressDraft?.page === url ? addressDraft.text : url
  const pins = data.annotations.filter(item => item.url === url)
  const { open, target: selection, text: comment } = data.annotationDrafts?.[url] ?? emptyAnnotationDraft
  const annotating = open && replayIndex === null && !preview

  function updateBrowser(update) {
    if (api.updateBrowser(chat.id, update)) refresh()
  }

  function editAnnotation(patch) {
    updateBrowser(previous => {
      const annotationDrafts = { ...previous.annotationDrafts }
      const draft = { ...emptyAnnotationDraft, ...annotationDrafts[url], ...patch }
      if (draft.open || draft.target || draft.text) annotationDrafts[url] = draft
      else delete annotationDrafts[url]
      return { ...previous, annotationDrafts }
    })
  }

  function navigate(value) {
    if (browserAddress(value) === null) return report('请输入有效的 HTTP 或 HTTPS 地址', true)
    setAddressDraft(null)
    updateBrowser(previous => navigateBrowser(previous, value))
  }

  function history(by) {
    setAddressDraft(null)
    updateBrowser(previous => moveBrowser(previous, by))
  }

  function showPlayback(open, index = null) {
    setAddressDraft(null)
    updateBrowser(previous => ({ ...previous, playbackOpen: open, replayIndex: index }))
  }

  function addAnnotation(event) {
    event.preventDefault()
    if (!comment.trim()) return
    const pin = { url, target: selection || '整个页面', text: comment.trim() }
    updateBrowser(previous => {
      const annotationDrafts = { ...previous.annotationDrafts }
      delete annotationDrafts[url]
      return { ...previous, annotations: [...previous.annotations, pin], annotationDrafts }
    })
  }

  function sendAnnotations() {
    const current = api.current()?.chats[chat.id]
    if (!current) return
    const annotation = ['请查看以下网页批注', url, ...pins.map((pin, index) => (index + 1) + '. ' + pin.target + ' · ' + pin.text)].join('\n')
    if (current.draft.includes(annotation)) return report('这些网页批注已在会话草稿中')
    api.setDraft(chat.id, [current.draft, annotation].filter(Boolean).join('\n\n'))
    refresh()
    report('已将网页批注放入会话草稿')
  }

  return <>
    <form className="browser-bar" onSubmit={event => { event.preventDefault(); navigate(address) }}>
      <IconButton icon="back" label="后退" disabled={data.historyIndex === 0} onClick={() => history(-1)} />
      <IconButton icon="next" label="前进" disabled={data.historyIndex === data.history.length - 1} onClick={() => history(1)} />
      <IconButton icon="refresh" label="刷新预览" disabled={!url} onClick={() => { setReload(reload + 1); report('本地预览已刷新') }} />
      <input aria-label="浏览器地址" value={address} onChange={event => {
        setAddressDraft({ page: data.visited, text: event.target.value })
        if (replayIndex !== null) updateBrowser(previous => ({ ...previous, replayIndex: null }))
      }} placeholder="搜索或输入网址" />
      <IconButton icon="home" label="工具起始页" disabled={!url} onClick={() => navigate('')} />
    </form>
    {(url || agentActions.length > 0) && <div className="tool-home browser-document">
      <div className="browser-document-actions">
        {url && <button type="button" className="secondary" aria-pressed={annotating} disabled={replayIndex !== null}
          onClick={() => editAnnotation({ open: !annotating })}><Icon name="edit" size={15} />批注{pins.length ? ' · ' + pins.length : ''}</button>}
        <button type="button" className="secondary" aria-expanded={playbackOpen} disabled={!agentActions.length}
          onClick={() => showPlayback(!playbackOpen)}><Icon name="bot" size={15} />Agent 回放{agentActions.length ? ' · ' + agentActions.length : ''}</button>
      </div>
      {playbackOpen && agentActions.length > 0 && <section className="browser-playback" aria-label="Agent 操作回放">
        <div className="tool-title"><strong>{replayIndex === null ? '最近一次操作' : '回放 · ' + (replayIndex + 1) + ' / ' + agentActions.length}</strong>
          <button type="button" className="tool-text-button" onClick={() => showPlayback(false)}>返回当前页面</button></div>
        <ol>{agentActions.map((action, index) => <li key={index}>
          <button type="button" aria-pressed={replayIndex === index} onClick={() => showPlayback(true, index)}>
            <span>{index + 1}. {action.label || action.action || '打开网页'}</span>
            {action.url && <small>{action.url}</small>}
          </button>
        </li>)}</ol>
      </section>}
      {url && <BrowserPage key={url + reload} url={url} navigate={navigate} annotating={annotating}
        selectTarget={target => editAnnotation({ target })} selection={selection} />}
      {annotating && <form className="browser-note" onSubmit={addAnnotation}>
        <label>批注位置 · {selection || '整个页面'}<textarea value={comment} onChange={event => editAnnotation({ text: event.target.value })}
          placeholder="选择页面元素，或为整个页面写批注" /></label>
        <button className="secondary" disabled={!comment.trim()}>保存批注</button>
      </form>}
      {!!pins.length && replayIndex === null && <section className="browser-pins" aria-label="网页批注">
        <ul>{pins.map((pin, index) => <li key={index}><strong>{pin.target}</strong><p>{pin.text}</p></li>)}</ul>
        <button className="primary" onClick={sendAnnotations}>添加批注到会话</button>
      </section>}
    </div>}
    {!url && <BrowserHome openTool={openTool} navigate={navigate} />}
  </>
}

function CanvasTool({ data, set }) {
  return <div className="tool-home">
    <div className="tool-title"><h3>无限画布</h3><button className="secondary" onClick={() => set('notes', [...data.notes, '新便签'])}><Icon name="add" />添加便签</button></div>
    {data.notes.length ? <div className="notes-grid">{data.notes.map((note, index) => <textarea key={index} aria-label={'便签 ' + (index + 1)} value={note} onChange={e => set('notes', data.notes.map((item, i) => i === index ? e.target.value : item))} />)}</div>
      : <div className="tool-empty"><Icon name="canvas" size={32} /><h3>从一张便签开始</h3><p>把这个会话里的想法放进画布。</p></div>}
  </div>
}

function toolFiles(project, data, chat) {
  const projectFiles = project ? [
    { name: 'README.md', type: '项目文件', text: '# ' + project.name + '\n\n项目演示目录。这里可以预览文件，或将文件带回当前会话。' },
    { name: 'src/workspace.js', type: '项目文件', text: 'export const workspace = {\n  preview: true,\n  layout: "split",\n}' },
  ] : []
  const known = [...projectFiles, ...data.artifacts]
  const drafts = (chat?.attachments ?? []).map(name => {
    const entry = Object.hasOwn(chat.attachmentDetails ?? {}, name) ? chat.attachmentDetails[name] : null
    return { name, type: '会话附件', attachment: isLocalAttachment(entry) ? entry : null }
  }).filter(file => file.attachment || !known.some(item => item.name === file.name))
  return [...known, ...drafts]
}

const toolFileKey = file => file.attachment ? JSON.stringify(['local', file.name]) : file.name

function useReadingPosition({ chat, api, contentRef, scope, visible, output }) {
  const position = useRef(null)
  const appliedTop = useRef(null)
  const followsOutput = output !== undefined

  useLayoutEffect(() => {
    if (!visible || !scope) return
    const content = contentRef.current
    const el = followsOutput ? content : content.closest('.tool-scroll')
    position.current = chat.toolEdits?.readingPositions?.[scope] ?? { top: 0, follow: followsOutput }
    function restore() {
      if (!el.clientHeight) return
      el.scrollTop = position.current.follow ? el.scrollHeight : position.current.top
      appliedTop.current = el.scrollTop
    }
    function save() {
      const top = el.scrollTop
      const max = el.scrollHeight - el.clientHeight
      if (top === appliedTop.current || max <= 0 || !el.clientHeight || api.current()?.chats[chat.id] !== chat) return
      appliedTop.current = null
      const next = { top, follow: followsOutput && max - top <= 2 }
      position.current = next
      api.updateToolEdits(chat.id, ({ readingPositions }) => ({ readingPositions: { ...readingPositions, [scope]: next } }))
    }
    restore()
    el.addEventListener('scroll', save)
    const resize = new ResizeObserver(restore)
    resize.observe(el)
    if (content !== el) resize.observe(content)
    return () => {
      resize.disconnect()
      el.removeEventListener('scroll', save)
    }
  }, [api, chat, scope, contentRef, visible, followsOutput])

  useLayoutEffect(() => {
    if (!visible || !scope || !output || !position.current?.follow) return
    const el = contentRef.current
    el.scrollTop = el.scrollHeight
    appliedTop.current = el.scrollTop
  }, [output, scope, contentRef, visible])
}

function FileTool({ data, set, chat, project, attach, api, visible: paneVisible, onAttachmentPreview }) {
  const content = useRef(null)
  const files = toolFiles(project, data, chat)
  const filter = data.fileFilter
  const visible = files.filter(file => filter === '全部' || file.type === filter)
  const selected = visible.find(file => toolFileKey(file) === data.selectedFile) ?? visible[0]
  useReadingPosition({ chat, api, contentRef: content, visible: paneVisible,
    scope: selected && JSON.stringify(['file', project?.id, toolFileKey(selected)]) })
  const downloadName = selected?.name.split('/').at(-1)
  const downloadHref = selected?.url ?? (selected?.text !== undefined ? 'data:text/plain;charset=utf-8,' + encodeURIComponent(selected.text) : '')

  return <div ref={content} className="tool-home tool-detail">
    <header className="tool-detail-header"><div><h3>文件与产物</h3><p>{project?.folder || '当前会话'}</p></div><span className="tool-badge">样例</span></header>
    <div className="tool-segments" aria-label="文件类别">{['全部', '项目文件', '会话产物', '会话附件'].map(type =>
      <button key={type} aria-pressed={filter === type} onClick={() => set('fileFilter', type)}>{type}</button>)}</div>
    {visible.length ? <ul className="tool-file-list">{visible.map(file => <li key={toolFileKey(file)}>
      <button aria-pressed={selected === file} onClick={() => set('selectedFile', toolFileKey(file))}>
        <Icon name={file.url ? 'photo' : 'file'} size={17} /><span>{file.name}</span><small>{file.type}</small>
      </button>
    </li>)}</ul> : <div className="tool-empty"><Icon name="folder" size={30} /><h3>暂无文件</h3><p>产物和附件会出现在此处。</p></div>}
    {selected && <section className="tool-file-preview" aria-label="文件预览">
      <div className="tool-title"><strong>{selected.name}</strong><span className="tool-badge">预览</span></div>
      {selected.url ? <div className="image-preview"><img src={selected.url} alt={selected.name} /></div>
        : selected.text !== undefined ? <pre>{selected.text}</pre>
          : selected.attachment ? <button type="button" className="secondary"
            onClick={() => onAttachmentPreview?.(selected.attachment)}>预览原文件</button>
            : <p className="muted">该演示附件只有名称。</p>}
      <div className="tool-action-row">
        <button className="secondary" onClick={() => attach(selected.name)}><Icon name="attach" size={15} />在会话中使用</button>
        {downloadHref && <a className="secondary tool-download" href={downloadHref} download={downloadName}><Icon name="download" size={15} />下载</a>}
      </div>
    </section>}
  </div>
}

function projectWorktrees(data, project) {
  return project ? data.worktrees.filter(worktree => worktree.projectId === project.id) : []
}

function activeWorktree(data, project, worktrees = projectWorktrees(data, project)) {
  return worktrees.find(worktree => worktree.path === data.activeWorktreePath) ?? { branch: 'main', path: project?.folder ?? '~/Workspace' }
}

function TerminalTool({ data, updateEdits, project, chat, api, visible }) {
  const [command, setCommand] = useState('')
  const [cursor, setCursor] = useState(null)
  const terminal = useRef(null)
  const worktree = activeWorktree(data, project)
  const history = data.terminalLog.map(entry => entry.command)
  useReadingPosition({ chat, api, contentRef: terminal, visible,
    scope: history.length ? 'terminal' : null, output: data.terminalLog })

  function clearLog() {
    updateEdits(({ readingPositions }) => {
      const next = { ...readingPositions }
      delete next.terminal
      return { terminalLog: [], readingPositions: next }
    })
    setCursor(null)
  }

  function run(event) {
    event.preventDefault()
    const input = command.trim()
    if (!input) return
    const output = terminalOutput(input, worktree.path, project ? worktree.branch : '', data.gitStaged[worktree.path] ?? [], project ? ['README.md', 'src/'] : [])
    if (input === 'clear') clearLog()
    else updateEdits(({ terminalLog }) => ({ terminalLog: [...terminalLog, { command: input, output }] }))
    setCommand('')
    setCursor(null)
  }

  function recall(event) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !history.length) return
    event.preventDefault()
    const next = Math.max(0, Math.min(history.length, (cursor ?? history.length) + (event.key === 'ArrowUp' ? -1 : 1)))
    setCursor(next)
    setCommand(history[next] || '')
  }

  return <div className="tool-home tool-detail">
    <header className="tool-detail-header"><div><h3>终端</h3><p>{worktree.path}</p></div><span className="tool-badge">模拟终端</span></header>
    <section className="terminal-demo" aria-label="模拟终端">
      <div className="terminal-output" ref={terminal} role="log" aria-label="终端输出" tabIndex={0}>
        <p className="terminal-hint">输入 help 查看可用命令</p>
        {data.terminalLog.map((entry, index) => <div key={index}><span className="terminal-command">$ {entry.command}</span><pre>{entry.output}</pre></div>)}
      </div>
      <form onSubmit={run}><span aria-hidden="true">$</span><input value={command} onChange={event => setCommand(event.target.value)}
        onKeyDown={recall} autoComplete="off" spellCheck={false} aria-label="终端命令" /><button type="submit">运行</button></form>
    </section>
    <div className="tool-action-row">
      {['pwd', 'ls', 'git status'].map(value => <button key={value} type="button" className="secondary" onClick={() => setCommand(value)}>{value}</button>)}
      <button className="tool-text-button" type="button" disabled={!data.terminalLog.length} onClick={clearLog}>清屏</button>
    </div>
  </div>
}

function GitTool({ data, set, updateEdits, project, report, chat, api, visible: paneVisible }) {
  const [name, setName] = useState('')
  const content = useRef(null)
  const worktrees = projectWorktrees(data, project)
  const worktree = activeWorktree(data, project, worktrees)
  const stagedPaths = data.gitStaged[worktree.path] ?? []
  const filter = data.gitFilter
  const visible = gitChanges.filter(change => filter === '全部' || (filter === '已暂存') === stagedPaths.includes(change.path))
  const selected = visible.find(change => change.path === data.gitSelected) ?? visible[0]
  const staged = selected && stagedPaths.includes(selected.path)
  useReadingPosition({ chat, api, contentRef: content, visible: paneVisible,
    scope: project && selected && JSON.stringify(['git', worktree.path, selected.path]) })

  function createWorktree(event) {
    event.preventDefault()
    const branch = name.trim()
    if (!/^[a-z0-9][a-z0-9_/-]*$/i.test(branch) || branch.endsWith('/') || branch.includes('//')) return report('请输入有效的演示分支名称', true)
    if (branch === 'main' || worktrees.some(item => item.branch === branch)) return report('该演示分支已存在', true)
    const path = project.folder + '/.worktrees/' + branch
    updateEdits(({ worktrees }) => ({
      activeWorktreePath: path,
      worktrees: [...worktrees, { branch, path, projectId: project.id }],
    }))
    setName('')
    report('已切换到演示工作树')
  }

  function toggleStage() {
    updateEdits(({ gitStaged }) => {
      const paths = gitStaged[worktree.path] ?? []
      const next = paths.includes(selected.path) ? paths.filter(path => path !== selected.path) : [...paths, selected.path]
      return { gitStaged: { ...gitStaged, [worktree.path]: next } }
    })
  }

  return <div ref={content} className="tool-home tool-detail">
    <header className="tool-detail-header"><div><h3>Git</h3><p>{project ? worktree.path : '当前会话没有项目目录'}</p></div><span className="tool-badge">模拟仓库</span></header>
    {project ? <>
      <label className="tool-field">工作树<select value={worktree.path} onChange={event => set('activeWorktreePath', event.target.value)}>
        <option value={project.folder}>main · 主工作树</option>
        {worktrees.map(item => <option key={item.path} value={item.path}>{item.branch}</option>)}
      </select></label>
      <form className="git-create" onSubmit={createWorktree}><input aria-label="新工作树分支名称" placeholder="新工作树分支名" value={name}
        onChange={event => setName(event.target.value)} /><button className="secondary" disabled={!name.trim()}>模拟创建</button></form>
      <div className="tool-segments" aria-label="Git 变更范围">{['全部', '未暂存', '已暂存'].map(item =>
        <button key={item} aria-pressed={filter === item} onClick={() => set('gitFilter', item)}>{item}</button>)}</div>
      <ul className="tool-file-list">{visible.map(change => <li key={change.path}><button aria-pressed={selected?.path === change.path}
        onClick={() => set('gitSelected', change.path)}><Icon name="file" size={16} /><span>{change.path}</span><small>{change.summary}</small></button></li>)}</ul>
      {selected ? <section className="tool-file-preview" aria-label="Git 差异">
        <div className="tool-title"><strong>{selected.path}</strong><button className="secondary" onClick={toggleStage}>{staged ? '取消暂存' : '暂存'}</button></div>
        <pre className="git-patch">{selected.patch.map((line, index) => <span key={index} className={line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : ''}>{line + '\n'}</span>)}</pre>
      </section> : <p className="muted">此范围暂无变更。</p>}
    </> : <div className="tool-empty"><Icon name="git" size={30} /><h3>打开项目以查看变更</h3></div>}
  </div>
}

const generationCost = 40
const aspectRatios = { square: '1:1 方形', landscape: '16:9 横向', portrait: '9:16 纵向' }

function imageSample(aspect = 'square', saturation = 100) {
  const [width, height] = { square: [480, 480], landscape: [640, 360], portrait: [360, 640] }[aspect]
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 100 100" preserveAspectRatio="none">'
    + '<defs><filter id="tone"><feColorMatrix type="saturate" values="' + (saturation / 100) + '"/></filter></defs>'
    + '<g filter="url(#tone)"><rect width="100" height="100" fill="#f6eddf"/><circle cx="64" cy="37" r="17" fill="#d89460"/>'
    + '<path d="M0 76 25 47 48 72 67 59 100 83V100H0Z" fill="#4d655b"/><path d="M0 89 25 71 49 88 77 73 100 86V100H0Z" fill="#9cab88"/></g></svg>'
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

function MediaProviderSelect({ type, value, onChange }) {
  return <label className="tool-field">演示供应商<select value={value} onChange={event => onChange(event.target.value)}>
    {Object.entries(mediaProviders[type]).map(([id, provider]) => <option value={id} key={id}>{provider.name}</option>)}
  </select></label>
}

function GenerationTool({ data, set, chat, api, report, saveArtifact, attach }) {
  const providerId = data.imageProvider ?? (chat?.source && chat.source !== 'managed' ? 'none' : 'managed')
  const provider = mediaProviders.image[providerId]
  const aspect = data.aspect
  const generated = data.artifacts.find(item => item.name === data.generatedFile)
  const ready = provider.generate && (!provider.managed || (api?.current()?.credits ?? 0) >= generationCost)

  function generate(event) {
    event.preventDefault()
    const prompt = data.prompt.trim()
    if (!ready || !prompt) return
    if (provider.managed) {
      const result = api.charge({ id: crypto.randomUUID(), kind: '托管生图', amount: generationCost, source: 'managed' })
      if (!result.ok) return report('积分不足 · 生图需要 40 积分', true)
    }
    const artifact = { name: '生图样例 · ' + prompt.slice(0, 22).replace(/[\/\\]/g, '／') + '.svg', aspect, url: imageSample(aspect) }
    saveArtifact(artifact, { toolEdits: { generated: prompt, generatedFile: artifact.name } })
  }

  return <div className="tool-home tool-detail">
    <header className="tool-detail-header"><div><h3>生图工具</h3><p>从文字描述生成图像样例</p></div><span className="tool-badge">模拟</span></header>
    <MediaProviderSelect type="image" value={providerId} onChange={value => set('imageProvider', value)} />
    <form className="generation-form" onSubmit={generate}>
      <label>图像描述<textarea value={data.prompt} onChange={event => set('prompt', event.target.value)} placeholder="描述想生成的画面" /></label>
      <label className="tool-field">画面比例<select value={aspect} onChange={event => set('aspect', event.target.value)}>
        {Object.entries(aspectRatios).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <div className="tool-title"><small>{provider.managed ? (ready ? '托管生图 · 40 积分' : '积分不足 · 需要 40 积分') : provider.generate ? '使用供应商额度 · 演示' : '请选择可用的图片供应商'}</small>
        <button className="primary" disabled={!ready || !data.prompt.trim()}>生成样例</button></div>
    </form>
    {generated && <section className="generation-result" aria-label="生图结果">
      <img src={generated.url} alt="生图样例" />
      <div><strong>生图样例</strong><p>{data.generated}</p></div>
      <button className="secondary" onClick={() => attach(generated.name, true)}>带回会话</button>
    </section>}
  </div>
}

function ImageEditTool({ data, set, chat, api, saveArtifact, report }) {
  const providerId = data.imageProvider ?? (chat?.source && chat.source !== 'managed' ? 'none' : 'managed')
  const provider = mediaProviders.image[providerId]
  const editPrompt = data.imageEditPrompt
  const edited = data.artifacts.find(item => item.name === data.imageEditedFile)
  const imageArtifacts = data.artifacts.filter(item => item.url && item.name !== '手动调色.svg')
  const original = imageArtifacts.find(item => item.name === data.imageEditSource)
  const source = original?.name ?? toolEditDefaults.imageEditSource
  const adjusted = imageSample(original?.aspect, data.setting * 2)
  const enoughCredits = !provider.managed || (api?.current()?.credits ?? 0) >= generationCost

  function edit(event) {
    event.preventDefault()
    if (!provider.edit || !enoughCredits || !editPrompt.trim()) return
    if (provider.managed) {
      const result = api.charge({ id: crypto.randomUUID(), kind: '托管 AI 修图', amount: generationCost, source: 'managed' })
      if (!result.ok) return report('积分不足 · AI 修图需要 40 积分', true)
    }
    const artifact = { name: 'AI 修图样例.svg', aspect: original?.aspect, url: imageSample(original?.aspect, 62) }
    saveArtifact(artifact, { toolEdits: { imageEditedFile: artifact.name } })
    report('已生成模拟修图产物')
  }

  return <div className="tool-home tool-detail">
    <header className="tool-detail-header"><div><h3>修图工具</h3><p>本地调色与供应商图像编辑</p></div><span className="tool-badge">样例</span></header>
    <div className="image-preview"><img src={adjusted} alt="用于调色的样例图像" /></div>
    <label className="range-label">饱和度<input type="range" min="0" max="100" value={data.setting}
      onChange={event => set('setting', Number(event.target.value))} /><output>{data.setting}</output></label>
    <button className="secondary" onClick={() => {
      saveArtifact({ name: '手动调色.svg', aspect: original?.aspect, url: adjusted })
      report('已保存调色样例到文件与产物')
    }}>保存调色样例</button>
    <section className="tool-provider-section" aria-label="AI 修图">
      <h4>AI 修图</h4>
      <MediaProviderSelect type="image" value={providerId} onChange={value => set('imageProvider', value)} />
      <p className="muted">{provider.edit ? '当前模型支持图像到图像编辑。' : provider.styleOnly
        ? '当前模型仅支持样式参考。' : '当前供应商未提供图像编辑能力。'}</p>
      <form className="generation-form" onSubmit={edit}>
        <label className="tool-field">源图像<select disabled={!provider.edit} value={source} onChange={event => set('imageEditSource', event.target.value)}>
          <option>样例图像</option>{imageArtifacts.map(item => <option key={item.name}>{item.name}</option>)}
        </select></label>
        <label>编辑描述<textarea disabled={!provider.edit} value={editPrompt} onChange={event => set('imageEditPrompt', event.target.value)} placeholder="例如 调整为低饱和暖色" /></label>
        <div className="tool-title">
          {provider.managed && <small>{enoughCredits ? '托管 AI 修图 · 40 积分' : '积分不足 · 需要 40 积分'}</small>}
          <button className="primary" disabled={!provider.edit || !enoughCredits || !editPrompt.trim()}>模拟 AI 修图</button>
        </div>
      </form>
      {edited && <div className="generation-result"><img src={edited.url} alt="AI 修图样例" /><small>已保存到文件与产物</small></div>}
    </section>
  </div>
}

function clipTime(seconds) {
  return '00:' + String(seconds).padStart(2, '0')
}

function VideoEditTool({ data, set, chat, api, refresh, saveArtifact, report, preview }) {
  const providerId = data.videoProvider
  const provider = mediaProviders.video[providerId]
  const [start, end] = data.clipBounds
  const { videoUrl: sourceUrl, videoEditPrompt: editPrompt } = data
  const video = sourceUrl.trim() ? URL.parse(sourceUrl.trim()) : null
  const editReady = provider.edit && video?.protocol === 'https:' && !video.username && !video.password
    && video.pathname.toLowerCase().endsWith('.mp4') && editPrompt.trim()

  useEffect(() => {
    if (preview || !data.playing) return
    const interval = setInterval(() => {
      if (api.current()?.chats[chat.id] !== chat) return
      if (api.updateToolEdits(chat.id, ({ elapsed }) => ({
        elapsed: elapsed >= end || elapsed < start ? start : elapsed + 1,
      }))) refresh()
    }, 750)
    return () => clearInterval(interval)
  }, [start, end, data.playing, preview, api, chat, refresh])

  function saveClip(event) {
    event.preventDefault()
    if (!editReady) return
    const request = { demo: true, tool: 'xai_video_edit', video_url: video.origin + video.pathname, prompt: editPrompt.trim() }
    saveArtifact({ name: 'AI 视频编辑请求样例.json', text: JSON.stringify(request, null, 2) })
    report('已保存视频编辑样例到文件与产物')
  }

  return <div className="tool-home tool-detail">
    <header className="tool-detail-header"><div><h3>剪辑工具</h3><p>本地时间轴与供应商视频编辑</p></div><span className="tool-badge">样例</span></header>
    <div className="clip-preview" style={{ '--clip-position': data.elapsed / 15 }} aria-label="演示画面">
      <Icon name="movie" size={27} /><output>{clipTime(data.elapsed)} / 00:15</output>
    </div>
    <label className="range-label">进度<input type="range" min="0" max="15" value={data.elapsed}
      onChange={event => set('elapsed', Number(event.target.value))} /></label>
    <div className="clip-bounds">
      <label>起点<input type="number" min="0" max={end - 1} value={start}
        onChange={event => set('clipBounds', [Math.min(end - 1, Math.max(0, Number(event.target.value))), end])} /></label>
      <label>终点<input type="number" min={start + 1} max="15" value={end}
        onChange={event => set('clipBounds', [start, Math.max(start + 1, Math.min(15, Number(event.target.value)))])} /></label>
    </div>
    <div className="tool-action-row">
      <button className="secondary" onClick={() => set('playing', !data.playing)}>{data.playing ? '暂停' : '预览片段'}</button>
      <button className="secondary" onClick={() => {
        saveArtifact({ name: '剪辑时间轴.json', text: JSON.stringify({ demo: true, start, end }, null, 2) })
        report('已保存时间轴到文件与产物')
      }}>保存时间轴</button>
    </div>
    <section className="tool-provider-section" aria-label="AI 视频编辑">
      <h4>AI 视频编辑</h4>
      <MediaProviderSelect type="video" value={providerId} onChange={value => set('videoProvider', value)} />
      <p className="muted">{provider.edit ? 'xAI 编辑需要公开视频的 HTTPS MP4 地址。' : '当前供应商未提供视频编辑能力。'}</p>
      <form className="generation-form" onSubmit={saveClip}>
        <label className="tool-field">源视频 URL<input type="url" maxLength={2048} disabled={!provider.edit} value={sourceUrl}
          onChange={event => set('videoUrl', event.target.value)} placeholder="https://example.com/clip.mp4" /></label>
        <label>编辑描述<textarea maxLength={2000} disabled={!provider.edit} value={editPrompt}
          onChange={event => set('videoEditPrompt', event.target.value)} placeholder="描述想修改的视频内容" /></label>
        <button className="primary" disabled={!editReady}>模拟视频编辑</button>
      </form>
    </section>
  </div>
}

const toolViews = {
  浏览器: BrowserTool,
  无限画布: CanvasTool,
  文件与产物: FileTool,
  终端: TerminalTool,
  Git: GitTool,
  生图工具: GenerationTool,
  修图工具: ImageEditTool,
  剪辑工具: VideoEditTool,
}

export function ToolPanel({ active, openTool, chat, api, refresh, report, data, update, visible = false, preview = false, onAttachmentPreview }) {
  const project = api?.current()?.projects.find(item => item.id === chat?.projectId)
  const Tool = toolViews[active]

  function updateEdits(edit) {
    if (api.updateToolEdits(chat.id, edit)) refresh()
  }

  function set(field, value) {
    if (Object.hasOwn(toolEditDefaults, field)) {
      updateEdits(() => ({ [field]: value }))
    } else {
      update(previous => ({ ...previous, [field]: value }))
    }
  }

  function saveArtifact(artifact, { toolEdits } = {}) {
    const current = api.current()?.chats[chat.id]
    if (!current) return
    const retained = (current.artifacts ?? []).filter(item => item.name !== artifact.name)
    const artifacts = [{ ...artifact, type: '会话产物' }, ...retained].slice(0, 20)
    const patch = { artifacts }
    if (toolEdits) patch.toolEdits = { ...current.toolEdits, ...toolEdits }
    if (!api.changeChat(chat.id, patch)) return
    refresh()
  }

  function attach(name, alsoLibrary = false) {
    const record = api.current()
    const current = record?.chats[chat.id]
    if (!name || !current) return
    if (alsoLibrary && !record.assets.includes(name)) api.addAsset(name)
    if (!current.attachments.includes(name)) api.changeChat(chat.id, { attachments: [...current.attachments, name] })
    refresh()
    report(alsoLibrary ? '已添加到会话与素材库' : '已添加到当前会话')
  }

  return Tool ? <Tool openTool={openTool} chat={chat} project={project} api={api} refresh={refresh} report={report} data={data}
    updateEdits={updateEdits} set={set} attach={attach} saveArtifact={saveArtifact} visible={visible} preview={preview}
    onAttachmentPreview={onAttachmentPreview} /> : null
}

export function Directory({ section, selected, record, report, account, search = '', onSearchChange }) {
  const labels = { library: '素材库', profile: '个人资料', usage: '积分和用量' }
  const title = labels[section]
  const match = name => name.toLowerCase().includes(search.toLowerCase())
  const assets = selected === 'docs' ? record.assets.filter(name => /\.(md|pdf)$/.test(name)) : selected === 'recent' ? record.assets.slice(0, 2) : record.assets

  return <>
    <div className="directory-heading"><h2>{title}</h2>
      {section === 'library' && <label className="search-box"><Icon name="search" /><input aria-label={'搜索' + title} placeholder="搜索" value={search} onChange={e => onSearchChange(e.target.value)} /></label>}
    </div>
    {section === 'library' && <div className="asset-table">
      <div className="asset-head">名称<span>位置</span></div>
      {assets.filter(match).map(name => <button key={name} className="asset-row" onClick={() => report('已选择 · ' + name)}><span><Icon name="file" />{name}</span><span>本机工作区</span></button>)}
    </div>}
    {section === 'profile' && <div className="profile-card">
      <span className="avatar" style={{ '--avatar': account.color }}>{account.initial}</span><h3>{account.name}</h3><p>本机工作区 · 演示账号</p>
    </div>}
    {section === 'usage' && <>
      <div className="usage-summary"><span>可用积分</span><strong>{record.credits.toLocaleString('zh-CN')}</strong><small>托管模型和托管工具计入用量</small></div>
      <div className="detail-list">{record.usage.length ? record.usage.map(row => <div className="detail-row" key={row.id}>
        <div><strong>{row.kind}</strong><small>{new Date(row.timestamp).toLocaleString('zh-CN')}</small></div><span>−{row.amount} 积分</span>
      </div>) : <p className="muted">暂无用量记录</p>}</div>
    </>}
  </>
}
