/** Window-local view over the original client update store. No backend update
 * or runtime lifecycle is substituted. Original check/apply owns all outcomes. */
export function createNativeUpdateController({ host, original, isCurrent, onChange, copySelection, environment = globalThis }) {
  let recent = []
  let disposed = false, open = false, progress = null, applying = false, error = null, notice = null, noticeTimer
  const active = () => !disposed && isCurrent()
  const publish = () => { if (active()) onChange() }
  const stores = [original.$updateStatus, original.$updateChecking, original.$updateApply, original.$desktopVersion]
  const disposers = stores.map(store => store.listen(publish))
  const offProgress = host.updates?.onProgress?.(value => {
    if (!active()) return
    progress = { stage: value.stage, message: value.message, percent: value.percent ?? progress?.percent ?? original.$updateApply.get().percent, error: value.error }
    recent = [...recent, { stage: value.stage, message: value.message }].slice(-300)
    publish()
  })
  if (typeof offProgress === 'function') disposers.push(offProgress)
  function snapshot() {
    return { open, status: original.$updateStatus.get(), checking: original.$updateChecking.get(),
      apply: original.$updateApply.get(), version: original.$desktopVersion.get(), progress, recent, error, notice }
  }
  function showNotice(value) {
    if (!active() || !open) return
    notice = value; publish(); clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { if (active()) { notice = null; publish() } }, 3500)
  }
  function diagnosticsKey(event) {
    if (!active() || !open || !nativeUpdateDiagnosticsShortcut(event, environment.navigator?.platform ?? '')) return
    event.preventDefault()
    const text = nativeUpdateDiagnostics(snapshot())
    if (!text) showNotice('empty')
    else if (copySelection?.(text)) showNotice('copied')
    else if (environment.navigator?.clipboard?.writeText) void environment.navigator.clipboard.writeText(text).then(() => showNotice('copied'), () => showNotice('copyFailed'))
    else showNotice('copyFailed')
  }
  if (typeof environment.addEventListener === 'function') {
    environment.addEventListener('keydown', diagnosticsKey)
    disposers.push(() => environment.removeEventListener('keydown', diagnosticsKey))
  }
  return {
    snapshot,
    async open() { if (!active()) return; open = true; error = null; publish(); await original.checkUpdates({ force: true }); publish() },
    close() { if (!active() || applying || original.$updateApply.get().applying) return; open = false; notice = null; clearTimeout(noticeTimer); publish() },
    async check() { if (!active()) return; await original.checkUpdates({ force: true }); publish() },
    async apply(confirmed) {
      const status = original.$updateStatus.get()
      if (!confirmed || !active() || applying || original.$updateApply.get().applying || original.$updateChecking.get()) return false
      if (!status?.supported || status.retirement || status.error || !(status.updateAvailable || status.behind > 0)) return false
      applying = true; progress = null; recent = []; error = null
      try { return await original.applyUpdates() }
      catch (problem) { if (active()) error = problem instanceof Error ? problem.message : '原生更新失败。'; return { ok: false } }
      finally { applying = false; publish() }
    },
    dispose() { if (disposed) return; disposed = true; clearTimeout(noticeTimer); for (const off of disposers) off() },
  }
}


export function nativeUpdateDiagnosticsShortcut(event, platform) {
  const modifier = platform.startsWith('Mac') ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  return Boolean(modifier && event.shiftKey && !event.altKey && !event.repeat && event.key.toLowerCase() === 'l')
}

export function nativeUpdateDiagnostics(state) {
  const entries = state.recent?.length ? state.recent : state.apply?.log ?? []
  const lines = entries.map(({ stage, message }) => stage ? `[${stage}] ${message}` : message)
  const progress = state.progress
  if (progress?.message && !entries.some(row => row.message === progress.message)) lines.push(progress.stage ? `[${progress.stage}] ${progress.message}` : progress.message)
  const error = state.error || state.apply?.error || (state.status?.error ? state.status.message || state.status.error : null)
  if (error) lines.push(error)
  return lines.filter(Boolean).join('\n')
}

const stages = {
  idle:'', prepare:'正在准备客户端更新…', download:'正在获取客户端更新…', pull:'正在获取客户端更新…',
  deps:'正在更新客户端组件…', rebuild:'正在构建客户端…', install:'正在安装客户端更新…',
  restart:'客户端正在重新启动…', done:'客户端更新已完成。', error:'客户端更新未完成。',
  manual:'此安装需要使用原有安装方式更新客户端。', guiSkew:'客户端与核心版本不一致，请通过原生安装器完成更新。',
}
function briefFact(value) {
  if (!value) return ''
  const first = String(value).split('\n').map(line => line.trim()).find(Boolean) || ''
  if (/^(Traceback|File |at |\{)/i.test(first)) return '原生更新未完成，可使用诊断快捷键复制当前信息。'
  return first.replace(/^Error:\s*/i, '').slice(0, 180)
}
/** Only these facts are shown in the update page; raw diagnostics stay behind
 * the original installer shortcut. No log/command text is a visible action. */
export function nativeUpdatePresentation(state) {
  const status = state.status, apply = state.apply ?? {}
  const error = briefFact(state.error || apply.error || (status?.error ? status.message || status.error : ''))
  const stage = apply.applying ? state.progress?.stage || apply.stage : apply.stage
  return {
    status: state.checking ? '正在检查客户端更新…' : status?.retirement ? '当前更新渠道已停止维护。'
      : status?.supported === false ? '此安装不支持客户端内自动更新。'
      : error ? '客户端更新检查未完成。' : status?.updateAvailable || status?.behind > 0 ? '有可用的客户端更新。'
      : status ? '当前客户端已是最新版本。' : '',
    progress: stages[stage] ?? (apply.applying ? '正在执行原生客户端更新…' : ''),
    error: status?.supported === false ? '' : error,
  }
}
