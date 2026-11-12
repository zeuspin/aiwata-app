import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { runTourEngine } from '../src/vendor/aiwata-tour/engine.mjs'
import { collectTourTargets } from '../src/vendor/aiwata-tour/collect-targets.mjs'
const assets = Promise.all(['driver.js.iife.js', 'driver.css'].map(name => readFile(new URL('../src/vendor/aiwata-tour/' + name, import.meta.url), 'utf8')))
export async function tourPreview(guest, action, current) {
  if (!current()) return { success: false, error: '网页已切换。' }
  const [driver, css] = await assets
  // Asset loading and Chromium evaluation both yield: re-check at each boundary.
  if (!current()) return { success: false, error: '网页已切换。' }
  const token = randomUUID()
  const lease = await guest.executeJavaScript(`(() => { window.__aiwataTourDocumentKey ||= ${JSON.stringify(token)}; return { token: window.__aiwataTourDocumentKey, url: location.href }; })()`)
  if (!current() || typeof lease?.token !== 'string' || typeof lease?.url !== 'string') return { success: false, error: '网页已切换。' }
  const source = `(() => {
    if (window.__aiwataTourDocumentKey !== ${JSON.stringify(lease.token)} || location.href !== ${JSON.stringify(lease.url)}) return { success: false, error: '网页已切换。' };
    ${driver}\n
    let style = document.getElementById('__aiwata_tour_style');
    if (!style) { style = document.createElement('style'); style.id = '__aiwata_tour_style'; style.textContent = ${JSON.stringify(css)}; document.head.append(style); }
    const holder = window.__aiwataTourHolder ||= {};
    return (${runTourEngine.toString()})(window.driver.js.driver, holder, ${JSON.stringify(action)}, (${collectTourTargets.toString()}), document);
  })()`
  const result = await guest.executeJavaScript(source, true)
  return current() ? result : { success: false, error: '网页已切换。' }
}
