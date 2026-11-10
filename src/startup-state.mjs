export const initialInstall = {
  status: 'idle', stages: [], logs: [], installRoot: null, error: null,
}

// Consumes the payloads of the existing Tauri "bootstrap" channel.
export function applyBootstrapEvent(state, event) {
  if (event.type === 'manifest') {
    return { ...state, status: 'running', error: null, installRoot: null,
      stages: event.stages.map(stage => ({ ...stage, state: null })) }
  }
  if (event.type === 'log') {
    return { ...state, logs: [...state.logs.slice(-1999), event] }
  }
  if (state.status !== 'running') return state
  switch (event.type) {
    case 'stage':
      return { ...state, stages: state.stages.map(stage => stage.name === event.name
        ? { ...stage, state: event.state, durationMs: event.durationMs, error: event.error } : stage) }
    case 'complete':
      return { ...state, status: 'completed', installRoot: event.installRoot }
    case 'failed':
      return { ...state, status: 'failed', error: event.error,
        stages: state.stages.map(stage => stage.name === event.stage
          ? { ...stage, state: 'failed', error: event.error } : stage) }
    default:
      return state
  }
}

export function installProgress(stages) {
  const done = stages.filter(stage => stage.state === 'succeeded' || stage.state === 'skipped').length
  return { done, total: stages.length, percent: stages.length ? Math.round(done / stages.length * 100) : 0 }
}

export const desktopSteps = [
  { label: '准备本地运行环境', phase: 'backend.runtime' },
  { label: '启动并连接网关', phase: 'renderer.gateway.connect' },
  { label: '载入设置与会话', phase: 'renderer.config' },
]

const desktopMilestones = {
  'renderer.init': 0, 'renderer.boot': 0, 'backend.resolve': 0,
  'backend.runtime': 0, 'runtime.external': 0,
  'backend.ready': 1, 'renderer.gateway.connect': 1,
  'renderer.config': 2, 'renderer.ready': 3,
}

export function desktopMilestone(boot) {
  return desktopMilestones[boot.phase] ?? (boot.progress >= 97 ? 2 : boot.progress >= 94 ? 1 : 0)
}
