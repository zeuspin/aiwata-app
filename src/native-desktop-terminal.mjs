import { droppedTerminalPaths } from './terminal-interactions.mjs'
const base64 = text => {
  const bytes=new TextEncoder().encode(text)
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte)
  return btoa(binary)
}
export function nativeTerminal({ rpc, host, route, stops, check, storage = globalThis.localStorage }) {
  const terminals=new Map(), viewers=new Map()
  const keyFor=(session,instance='terminal')=>JSON.stringify([route.connectionId,route.profile,session,instance])
  const historyKey=(session,instance)=>'aiwata-app.native-terminal-history.v1:'+keyFor(session,instance)
  function history(session,instance) {
    try {const value=JSON.parse(storage?.getItem(historyKey(session,instance))??'null');return value&&typeof value.text==='string'?value:null}catch{return null}
  }
  function persist(session,instance,value) { storage?.setItem(historyKey(session,instance),JSON.stringify(value)) }
  function acquire(session,cols,rows,instance) {
    const key=keyFor(session,instance)
    if(terminals.has(key))return terminals.get(key)
    const creating=(async()=>{
      const snapshot=await rpc('session.resume',{session_id:session,omit_messages:true})
      check()
      const saved=history(session,instance)
      const shell=await host.terminal.start({cwd:saved?.cwd || snapshot.info?.cwd,cols,rows,profile:route.profile,
        connectionId:route.connectionId,restoreKey:'aiwata-app:'+key})
      if(shell.unavailable)throw new Error('原 AIWATA 宿主当前无法打开此连接的终端。')
      try { check() } catch(error) { await host.terminal.dispose(shell.id); throw error }
      const entry={...shell,output:saved?.text?saved.text+'\r\n':'',viewers:new Set(),historyRevision:0,restored:Boolean(saved?.text)}
      const dispose=()=>{entry.offData?.();entry.offExit?.();stops.delete(dispose)}
      entry.offData=host.terminal.onData(shell.id,text=>{
        // Bounded renderer scrollback. Hidden panels keep consuming this same
        // native PTY; re-mounts replay presentation bytes, never restart a shell.
        entry.output=(entry.output+text).slice(-1048576)
        for(const viewer of entry.viewers)viewer.emit({type:'output',data:base64(text)})
      })
      entry.offExit=host.terminal.onExit(shell.id,value=>{
        terminals.delete(key)
        for(const viewer of [...entry.viewers]) {viewer.emit({type:'exit',...value});viewer.stop()}
        dispose()
      })
      entry.dispose=dispose;stops.add(dispose)
      return entry
    })().catch(error=>{terminals.delete(key);throw error})
    terminals.set(key,creating);return creating
  }
  return {
    async terminalOpen(session,cols,rows,signal,instance='terminal') {
      check();signal?.throwIfAborted()
      const entry=await acquire(session,cols,rows,instance)
      check();signal?.throwIfAborted()
      const id=crypto.randomUUID(),encoder=new TextEncoder()
      let output,closed=false,viewer
      const stop=()=>{if(closed)return;closed=true;entry.viewers.delete(viewer);viewers.delete(id);signal?.removeEventListener('abort',stop);stops.delete(stop);try{output?.close()}catch{}}
      const emit=frame=>{if(!closed)output.enqueue(encoder.encode(JSON.stringify(frame)+'\n'))}
      const stream=new ReadableStream({start(controller){
        output=controller;viewer={id:entry.id,session,instance,emit,stop};entry.viewers.add(viewer);viewers.set(id,viewer);stops.add(stop)
        emit({type:'open',viewer_id:id,terminal_id:entry.id,cwd:entry.cwd,shell:entry.shell,restored:entry.restored,persistent:entry.persistent===true,ready:true})
        if(entry.output)emit({type:'output',data:base64(entry.output)})
        void host.terminal.attach(entry.id).then(ok=>{
          if(ok)emit({type:'replay-end'});else{emit({type:'error',message:'终端已经关闭。'});stop()}
        }).catch(error=>{emit({type:'error',message:error.message});stop()})
        signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop()
      },cancel:stop})
      return new Response(stream)
    },
    async terminalControl({action,session_id,viewer_id,instance_id,cols,rows,data},signal) {
      check();signal?.throwIfAborted()
      if(action==='close'&&!viewer_id) {
        const key=keyFor(session_id,instance_id),entry=await terminals.get(key)
        if(entry) {
          const ok=await host.terminal.dispose(entry.id)
          if(!ok)throw new Error('原生终端未确认关闭。')
          terminals.delete(key);for(const viewer of [...entry.viewers])viewer.stop();entry.dispose()
        }
        return {ok:true}
      }
      const viewer=viewers.get(viewer_id)
      if(!viewer||viewer.session!==session_id || instance_id && viewer.instance!==instance_id)throw new Error('终端归属已变化，请重新打开。')
      if(action==='write') {
        if(await host.terminal.write(viewer.id,data)===false)throw new Error('原生终端已关闭。')
      } else if(action==='resize') {
        if(await host.terminal.resize(viewer.id,{cols,rows})===false)throw new Error('原生终端已关闭。')
      } else if(action==='clear') {
        const entry=await terminals.get(keyFor(session_id,viewer.instance))
        if(entry){entry.historyRevision++;entry.output='';persist(session_id,viewer.instance,{text:'',cwd:entry.cwd})}
      } else if(action==='detach')viewer.stop()
      else if(action==='close') {
        if(await host.terminal.dispose(viewer.id)===false)throw new Error('原生终端未确认关闭。')
        viewer.stop()
      } else throw new Error('不支持的原生终端操作。')
      return {ok:true}
    },
    async terminalSaveSnapshot(session,instance,value) {
      check();const entry=await terminals.get(keyFor(session,instance));check();if(!entry)return false
      const version=entry.historyRevision
      const cwd=await host.terminal.cwd?.(entry.id);check()
      if(version!==entry.historyRevision)return false
      if(cwd)entry.cwd=cwd
      // Same bounded presentation contract as the original renderer. This is
      // plain buffer text, never PTY input or a promise to resume shell processes.
      persist(session,instance,{text:String(value.text??'').split('\n').slice(-200).join('\n').slice(-65536),cwd:entry.cwd})
      return true
    },
    async terminalFontFaces() {
      const faces=await Promise.all([import('@/fonts/JetBrainsMono-Regular.woff2?url'),import('@/fonts/JetBrainsMono-Bold.woff2?url'),import('@/fonts/JetBrainsMono-Italic.woff2?url')])
      check();return faces.map((face,index)=>({url:face.default,weight:index===1?'700':'400',style:index===2?'italic':'normal'}))
    },
    async terminalFont(value) {
      check()
      const request={connectionId:route.connectionId,profile:route.profile,path:'/api/config'}
      if(value===undefined){const config=await host.api(request);check();return typeof config.terminal?.font_family==='string'?config.terminal.font_family:''}
      const result=await host.api({...request,method:'PUT',body:{config:{terminal:{font_family:String(value).trim()}}}});check()
      if(!result?.ok)throw new Error('终端字体未确认保存。')
      return String(value).trim()
    },
    async terminalClipboard(action,text) {
      check();const result=action==='read'?await host.readClipboard():await host.writeClipboard(String(text??''));check()
      if(result===false)throw new Error('系统剪贴板操作失败。')
      return result
    },
    terminalPaths:transfer=>{check();return droppedTerminalPaths(transfer,host.getPathForFile)},
    async terminalOpenExternal(uri) {
      check();const url=new URL(uri);if(!['http:','https:'].includes(url.protocol))return false
      return host.openExternal(url.href)
    },
  }
}
