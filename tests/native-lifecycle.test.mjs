import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeDesktopClient } from '../src/native-desktop-client.mjs'
import { createNativeRuntime } from '../src/native-runtime.mjs'
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
function fixture(){const events={registry:new Set(),applied:new Set()},calls=[],sockets=[]
 const listen=kind=>callback=>{events[kind].add(callback);return()=>events[kind].delete(callback)}
 class Gateway{constructor(){sockets.push(this)}onEvent(fn){this.event=fn}onRequest(fn){this.requestEvent=fn}onState(fn){this.state=fn}async connect(url){this.url=url;calls.push(['dial',url])}async request(method,params){calls.push(['rpc',method,params]);return method==='client.capabilities'?{}:{ok:true}}close(){this.closed=true;calls.push(['socket-close',this.url])}}
 const host={profile:{getDefault:async()=>({connectionId:'remote',profile:'default'}),rememberConnection:async()=>{}},getConnectionFor:async route=>({...route,mode:'remote',baseUrl:'https://old.example',registryScoped:true}),getGatewayWsUrlFor:async route=>({wsUrl:'wss://old.example/'+route.connectionId+'/'+route.profile}),setActiveConnectionRoute:()=>{},connections:{onChanged:listen('registry'),setLastUsed:async()=>{}},onConnectionApplied:listen('applied'),api:async request=>{calls.push(['api',request]);return{ok:true}}}
 return{host,Gateway,calls,sockets,emit:(kind,value)=>{for(const fn of [...events[kind]])fn(value)},events}}

test('material source edits immediately retire sockets, API and late replies while label saves do not',async()=>{
 const f=fixture(),pending=deferred(),client=await createNativeDesktopClient({...f,route:{connectionId:'remote',profile:'default'}})
 const gateway=f.sockets[0],request=gateway.request.bind(gateway);gateway.request=(method,params)=>method==='session.resume'?pending.promise:request(method,params)
 const frames=[];client.watch(frame=>frames.push(frame),()=>{})
 const late=client.rpc('session.resume',{session_id:'old-session'});await tick()
 f.emit('registry',{connectionId:'remote',reason:'saved'});assert.equal(gateway.closed,undefined)
 f.emit('registry',{connectionId:'remote',reason:'updated'});assert.equal(gateway.closed,true)
 await assert.rejects(client.api('/api/config',{method:'PUT',body:{old:true}}),/关闭|失效/)
 pending.resolve({session_id:'old-runtime'});await assert.rejects(late,/关闭|失效/)
 gateway.event({session_id:'old-runtime',type:'message.complete'});assert.deepEqual(frames,[])
 await client.close();assert.equal(f.events.registry.size,0)
})

test('source invalidation closes local OAuth listeners without canceling old sessions against the new endpoint',async()=>{
 const f=fixture(),callback=deferred();f.host.mcpOauth={listen:async()=>({id:'local-listener',redirectUri:'http://127.0.0.1:1234/callback'}),wait:()=>callback.promise,cancel:async id=>f.calls.push(['listener-close',id])}
 const request=f.Gateway.prototype.request
 f.Gateway.prototype.request=async function(method,params){if(method==='mcp.servers.oauth.start')return{ok:true,session_id:'old-oauth',auth_url:'https://auth.example/?redirect_uri=http%3A%2F%2F127.0.0.1%3A1234%2Fcallback'};return request.call(this,method,params)}
 const client=await createNativeDesktopClient({...f,route:{connectionId:'remote',profile:'default'}})
 await client.capability('mcp.servers.oauth.start','default',{name:'docs'})
 f.emit('registry',{connectionId:'remote',reason:'updated'});await tick();callback.resolve({state:'late',code:'late'});await tick()
 assert.equal(f.calls.filter(row=>row[0]==='listener-close').length,1)
 assert.equal(f.calls.some(row=>row[0]==='rpc'&&['mcp.servers.oauth.cancel','mcp.servers.oauth.callback'].includes(row[1])),false)
 await client.close()
})

test('ConnectionApplied retires all owning Profile sockets instead of keeping an old pooled transport',async()=>{
 const f=fixture(),client=await createNativeDesktopClient({...f,route:{connectionId:'remote',profile:'default'}})
 await client.rpc('session.resume',{session_id:'bot'},'writer');assert.equal(f.sockets.length,2)
 f.emit('applied');assert.equal(f.sockets.every(socket=>socket.closed),true)
 await assert.rejects(client.rpc('projects.list'),/关闭|失效/);await client.close()
})

