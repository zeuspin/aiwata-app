import React,{useState} from 'react'
import {Confirm,Dialog,Field} from './management-ui.jsx'
const labels={stage:'暂存',unstage:'取消暂存',revert:'丢弃更改',commit:'提交',push:'推送',createPr:'创建 Pull Request',worktreeAdd:'新建工作树',worktreeRemove:'移除工作树',branchSwitch:'切换分支'}
export function GitActions({state}) {
  const {repo,selected,mutate,mutation}=state
  const [dialog,setDialog]=useState(null),[branches,setBranches]=useState([]),[error,setError]=useState('')
  const close=()=>{setDialog(null);setError('')}
  async function execute(action,params={}){try{const result=await mutate(action,params);close();return result}catch(error){setError(error.message);return error.message}}
  async function chooseBranch(){setError('');try{const result=await mutate('branches');if(result){setBranches(result.branches??[]);setDialog({action:'branchSwitch'})}}catch(error){setError(error.message)}}
  const confirm=(action,params={},message)=>{setError('');setDialog({action,params,message})}
  return <div className="native-git-actions">
    <div className="management-tags" aria-label="Git 操作">
      <button type="button" className="secondary" disabled={mutation.busy||!selected||!selected.unstaged&&!selected.untracked&&!selected.conflicted} onClick={()=>void execute('stage',{path:selected.path})}>暂存所选</button>
      <button type="button" className="secondary" disabled={mutation.busy||!selected?.staged} onClick={()=>void execute('unstage',{path:selected.path})}>取消暂存</button>
      <button type="button" className="secondary" disabled={mutation.busy||!selected} onClick={()=>confirm('revert',{path:selected.path},`丢弃 ${selected.path} 的未提交更改？此操作不可撤销。`)}>丢弃所选更改…</button>
      <button type="button" className="secondary" disabled={mutation.busy} onClick={()=>confirm('stage',{},'暂存当前工作树的全部更改？')}>全部暂存…</button>
      <button type="button" className="secondary" disabled={mutation.busy||!repo.files?.some(file=>file.staged)} onClick={()=>confirm('commit')}>提交…</button>
      <button type="button" className="secondary" disabled={mutation.busy} onClick={()=>confirm('push',{},'将当前分支推送到配置的远端？')}>推送…</button>
      <button type="button" className="secondary" disabled={mutation.busy} onClick={()=>confirm('createPr',{},'使用原生 GitHub 工作流为当前分支创建 Pull Request？')}>创建 PR…</button>
      <button type="button" className="secondary" disabled={mutation.busy} onClick={()=>void chooseBranch()}>切换分支…</button>
      <button type="button" className="secondary" disabled={mutation.busy} onClick={()=>confirm('worktreeAdd')}>新建工作树…</button>
      {repo.worktrees?.some(tree=>tree.path===repo.absolutePath&&!tree.isMain)&&<button type="button" className="secondary" disabled={mutation.busy} onClick={()=>confirm('worktreeRemove',{worktreePath:repo.absolutePath},`移除工作树 ${repo.absolutePath}？原生 Git 会拒绝未清理的更改。`)}>移除工作树…</button>}
    </div>
    {(mutation.error||error)&&<p role="alert" className="management-error">{error||mutation.error}</p>}
    {mutation.busy&&<p role="status">正在执行 Git 操作…</p>}
    {mutation.notice&&!mutation.busy&&<p role="status" className="muted">{mutation.notice}</p>}
    {dialog?.message&&<Confirm title={labels[dialog.action]+'？'} submit={labels[dialog.action]} onClose={close} onConfirm={()=>execute(dialog.action,dialog.params)}>{dialog.message}</Confirm>}
    {dialog&&!dialog.message&&<Dialog title={labels[dialog.action]} onClose={close} submit={labels[dialog.action]} onSubmit={form=>{
      if(dialog.action==='commit')return execute('commit',{message:String(form.get('message')??''),push:false})
      if(dialog.action==='branchSwitch')return execute('branchSwitch',{branch:String(form.get('branch')??'')})
      return execute('worktreeAdd',{options:Object.fromEntries(['name','branch','base','existingBranch'].map(name=>[name,String(form.get(name)??'').trim()]))})
    }}>
      <p className="muted">{repo.absolutePath}</p>
      {dialog.action==='commit'?<Field name="message" label="提交说明" required autoFocus />:dialog.action==='branchSwitch'?<label>分支<select name="branch" aria-label="切换到分支" required>{branches.map(branch=><option key={branch.name} value={branch.name} disabled={branch.checkedOut}>{branch.name}{branch.checkedOut?'（已检出）':''}</option>)}</select></label>:<>
        <Field name="name" label="工作树名称" autoFocus /><Field name="branch" label="新分支（可选）" /><Field name="base" label="基准引用（可选）" /><Field name="existingBranch" label="使用已有分支（可选，与新分支二选一）" />
      </>}
      {error&&<p role="alert" className="management-error">{error}</p>}
    </Dialog>}
  </div>
}
