const ownerKey = owner => owner ? JSON.stringify([owner.accountId,owner.scopeIdentity,owner.connectionId,owner.profile,owner.sessionId]) : null
const fileKey = file => JSON.stringify([file.ownerKey,file.root,file.parts,file.entry.name])
const clone = file => ({...file,entry:{...file.entry},parts:[...file.parts]})

/** File text remains in this renderer's memory, scoped to its owning account
 * and native durable session. No localStorage/IndexedDB writes are involved. */
export function createNativeFileDraftMemory(environment=globalThis.window) {
  const drafts=new Map()
  const leave=event=>{if(drafts.size){event.preventDefault();event.returnValue=''}}
  let listening=false
  function sync(){
    if(!environment)return
    if(drafts.size&&!listening){environment.addEventListener('beforeunload',leave);listening=true}
    if(!drafts.size&&listening){environment.removeEventListener('beforeunload',leave);listening=false}
  }
  return {
    get:key=>drafts.get(key),entries:key=>[...drafts.values()].filter(file=>file.ownerKey===key),
    save(file){if(file.draft===file.baseline)drafts.delete(file.id);else drafts.set(file.id,clone(file));sync()},
    remove(key){drafts.delete(key);sync()},
  }
}
const memory=createNativeFileDraftMemory()

export function createNativeFileEditor({onChange,operate,drafts=memory}) {
  let owner=null,active=null,pending=null,disposed=false
  const current=held=>!disposed && held && owner?.live===held.live && owner?.chat===held.chat && owner?.api===held.api && ownerKey(owner)===ownerKey(held)
  const emit=()=>{if(!disposed)onChange()}
  function bind(next){
    disposed=false
    if(!current(next)){pending?.abort();pending=null;active=null}
    owner=next
  }
  function saveDraft(){if(active?.mode==='edit')drafts.save(active)}
  return {
    bind,
    snapshot:()=>({active,busy:Boolean(pending),drafts:drafts.entries(ownerKey(owner))}),
    open(entry,{root,parts,preview,local}){
      if(!owner?.sessionId||pending||active?.mode==='edit'&&active.draft!==active.baseline)return false
      active={ownerKey:ownerKey(owner),root,parts:[...parts],entry:{...entry},preview,local,mode:'menu',error:''}
      active.id=fileKey(active);emit();return true
    },
    edit(){
      if(!active||active.preview?.text===undefined||active.preview.truncated)return false
      const saved=drafts.get(active.id)
      active={...active,...(saved?clone(saved):{baseline:active.preview.text,draft:active.preview.text}),mode:'edit',error:''};emit();return true
    },
    change(text){if(active?.mode==='edit'){active={...active,draft:text};saveDraft();emit()}},
    mode(mode){if(active&&!pending){active={...active,mode,error:''};emit()}},
    resume(id){const saved=drafts.get(id);if(!saved||saved.ownerKey!==ownerKey(owner)||pending)return false;active={...clone(saved),mode:'edit',error:''};emit();return true},
    dismiss(discard=false){
      if(pending)return false
      if(active?.mode==='edit'&&active.draft!==active.baseline&&!discard)return false
      if(discard&&active)drafts.remove(active.id)
      active=null;emit();return true
    },
    async execute(action,params={}){
      if(!active||pending||disposed)return false
      const file=active,held=owner,controller=new AbortController();pending=controller
      active={...active,error:''};emit()
      try{
        const result=await operate(held,file,action,params,controller.signal)
        if(!current(held)||controller.signal.aborted||pending!==controller)return false
        if(result?.ok===false||result?.error)throw new Error(result.error||'文件操作未确认成功。')
        if(action==='write'){
          if(active?.id===file.id){active={...active,baseline:params.content};saveDraft();if(active.draft===params.content)active=null}
        }else active=null
        return result
      }catch(error){if(current(held)&&!controller.signal.aborted&&pending===controller)active={...active,error:error.message};return false}
      finally{if(pending===controller){pending=null;emit()}}
    },
    dispose(){saveDraft();disposed=true;pending?.abort();pending=null;active=null},
  }
}
