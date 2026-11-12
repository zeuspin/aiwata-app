import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectLegacyNativeCache} from '../src/native-legacy-cache.mjs'
test('legacy cache inspection reports only counts and never migrates, writes or reveals draft contents',()=>{
 const saved={oldAccount:{chats:{one:{draft:'secret draft',attachments:['secret.txt']},two:{draft:'',attachments:[],pending:{input:'private pending'}}},newChatDraft:{draft:'new secret',attachments:['other.txt']},gatewayCaptureDrafts:{capture:{draft:'quick secret'}}}}
 const storage={getItem:key=>key==='aiwata-app-native:v1:["remote","default"]'?JSON.stringify(saved):null,setItem:()=>assert.fail('read-only')}
 const summary=inspectLegacyNativeCache(storage,{connectionId:'remote',profile:'default'})
 assert.deepEqual(summary,{accounts:1,sessions:4,drafts:3,attachments:2,pending:1})
 assert.doesNotMatch(JSON.stringify(summary),/secret|private/)
 assert.equal(inspectLegacyNativeCache(storage,{connectionId:'other',profile:'default'}),null)
})
