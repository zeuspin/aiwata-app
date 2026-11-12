// Original Desktop terminal-font/clipboard/links/terminal-drop contracts.
export const DEFAULT_TERMINAL_FONT_FAMILY = "'JetBrains Mono', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace"
export function resolveTerminalFontFamily(value) {
  const text=typeof value==='string'?value.trim():''
  if(!text)return DEFAULT_TERMINAL_FONT_FAMILY
  const preferred=text.includes(',')||/['"]/.test(text)?text:"'"+text.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'"
  return preferred+', '+DEFAULT_TERMINAL_FONT_FAMILY
}
export function terminalClipboardIntent(event,{hasSelection,isMac}) {
  if(event.type!=='keydown'||event.altKey)return null
  const key=event.key.toLowerCase()
  if(isMac){if(!event.metaKey||event.ctrlKey||event.shiftKey)return null;return key==='c'?(hasSelection?'copy':null):key==='v'?'paste':null}
  if(!event.ctrlKey||event.metaKey)return null
  if(event.shiftKey)return key==='c'?(hasSelection?'copy':null):key==='v'?'paste':null
  return key==='c'&&hasSelection?'copy':null
}
export function droppedTerminalPaths(transfer,getPathForFile) {
  const paths=new Set(),push=value=>{if(typeof value==='string'&&value.trim())paths.add(value.trim())}
  try {const raw=transfer.getData('application/x-hermes-paths');if(raw)for(const value of JSON.parse(raw))push(value?.path)} catch { /* malformed in-app drag falls through to OS files */ }
  const files=Array.from(transfer.files??[])
  if(!files.length)for(const item of Array.from(transfer.items??[]))if(item.kind==='file'){const file=item.getAsFile();if(file)files.push(file)}
  for(const file of files)push(getPathForFile?.(file))
  return [...paths]
}
export function quoteTerminalPaths(paths,shell) {
  const name=String(shell||'').toLowerCase().replace(/^.*[\\/]/,'').replace(/^-/,'').replace(/\.exe$/,'')
  const typed=[],refused=[]
  for(const path of paths){
    if(/[\u0000-\u001f\u007f-\u009f]/.test(path)){refused.push(path);continue}
    let quote
    if(name==='fish')quote="'"+path.replace(/[\\']/g,'\\$&')+"'"
    else if(name.startsWith('pwsh')||name.startsWith('powershell'))quote="'"+path.replace(/['\u2018\u2019\u201a\u201b]/g,'$&$&')+"'"
    else if(['ash','bash','dash','ksh','mksh','sh','zsh','csh','tcsh'].includes(name)){quote="'"+path.replace(/'/g,"'\\''")+"'";if(name==='csh'||name==='tcsh')quote=quote.replace(/!/g,'\\!')}
    else if(name==='cmd'&&!path.includes('!'))quote=path.split('%').map(part=>'"'+part.replace(/"/g,'""')+'"').join('^%')
    else if(/^[\w./:][\w./:-]*$/.test(path))quote=path
    if(quote)typed.push(quote);else refused.push(path)
  }
  return{text:typed.length?typed.join(' ')+' ':'',refused}
}
export async function activateTerminalLink(event,uri,{isMac,onPreview,openExternal}) {
  if(event?.isTrusted!==true || !(isMac?event.metaKey:event.ctrlKey))return false
  let url
  try{url=new URL(uri)}catch{return false}
  if(!['http:','https:'].includes(url.protocol))return false
  const handler=event.shiftKey?openExternal:onPreview
  if(typeof handler!=='function')return false
  await handler(url.href);return true
}

export function createTerminalCommands({terminal,clipboard,isCurrent,onClear=()=>{},canPaste=()=>true}) {
  return {
    async copy(){if(!isCurrent())return false;const text=terminal.getSelection();if(!text)return false;await clipboard('write',text);return true},
    async paste(){if(!isCurrent()||!canPaste())return false;const text=await clipboard('read');if(!isCurrent()||!canPaste())return false;terminal.paste(text);terminal.focus();return true},
    clear(){if(!isCurrent())return false;terminal.clear();onClear();return true},
    selectAll(){if(!isCurrent())return false;terminal.selectAll();return true},
  }
}
