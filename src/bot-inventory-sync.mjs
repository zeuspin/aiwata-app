import { botManagementSkillName, botManagementSkillContent, legacyBotManagementSkillContent } from './bot-management-skill.mjs'

export async function ensureBotManagementSkill(live, active, executeStep) {
  if (!live?.native || !live.skill || !active()) return
  const profile = live.route?.profile ?? 'default'
  const skill=(method,params={})=>executeStep?executeStep({kind:'skill',method,params,profile},()=>live.skill(method,profile,params)):live.skill(method,profile,params)
  const skills = await skill('list')
  if (!active()) return
  if (!Array.isArray(skills)) throw new Error('无法读取主 Bot 技能列表。')
  if (skills.some(skill => skill.name === botManagementSkillName)) {
    const existing = await skill('content', { id: botManagementSkillName })
    if (!active()) return
    const prior = existing?.content
    const legacy = [legacyBotManagementSkillContent, legacyBotManagementSkillContent.replace('清单中.', '清单中。')]
    if (legacy.includes(prior)) await skill('save', { id: botManagementSkillName, content: botManagementSkillContent })
    return
  }
  await skill('create', { id: botManagementSkillName, content: botManagementSkillContent })
}

export function createBotInventorySync({ live, api, active, refresh, report }) {
  const record = api.current()
  const owns = () => active() && api.current() === record
  let pending = null, requested = false
  return () => {
    if (!live?.bots || !owns()) return Promise.resolve()
    requested = true
    if (pending) return pending
    pending = (async () => {
      while (requested && owns()) {
        requested = false
        try {
          const inventory = await live.bots()
          if (!owns()) return
          api.syncGatewayBots(inventory.bots)
          refresh()
        } catch (error) { if (owns()) report('Bot 列表同步失败：' + error.message, true) }
      }
    })().finally(() => { pending = null })
    return pending
  }
}
