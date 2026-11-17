import { onDesignThemeChange, readDesignColor, readDesignValue } from './design/theme-runtime.mjs'
import { driver } from './vendor/aiwata-tour/driver.js.mjs'
import { runTourEngine } from './vendor/aiwata-tour/engine.mjs'
import { collectTourTargets } from './vendor/aiwata-tour/collect-targets.mjs'
import './vendor/aiwata-tour/driver.css'

export function tourAction(params) {
  if (!params || !['targets', 'show', 'start', 'next', 'prev', 'stop'].includes(params.action)) throw new Error('导览操作无效。')
  const action = { kind: params.action, selector: params.selector, side: params.side, startAt: params.step_index,
    steps: params.steps, text: params.text, title: params.title }
  if (action.kind === 'start' && !Array.isArray(action.steps)) action.steps = [
    { selector: '[data-tour="sessions"]', title: '项目与会话', text: '在这里选择项目、Bot 和会话。', pane: 'sessions' },
    { selector: '[data-tour="composer"]', title: '开始工作', text: '输入需求，与 Agent 协作。' },
    ...(params.preset === 'quick' ? [] : [{ selector: '[data-tour="tool-controls"]', title: '工作工具', text: '打开网页、终端和项目文件。' }]),
  ]
  return action
}
export function createAppTour(doc, host) {
  const holder = {}
  const presentation = () => ({
    overlayColor: readDesignColor(doc.documentElement, 'comp.tour.overlay-color'),
    ...Object.fromEntries(['overlayOpacity', 'stagePadding', 'stageRadius', 'popoverOffset'].map(key => [key, Number.parseFloat(readDesignValue(doc.documentElement, 'comp.tour.' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())))])),
  })
  const releaseTheme = onDesignThemeChange(doc.documentElement, () => {
    if (!holder.driver?.isActive()) return
    const next = presentation()
    holder.driver.setConfig({ ...holder.driver.getConfig(), ...next })
    const overlay = doc.querySelector('svg.driver-overlay path')
    if (overlay) { overlay.style.fill = next.overlayColor; overlay.style.opacity = String(next.overlayOpacity) }
    holder.driver.refresh()
  })
  return {
    run(params) { return runTourEngine(driver, holder, tourAction(params), collectTourTargets, doc, {
      ...presentation(),
      animate: !doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches,
    }, host) },
    dispose() { this.stop(); releaseTheme() },
    stop() { holder.driver?.destroy(); holder.release?.(); holder.driver = undefined; holder.release = undefined },
  }
}
