import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { makeTerminalReader } from './terminal-reader.mjs'
import '@xterm/xterm/css/xterm.css'
import './live-terminal.css'

export default function AgentTerminal({ process, onReader }) {
  const element = useRef(null), state = useRef(null), callbacks = useRef(onReader)
  callbacks.current = onReader
  useEffect(() => {
    const terminal = new Terminal({ disableStdin: true, fontSize: 13, scrollback: 1500,
      theme: { background: '#232724', foreground: '#e9eee8' } })
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(element.current); fit.fit()
    const observer = new ResizeObserver(() => fit.fit()); observer.observe(element.current)
    state.current = { terminal, output: '' }
    callbacks.current?.(makeTerminalReader(terminal))
    return () => { callbacks.current?.(null); observer.disconnect(); terminal.dispose(); state.current = null }
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
