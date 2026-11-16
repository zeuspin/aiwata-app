import { botManagementSkillName } from './bot-management-skill.mjs'
export function botCreationCommand(live, chat, text) {
  if (!live?.native || !chat.gatewayProfile || chat.gatewayProfile !== (live.route?.profile ?? 'default')) return null
  const match = /(?:创建|新建|新增|创造|建立|制作|生成|做|弄|\bcreate\b|\bmake\b|\bbuild\b|\badd\b)[^。！？!?\n]{0,100}(?:\bbots?\b|机器人|助手)/i.exec(text)
  if (!match || /^(?:创建|新建|新增|创造|建立|制作|生成|做|弄)(?:了|过)/.test(match[0])) return null
  const before = text.slice(0, match.index)
  if (/(?:如何|怎样|怎么|解释|说明|介绍)[^。！？!?\n]*$/.test(before) || /(?:不要|不用|不必|不想|别|勿|do not|don't)\s*(?:再)?\s*$/i.test(before)) return null
  return [botManagementSkillName, text]
}
