import { appearanceAccents, appearanceLayouts } from './desktop-appearance.mjs'
export const desktopChoiceAllowsText = request => request.method === 'theme.pick' || request.params?.beat === 'name'
export function desktopChoiceOptions(request) {
  const params = request.params ?? {}
  const theme = request.method === 'theme.pick'
  const colors = params.picker === 'accent' || !theme && params.beat === 'theme'
  const ids = colors ? Object.keys(appearanceAccents).filter(id => id !== 'nous') : appearanceLayouts
  const options = theme || colors ? ids.map(id => ({ id, label: id === 'sidebar-left' ? '左侧列表布局' : id }))
    : (params.card?.options ?? []).filter(option => params.beat !== 'layout' || appearanceLayouts.includes(option.id))
  return options.map(option => ({ ...option, color: colors ? appearanceAccents[option.id] || 'var(--accent)' : null,
    answer: theme ? { picked: { [params.picker]: option.id } } : { answer: { [colors ? 'accent' : params.beat]: option.id } } }))
}
