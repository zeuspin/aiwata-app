export const botSidebarCompactWidth = 72
export const botSidebarCompactThreshold = 160
export const botSidebarExpandedMinimum = 200

export function settleBotSidebarWidth(width) {
  return width < botSidebarCompactThreshold ? botSidebarCompactWidth
    : Math.max(botSidebarExpandedMinimum, Math.min(520, Math.round(width)))
}

export function expandedBotSidebarWidth(state = {}, fallback = 322) {
  const width = state.sidebarExpandedWidth ?? state.sidebarWidth
  return Math.max(botSidebarExpandedMinimum, Math.min(520,
    Number.isFinite(width) && width >= botSidebarExpandedMinimum ? width : fallback))
}

export function savedBotSidebarWidth(state = {}, fallback = 322) {
  return Number.isFinite(state.sidebarWidth) && state.sidebarWidth >= botSidebarCompactWidth
    ? settleBotSidebarWidth(state.sidebarWidth) : expandedBotSidebarWidth(state, fallback)
}

export function botSidebarWidthPatch(width) {
  const sidebarWidth = settleBotSidebarWidth(width)
  return { sidebarWidth, ...(sidebarWidth >= botSidebarExpandedMinimum ? { sidebarExpandedWidth: sidebarWidth } : {}) }
}

export function botSidebarKeyWidth(width, key, expandedWidth, maximum) {
  if (key === 'Home') return botSidebarCompactWidth
  if (key === 'End') return maximum
  if (key === 'ArrowRight') return width < botSidebarCompactThreshold ? expandedWidth : width + 16
  return width <= botSidebarExpandedMinimum ? botSidebarCompactWidth : width - 16
}
