import React, { useEffect, useState } from 'react'

function policyText(config) {
  const sessions = (config.config ?? config).sessions ?? {}
  if (!sessions.auto_prune) return '未启用自动清理。归档仅隐藏会话，不会因归档而自动删除。'
  const days = sessions.retention_days ?? 90, hours = sessions.min_interval_hours ?? 24
  if (!Number.isFinite(days) || days < 0 || !Number.isFinite(hours) || hours < 0) return '自动清理配置异常，无法确定保留时间，请检查原生会话设置。'
  return `自动清理已开启：已结束且未置顶的会话闲置 ${days} 天后符合清理条件；维护检查最短间隔 ${hours} 小时。运行中或受写入保护的记录会保留，实际删除由后端维护触发，不从归档时间起算，也不保证在固定时刻执行。`
}

export function ArchivePolicy({ live }) {
  const [snapshot, setSnapshot] = useState(null)
  useEffect(() => {
    if (!live?.api) return
    let active = true
    void live.api('/api/config').then(config => {
      if (active) setSnapshot({ owner: live, text: policyText(config) })
    }).catch(() => {
      if (active) setSnapshot({ owner: live, text: '无法读取当前工作区的自动清理配置，请重新打开归档记录重试。' })
    })
    return () => { active = false }
  }, [live])
  const text = !live ? '演示模式：不执行后端自动清理。'
    : !live.api ? '当前连接未提供自动清理配置，无法确认清理时间。'
      : snapshot?.owner === live ? snapshot.text : '正在读取当前工作区的自动清理配置…'
  return <p className="context-label archive-policy" role="status">{text}</p>
}
