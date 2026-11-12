import { useEffect, useState } from 'react'
import { currentCompletion, nativeCompletionItems } from './live-completions.mjs'

export function useLiveCompletions({ live, chat, trigger, text, cwd, enabled }) {
  const [response, setResponse] = useState(null)
  const sessionId = chat.gatewayId || chat.gatewayStoredId
  const word = trigger ? trigger.kind + trigger.query : ''
  const profile = chat.gatewayProfile || 'default'
  const key = JSON.stringify([chat.id, sessionId, profile, cwd, word, trigger?.kind])
  useEffect(() => {
    if (!live || !enabled || !word) return
    let active = true
    const timer = setTimeout(() => {
      const method = trigger.kind === '/' ? 'complete.slash' : 'complete.path'
      const params = { ...(sessionId ? { session_id: sessionId } : cwd ? { cwd } : {}),
        ...(trigger.kind === '/' ? { text: word } : { word }) }
      void live.capability(method, profile, params).then(data => {
        if (active) setResponse({ live, key, items: nativeCompletionItems(data, trigger) })
      }).catch(error => { if (active) setResponse({ live, key, error: error.message, items: [] }) })
    }, 160)
    return () => { active = false; clearTimeout(timer) }
  }, [live, enabled, key])
  return currentCompletion(response, live, key, enabled)
}
