const controllers = new WeakMap()
const properties = ['--bot-look-x', '--bot-look-y', '--bot-lean', '--bot-blink']

// One input listener and one active frame clock per window, irrespective of list length.
export function createBotMotionController(view) {
  const document = view.document
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = view.matchMedia('(hover: hover) and (pointer: fine)')
  const entries = new Map()
  let frame = 0, timer = 0, lastTime = null, present = true, listening = false
  const now = () => view.performance.now()
  const allowed = () => !reduced.matches && pointer.matches && !document.hidden && present
  const nextBlink = () => now() + 2600 + Math.random() * 4200

  function paint(element, entry, blink = 1) {
    element.style.setProperty('--bot-look-x', (entry.x * 2.6).toFixed(3) + 'px')
    element.style.setProperty('--bot-look-y', (entry.y * 1.8).toFixed(3) + 'px')
    element.style.setProperty('--bot-lean', (entry.x * 4).toFixed(3) + 'deg')
    element.style.setProperty('--bot-blink', blink.toFixed(3))
  }

  function clearMotion() {
    if (frame) view.cancelAnimationFrame(frame)
    if (timer) view.clearTimeout(timer)
    frame = timer = 0
    lastTime = null
    for (const [element, entry] of entries) {
      Object.assign(entry, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, blinkStart: null, blinkAt: nextBlink() })
      for (const property of properties) element.style.removeProperty(property)
    }
  }

  function visible(element) {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < view.innerHeight &&
      rect.right > 0 && rect.left < view.innerWidth && !element.closest('[inert]') ? rect : null
  }

  function scheduleBlink() {
    if (timer) view.clearTimeout(timer)
    timer = 0
    if (!allowed() || !entries.size) return
    const deadline = Math.min(...[...entries.values()].map(entry => entry.blinkAt))
    timer = view.setTimeout(() => {
      timer = 0
      const time = now()
      for (const [element, entry] of entries) if (entry.blinkAt <= time + 1) {
        entry.blinkStart = visible(element) ? time : null
        entry.blinkAt = nextBlink()
      }
      startFrame()
      scheduleBlink()
    }, Math.max(0, deadline - now()))
  }

  function stepAxis(entry, axis, dt) {
    const velocity = 'v' + axis, target = 't' + axis
    entry[velocity] += (256 * (entry[target] - entry[axis]) - 28 * entry[velocity]) * dt
    entry[axis] += entry[velocity] * dt
    if (Math.abs(entry[target] - entry[axis]) < .001 && Math.abs(entry[velocity]) < .005) {
      entry[axis] = entry[target]
      entry[velocity] = 0
    }
    return entry[axis] !== entry[target] || entry[velocity] !== 0
  }

  function tick(time) {
    frame = 0
    if (!allowed()) { clearMotion(); return }
    const dt = Math.min((time - (lastTime ?? time - 16)) / 1000, .032)
    lastTime = time
    let moving = false
    for (const [element, entry] of entries) {
      const xMoving = stepAxis(entry, 'x', dt)
      const yMoving = stepAxis(entry, 'y', dt)
      let blink = 1
      if (entry.blinkStart !== null) {
        const age = time - entry.blinkStart
        if (age >= 180) entry.blinkStart = null
        else blink = 1 - .9 * Math.sin(Math.PI * age / 180)
      }
      paint(element, entry, blink)
      moving ||= xMoving || yMoving || entry.blinkStart !== null
    }
    if (moving) frame = view.requestAnimationFrame(tick)
    else lastTime = null
  }

  function startFrame() {
    if (!frame && allowed()) frame = view.requestAnimationFrame(tick)
  }

  function move(event) {
    if (event.pointerType && event.pointerType !== 'mouse') { present = false; clearMotion(); return }
    const wasPresent = present
    present = true
    if (!allowed()) return
    for (const [element, entry] of entries) {
      const rect = visible(element)
      entry.tx = rect ? Math.tanh((event.clientX - rect.left - rect.width / 2) / 150) : 0
      entry.ty = rect ? Math.tanh((event.clientY - rect.top - rect.height / 2) / 150) : 0
    }
    startFrame()
    if (!wasPresent) scheduleBlink()
  }

  function suspend() { present = false; clearMotion() }
  function leave(event) { if (!event.relatedTarget) suspend() }
  function resume() { present = true; sync() }
  function sync() { clearMotion(); scheduleBlink() }

  function connect() {
    listening = true
    view.addEventListener('pointermove', move, { passive: true })
    view.addEventListener('pointerout', leave)
    view.addEventListener('blur', suspend)
    view.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', sync)
    reduced.addEventListener('change', sync)
    pointer.addEventListener('change', sync)
  }

  function disconnect() {
    clearMotion()
    view.removeEventListener('pointermove', move)
    view.removeEventListener('pointerout', leave)
    view.removeEventListener('blur', suspend)
    view.removeEventListener('focus', resume)
    document.removeEventListener('visibilitychange', sync)
    reduced.removeEventListener('change', sync)
    pointer.removeEventListener('change', sync)
    listening = false
  }

  return {
    observe(element) {
      if (!listening) connect()
      entries.set(element, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, blinkStart: null, blinkAt: nextBlink() })
      scheduleBlink()
      return () => {
        entries.delete(element)
        for (const property of properties) element.style.removeProperty(property)
        if (entries.size) scheduleBlink()
        else disconnect()
      }
    },
  }
}

export function observeInteractiveBot(element) {
  const view = element.ownerDocument.defaultView
  if (!controllers.has(view)) controllers.set(view, createBotMotionController(view))
  return controllers.get(view).observe(element)
}
