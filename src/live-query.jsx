import { useEffect, useState } from 'react'

export function useLiveQuery(live, method, args, revision) {
  const query = args ? JSON.stringify(args) : null
  const key = JSON.stringify([query, revision])
  const [response, setResponse] = useState(null)
  useEffect(() => {
    if (!live || !query) return
    const controller = new AbortController()
    live[method](...args, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResponse({ live, key, data }) })
      .catch(error => { if (!controller.signal.aborted) setResponse({ live, key, error: error.message }) })
    return () => controller.abort()
  }, [live, method, query, key])
  return query && response?.key === key && response.live === live ? response : null
}
