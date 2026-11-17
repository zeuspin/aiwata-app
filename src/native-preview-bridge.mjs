// Presentation compatibility for the existing browser UI. Every native operation
// goes through the original AIWATA host; no custom IPC/main-process host is used.
import { captureNativePreview } from './native-preview-capture.mjs'
import { isPreviewPartition } from '@aiwata/native-preview-scope'
import { createNativePreviewSession } from './native-preview-session.mjs'
import { createAnnotationController } from '../scripts/desktop-preview-annotations.mjs'
import { drivePreviewPage } from '../scripts/desktop-preview-inspection.mjs'
import { previewCommand } from './web-preview.mjs'
import { runTourEngine } from './vendor/aiwata-tour/engine.mjs'
import { collectTourTargets } from './vendor/aiwata-tour/collect-targets.mjs'
import driver from './vendor/aiwata-tour/driver.js.iife.js?raw'
import driverCSS from './vendor/aiwata-tour/driver.css?raw'

export function installNativePreviewBridge(host, partition) {
  let disposed=false
  const annotations = new Map(), inspections = new Map(), facades = new WeakMap()
  const lifecycle = createNativePreviewSession(partition, async () => {
    for (const item of annotations.values()) item.controller.invalidate()
    annotations.clear()
    for (const controller of inspections.values()) controller.abort()
    inspections.clear()
  })
  function viewFor(id, url) {
    const view = [...document.querySelectorAll('webview')].find(view => { try { return view.getWebContentsId() === id } catch { return false } })
    if (disposed || !lifecycle.active || !view || !isPreviewPartition(view.partition) || url && view.getURL() !== url) throw new Error('当前网页或接收会话已切换。')
    return view
  }
  async function execute(view, code) {
    const token = await host.beginPreviewGuestActivity(view.getWebContentsId())
    try { return await host.executePreviewGuestScript(token, code) }
    finally { await host.endPreviewGuestActivity(token) }
  }
  function facade(view) {
    if (facades.has(view)) return facades.get(view)
    const wrapper = {
      getURL: () => view.getURL(), getZoomFactor: () => view.getZoomFactor(),
      isDestroyed: () => !lifecycle.active || !view.isConnected,
      executeJavaScript: code => execute(view, code),
      executeJavaScriptInIsolatedWorld: (_world, scripts) => execute(view, scripts.map(s=>s.code).join('\n')),
      sendInputEvent: input => view.sendInputEvent(input), focus: () => view.focus(),
      reload: () => view.reload(), canGoBack: () => view.canGoBack(), canGoForward: () => view.canGoForward(),
      goBack: () => view.goBack(), goForward: () => view.goForward(),
      async capturePage(rect) {
        const url = await captureNativePreview(host, view, execute, rect)
        return { isEmpty:()=>!url, toDataURL:()=>url }
      },
    }
    facades.set(view, wrapper); return wrapper
  }
  const bridge = {
    start: () => lifecycle.start(),
    stop: () => lifecycle.stop(),
    selectPaths: () => host.selectPaths({ directories:true, multiple:true }),
    openExternal: url => host.openExternal(url), readWindowBelow: () => host.readWindowBelow(),
    async inspect(_partition, id, url, method, params, requestId) {
      const view = viewFor(id, url), controller = new AbortController()
      inspections.set(requestId, controller)
      try { return await drivePreviewPage(facade(view), previewCommand(method, params), url,
        () => lifecycle.active && view.isConnected && view.getURL() === url, controller.signal,
        () => lifecycle.active && view.isConnected) }
      finally { inspections.delete(requestId) }
    },
    async cancelInspection(_partition, _id, requestId) { inspections.get(requestId)?.abort() },
    async target(_partition, id, url, x, y) {
      const view = viewFor(id, url)
      return drivePreviewPage(facade(view), { action:'target', x, y }, url, () => lifecycle.active && view.isConnected && view.getURL() === url)
    },
    async annotate(_partition, id, url, command) {
      const view = viewFor(id, url)
      let item = annotations.get(id)
      if (!item || item.url !== url || command.action === 'start') {
        item?.controller.invalidate()
        item = { url, controller:createAnnotationController({ guest:facade(view), url,
          isCurrent:()=>lifecycle.active && view.isConnected && view.getURL() === url }) }
        annotations.set(id, item)
      }
      return item.controller.run(command)
    },
    async devTools(_partition, id, url) {
      const view = viewFor(id, url)
      if (view.isDevToolsOpened()) view.closeDevTools()
      else view.openDevTools()
      return { success:true, open:view.isDevToolsOpened() }
    },
    async favicon(_partition, id, url) {
      const view = viewFor(id, url)
      const favicon = await execute(view, `(async()=>{
        const icon=document.querySelector('link[rel~="icon"]')?.href||new URL('/favicon.ico',location.href).href;
        try { const response=await fetch(icon); const blob=await response.blob();
          if(!response.ok||blob.size>131072||!blob.type.startsWith('image/'))return null;
          return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>resolve(null);reader.readAsDataURL(blob)});
        }catch{return null}
      })()`)
      return { success:Boolean(favicon && lifecycle.active && view.getURL()===url), favicon }
    },
    async tour(_partition, id, url, action, requestId) {
      const view=viewFor(id,url), controller=new AbortController(); inspections.set(requestId,controller)
      try {
        const result=await execute(view, `(()=>{${driver}\nlet style=document.getElementById('__aiwata_tour_style');if(!style){style=document.createElement('style');style.id='__aiwata_tour_style';style.textContent=${JSON.stringify(driverCSS)};document.head.append(style)};return (${runTourEngine.toString()})(window.driver.js.driver,window.__aiwataTourHolder||={},${JSON.stringify(action)},(${collectTourTargets.toString()}),document)})()`)
        controller.signal.throwIfAborted(); viewFor(id,url); return result
      } finally { inspections.delete(requestId) }
    },
  }
  window.aiwataPreview=bridge
  return () => {
    disposed=true
    for(const item of annotations.values())item.controller.invalidate()
    annotations.clear()
    for(const controller of inspections.values())controller.abort()
    inspections.clear()
    if(window.aiwataPreview===bridge)delete window.aiwataPreview
  }
}
