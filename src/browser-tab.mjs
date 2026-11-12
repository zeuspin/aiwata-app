import { webPreviewAddress } from './web-preview.mjs'

const imageData = value => typeof value === 'string' && value.length <= 180000 &&
  /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null

export function updateBrowserPageMetadata(browser, url, fields) {
  if (!webPreviewAddress(url) || browser.visited !== url) return browser
  const previous = browser.page?.url === url ? browser.page : { url }
  const page = { ...previous }
  if (Object.hasOwn(fields, 'title')) page.title = typeof fields.title === 'string'
    ? fields.title.replace(/[\p{Cc}\s]+/gu, ' ').trim().slice(0, 240) : ''
  if (Object.hasOwn(fields, 'favicon')) page.favicon = imageData(fields.favicon)
  return JSON.stringify(page) === JSON.stringify(previous) ? browser : { ...browser, page }
}

export function browserTabInfo(browser, customTitle) {
  const url = webPreviewAddress(browser?.visited)
  const page = url && browser.page?.url === url ? browser.page : null
  return { title: customTitle || page?.title || (url ? new URL(url).hostname : '浏览器'), favicon: imageData(page?.favicon) }
}
