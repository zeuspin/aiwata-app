import React, { useEffect, useReducer, useRef, useState } from 'react'
import { applyBootstrapEvent, initialInstall } from './startup-state.mjs'
import { DesktopLoadingScreen, InstallScreen } from './startup-screens.jsx'

const installStages = [
  ['prerequisites', '检查系统要求', 650],
  ['repository', '准备 AIWATA 源码', 850],
  ['venv', '创建 Python 环境', 620],
  ['python-deps', '安装 Python 依赖', 1550],
  ['config', '准备配置与技能', 620],
  ['products', '构建桌面应用', 1550],
  ['setup', '交给应用配置模型', 320, true],
  ['gateway', '交给应用配置网关', 320, true],
  ['complete', '完成安装', 600],
]

const initialBoot = { phase: 'renderer.init', message: '正在初始化桌面界面。', progress: 2, running: true, error: null }
const bootSteps = [
  ['backend.resolve', '正在定位 AIWATA 后端。', 8],
  ['backend.runtime', '正在检查本地运行环境。', 28],
  ['backend.runtime', '正在等待本地网关就绪。', 28],
  ['backend.ready', '本地网关已启动。', 94],
  ['renderer.gateway.connect', '正在连接网关。', 95],
  ['renderer.config', '正在载入工作区设置与会话。', 97],
  ['renderer.ready', '工作环境已就绪。', 100],
]

function play(frames, publish) {
  const timers = frames.map(([delay, event]) => setTimeout(() => publish(event), delay))
  return () => timers.forEach(clearTimeout)
}

function installFrames(fail) {
  const manifest = installStages.map(([name, title, , interactive]) => ({
    name, title, category: interactive || name === 'config' ? 'configuration' : 'runtime',
    needs_user_input: Boolean(interactive),
  }))
  const frames = [[160, { type: 'manifest', stages: manifest, protocolVersion: 1 }]]
  let elapsed = 260
  for (const [name, title, durationMs, interactive] of installStages) {
    frames.push([elapsed, { type: 'stage', name, state: 'running' }])
    frames.push([elapsed + 130, { type: 'log', stage: name, stream: 'stdout', line: '开始：' + title }])
    elapsed += durationMs
    if (fail && name === 'python-deps') {
      const error = '下载 Python 依赖时连接超时。请检查网络后重试。'
      frames.push([elapsed, { type: 'stage', name, state: 'failed', durationMs, error }])
      frames.push([elapsed, { type: 'log', stage: name, stream: 'stderr', line: error }])
      frames.push([elapsed, { type: 'failed', stage: name, error }])
      return frames
    }
    frames.push([elapsed, { type: 'stage', name, state: interactive ? 'skipped' : 'succeeded', durationMs }])
    frames.push([elapsed, { type: 'log', stage: name, stream: 'stdout', line: (interactive ? '已跳过：' : '完成：') + title }])
    elapsed += 85
  }
  frames.push([elapsed, { type: 'complete', installRoot: '~/.aiwata', marker: {} }])
  return frames
}

function previewInstallReducer(state, event) {
  if (event.type === 'start') return { ...initialInstall, status: 'running' }
  return applyBootstrapEvent(state, event)
}

function InstallPreview({ scenario }) {
  const [install, dispatch] = useReducer(previewInstallReducer, initialInstall)
  const [launch, setLaunch] = useState({ pending: false, error: null })
  const stop = useRef(null)
  const installAttempts = useRef(0)
  const launchAttempts = useRef(0)
  useEffect(() => () => stop.current?.(), [])

  function start() {
    stop.current?.()
    dispatch({ type: 'start' })
    const fail = scenario === 'failure' && installAttempts.current === 0
    installAttempts.current += 1
    stop.current = play(installFrames(fail), dispatch)
  }

  function cancel() {
    stop.current?.()
    const current = install.stages.find(stage => stage.state === 'running')
    if (current) dispatch({ type: 'stage', name: current.name, state: 'failed', error: '安装已取消。' })
    dispatch({ type: 'log', line: '安装已取消。' })
    dispatch({ type: 'failed', error: '安装已取消。' })
  }

  function openDesktop() {
    stop.current?.()
    setLaunch({ pending: true, error: null })
    const fail = scenario === 'launch-failure' && launchAttempts.current === 0
    launchAttempts.current += 1
    stop.current = play([[900, fail]], failed => {
      if (failed) setLaunch({ pending: false, error: '未收到桌面窗口的启动回执，请重新打开 AIWATA。' })
      else window.location.assign('/')
    })
  }

  return <InstallScreen install={install} launch={launch} home="~/.aiwata" preview
    onStart={start} onCancel={cancel} onLaunch={openDesktop} />
}

function LoadingPreview({ children, scenario, extended }) {
  const [boot, setBoot] = useState(initialBoot)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const fail = scenario === 'failure' && attempt === 0
    const interval = extended ? 740 : 340
    const frames = bootSteps.map(([phase, message, progress], index) => [
      interval * (index + 1), { phase, message, progress, running: progress < 100, error: null },
    ])
    if (fail) {
      frames.splice(2, frames.length, [interval * 3, {
        phase: 'backend.error', message: '暂时无法连接本地网关。', progress: 28, running: false,
        error: '等待网关就绪超时。请重试启动。',
      }])
    }
    return play(frames, setBoot)
  }, [attempt, extended, scenario])

  if (boot.phase === 'renderer.ready') return children
  return <DesktopLoadingScreen boot={boot} preview onRetry={() => {
    setBoot(initialBoot)
    setAttempt(value => value + 1)
  }} />
}

export function StartupPreview({ children }) {
  const location = new URL(window.location.href)
  const scenario = location.searchParams.get('scenario')
  return location.pathname === '/install'
    ? <InstallPreview scenario={scenario} />
    : <LoadingPreview scenario={scenario} extended={location.pathname === '/loading'}>{children}</LoadingPreview>
}
