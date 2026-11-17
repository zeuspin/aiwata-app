import { designValue } from './aiwata-tokens.mjs'

const legacyRoles = { '--text': 'text-primary', '--muted': 'text-muted', '--faint': 'text-faint',
  '--surface': 'surface-primary', '--tool-surface': 'surface-tool', '--sidebar': 'surface-sidebar',
  '--app-surface': 'surface-canvas', '--hover': 'surface-hover', '--selected': 'surface-selected',
  '--line': 'border-default', '--accent': 'action-primary' }
export const designCssName = name => '--ai-' + name.replaceAll('.', '-')

export function applyDocumentTheme(root, properties) {
  const prior = new Map()
  const paint = (name, value) => {
    prior.set(name, [root.style.getPropertyValue(name), root.style.getPropertyPriority(name)])
    root.style.setProperty(name, value)
  }
  paint('color-scheme', properties.colorScheme || 'light')
  for (const [name, value] of Object.entries(properties)) {
    if (legacyRoles[name]) paint('--ai-sys-color-' + legacyRoles[name], value)
  }
  return () => {
    for (const [name, [value, priority]] of prior) {
      if (value) root.style.setProperty(name, value, priority)
      else root.style.removeProperty(name)
    }
  }
}

function themeStamp(root) {
  const values = [...root.style].filter(name => name.startsWith('--ai-') || name === 'color-scheme')
    .map(name => name + ':' + root.style.getPropertyValue(name)).join(';')
  return root.className + '|' + (root.dataset.aiTheme || '') + '|' + values
}

export function onDesignThemeChange(element, callback) {
  const root = element.ownerDocument.documentElement
  let previous = themeStamp(root)
  const observer = new element.ownerDocument.defaultView.MutationObserver(() => {
    const next = themeStamp(root)
    if (next !== previous) { previous = next; callback() }
  })
  observer.observe(root, { attributes: true, attributeFilter: ['style', 'class', 'data-ai-theme'] })
  return () => observer.disconnect()
}

export function readDesignValue(element, name) {
  return element.ownerDocument.defaultView.getComputedStyle(element).getPropertyValue(designCssName(name)).trim() || designValue(name)
}

export function readDesignColor(element, name) {
  const document = element.ownerDocument
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;'
  // Preserve the supplied Canvas palette; native controls retain forced-color behavior.
  probe.style.forcedColorAdjust = 'none'
  probe.style.color = readDesignValue(element, name)
  element.append(probe)
  const color = document.defaultView.getComputedStyle(probe).color
  probe.remove()
  // Canvas normalizes modern color expressions for xterm and native color APIs.
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

export function readDesignHexColor(element, name) {
  const channels = readDesignColor(element, name).match(/[\d.]+/g).slice(0, 3)
  return '#' + channels.map(channel => Number(channel).toString(16).padStart(2, '0')).join('')
}

export function readDesignFontSize(element, name) {
  const document = element.ownerDocument
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;'
  probe.style.fontSize = readDesignValue(element, name)
  element.append(probe)
  const pixels = Number.parseFloat(document.defaultView.getComputedStyle(probe).fontSize)
  probe.remove()
  return pixels
}

export function terminalPresentation(element, { agent = false } = {}) {
  const prefix = agent ? 'comp.agent-terminal.' : 'comp.terminal.'
  return {
    theme: Object.fromEntries(["background","foreground","cursor","cursorAccent","selectionBackground","black","red","green","yellow","blue","magenta","cyan","white","brightBlack","brightRed","brightGreen","brightYellow","brightBlue","brightMagenta","brightCyan","brightWhite"].map(key =>
      [key, readDesignColor(element, prefix + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()))])),
    fontSize: readDesignFontSize(element, prefix + 'font-size'),
    lineHeight: Number.parseFloat(readDesignValue(element, prefix + 'line-height')),
    fontFamily: readDesignValue(element, prefix + 'font-family'),
  }
}

export function watchTerminalTheme(terminal, element, { agent = false, fit, updateFontFamily = true } = {}) {
  function apply() {
    const next = terminalPresentation(element, { agent })
    const geometry = terminal.options.fontSize !== next.fontSize || terminal.options.lineHeight !== next.lineHeight
      || updateFontFamily && terminal.options.fontFamily !== next.fontFamily
    terminal.options.theme = next.theme
    terminal.options.fontSize = next.fontSize
    terminal.options.lineHeight = next.lineHeight
    if (updateFontFamily) terminal.options.fontFamily = next.fontFamily
    if (geometry) fit?.()
  }
  apply()
  return onDesignThemeChange(element, apply)
}
