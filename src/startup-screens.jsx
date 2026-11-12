import React from 'react'
import { desktopMilestone, desktopSteps, installProgress } from './startup-state.mjs'
import './startup.css'

const stageLabels = {
  running: '进行中', succeeded: '完成', skipped: '已跳过', failed: '失败', waiting: '等待中',
}

function StartupFrame({ label, preview, children }) {
  return <main className="startup-screen">
    <header className="startup-header">
      <span><img src="./aiwata-app-icon.svg" alt="" />{label}</span>
      {preview && <small>本地预览</small>}
    </header>
    <div className="startup-body">{children}</div>
  </main>
}

function StartupLogo({ draw }) {
  return <img className="startup-logo" src={'./aiwata-banner.svg' + (draw ? '#draw' : '')}
    width="1980" height="442" alt="AIWATA" />
}

function StageList({ stages, label }) {
  return <ol className="startup-stages" aria-label={label}>{stages.map(stage => {
    const state = stage.state ?? 'waiting'
    return <li key={stage.name} data-state={state} aria-current={state === 'running' ? 'step' : undefined}>
      <span className="startup-stage-dot" aria-hidden="true">{state === 'succeeded' ? '✓' : state === 'skipped' ? '–' : state === 'failed' ? '×' : ''}</span>
      <span>{stage.title}</span><small>{stageLabels[state]}</small>
    </li>
  })}</ol>
}

function Progress({ label, percent }) {
  return <div className="startup-progress">
    <div><span>{label}</span><span>{percent == null ? '准备中' : percent + '%'}</span></div>
    <progress value={percent ?? undefined} max="100" aria-label={label} />
  </div>
}

function StartupLogs({ logs, logPath, onOpenLogs }) {
  if (!logs?.length && !logPath && !onOpenLogs) return null
  return <details className="startup-logs">
    <summary>查看日志</summary>
    {logs?.length > 0 && <pre aria-label="运行日志" tabIndex={0}>{logs.map(entry => entry.line ?? entry).join('\n')}</pre>}
    {logPath && <code>{logPath}</code>}
    {onOpenLogs && <button type="button" onClick={onOpenLogs}>打开日志目录</button>}
  </details>
}

export function InstallScreen({ install, launch, home, logPath, preview, onStart, onCancel, onLaunch, onOpenLogs }) {
  const { status, stages, logs, error } = install
  const { done, total, percent } = installProgress(stages)
  const waiting = status === 'idle'
  const running = status === 'running'
  const completed = status === 'completed'
  const title = waiting ? '安装 AIWATA' : running ? '正在安装 AIWATA' : completed ? '安装完成' : '安装未完成'

  return <StartupFrame label="AIWATA 安装程序" preview={preview}>
    <section className="startup-install" aria-labelledby="startup-install-title">
      <div className="startup-intro">
        <StartupLogo draw={waiting || running} />
        <div aria-live="polite">
          <h1 id="startup-install-title">{title}</h1>
          <p>{waiting ? '首次安装需要联网下载运行组件并准备桌面应用。'
            : running ? '正在准备本地运行环境，请保持网络连接。'
              : completed ? '桌面应用已准备好。打开后会继续连接本地网关。'
                : '你可以查看日志，然后重新开始安装。'}</p>
        </div>
        {error && <p className="startup-error" role="alert">{error}</p>}
        {launch.error && <p className="startup-error" role="alert">{launch.error}</p>}
        <div className="startup-actions">
          {waiting && <button className="startup-primary" type="button" onClick={onStart}>开始安装 <span aria-hidden="true">→</span></button>}
          {running && <button className="startup-secondary" type="button" onClick={onCancel} disabled={install.cancelling}>
            {install.cancelling ? '正在取消…' : '取消安装'}</button>}
          {status === 'failed' && <button className="startup-primary" type="button" onClick={onStart}>重试安装 <span aria-hidden="true">→</span></button>}
          {completed && <button className="startup-primary" type="button" disabled={launch.pending} onClick={onLaunch}>
            {launch.pending ? '正在打开桌面…' : '打开 AIWATA'} <span aria-hidden="true">→</span></button>}
        </div>
      </div>
      <aside className="startup-install-detail" aria-label={waiting ? '安装信息' : '安装进度'}>
        {waiting ? <>
          <h2>安装信息</h2>
          <dl className="startup-install-meta">
            <div><dt>安装与数据目录</dt><dd><code>{home}</code></dd></div>
            <div><dt>首次安装</dt><dd>准备运行组件、配置和桌面应用</dd></div>
            <div><dt>后续启动</dt><dd>打开应用后连接运行环境</dd></div>
          </dl>
        </> : <>
          <Progress label={total ? '已完成 ' + done + ' / ' + total + ' 步' : '正在获取安装步骤'} percent={total ? percent : null} />
          <StageList stages={stages} label="安装步骤" />
        </>}
        <StartupLogs logs={logs} logPath={logPath} onOpenLogs={onOpenLogs} />
      </aside>
    </section>
  </StartupFrame>
}

export function DesktopLoadingScreen({ boot, preview, onRetry, onOpenLogs, logs }) {
  const step = desktopMilestone(boot)
  const stages = desktopSteps.map(({ label, phase }, index) => ({
    name: phase, title: label, state: index < step ? 'succeeded'
      : index === step ? boot.error ? 'failed' : 'running' : null,
  }))

  return <StartupFrame label="AIWATA 桌面" preview={preview}>
    <section className="startup-loading" aria-labelledby="startup-loading-title">
      <StartupLogo draw={!boot.error} />
      <div className="startup-loading-copy" aria-live="polite">
        <h1 id="startup-loading-title">{boot.error ? '环境准备未完成' : '正在准备工作环境'}</h1>
        <p>{boot.message}</p>
      </div>
      <div className="startup-loading-detail">
        <Progress label="启动进度" percent={boot.progress} />
        <StageList stages={stages} label="启动步骤" />
        <StartupLogs logs={logs} onOpenLogs={onOpenLogs} />
      </div>
      {boot.error && <div className="startup-loading-recovery">
        <p className="startup-error" role="alert">{boot.error}</p>
        <button type="button" className="startup-primary" onClick={onRetry}>重试启动 <span aria-hidden="true">→</span></button>
      </div>}
    </section>
  </StartupFrame>
}
