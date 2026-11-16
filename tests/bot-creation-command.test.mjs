import test from 'node:test'
import assert from 'node:assert/strict'
import { botCreationCommand } from '../src/bot-creation-command.mjs'
test('clear creation requests automatically select the native skill for the main Bot',()=>{
 const live={native:true,route:{profile:'default'}}
 for(const text of ['帮我创建一个独立的 Bot，专门写中文文案','创建一个每小时讲冷笑话的机器人','Please create a new bot for writing']) {
  assert.deepEqual(botCreationCommand(live,{gatewayProfile:'default'},text),['aiwata-bot-management',text])
 }
 assert.equal(botCreationCommand(live,{gatewayProfile:'writer'},'创建一个文案Bot'),null)
})
test('ordinary chat, explanations, negation and mock conversations do not trigger creation skill',()=>{
 const live={native:true,route:{profile:'default'}},chat={gatewayProfile:'default'}
 for(const text of ['你好','如何创建一个 Bot？','不要创建新的 Bot','解释一下创建机器人有什么用','把下面的文案写得更好','刚才你新建了一个 Bot，为什么列表没有？','之前创建过一个助手，我想看它的记录'])assert.equal(botCreationCommand(live,chat,text),null,text)
 assert.equal(botCreationCommand(null,chat,'创建新的 Bot'),null)
})
