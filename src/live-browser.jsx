import { BrowserViewportControls, BrowserViewportFrame } from './browser-viewport.jsx'
import { browserViewport, updateBrowserViewport, scaleViewportRect } from './browser-viewport.mjs'
import { BrowserHome } from './browser-home.jsx'
import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnnotationControls, NativeAnnotationCard, browserAnnotations } from './browser-annotations.jsx'
import { placeAnnotateCard } from './browser-annotation-card.mjs'
import { PreviewConsole } from './browser-console.jsx'
import { appendConsoleToDraft, browserConsole } from './browser-console.mjs'
import { Icon, IconButton } from './icons.jsx'
import { emptyBrowserState, moveBrowser, navigateBrowser } from './tool-surfaces.mjs'
import { webPreviewAddress } from './web-preview.mjs'
import { runBrowserAnnotationSession } from './native-browser-annotations.mjs'
import { updateBrowserPageMetadata } from './browser-tab.mjs'

export const liveBrowserTool = '浏览器'

function addressInput(input) {
  const value = input.trim()
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value)
  const bareDomain = /^[^\s/:]+\.[^\s/:]+(?::\d+)?(?:[/?#]|$)/i.test(value)
  return webPreviewAddress(value) ?? ((local || bareDomain) ? webPreviewAddress((local ? 'http://' : 'https://') + value) : null)
}

function Page({ viewport, url, partition, onNavigate, onMetadata, onStatus, chatId, toolInstanceId, previewPage, annotation, annotating, onBusy, onReady, onAnnotationError, consoleStore, consolePanel, onDevTools, controls, voiceService, profile, report }) {
  const element = useRef(null)
  const frame = useRef(null)
  const [pane, setPane] = useState({ width: 360, height: 360 })
  const [geometry, setGeometry] = useState({left:0,top:0,scale:1})
  function viewportGeometry(next) {setGeometry(previous => previous.left === next.left && previous.top === next.top && previous.scale === next.scale ? previous : next)}
  const [draftRect, setDraftRect] = useState(null)
  const [pageReady, setPageReady] = useState(false)
  const initial = useRef(url)
  const loaded = useRef(url)
  const failureReported = useRef(false)
  const callbacks = useRef({ onNavigate, onStatus, consoleStore, onDevTools })
  callbacks.current = { ...callbacks.current, onNavigate, onMetadata, onStatus, consoleStore, onDevTools }

  useLayoutEffect(() => {
    const view = element.current
    let alive = true, iconRequest = 0
    function titleChanged() {
      const page = webPreviewAddress(view.getURL())
      if (page && loaded.current === page) callbacks.current.onMetadata(page, { title: view.getTitle() })
    }
    async function faviconChanged() {
      const page = webPreviewAddress(view.getURL())
      if (!page || loaded.current !== page || !window.aiwataPreview?.favicon) return
      const request = ++iconRequest
      try {
        const result = await window.aiwataPreview.favicon(partition, view.getWebContentsId(), page)
        if (alive && request === iconRequest && result.success && view.getURL() === page && loaded.current === page) {
          callbacks.current.onMetadata(page, { favicon: result.favicon })
        }
      } catch { /* Missing or unsupported page icons use the generic browser icon. */ }
    }
    callbacks.current.consoleStore.begin(url)
    function navigated(event) {
      if (event.isMainFrame === false) return
      const next = webPreviewAddress(event.url)
      if (!next) return
      loaded.current = next
      callbacks.current.consoleStore.commit(next)
      callbacks.current.onNavigate(next)
      titleChanged()
    }
    const loading = () => callbacks.current.onStatus({ loading: true, error: '' })
    const finished = () => { callbacks.current.onStatus(previous => ({ ...previous, loading: false })); titleChanged(); void faviconChanged() }
    const failed = event => {
      if (event.isMainFrame === false || event.errorCode === -3) return
      if (failureReported.current) return
      failureReported.current = true
      callbacks.current.consoleStore.commit(event.validatedURL || loaded.current)
      callbacks.current.consoleStore.append({ level: 3, source: event.validatedURL,
        message: '加载失败' + (event.errorCode ? ' (' + event.errorCode + ')' : '') + ': ' + (event.errorDescription || '网页不可用') })
      callbacks.current.onStatus({ loading: false,
        error: event.errorCode === -20 ? '当前预览无法访问这个地址。' : '网页加载失败，请检查地址和网络。' })
    }
    callbacks.current.loadFailed = failed
    const listeners = {
      'dom-ready': () => { callbacks.current.consoleStore.commit(view.getURL()); setPageReady(true) },
      'did-start-navigation': event => { if (event.isMainFrame !== false && !event.isInPlace) { failureReported.current = false; callbacks.current.consoleStore.begin(event.url) } },
      'did-navigate': navigated, 'did-navigate-in-page': navigated, 'did-start-loading': loading,
      'did-stop-loading': finished, 'did-fail-load': failed,
      'console-message': event => callbacks.current.consoleStore.append(event),
      'page-title-updated': titleChanged,
      'page-favicon-updated': faviconChanged,
      'devtools-opened': () => callbacks.current.onDevTools(true),
      'devtools-closed': () => callbacks.current.onDevTools(false),
    }
    for (const [event, listener] of Object.entries(listeners)) view.addEventListener(event, listener)
    return () => {
      alive = false; iconRequest++
      for (const [event, listener] of Object.entries(listeners)) view.removeEventListener(event, listener)
      callbacks.current.onDevTools(false)
    }
  }, [])

  useLayoutEffect(() => {
    const view = element.current
    const page = {
      chatId, toolInstanceId,
      inspect: async (method, params, signal) => {
        if (signal?.aborted) return { success: false, error: '网页操作已取消。' }
        const requestId = crypto.randomUUID(), guestId = view.getWebContentsId()
        const cancel = () => { void window.aiwataPreview.cancelInspection(partition, guestId, requestId).catch(() => {}) }
        signal?.addEventListener('abort', cancel, { once: true })
        try { return await window.aiwataPreview.inspect(partition, guestId, loaded.current, method, params, requestId) }
        finally { signal?.removeEventListener('abort', cancel) }
      },
      tour: async (action, signal) => {
        if (signal?.aborted) return { success: false, error: '导览已取消。' }
        const requestId = crypto.randomUUID(), guestId = view.getWebContentsId()
        const cancel = () => { void window.aiwataPreview.cancelInspection(partition, guestId, requestId).catch(() => {}) }
        signal?.addEventListener('abort', cancel, { once: true })
        try { return await window.aiwataPreview.tour(partition, guestId, loaded.current, action, requestId) }
        finally { signal?.removeEventListener('abort', cancel) }
      },
      target: (url, x, y) => window.aiwataPreview.target(partition, view.getWebContentsId(), url, x, y),
      toggleDevTools: () => window.aiwataPreview.devTools(partition, view.getWebContentsId(), loaded.current, { action: 'toggle' }),
    }
    previewPage.current = page
    return () => { if (previewPage.current === page) previewPage.current = null }
  }, [chatId, toolInstanceId, partition, previewPage])

  useLayoutEffect(() => {
    if (loaded.current === url) return
    failureReported.current = false
    consoleStore.begin(url)
    setPageReady(false)
    loaded.current = url
    let cancelled = false
    void element.current.loadURL(url).catch(error => {
      if (!cancelled && loaded.current === url) callbacks.current.loadFailed?.({ isMainFrame: true, validatedURL: url,
        errorDescription: error.message || '网页不可用' })
    })
    return () => { cancelled = true }
  }, [url])

  const annotationRef = useRef(annotation)
  annotationRef.current = annotation
  const [nativeSession, setNativeSession] = useState(null)
  const [capturing, setCapturing] = useState(false)
  useLayoutEffect(() => {
    const element = frame.current
    let alive = true
    const update = () => { if (alive) setPane({ width: element.clientWidth, height: element.clientHeight }) }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { alive = false; observer.disconnect() }
  }, [])
  useEffect(() => {
    if (!annotating || !pageReady) return
    const host = window.aiwataPreview
    if (!host?.annotate) { onAnnotationError('请重新打开桌面预览以启用原生标注。'); return }
    const controller = new AbortController()
    let guestId
    try { guestId = element.current.getWebContentsId() } catch { onAnnotationError('网页尚未准备好，请刷新后重试。'); return }
    void runBrowserAnnotationSession({ host, partition, guestId, url, signal: controller.signal,
      getNumber: () => annotationRef.current.nextNumber,
      onReady: session => { setNativeSession(session); onReady(true) },
      onBusy: busy => { setCapturing(busy); onBusy(busy) },
      onPick: (capture, signal) => { setDraftRect(capture.rect); return annotationRef.current.capture(capture, signal) },
      onReposition: setDraftRect,
      onEnd: () => annotationRef.current.edit({ open: false }),
      onError: error => { onAnnotationError(error.message); annotationRef.current.edit({ open: false }) },
    })
    return () => { controller.abort(); setNativeSession(null); onBusy(false); onReady(false) }
  }, [annotating, partition, url, pageReady])

  const chrome = annotation.pins.filter(pin => pin.capture).map(pin => ({
    kind: pin.capture.kind, number: pin.number, rect: pin.capture.rect,
    ...(pin.capture.page ? { page: pin.capture.page } : {}),
    ...(pin.capture.identity?.selector ? { selector: pin.capture.identity.selector } : {}),
  }))
  const chromeKey = JSON.stringify(chrome)
  useEffect(() => {
    if (!nativeSession || capturing) return
    void nativeSession.command({ action: 'sync', pins: JSON.parse(chromeKey) }).catch(() => {})
  }, [nativeSession, chromeKey])
  const capture = annotation.draft.capture
  useEffect(() => { setDraftRect(capture?.rect ?? null) }, [capture?.image?.blobId])
  useEffect(() => {
    if (!nativeSession || capturing) return
    if (capture) void nativeSession.command({ action: 'draft', rect: capture.rect, number: capture.number ?? annotation.nextNumber,
      page: capture.page, selector: capture.identity?.selector }).catch(() => {})
    else void nativeSession.command({ action: 'hideDraft' }).catch(() => {})
  }, [nativeSession, chromeKey, capture, capturing])

  return <div className="live-browser-frame" ref={frame}>
    <BrowserViewportFrame settings={viewport} onGeometry={viewportGeometry}>
    <webview className="live-browser-page" ref={element} partition={partition}
      src={initial.current} aria-label="真实网页预览" />
    </BrowserViewportFrame>
    {annotating && capture && !capturing && <NativeAnnotationCard
      {...placeAnnotateCard({ paneWidth: pane.width, paneHeight: pane.height, rect: scaleViewportRect(draftRect ?? capture.rect, geometry) })}
      number={capture.number ?? annotation.nextNumber} note={annotation.draft.text}
      onChange={text => annotation.edit({ text })} onSave={event => annotation.save(event, true)}
      onCancel={() => annotation.edit({ capture: null, target: '', text: '' })}
      voiceService={voiceService} profile={profile} identity={capture.image?.blobId}
      isCurrent={() => annotationRef.current.draft.capture?.image?.blobId === capture.image?.blobId && annotationRef.current.isCurrent()}
      report={report} />}
    {controls && <AnnotationControls pane={pane} {...controls} />}
    {consolePanel}
  </div>
}

export function LiveBrowser({ chat, api, refresh, partition, visible, thumbnail, report, previewPage, openTool, availableTools, voiceService }) {
  const ownerAccountId = api.accountId
  const ownerRecord = api.current()
  const data = chat.browser ?? emptyBrowserState
  const viewport = browserViewport(data.viewport)
  const url = partition ? webPreviewAddress(data.visited) : null
  const consoleStore = browserConsole(api, partition, chat.id, chat.toolInstanceId ?? '浏览器')
  const consoleState = useSyncExternalStore(consoleStore.subscribe, consoleStore.snapshot, consoleStore.snapshot)
  const [devToolsOpen, setDevToolsOpen] = useState(false)
  const [addressDraft, setAddressDraft] = useState(null)
  const address = addressDraft?.page === url ? addressDraft.text : url ?? ''
  const [version, reload] = useState(0)
  const [status, setStatus] = useState({ loading: false, error: '' })
  const [capturing, setCapturing] = useState(false)
  const [annotationReady, setAnnotationReady] = useState(false)
  const [annotationError, setAnnotationError] = useState('')
  const [marksHidden, setMarksHidden] = useState(false)
  const annotations = browserAnnotations({ chat, url, api, refresh, report })
  const annotating = !!url && visible && annotations.draft.open && !marksHidden && !status.loading && !status.error
  useEffect(() => { setMarksHidden(false) }, [url, chat.id, chat.toolInstanceId])

  function update(action) {
    if (api.updateBrowser(chat.id, action, chat.toolInstanceId)) refresh()
  }

  function navigate(target) {
    setAddressDraft(null)
    setStatus({ loading: Boolean(target), error: '' })
    update(previous => navigateBrowser(previous, target))
  }

  function history(by) {
    setAddressDraft(null)
    setStatus({ loading: false, error: '' })
    update(previous => moveBrowser(previous, by))
  }

  function refreshPage() {
    reload(value => value + 1)
  }

  function addLogs(entries) {
    const result = appendConsoleToDraft({ api, accountId: ownerAccountId, chatId: chat.id, tabId: chat.toolInstanceId ?? '浏览器',
      url, entries, destinationLabel: annotations.destination?.label })
    if (!result.ok) return report(result.error, true)
    consoleStore.clearSelection(); refresh()
    report(result.duplicate ? '这些日志已在草稿中' : '已添加到「' + annotations.destination.label + '」的草稿')
  }

  async function toggleDevTools() {
    const page = previewPage.current
    if (page?.chatId !== chat.id || page.toolInstanceId !== chat.toolInstanceId) return report('请先载入当前浏览器网页。', true)
    try {
      const result = await page.toggleDevTools()
      if (!result.success) report(result.error || '无法打开当前网页的 DevTools。', true)
    } catch { report('DevTools 需要当前桌面预览宿主，请重新打开预览。', true) }
  }

  if (thumbnail) return <p className="live-browser-thumbnail">{url ? new URL(url).hostname : '工具起始页'}</p>
  return <section className="live-browser" aria-label="网页预览">
    <form className="browser-bar" onSubmit={event => {
      event.preventDefault()
      if (!partition) return report('网页预览需要 AIWATA 桌面宿主。', true)
      const next = addressInput(address)
      if (!next) return report('请输入有效的 HTTP 或 HTTPS 地址。', true)
      if (next === url) { refreshPage(); setAddressDraft(null) }
      else navigate(next)
    }}>
      <IconButton icon="back" label="后退" disabled={data.historyIndex <= 0} onClick={() => history(-1)} />
      <IconButton icon="next" label="前进" disabled={data.historyIndex >= data.history.length - 1} onClick={() => history(1)} />
      <IconButton icon="refresh" label="刷新网页" disabled={!url} onClick={refreshPage} />
      <input disabled={!partition} aria-label="浏览器地址" value={address} onChange={event => setAddressDraft({ page: url, text: event.target.value })} placeholder={partition ? '输入网址' : '网页预览需要桌面宿主'} />
      <IconButton icon="home" label="浏览器起始页" disabled={!url} onClick={() => navigate('')} />
      <IconButton icon="devices" className="browser-viewport-toggle" label="响应式预览" aria-pressed={viewport.enabled}
        onClick={() => update(previous => updateBrowserViewport(previous, {enabled:!viewport.enabled}))} />
      <IconButton icon="annotate" className="browser-annotate-toggle" label={annotations.draft.open ? '停止标注' : '标注'}
        aria-pressed={annotations.draft.open} disabled={!url} onClick={() => {
          setAnnotationError('')
          annotations.edit({ open: !annotations.draft.open })
        }} />
      <IconButton icon="terminal" label={consoleState.open ? '隐藏预览控制台' : '显示预览控制台'}
        aria-expanded={consoleState.open} disabled={!url} onClick={() => consoleStore.setOpen(!consoleState.open)} />
      <IconButton icon="bug" label={devToolsOpen ? '关闭开发者工具' : '打开开发者工具'}
        aria-pressed={devToolsOpen} disabled={!url || !partition || !window.aiwataPreview?.devTools} onClick={toggleDevTools} />
    </form>
    {viewport.enabled && <BrowserViewportControls settings={viewport} onChange={patch => update(previous => updateBrowserViewport(previous, patch))} />}
    {annotationError && <p className="live-browser-status" role="alert">{annotationError}</p>}
    {visible && url ? <>
      {status.error && <p className="live-browser-status" role="alert">{status.error}</p>}
      {status.loading && <p className="live-browser-status" role="status">正在加载网页…</p>}
      <Page key={version} viewport={viewport} url={url} partition={partition} onNavigate={next => {
        update(previous => navigateBrowser(previous, next))
      }} onMetadata={(page, fields) => {
        if (api.accountId === ownerAccountId && api.current() === ownerRecord) update(previous => updateBrowserPageMetadata(previous, page, fields))
      }} onStatus={setStatus} chatId={chat.id} toolInstanceId={chat.toolInstanceId} previewPage={previewPage} annotation={annotations}
        consoleStore={consoleStore} onDevTools={setDevToolsOpen}
        consolePanel={consoleState.open && <PreviewConsole store={consoleStore} state={consoleState} destination={annotations.destination}
          onDraft={addLogs} report={report} />}
        voiceService={voiceService} profile={chat.gatewayProfile || 'default'} report={report}
        controls={annotations.draft.open && { count: annotations.pins.length, hidden: marksHidden, ready: annotationReady,
          onHidden: () => setMarksHidden(value => !value), onClear: annotations.clear, onSend: annotations.send,
          onClose: () => annotations.edit({ open: false }), destination: annotations.destination, busy: annotations.busy }}
        annotating={annotating} onBusy={setCapturing} onReady={setAnnotationReady} onAnnotationError={setAnnotationError} />
    </> : visible && <div className="browser-viewport-home"><BrowserViewportFrame settings={viewport}>{(availableTools.length === 1 ? <div className="browser-annotation-empty">
      <Icon name="browser" size={/* @ai-token sys.icon.size.32 */ 32} /><h3>打开网页，直观描述修改</h3>
      <p>在地址栏输入网址，点击标注后可选择元素或框选区域，将截图和修改意见添加到当前{annotations.destination?.kind === 'group' ? '群聊' : 'Bot'}的草稿。</p>
      {!partition && <small>网页载入和截图需要桌面宿主。</small>}
    </div> : <BrowserHome openTool={openTool} availableTools={availableTools} />)}</BrowserViewportFrame></div>}
  </section>
}
