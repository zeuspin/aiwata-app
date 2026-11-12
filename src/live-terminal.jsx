import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './live-terminal.css'
import { makeTerminalReader } from './terminal-reader.mjs'
import { activateTerminalLink, createTerminalCommands, quoteTerminalPaths, resolveTerminalFontFamily, terminalClipboardIntent } from './terminal-interactions.mjs'

export default function LiveTerminal({ live, sessionId, instanceId, visible, onPreview, onOpenLink, readingPositions, onReader }) {
  const readingKey = JSON.stringify([sessionId, instanceId])
  const host = useRef(null), terminalRef = useRef(null), actions = useRef(null), fitRef = useRef(null)
  const preview = useRef(onPreview), link = useRef(onOpenLink), readerCallback = useRef(onReader), lifetime = useRef(null)
  preview.current = onPreview; link.current = onOpenLink; readerCallback.current = onReader
  const [attempt, reconnect] = useState(0)
  const [cwd, setCwd] = useState(''), [status, setStatus] = useState('正在连接终端…')
  const [problem, setProblem] = useState(''), [disconnected, setDisconnected] = useState(false)
  const [menu, setMenu] = useState(null), [fonts, setFonts] = useState(false)
  const [font, setFont] = useState(''), [fontDraft, setFontDraft] = useState(''), [recovered, setRecovered] = useState(false)

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController(), { signal } = controller
    lifetime.current=controller
    const isMac = /mac/i.test(navigator.platform)
    const activate = (event, uri) => {
      void activateTerminalLink(event, uri, { isMac, onPreview: link.current,
        openExternal: live.terminalOpenExternal }).then(opened => {
        if(!opened && !signal.aborted && event.isTrusted && (isMac?event.metaKey:event.ctrlKey))setProblem('此链接无法打开；网页预览未接入时，可按 Shift 加系统修饰键在浏览器中打开 HTTP(S) 链接。')
      }).catch(error=>{if(!signal.aborted)setProblem(error.message)})
    }
    const terminal = new Terminal({
      disableStdin: true, cursorBlink: true, fontSize: 13, scrollback: 1500,
      fontFamily: resolveTerminalFontFamily(''), linkHandler: { activate },
      theme: { background: '#232724', foreground: '#e9eee8', cursor: '#d4e1cd', selectionBackground: '#526451' },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit); terminal.open(host.current); terminalRef.current=terminal;fitRef.current=()=>fit.fit()
    readerCallback.current?.(makeTerminalReader(terminal));fit.fit()
    setStatus('正在连接终端…');setProblem('');setDisconnected(false);setMenu(null);setRecovered(false)
    let unmounted=false, viewer, terminalId, shell='', restored=false, ready=false, closedByShell=false, interacted=false
    let writes=Promise.resolve(), resizeFrame, snapshotTimer, lastSnapshot=0, replaying=true

    function stop(error) {
      if(signal.aborted)return
      controller.abort();terminal.options.disableStdin=true;setProblem(error||'')
      setStatus(closedByShell?'终端已结束':'终端已断开');setDisconnected(true)
    }
    function control(action,data) {
      if(!viewer||!ready||signal.aborted)return
      writes=writes.then(async()=>{if(!signal.aborted)await live.terminalControl({action,session_id:sessionId,...(instanceId?{instance_id:instanceId}:{}),viewer_id:viewer,...data},signal)}).catch(error=>stop(error.message))
    }
    function connected() {ready=true;replaying=false;terminal.options.disableStdin=false;setStatus('');control('resize',{cols:terminal.cols,rows:terminal.rows})}
    function snapshotText(count) {
      const buffer=terminal.buffer.active,end=buffer.baseY+buffer.cursorY+1,lines=[]
      for(let row=Math.max(0,end-count);row<end;row++)lines.push(buffer.getLine(row)?.translateToString(true)??'')
      return lines.join('\n')
    }
    function saveSnapshot() {
      if(signal.aborted||!interacted||!live.terminalSaveSnapshot)return
      lastSnapshot=Date.now();snapshotTimer=undefined
      void live.terminalSaveSnapshot(sessionId,instanceId||'terminal',{text:snapshotText(200)}).catch(error=>{if(!signal.aborted)setProblem(error.message)})
    }
    function capturePreview() {
      if(signal.aborted)return
      preview.current?.(snapshotText(5))
      if(interacted&&!snapshotTimer){const wait=750-(Date.now()-lastSnapshot);if(wait<=0)saveSnapshot();else snapshotTimer=setTimeout(saveSnapshot,wait)}
    }
    const commands=createTerminalCommands({terminal,isCurrent:()=>!unmounted,canPaste:()=>ready&&!signal.aborted,
      clipboard:(action,text)=>live.terminalClipboard?live.terminalClipboard(action,text):action==='read'?navigator.clipboard.readText():navigator.clipboard.writeText(text),
      onClear:()=>control('clear')})
    async function clipboard(action) {
      try {await commands[action]()}catch(error){if(!unmounted)setProblem(error.message)}
    }
    actions.current={copy:()=>clipboard('copy'),paste:()=>clipboard('paste'),selectAll:commands.selectAll,clear:commands.clear,focus:()=>terminal.focus()}
    terminal.attachCustomKeyEventHandler(event=>{
      const intent=terminalClipboardIntent(event,{isMac,hasSelection:terminal.hasSelection()})
      if(!intent)return true
      event.preventDefault();void clipboard(intent);return false
    })
    const selection=terminal.onSelectionChange(()=>{
      const field=host.current?.querySelector('.xterm-helper-textarea'),text=terminal.getSelection()
      if(!field)return
      field.value=text
      const selected=window.getSelection(),foreign=selected&&!selected.isCollapsed&&selected.anchorNode&&!host.current.contains(selected.anchorNode)
      if(text&&host.current.contains(document.activeElement)&&!foreign)field.select()
    })
    const links=terminal.registerLinkProvider({provideLinks(y,callback){
      const text=terminal.buffer.active.getLine(y-1)?.translateToString(true)??''
      const found=[...text.matchAll(/https?:\/\/[^\s<>"'`]+/g)].map(match=>{const uri=match[0].replace(/[),.;!?]+$/,'');return{text:uri,range:{start:{x:match.index+1,y},end:{x:match.index+uri.length,y}},activate}})
      callback(found)
    }})
    function receive(frame) {
      if(frame.type==='open'){viewer=frame.viewer_id;terminalId=frame.terminal_id;shell=frame.shell||'';setCwd(frame.cwd||'');setRecovered(frame.restored===true);if(frame.ready&&!live.native)connected()}
      else if(frame.type==='ready'&&!live.native)connected()
      else if(frame.type==='output')terminal.write(Uint8Array.fromBase64(frame.data),capturePreview)
      else if(frame.type==='replay-end')terminal.write('',()=>{
        if(signal.aborted)return
        const position=readingPositions?.get(readingKey)
        if(position?.terminalId===terminalId&&position.line!==null)terminal.scrollToLine(position.line)
        restored=true;replaying=false;if(!ready)connected()
      })
      else if(frame.type==='error')stop(frame.message)
      else if(frame.type==='exit'){closedByShell=true;stop()}
    }
    async function connect() {
      try {
        const response=await live.terminalOpen(sessionId,terminal.cols,terminal.rows,signal,instanceId)
        const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();let pending=''
        for(;;){const {value,done}=await reader.read();if(done||signal.aborted)break;const frames=(pending+value).split('\n');pending=frames.pop();for(const frame of frames)if(frame&&!signal.aborted)receive(JSON.parse(frame))}
        stop()
      }catch(error){stop(error.message)}
    }
    const drop=event=>{
      if(!ready||signal.aborted||!live.terminalPaths)return
      const paths=live.terminalPaths(event.dataTransfer)
      if(!paths.length)return
      event.preventDefault();event.stopPropagation()
      const result=quoteTerminalPaths(paths,shell)
      if(result.refused.length)setProblem('部分路径包含控制字符，或当前 shell 无法安全引用，未输入这些路径。')
      if(result.text){terminal.paste(result.text);terminal.focus()}
    }
    const drag=event=>{if(event.dataTransfer?.types?.some(type=>type==='Files'||type==='application/x-hermes-paths')){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy'}}
    const element=host.current;element.addEventListener('dragover',drag);element.addEventListener('drop',drop)
    const input=terminal.onData(data=>{if(!replaying){interacted=true;control('write',{data})}})
    const resize=terminal.onResize(dimensions=>control('resize',dimensions))
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>fit.fit())});observer.observe(element)
    void connect()
    if(live.terminalFont)void live.terminalFont().then(value=>{if(!signal.aborted){setFont(value);setFontDraft(value)}}).catch(error=>{if(!signal.aborted)setProblem(error.message)})
    if(live.terminalFontFaces&&typeof FontFace==='function')void live.terminalFontFaces().then(async faces=>{
      await Promise.all(faces.map(async face=>{const loaded=await new FontFace('JetBrains Mono',`url(${face.url})`,{weight:face.weight,style:face.style}).load();if(!signal.aborted)document.fonts.add(loaded)}))
      if(!signal.aborted){fit.fit();terminal.refresh(0,terminal.rows-1)}
    }).catch(error=>{if(!signal.aborted)setProblem(error.message)})
    return()=>{
      unmounted=true;readerCallback.current?.(null)
      if(restored){const{baseY,viewportY}=terminal.buffer.active;readingPositions?.set(readingKey,{terminalId,line:viewportY<baseY?viewportY:null})}
      controller.abort();observer.disconnect();cancelAnimationFrame(resizeFrame);clearTimeout(snapshotTimer)
      element.removeEventListener('dragover',drag);element.removeEventListener('drop',drop)
      input.dispose();resize.dispose();selection.dispose();links.dispose();terminal.dispose();terminalRef.current=null;actions.current=null;fitRef.current=null;if(lifetime.current===controller)lifetime.current=null
    }
  },[live,sessionId,instanceId,visible,attempt,readingPositions])

  useEffect(()=>{
    const terminal=terminalRef.current;if(!terminal)return
    let current=true;const family=resolveTerminalFontFamily(font)
    void Promise.allSettled(['400','700','italic 400'].map(weight=>document.fonts?.load(`${weight} 13px ${family}`))).then(()=>{
      if(!current||terminalRef.current!==terminal)return
      terminal.options.fontFamily=family;fitRef.current?.();terminal.refresh(0,terminal.rows-1)
    });return()=>{current=false}
  },[font,visible,attempt])
  useEffect(()=>{
    if(!menu)return
    const close=()=>setMenu(null),key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}}
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key,true)
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key,true)}
  },[menu])
  async function saveFont(event){event.preventDefault();const token=lifetime.current;if(!token||token.signal.aborted)return;try{const value=await live.terminalFont(fontDraft);if(lifetime.current===token&&!token.signal.aborted){setFont(value);setFonts(false)}}catch(error){if(lifetime.current===token&&!token.signal.aborted)setProblem(error.message)}}
  return <section className="live-terminal" aria-label="交互终端">
    <div className="live-terminal-bar"><span title={cwd}>{cwd||'会话工作目录'}</span>{recovered&&<small>已恢复显示历史</small>}{status&&<small role="status">{status}</small>}
      {live.terminalFont&&<button className="tool-text-button" type="button" aria-expanded={fonts} onClick={()=>setFonts(value=>!value)}>字体</button>}
      {disconnected&&<button className="tool-text-button" type="button" onClick={()=>reconnect(value=>value+1)}>重新连接</button>}
    </div>
    {fonts&&<form className="live-terminal-bar" aria-label="终端字体设置" onSubmit={saveFont}>
      <input aria-label="终端字体名称或 CSS 字体列表" value={fontDraft} onChange={event=>setFontDraft(event.target.value)} placeholder="JetBrains Mono（默认）" style={{minWidth:0,flex:1,color:'inherit',background:'#232724',border:'1px solid #526451',padding:5}}/>
      <button type="button" onClick={()=>setFontDraft('')}>重置</button><button type="submit">保存</button>
    </form>}
    {problem&&<p className="live-terminal-error" role="alert">{problem}</p>}
    <div className="live-terminal-screen" ref={host} aria-label="终端输入和输出" data-terminal data-interactive-terminal onContextMenu={event=>{event.preventDefault();event.stopPropagation();setMenu({x:Math.min(event.clientX,window.innerWidth-150),y:Math.min(event.clientY,window.innerHeight-185)})}}/>
    {menu&&<div role="menu" aria-label="终端操作" onPointerDown={event=>event.stopPropagation()} style={{position:'fixed',left:menu.x,top:menu.y,zIndex:1000,width:150,padding:5,background:'#303830',border:'1px solid #526451',borderRadius:8,boxShadow:'0 8px 28px #0005'}}>
      {[['copy','复制'],['paste','粘贴'],['selectAll','全选'],['clear','清屏']].map(([action,label])=><button key={action} type="button" role="menuitem" className="menu-row" disabled={action==='copy'&&!terminalRef.current?.hasSelection()||action==='paste'&&disconnected} onClick={()=>{void actions.current?.[action]();setMenu(null)}}>{label}</button>)}
      <button type="button" role="menuitem" className="menu-row" onClick={()=>{setFonts(true);setMenu(null)}} disabled={!live.terminalFont}>字体设置</button>
    </div>}
  </section>
}
