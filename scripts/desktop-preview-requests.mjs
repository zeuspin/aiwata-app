export function createInspectionRequests() {
  const entries = new Map()
  return {
    begin(scope, guest, id) {
      if (entries.has(id) || entries.size >= 32) throw new Error('网页操作请求重复或已超过上限。')
      const controller = new AbortController()
      const entry = { scope, guest, signal: controller.signal, controller }
      entries.set(id, entry)
      return { signal: controller.signal, finish: () => { if (entries.get(id) === entry) entries.delete(id) } }
    },
    cancel(scope, guest, id) {
      const entry = entries.get(id)
      if (!entry || entry.scope !== scope || entry.guest !== guest) return false
      entry.controller.abort(); entries.delete(id); return true
    },
    release(scope, guest) {
      for (const [id, entry] of entries) if (entry.scope === scope && (!guest || guest === entry.guest)) {
        entry.controller.abort(); entries.delete(id)
      }
    },
  }
}

export function inspectionResultIsCurrent({ action, result, active, documentCurrent, aborted = false }) {
  return Boolean(!aborted && active && (documentCurrent || (result?.success &&
    ['click', 'type', 'press', 'back', 'forward', 'reload'].includes(action))))
}
