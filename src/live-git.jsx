import React, { useEffect, useRef, useState } from 'react'
import { Icon, IconButton } from './icons.jsx'
import { createOwnedToolOperation } from './owned-tool-operation.mjs'
import { useLiveQuery } from './live-query.jsx'
import { GitActions } from './native-git-actions.jsx'
import { useReadingPosition } from './surfaces.jsx'

export const liveGitTool = 'Git'
const scopes = { all: '全部', worktree: '未暂存', staged: '已暂存' }
const patchKinds = { staged: '已暂存', worktree: '未暂存', untracked: '未跟踪', conflicted: '冲突' }
const defaultState = { scope: 'all' }
const readActions = new Set(['branches','baseBranches','shipInfo','commitContext'])

function labels(file) {
  if (file.conflicted) return '冲突'
  if (file.untracked) return '未跟踪'
  return [file.staged && '已暂存', file.unstaged && '未暂存'].filter(Boolean).join(' · ')
}

export function useLiveGit({ live, chat, project, visible, api, refresh }) {
  const [revision, setRevision] = useState(0)
  const priorRun = useRef(null)
  const [,refreshMutation]=useState(0)
  const operations=useRef(null)
  if(!operations.current)operations.current=createOwnedToolOperation(()=>refreshMutation(value=>value+1))
  const session = visible ? chat?.gatewayStoredId : null
  const running = Boolean(chat?.pending)
  const saved = chat?.toolEdits?.liveGit ?? defaultState
  const operationOwner={live,key:JSON.stringify([api.accountId,chat?.id,chat?.gatewayStoredId,chat?.gatewayProfile,saved.root??project?.folder,saved.worktree])}
  operations.current.bind(operationOwner)
  const mutation=operations.current.snapshot()
  useEffect(()=>{operations.current.bind(operationOwner);return()=>operations.current.bind(null)},[])
  const version = JSON.stringify([project?.id, project?.folder, project?.folders, revision])
  const status = useLiveQuery(live, 'git', session && [{ action: 'status', session_id: session, root: saved.root,worktree:saved.worktree }], version)
  const result = status?.data
  const repo = result?.repository
  const files = (repo?.files ?? []).filter(file => saved.scope === 'all' ||
    (saved.scope === 'staged' ? file.staged : file.unstaged || file.conflicted))
  const selected = files.find(file => file.path === saved.selected) ?? files[0]
  const diff = useLiveQuery(live, 'git', session && selected && [{
    action: 'diff', session_id: session, root: result.root, path: selected.path, scope: saved.scope,worktree:saved.worktree,
  }], version)

  useEffect(() => {
    if (session && priorRun.current?.session === session && priorRun.current.running && !running) {
      setRevision(value => value + 1)
    }
    priorRun.current = { session, running }
  }, [session, running])

  function update(patch) {
    api.updateToolEdits(chat.id, edits => ({ liveGit: { ...(edits.liveGit ?? defaultState), ...patch } }))
    refresh()
  }

  async function mutate(action,params={}) {
    const sessionId=chat?.gatewayStoredId
    if(!sessionId||!live?.native)throw new Error('Git 工作区尚未就绪。')
    return operations.current.run(()=>live.git({action,session_id:sessionId,root:result?.root,worktree:saved.worktree,...params}),()=>{if(!readActions.has(action))setRevision(value=>value+1)})
  }
  return { status, result, repo, files, selected, diff, saved, update, mutation,mutate,canWrite:Boolean(live?.native), reload: () => setRevision(value => value + 1) }
}

function Patch({ patch }) {
  const lines = patch.text.split('\n')
  return <>
    <h4>{patchKinds[patch.kind]}</h4>
    <pre className="git-patch">{lines.slice(0, 2000).map((line, index) =>
      <span key={index} className={line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : ''}>{line + '\n'}</span>)}</pre>
    {(patch.truncated || lines.length > 2000) && <p className="muted">差异较长，预览已截断。</p>}
  </>
}

export function LiveGit({ state, chat, api, visible = false, thumbnail = false }) {
  const content = useRef(null)
  const { status, result, repo, files, selected, diff, saved, update, reload } = state
  const directory = result?.roots.find(root => root.id === result.root)?.label
  const relative = repo?.path !== '.' ? repo?.path : ''
  const path = [directory, relative].filter(Boolean).join(' / ')
  useReadingPosition({ chat, api, contentRef: content, visible,
    scope: selected && JSON.stringify(['live-git', result.root, relative, selected.path, saved.scope]) })
  return <div className="tool-home tool-detail" ref={content}>
    <header className="tool-detail-header">
      <div><h3>Git</h3><p>{[path, repo?.branch === '(detached)' ? '分离 HEAD' : repo?.branch].filter(Boolean).join(' · ') || '当前会话的工作目录'}</p></div>
      {!thumbnail && <IconButton icon="refresh" label="刷新 Git 变更" onClick={reload} />}
    </header>
    {!thumbnail && result?.roots.length > 1 && <label className="tool-field">Git 项目目录
      <select aria-label="Git 项目目录" value={result.root} onChange={event => update({ root: event.target.value, selected: null })}>
        {result.roots.map(root => <option key={root.id} value={root.id}>{root.label}</option>)}
      </select>
    </label>}
    {!status ? <p role="status">正在读取 Git 变更…</p> : status.error ? <div>
      <p role="alert" className="management-error">{status.error}</p>
      {!thumbnail && (saved.root||saved.worktree) && <button type="button" className="tool-text-button"
        onClick={() => update({ root: undefined,worktree:undefined, selected: null })}>返回会话工作目录</button>}
    </div> : repo ? <>
      {!thumbnail && state.canWrite && <GitActions state={state} />}
      {!thumbnail && repo.worktrees?.length>1 && <label className="tool-field">工作树<select aria-label="Git 工作树" value={saved.worktree??repo.absolutePath} onChange={event=>update({worktree:event.target.value,selected:null})}>
        {repo.worktrees.map(tree=><option key={tree.path} value={tree.path}>{tree.branch||'分离 HEAD'} · {tree.path}</option>)}
      </select></label>}
      {!thumbnail && <div className="tool-segments" aria-label="Git 变更范围">
        {Object.entries(scopes).map(([scope, label]) => <button key={scope} type="button" aria-pressed={saved.scope === scope}
          onClick={() => update({ scope })}>{label}</button>)}
      </div>}
      <ul className="tool-file-list">{files.map(file => <li key={file.path}><button type="button"
        aria-pressed={selected === file} onClick={() => update({ selected: file.path })}>
        <Icon name="file" size={16} /><span title={file.path}>{file.path}</span><small>{labels(file)}</small>
      </button></li>)}</ul>
      {repo.truncated && <p className="muted">变更较多，仅显示部分文件。</p>}
      {selected ? <section className="tool-file-preview" aria-label="Git 差异">
        <div className="tool-title"><strong>{selected.path}</strong><span className="tool-badge">{labels(selected)}</span></div>
        {!diff ? <p role="status">正在读取差异…</p> : diff.error ? <p role="alert" className="management-error">{diff.error}</p>
          : diff.data.patches.length ? diff.data.patches.map(patch => <Patch key={patch.kind} patch={patch} />)
            : <p className="muted">此范围暂无可显示的差异。</p>}
      </section> : <p className="muted">此范围暂无变更。</p>}
    </> : <div className="tool-empty"><Icon name="git" size={30} /><h3>这个目录没有 Git 工作树</h3></div>}
  </div>
}
