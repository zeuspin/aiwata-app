// Native contract: appearance-apply.ts and themes/accents.ts. Layouts are
// frontend-owned: report only layouts this workbench can actually render.
export const appearanceAccents = { theme: null, mono: '#000000', green: '#2ea043', cyan: '#00d5ff', nous: null,
  violet: '#8a2be2', pink: '#e0218a', red: '#ff073a', orange: '#ff6a00' }
export const appearanceLayouts = ['sidebar-left']
export function appearanceChange(prior = {}, values = {}) {
  const applied = {}
  const fail = (key, available) => ({ success: false, error: `Unknown ${key}: ${String(values[key])}`, available })
  if (values.mode !== undefined) {
    if (!['light', 'dark', 'system'].includes(values.mode)) return fail('mode', ['light', 'dark', 'system'])
    applied.mode = values.mode
  }
  if (values.accent !== undefined) {
    const raw = String(values.accent).replace(/^custom:/, '').toLowerCase()
    if (Object.hasOwn(appearanceAccents, values.accent)) applied.accent = appearanceAccents[values.accent] === null ? null : values.accent
    else if (/^#[a-f0-9]{6}$/.test(raw)) applied.accent = 'custom:' + raw
    else return fail('accent', Object.keys(appearanceAccents))
  }
  if (values.layout !== undefined) {
    if (!appearanceLayouts.includes(values.layout)) return fail('layout', appearanceLayouts)
    applied.layout = values.layout
  }
  return { success: true, applied, preferences: { ...prior, ...applied } }
}
export function appearanceStyle(preferences = {}, systemDark = false) {
  const dark = preferences.mode === 'dark' || preferences.mode === 'system' && systemDark
  const accent = preferences.accent === 'mono' && dark ? '#ffffff'
    : appearanceAccents[preferences.accent] ?? (preferences.accent?.startsWith('custom:') ? preferences.accent.slice(7) : undefined)
  return { ...(dark ? { '--text': '#e9e9e8', '--muted': '#acaeaa', '--faint': '#90938f', '--surface': '#242624',
    '--tool-surface': '#202220', '--sidebar': '#282a28', '--app-surface': '#191b19', '--hover': '#353835',
    '--selected': '#3a3e3a', '--line': '#414441', color: '#e9e9e8', colorScheme: 'dark' } : {}),
    ...(accent ? { '--accent': accent } : {}) }
}
