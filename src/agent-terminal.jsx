import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { makeTerminalReader } from './terminal-reader.mjs'
import '@xterm/xterm/css/xterm.css'
import './live-terminal.css'
import { terminalPresentation, watchTerminalTheme } from './design/theme-runtime.mjs'

export default function AgentTerminal({ process, onReader }) {
  const element = useRef(null), state = useRef(null), callbacks = useRef(onReader)
  callbacks.current = onReader
  useEffect(() => {
    const terminal = new Terminal({ disableStdin: true, scrollback: 1500, ...terminalPresentation(element.current, { agent: true }) })
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(element.current); fit.fit()
    const observer = new ResizeObserver(() => fit.fit()); observer.observe(element.current)
    const stopTheme = watchTerminalTheme(terminal, element.current, { agent: true, fit: () => fit.fit() })
    state.current = { terminal, output: '' }
    callbacks.current?.(makeTerminalReader(terminal))
    return () => { callbacks.current?.(null); stopTheme(); observer.disconnect(); terminal.dispose(); state.current = null }
  }, [process.id])
  useEffect(() => {
    const entry = state.current
    if (!entry) return
    if (!process.output.startsWith(entry.output)) { entry.terminal.reset(); entry.output = '' }
    entry.terminal.write(process.output.slice(entry.output.length)); entry.output = process.output
  }, [process.output])
  return <div className="live-terminal"><p className="live-connection">Agent 后台输出 · {process.id} · 只读</p>
    <div ref={element} className="live-terminal-host" /></div>
}
