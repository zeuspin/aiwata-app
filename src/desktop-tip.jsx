import React, { useLayoutEffect, useRef, useState } from 'react'
import './desktop-tip.css'

// Match the native tip contract: no overlay, focus capture or Escape handler.
// A tip follows its subject across re-renders and retires after 22 seconds.
export function DesktopTip({ tip, onClose }) {
  const bubble = useRef(null), close = useRef(onClose), owner = useRef(tip)
  const [position, setPosition] = useState(null)
  close.current = onClose
  owner.current = tip
  useLayoutEffect(() => {
    if (!tip) return
    const doc = bubble.current.ownerDocument, environment = doc.defaultView
    let marked
    const unmark = () => marked?.removeAttribute('data-tip-target')
    const sync = () => {
      let anchor
      try { anchor = doc.querySelector(tip.selector) } catch { tip.onReady?.({ success: false, error: 'The tip selector is invalid.' }); close.current(); return }
      const rect = anchor?.getBoundingClientRect()
      if (!rect?.width || !rect.height) { tip.onReady?.({ success: false, error: 'The tip target disappeared.' }); close.current(); return }
      if (marked !== anchor) { unmark(); marked = anchor; marked.setAttribute('data-tip-target', '') }
      const box = bubble.current.getBoundingClientRect(), width = box.width || 260, height = box.height || 80
      let side = ['top', 'right', 'bottom', 'left'].includes(tip.side) ? tip.side : 'top'
      const room = { top: rect.top, bottom: environment.innerHeight - rect.bottom, left: rect.left, right: environment.innerWidth - rect.right }
      const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
      if (room[side] < (['top', 'bottom'].includes(side) ? height : width) + 20 && room[opposite[side]] > room[side]) side = opposite[side]
      const centerX = rect.left + (rect.width - width) / 2, centerY = rect.top + (rect.height - height) / 2
      const [left, top] = { top: [centerX, rect.top - height - 12], bottom: [centerX, rect.bottom + 12],
        left: [rect.left - width - 12, centerY], right: [rect.right + 12, centerY] }[side]
      setPosition({ owner: tip, left: Math.max(12, Math.min(left, environment.innerWidth - width - 12)),
        top: Math.max(12, Math.min(top, environment.innerHeight - height - 12)), side })
    }
    sync()
    const poll = environment.setInterval(sync, 1000)
    const timer = environment.setTimeout(() => close.current(), 22000)
    environment.addEventListener('resize', sync); doc.addEventListener('scroll', sync, true)
    return () => {
      // StrictMode replays layout effects without retiring the actual bubble.
      queueMicrotask(() => {
        if (owner.current !== tip || !bubble.current?.isConnected) tip.onReady?.({ success: false, error: 'The tip owner changed before display was confirmed.' })
      })
      unmark(); environment.clearInterval(poll); environment.clearTimeout(timer)
      environment.removeEventListener('resize', sync); doc.removeEventListener('scroll', sync, true) }
  }, [tip])
  useLayoutEffect(() => {
    if (position?.owner === tip) tip?.onReady?.({ success: true, display_confirmed: true, selector: tip.selector })
  }, [tip, position])
  if (!tip) return null
  return <div ref={bubble} className="desktop-tip" role="status" aria-live="polite" data-side={position?.side}
    style={{ left: position?.left, top: position?.top, visibility: position?.owner === tip ? 'visible' : 'hidden' }}>
    <div>{tip.title && <strong>{tip.title}</strong>}<p>{tip.text}</p></div>
    <button type="button" aria-label="关闭提示" onClick={onClose}>×</button>
  </div>
}