test('runtime gates the workspace synchronously, refreshes the exact source and never reuses an old snapshot dial',async()=>{
 const f=fixture(),clients=[],descriptor=deferred();let publicUrl='https://old.example'
 const base=f.host.getConnectionFor;f.host.getConnectionFor=async route=>({...await base(route),baseUrl:publicUrl})
 const runtime=await createNativeRuntime({host:f.host,connect:async route=>{const client={route,retire(){this.retired=true},async close(){this.retired=true}};clients.push(client);return client}})
 const original=runtime.snapshot;await original.connect()
 publicUrl='https://new.example';f.host.getConnectionFor=()=>descriptor.promise
 f.emit('registry',{connectionId:'remote',reason:'updated'})
 assert.equal(clients[0].retired,true);assert.equal(runtime.snapshot.status,'reconnecting')
 await assert.rejects(original.connect(),/归属|失效|过期/)
 descriptor.resolve({connectionId:'remote',profile:'default',mode:'remote',baseUrl:publicUrl,registryScoped:true});await tick()
 assert.equal(runtime.snapshot.status,'ready');assert.notEqual(runtime.snapshot.storageNamespace,original.storageNamespace)
 assert.equal(runtime.route.connectionId,'remote');runtime.dispose()
})

test('a removed current connection cannot silently resolve to local and remains selectable as an error',async()=>{
 const f=fixture(),runtime=await createNativeRuntime({host:f.host,connect:async()=>({close:async()=>{}})})
 f.emit('registry',{connectionId:'remote',reason:'removed'});await tick()
 assert.equal(runtime.snapshot.status,'removed');assert.equal(runtime.route.connectionId,'remote')
 await assert.rejects(runtime.snapshot.connect(),/删除|失效|不可用/);runtime.dispose()
})

test('verified installation and public target retain presentation scope on token rotation, but replacement targets never inherit it',async()=>{
 const f=fixture();let install='install-A',endpoint='https://old.example',secret='first-token'
 f.host.getConnectionFor=async route=>({...route,mode:'remote',baseUrl:endpoint,token:secret})
 f.host.api=async()=>({install_id:install})
 const runtime=await createNativeRuntime({host:f.host,connect:async()=>({close:async()=>{}})})
 const first=runtime.snapshot
 secret='rotated-token';f.emit('registry',{connectionId:'remote',reason:'updated'});await tick()
 assert.equal(runtime.snapshot.storageNamespace,first.storageNamespace);assert.equal(runtime.snapshot.accounts[0].id,first.accounts[0].id)
 endpoint='https://new.example';f.emit('registry',{connectionId:'remote',reason:'updated'});await tick()
 assert.notEqual(runtime.snapshot.accounts[0].id,first.accounts[0].id)
 const second=runtime.snapshot;install='install-B';f.emit('registry',{connectionId:'remote',reason:'updated'});await tick()
 assert.notEqual(runtime.snapshot.storageNamespace,second.storageNamespace)
 assert.equal(JSON.stringify(runtime.snapshot).includes(secret),true) // Native descriptor stays transient; persisted keys below contain no credential.
 assert.equal(runtime.snapshot.storageNamespace.includes(secret),false);assert.equal(runtime.snapshot.accounts[0].id.includes(secret),false)
 runtime.dispose()
})

test('unverified identity conservatively isolates material changes and stale in-flight client creation is retired',async()=>{
 const f=fixture(),pending=deferred();const runtime=await createNativeRuntime({host:f.host,connect:()=>pending.promise})
 const first=runtime.snapshot,opening=first.connect(),late={retired:false,retire(){this.retired=true}}
 f.emit('registry',{connectionId:'remote',reason:'saved'});assert.equal(runtime.snapshot,first)
 f.emit('registry',{connectionId:'remote',reason:'updated'});await tick()
 assert.notEqual(runtime.snapshot.storageNamespace,first.storageNamespace)
 pending.resolve(late);await assert.rejects(opening,/失效/);assert.equal(late.retired,true)
 runtime.dispose();assert.equal(f.events.registry.size,0);assert.equal(f.events.applied.size,0)
})

test('editing a different source closes its peer client and the next validation dials a fresh peer without retiring the owner',async()=>{
 const f=fixture(),request=f.Gateway.prototype.request
 f.Gateway.prototype.request=async function(method,params){if(method==='groups.capabilities')return{driver:true,persistent_process:true,methods:['groups.peer.register']};return request.call(this,method,params)}
 const client=await createNativeDesktopClient({...f,route:{connectionId:'remote',profile:'default'},groupPolicy:{peerTargetState:()=>({ready:true}),canonicalGroupRoster:()=>({problem:'validation finished'})}})
 const params={room_id:'room',name:'Room',members:[{connectionId:'remote',profile:'default'},{connectionId:'peer',profile:'writer'}]}
 await assert.rejects(client.room('groups.create',params),/validation finished/)
 assert.equal(f.sockets.length,2)
 f.emit('registry',{connectionId:'peer',reason:'updated'});await tick()
 assert.equal(f.sockets[0].closed,undefined);assert.equal(f.sockets[1].closed,true)
 await assert.rejects(client.room('groups.create',params),/validation finished/)
 assert.equal(f.sockets.length,3);await client.close()
})

