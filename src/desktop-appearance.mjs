import { designValue } from './design/aiwata-tokens.mjs'
// Native contract: appearance-apply.ts and themes/accents.ts. Layouts are
// frontend-owned: report only layouts this workbench can actually render.
export const appearanceAccents = { theme: null, nous: null, ...Object.fromEntries(['mono', 'green', 'cyan', 'violet', 'pink', 'red', 'orange'].map(name => [name, designValue('sys.accent.preset.' + name)])) }
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
  const roles = { '--text': 'text-primary', '--muted': 'text-muted', '--faint': 'text-faint', '--surface': 'surface-primary',
    '--tool-surface': 'surface-tool', '--sidebar': 'surface-sidebar', '--app-surface': 'surface-canvas', '--hover': 'surface-hover',
    '--selected': 'surface-selected', '--line': 'border-default' }
  const accent = preferences.accent === 'mono' && dark ? 'var(--ai-sys-accent-preset-mono-dark)'
    : appearanceAccents[preferences.accent] ? 'var(--ai-sys-accent-preset-' + preferences.accent + ')'
      : preferences.accent?.startsWith('custom:') ? preferences.accent.slice(7) : undefined
  return { ...(dark ? { ...Object.fromEntries(Object.entries(roles).map(([key, role]) => [key, 'var(--ai-sys-dark-color-' + role + ')'])), colorScheme: 'dark' } : {}),
    ...(accent ? { '--accent': accent } : {}) }
}
