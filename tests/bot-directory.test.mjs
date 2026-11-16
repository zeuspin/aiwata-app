import test from 'node:test'
import assert from 'node:assert/strict'
import {directorySections, updateDirectory, conversationPreview} from '../src/bot-directory.mjs'

test('custom categories mix Bots and rooms, keep primary separate, and preserve conversation ownership', () => {
  const record={bots:[{id:'ordinary',name:'默认名字'}, {id:'owner',isDefault:true,name:'自定义主 Bot'}],groups:[{id:'room',name:'协作群',members:['ordinary']}],chats:{}}
  let state=updateDirectory({}, {type:'save-category',id:'writing',name:'文案编写组'})
  state=updateDirectory(state,{type:'move',id:'ordinary',category:'writing'})
  state=updateDirectory(state,{type:'move',id:'room',category:'writing'})
  const sections=directorySections(record,state)
  assert.deepEqual(sections.find(s=>s.id==='writing').items.map(i=>i.id),['ordinary','room'])
  assert.ok(sections.every(s=>s.items.every(i=>i.id!=='owner')))
  assert.deepEqual(record.groups[0].members,['ordinary'])
  state=updateDirectory(state,{type:'remove-category',id:'writing'})
  assert.deepEqual(directorySections(record,state).at(-1).items.map(i=>i.id),['ordinary','room'])
  assert.equal(state.placements.ordinary,undefined)
})

test('pinning stays inside a category and stale category assignments recover to ungrouped', () => {
  const record={bots:[{id:'a',name:'A'},{id:'b',name:'B'}],groups:[],chats:{}}
  let state=updateDirectory({placements:{a:'deleted'}},{type:'pin',id:'b'})
  assert.deepEqual(directorySections(record,state).at(-1).items.map(i=>i.id),['b','a'])
  state=updateDirectory(state,{type:'pin',id:'b'})
  assert.deepEqual(directorySections(record,state).at(-1).items.map(i=>i.id),['a','b'])
  assert.throws(()=>updateDirectory({categories:[{id:'a',name:'写作'}]},{type:'save-category',id:'b',name:' 写作 '}),/已存在/)
})

test('preview reads latest actual message and does not expose tool arguments', () => {
  assert.equal(conversationPreview({messages:[{role:'agent',text:'第一行\n第二行'},{role:'tool',text:'secret tool output'}]},{}),'第一行 第二行')
  assert.equal(conversationPreview({messages:[]},{description:'整理资料'}),'整理资料')
})
