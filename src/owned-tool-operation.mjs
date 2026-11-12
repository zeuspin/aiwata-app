const idle = () => ({ busy:false, error:'', notice:'' })
/** UI lock ownership is independent of backend operation lifetime. */
export function createOwnedToolOperation(onChange) {
  let owner=null,token=null,state=idle()
  const same=(left,right)=>left?.live===right?.live && left?.key===right?.key
  return {
    bind(next) { if(!same(owner,next)){owner=next;token=null;state=idle()} },
    snapshot:()=>state,
    async run(task,onSuccess) {
      if(!owner || token)throw new Error('Git 工作区尚未就绪。')
      const current={owner};token=current;state={busy:true,error:'',notice:''};onChange()
      try {
        const result=await task()
        if(token!==current || owner!==current.owner)return
        if(result?.ok===false || result?.error)throw new Error(result.error||result.message||'Git 操作未完成。')
        token=null;state={busy:false,error:'',notice:'Git 操作已完成。'};onChange();onSuccess?.()
        return result
      }catch(error){
        if(token!==current || owner!==current.owner)return
        token=null;state={busy:false,error:error.message,notice:''};onChange();throw error
      }
    },
  }
}
