const contextMessages = {
  zh: tokens => `这段对话已经很长${tokens ? `（约 ${tokens} 个 token）` : ''}。切换模型后，第一次回复需要重新读取对话，无法沿用原模型的缓存。这一次的输入将按全价计费。`,
  'zh-hant': tokens => `這段對話已經很長${tokens ? `（約 ${tokens} 個 token）` : ''}。切換模型後，第一次回覆需要重新讀取對話，無法沿用原模型的快取。這一次的輸入將按全價計費。`,
  en: tokens => `This conversation has a long history${tokens ? ` (about ${tokens} tokens)` : ''}. The new model will reread it for its first reply without using the previous model’s cache. That input is charged once at the full input rate.`,
}

function warningLanguage(languages) {
  for (const tag of languages) {
    const [language, ...subtags] = tag.toLowerCase().split(/[-_]/)
    if (language === 'en') return 'en'
    if (language === 'zh') {
      const traditional = subtags.includes('hant') ||
        (!subtags.includes('hans') && subtags.some(region => ['tw', 'hk', 'mo'].includes(region)))
      return traditional ? 'zh-hant' : 'zh'
    }
  }
  return 'zh'
}

export function modelSwitchWarning(refusal, languages = globalThis.navigator?.languages ?? []) {
  const warnings = refusal.warnings ?? []
  if (!warnings.some(warning => warning.kind === 'context_cache')) return refusal.confirm_message

  const language = warningLanguage(languages)
  const numberFormat = new Intl.NumberFormat(language)
  return warnings.map(warning => {
    if (warning.kind !== 'context_cache') return warning.message
    const tokens = Number.isSafeInteger(warning.context_tokens) && warning.context_tokens > 0
      ? numberFormat.format(warning.context_tokens) : ''
    return contextMessages[language](tokens)
  }).filter(Boolean).join('\n\n')
}
