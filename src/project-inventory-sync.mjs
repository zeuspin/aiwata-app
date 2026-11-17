// Projects belong to the gateway; an Agent write invalidates the same sidebar
// cache as a manual project operation. Never move navigation while refreshing it.
export function createProjectInventorySync({ live, api, active, refresh, report }) {
  const record = api.current()
  const owns = () => active() && api.current() === record
  let pending = null, requested = false
  return () => {
    if (!live?.rpc || !live.sessions || !owns()) return Promise.resolve()
    requested = true
    if (pending) return pending
    pending = (async () => {
      while (requested && owns()) {
        requested = false
        const revision = api.gatewayInventoryRevision()
        try {
          const [projects, inventory] = await Promise.all([live.rpc('projects.list'), live.sessions()])
          if (!owns()) return
          if (revision !== api.gatewayInventoryRevision()) { requested = true; continue }
          api.syncGatewayInventory(projects.projects, inventory.sessions)
          refresh()
        } catch (error) { if (owns()) report('项目列表同步失败：' + error.message, true) }
      }
    })().finally(() => { pending = null })
    return pending
  }
}