test('a registry change during startup is replayed before a caller can acquire the removed source',async()=>{
 const f=fixture(),identity=deferred();f.host.api=()=>identity.promise
 const pending=createNativeRuntime({host:f.host,connect:async()=>({})});await tick()
 f.emit('registry',{connectionId:'remote',reason:'removed'});identity.resolve({install_id:'install-A'})
 const runtime=await pending;assert.equal(runtime.snapshot.status,'removed');await assert.rejects(runtime.snapshot.connect(),/失效/);runtime.dispose()
})

test('SSH tunnel port renewal across renderer restarts retains the verified remote identity scope',async()=>{
 const f=fixture();let localPort=43210
 f.host.getConnectionFor=async route=>({...route,mode:'remote',remoteKind:'ssh',remoteHost:'alice@example.test:22',remoteIdentity:'owned-install',baseUrl:'http://127.0.0.1:'+localPort})
 f.host.api=async()=>({install_id:'install-ssh'})
 const first=await createNativeRuntime({host:f.host,connect:async()=>({})}),original=first.snapshot
 first.dispose();localPort=45678
 const second=await createNativeRuntime({host:f.host,connect:async()=>({})})
 assert.equal(second.snapshot.storageNamespace,original.storageNamespace)
 assert.equal(second.snapshot.accounts[0].id,original.accounts[0].id)
 second.dispose()
})

test('a failed candidate selection cannot cancel a later current-source rehome when that unrelated candidate is edited',async()=>{
 const f=fixture(),refresh=deferred(),getConnection=f.host.getConnectionFor
 const runtime=await createNativeRuntime({host:f.host,connect:async()=>({close:async()=>{}})})
 f.host.getConnectionFor=async route=>{if(route.connectionId==='failed')throw new Error('candidate unavailable');return getConnection(route)}
 await assert.rejects(runtime.selectRoute({connectionId:'failed',profile:'default'}),/unavailable/)
 f.host.getConnectionFor=()=>refresh.promise
 f.emit('registry',{connectionId:'remote',reason:'updated'});assert.equal(runtime.snapshot.status,'reconnecting')
 f.emit('registry',{connectionId:'failed',reason:'updated'})
 refresh.resolve({connectionId:'remote',profile:'default',mode:'remote',baseUrl:'https://old.example'});await tick()
 assert.equal(runtime.snapshot.status,'ready');assert.equal(runtime.route.connectionId,'remote');runtime.dispose()
})

test('a superseded selection finalizer cannot clear a newer pending candidate',async()=>{
 const f=fixture(),older=deferred(),newer=deferred()
 const runtime=await createNativeRuntime({host:f.host,connect:async()=>({close:async()=>{}})})
 f.host.getConnectionFor=route=>route.connectionId==='older'?older.promise:newer.promise
 const first=runtime.selectRoute({connectionId:'older',profile:'default'}),second=runtime.selectRoute({connectionId:'newer',profile:'default'})
 older.resolve({connectionId:'older',profile:'default'});assert.equal(await first,false)
 f.emit('registry',{connectionId:'newer',reason:'updated'})
 newer.resolve({connectionId:'newer',profile:'default'});assert.equal(await second,false)
 assert.equal(runtime.route.connectionId,'remote');runtime.dispose()
})

test('a failed candidate chosen during current-source rehome leaves that rehome able to complete',async()=>{
 const f=fixture(),refresh=deferred()
 const runtime=await createNativeRuntime({host:f.host,connect:async()=>({close:async()=>{}})})
 f.host.getConnectionFor=route=>route.connectionId==='remote'?refresh.promise:Promise.reject(new Error('candidate unavailable'))
 f.emit('registry',{connectionId:'remote',reason:'updated'})
 await assert.rejects(runtime.selectRoute({connectionId:'failed',profile:'default'}),/unavailable/)
 refresh.resolve({connectionId:'remote',profile:'default',mode:'remote',baseUrl:'https://old.example'});await tick()
 assert.equal(runtime.snapshot.status,'ready');assert.equal(runtime.route.connectionId,'remote');runtime.dispose()
})

test('a successful candidate chosen during rehome owns the window even when the old recovery finishes later',async()=>{
 const f=fixture(),refresh=deferred()
 const runtime=await createNativeRuntime({host:f.host,connect:async()=>({close:async()=>{}})})
 f.host.getConnectionFor=route=>route.connectionId==='remote'?refresh.promise:Promise.resolve({...route,mode:'remote',baseUrl:'https://other.example'})
 f.emit('registry',{connectionId:'remote',reason:'updated'})
 assert.equal(await runtime.selectRoute({connectionId:'other',profile:'default'}),true)
 refresh.resolve({connectionId:'remote',profile:'default',mode:'remote',baseUrl:'https://old.example'});await tick()
 assert.equal(runtime.snapshot.status,'ready');assert.equal(runtime.route.connectionId,'other');runtime.dispose()
})
