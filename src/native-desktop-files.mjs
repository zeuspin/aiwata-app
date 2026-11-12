import { createNativeArtifactReader, resolvedArtifactPath } from './native-artifacts.mjs'
const encode = encodeURIComponent
const filename = path => path.split('/').at(-1)
const join = (root, parts = []) => root.replace(/\/$/, '') + (parts.length ? '/' + parts.join('/') : '')
export function nativeFiles({ rpc, api,host,route,check=()=>{} }) {
  async function scope(session, root, parts = [], admittedSnapshot) {
    if (!Array.isArray(parts) || parts.some(v => typeof v !== 'string' || !v || /[/\\]/.test(v) || ['.', '..'].includes(v))) throw new Error('文件路径无效。')
    const snapshot = admittedSnapshot ?? await rpc('session.resume', { session_id:session, omit_messages:true })
    const cwd = snapshot.info?.cwd
    if (!cwd) throw new Error('此会话没有工作目录。')
    const { projects = [] } = await rpc('projects.list')
    const project = projects.find(p => (p.folders ?? []).some(f => cwd === f.path || cwd.startsWith(f.path + '/')))
    const paths = [...new Set(project ? [project.primary_path, ...project.folders.map(f=>f.path)] : [cwd])].filter(Boolean)
    const roots = paths.map(path => ({ id:path, label:path }))
    const selected = root ?? roots[0].id
    if (!paths.includes(selected)) throw new Error('会话工作目录已变化，请重新选择。')
    return { roots, root:selected, path:join(selected, parts) }
  }
  return {
    readArtifact: createNativeArtifactReader({ rpc, api, host, route, check }),
    async files(action, session, root, parts, signal) {
      signal?.throwIfAborted()
      const location = await scope(session, root, parts)
      const query = `path=${encode(location.path)}&session_id=${encode(session)}`
      if (action === 'list') {
        const listing = await api('/api/fs/list?' + query)
        if (listing.error) throw new Error(listing.error)
        const descriptor=host?.getConnectionFor ? await host.getConnectionFor(route) : null
        return { native:Boolean(host),localFiles:descriptor?.mode==='local',roots:location.roots, root:location.root, entries:(listing.entries ?? []).map(row=>({ name:row.name, directory:row.isDirectory, size:Number.isFinite(row.byteSize)&&row.byteSize>=0?row.byteSize:undefined })) }
      }
      const info = await api('/api/fs/read-text?' + query)
      if (info.error) throw new Error(info.error)
      const result = { name:filename(location.path), size:info.byteSize, mime:info.mimeType, text:info.binary ? undefined : info.text, truncated:info.truncated }
      if (action === 'read' || info.mimeType?.startsWith('image/') || info.byteSize<=16777216 && (info.mimeType==='application/pdf'||/^(audio|video)\//.test(info.mimeType))) {
        const file = await api('/api/fs/read-data-url?' + query)
        if (file.error) throw new Error(file.error)
        if (action === 'read') result.data_base64 = file.dataUrl.split(',')[1]
        else if(info.mimeType?.startsWith('image/'))result.image=file.dataUrl
        else result.media=file.dataUrl
      }
      signal?.throwIfAborted(); return result
    },
    async manageFile(action,session,root,parts,params={},signal) {
      check();signal?.throwIfAborted()
      const location=await scope(session,root,parts)
      const descriptor=await host.getConnectionFor(route)
      check();signal?.throwIfAborted()
      const local=descriptor.mode==='local'
      if(['rename','trash','reveal'].includes(action)&&!local)throw new Error('此操作只适用于本机文件；远端文件可编辑或下载。')
      const actions={
        rename:()=>{if(!params.name||params.name==='.'||params.name==='..'||/[/\\]/.test(params.name))throw new Error('文件名称无效。');return host.renamePath(location.path,params.name)},
        trash:()=>host.trashPath(location.path),
        reveal:async()=>{if(await host.revealPath(location.path)===false)throw new Error('此文件已不在本机。')},
        copyAbsolute:()=>host.writeClipboard(location.path),copyRelative:()=>host.writeClipboard(parts.join('/')),
        async write(){
          const fresh=await api('/api/fs/read-text?path='+encode(location.path)+'&session_id='+encode(session))
          check();signal?.throwIfAborted()
          if(fresh.error||fresh.binary||typeof fresh.text!=='string')throw new Error(fresh.error||'此文件不能作为文本编辑。')
          if(fresh.truncated)throw new Error('磁盘文件过大，重新读取已截断；不能安全覆盖，请使用外部编辑器。')
          if(fresh.text!==params.expectedText)throw new Error('磁盘文件已有变化，请重新载入后再编辑。')
          if(local)return host.writeTextFile(location.path,params.content)
          return api('/api/fs/write-text',{method:'POST',body:{path:location.path,content:params.content,session_id:session}})
        },
      }
      if(!actions[action])throw new Error('不支持的文件操作。')
      const result=await actions[action]();check();signal?.throwIfAborted();return result
    },
    async locateFile(session, target, signal) {
      check(); signal?.throwIfAborted()
      const snapshot = await rpc('session.resume', { session_id: session, omit_messages: true })
      check(); signal?.throwIfAborted()
      const path = resolvedArtifactPath(target, snapshot.info?.cwd)
      if (!snapshot.info?.cwd) return { artifact: { target: path, name: filename(path) } }
      const location = await scope(session, undefined, [], snapshot)
      const root = location.roots.find(row => path.startsWith(row.id + '/'))
      check(); signal?.throwIfAborted()
      if (!root) return { artifact: { target: path, name: filename(path) } }
      return { root:root.id, parts:path.slice(root.id.length+1).split('/') }
    },
    async git({ action, session_id, root, path, scope:diffScope, worktree, message, push=false, branch, options={}, worktreePath }) {
      const location = await scope(session_id, root)
      const repo = await api('/api/fs/git-root?path=' + encode(location.path))
      let repoPath = repo.root ?? repo.path
      if (!repoPath) return { ...location, repository:null }
      const origin=repoPath
      const trees=(await api('/api/git/worktrees?path='+encode(origin))).worktrees ?? []
      if(worktree){
        if(!trees.some(tree=>tree.path===worktree))throw new Error('所选工作树已不属于当前仓库。')
        repoPath=worktree
      }
      const filePath=()=>{
        if(!path)return null
        const parts=path.split('/')
        if(path.startsWith('/')||parts.some(p=>!p||p==='.'||p==='..'||p.includes('\\')))throw new Error('Git 文件路径无效。')
        return join(repoPath,parts)
      }
      const post=(endpoint,body)=>api('/api/git/'+endpoint,{method:'POST',body:{path:repoPath,...body}})
      const writes={
        stage:()=>post('review/stage',{file:filePath()}),unstage:()=>post('review/unstage',{file:filePath()}),
        revert:()=>post('review/revert',{file:filePath()}),
        commit:()=>{if(!message?.trim())throw new Error('请输入提交说明。');return post('review/commit',{message,push})},
        push:()=>post('review/push',{}),createPr:()=>post('review/create-pr',{}),
        branchSwitch:()=>{if(!branch?.trim())throw new Error('请选择分支。');return post('branch/switch',{branch})},
        worktreeAdd:()=>post('worktree/add',Object.fromEntries(['name','branch','base','existingBranch'].filter(k=>options[k]).map(k=>[k,options[k]]))),
        worktreeRemove:()=>{if(!trees.some(tree=>tree.path===worktreePath&&!tree.isMain))throw new Error('不能移除此工作树。');return post('worktree/remove',{worktreePath,force:options.force===true})},
      }
      if(writes[action])return writes[action]()
      if(action==='branches')return api('/api/git/branches?path='+encode(repoPath))
      if(action==='baseBranches')return api('/api/git/base-branches?path='+encode(repoPath))
      if(action==='shipInfo')return api('/api/git/review/ship-info?path='+encode(repoPath))
      if(action==='commitContext')return api('/api/git/review/commit-context?path='+encode(repoPath))
      const repository = await api('/api/git/status?path=' + encode(repoPath))
      if (action === 'diff') {
        const file=(repository.files??[]).find(row=>row.path===path)
        if (!file) throw new Error('此文件已不在当前变更列表中。')
        const patches=[]
        async function patch(staged,kind) {
          const result=await api(`/api/git/review/diff?path=${encode(repoPath)}&file=${encode(join(repoPath,path.split('/')))}&scope=uncommitted&staged=${staged}`)
          patches.push({kind,text:result.diff.slice(0,250000),truncated:result.diff.length>250000})
        }
        if(diffScope!=='worktree'&&file.staged)await patch(true,'staged')
        if(diffScope!=='staged'&&(file.unstaged||file.untracked||file.conflicted))await patch(false,file.untracked?'untracked':file.conflicted?'conflicted':'worktree')
        return {patches}
      }
      return { root:location.root, roots:location.roots, repository:{ ...repository, path:repoPath===location.root?'.':repoPath, absolutePath:repoPath,worktrees:trees } }
    },
  }
}
