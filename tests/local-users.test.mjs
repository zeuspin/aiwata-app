import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserLocalUsers } from '../src/local-users.mjs'
function fixture(){const values=new Map();return {values,storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}}}
test('two initial users persist; create validates names and deleting all never resets registration',async()=>{
 const f=fixture(),service=createBrowserLocalUsers(f.storage)
 assert.equal((await service.list()).users.length,2)
 await assert.rejects(service.create('  '),/用户名/)
 const created=await service.create(' 第三个用户 ')
 assert.equal(created.name,'第三个用户');assert.ok(created.id)
 await assert.rejects(service.create('第三个用户'),/已存在/)
 for(const user of (await service.list()).users)await service.remove(user.id)
 assert.deepEqual((await createBrowserLocalUsers(f.storage).list()).users,[])
})
test('deleting a demo user clears only its persisted data and attachment ownership',async()=>{
 const f=fixture(),removed=[];const service=createBrowserLocalUsers(f.storage,{removeAccount:async id=>removed.push(id)})
 const {users}=await service.list();const [first,second]=users
 f.values.set('aiwata-ui-prototype:v1:accounts',JSON.stringify({[first.id]:{draft:'first'},[second.id]:{draft:'keep'}}))
 await service.remove(first.id)
 assert.deepEqual(removed,[first.id]);assert.deepEqual(JSON.parse(f.values.get('aiwata-ui-prototype:v1:accounts')),{[second.id]:{draft:'keep'}})
 await assert.rejects(service.activate(first.id),/不存在/)
})
test('registry corruption fails visibly rather than silently regenerating users',async()=>{
 const f=fixture();f.values.set('aiwata-app:local-users:v1','{bad')
 await assert.rejects(createBrowserLocalUsers(f.storage).list(),/登记/)
 assert.equal(f.values.get('aiwata-app:local-users:v1'),'{bad')
})
test('attachment cleanup cannot overwrite another user creation or newer sibling workspace data',async()=>{
 const f=fixture();let release;const wait=new Promise(resolve=>release=resolve)
 const service=createBrowserLocalUsers(f.storage,{removeAccount:()=>wait})
 const {users:[first,second]}=await service.list()
 const deleting=service.remove(first.id)
 const added=await service.create('并发创建')
 f.values.set('aiwata-ui-prototype:v1:accounts',JSON.stringify({[second.id]:{draft:'newer'}}))
 release();await deleting
 assert.ok((await service.list()).users.some(user=>user.id===added.id))
 assert.deepEqual(JSON.parse(f.values.get('aiwata-ui-prototype:v1:accounts')),{[second.id]:{draft:'newer'}})
})
