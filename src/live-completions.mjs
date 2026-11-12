import { getTrigger, referenceText } from './composer.mjs'

export const liveNavigationCommands = new Set(['help', 'new', 'model', 'approvals', 'skills', 'cron', 'tools', 'status'])
export function liveCompletionTrigger(value, caret) {
  const head = value.slice(0, caret)
  const quoted = /(?:^|\s)(@(file|folder):([`"'])([^`"']*))$/.exec(head)
  if (!quoted) return getTrigger(value, caret)
  const tail = value.slice(caret)
  const end = tail.indexOf(quoted[3])
  return { kind: '@', query: quoted[2] + ':' + quoted[4], start: caret - quoted[1].length,
    end: caret + (end < 0 ? tail.length : end + 1) }
}

export function nativeCompletionItems(result, trigger) {
  const seen = new Set()
  return (result?.items ?? []).flatMap(item => {
    if (typeof item.text !== 'string' || !item.text || item.text.length > 2048) return []
    let insert = item.text
    if (trigger.kind === '/') {
      insert = '/' + insert.trim().replace(/^\//, '')
      if (item.kind !== 'skill' && !liveNavigationCommands.has(insert.slice(1))) return []
    } else {
      const path = /^@(file|folder):(.+)$/.exec(insert)
      if (path) insert = referenceText(path[1], path[2])
    }
    if (seen.has(insert)) return []
    seen.add(insert)
    return [{ insert, label: item.display || item.text, description: item.meta || (item.kind === 'skill' ? '调用此技能' : ''),
      complete: !/[/:]$/.test(item.text), caretBack: item.text.endsWith('/') && /[`\"']$/.test(insert) ? 1 : 0, icon: item.kind === 'skill' ? 'spark' : trigger.kind === '/' ? undefined : 'file' }]
  })
}

export function currentCompletion(response, live, key, enabled) {
  return live && response && response.live === live && response.key === key && enabled ? response : { items: [] }
}
