// Translate presentation data, not service behavior. Missing native APIs fail
// explicitly rather than loading Python companions or synthesizing Agent tools.
import { connectorApplyPlan, applyNativeConnectorConfiguration, watchNativeConnectorRestart } from './native-connectors.mjs'
import { createNativeMcpOAuth } from './native-mcp-oauth.mjs'
import { createNativeModelOAuth } from './native-model-oauth.mjs'
import { resolveGeneratedImage } from './native-image-results.mjs'
import { createNativeMessagingFlows } from './native-messaging-flows.mjs'
const encode=encodeURIComponent
const unsupported = feature => { throw new Error(`原 AIWATA 暂无可供此界面调用的${feature}接口；需要补齐原生前端契约。`) }
const dataURL = blob => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})
const voiceFields = {
  edge: 'voice', openai: 'voice', elevenlabs: 'voice_id', gemini: 'voice', xai: 'voice_id',
  minimax: 'voice_id', mistral: 'voice_id', deepinfra: 'voice', kittentts: 'voice', piper: 'voice',
}
export function nativeSettings({ rpc, api, host, route, stops, check }) {
  const botCreations=new Map(), uploads=new Map()
  const mcpOAuth=createNativeMcpOAuth({host,rpc,route,stops,check})
  const modelOAuth=createNativeModelOAuth({api,stops,check})
  const messagingFlows=createNativeMessagingFlows({api,stops,check})
  async function readBotVoice(profile) {
    const result = await api('/api/config', { profile })
    const tts = (result.config ?? result).tts ?? {}
    const provider = String(tts.provider || 'edge').trim().toLowerCase()
    const configProvider = provider === 'nous' ? 'openai' : provider
    const field = Object.hasOwn(voiceFields, configProvider) ? voiceFields[configProvider] : null
    return { provider, configProvider, field, value: field ? String(tts[configProvider]?.[field] ?? '') : '' }
  }
  return {
    closeNativeAuthorizations: () => Promise.all([mcpOAuth.dispose(),modelOAuth.dispose(),messagingFlows.dispose()]),
    async capability(method, profile, params={}) {
      if (method==='model.options') return rpc(method,{explicit_only:true,include_unconfigured:true,...params},profile)
      if (method==='model.oauth.providers') {const result=await api('/api/providers/oauth',{profile});return {providers:(result.providers??[]).filter(row=>row.id!=='nous')}}
      if (method==='model.oauth.start')return modelOAuth.start(profile,params)
      if (method==='model.oauth.poll')return modelOAuth.poll(profile,params)
      if (method==='model.oauth.submit')return modelOAuth.submit(profile,params)
      if (method==='model.oauth.cancel')return modelOAuth.cancel(profile,params)
      if (method==='mcp.servers.oauth.start')return mcpOAuth.start(profile,params)
      if (method==='mcp.servers.oauth.poll')return mcpOAuth.poll(profile,params)
      if (method==='mcp.servers.oauth.cancel')return mcpOAuth.cancel(profile,params)
      if (method==='mcp.toggle') return api(`/api/mcp/servers/${encode(params.name)}/enabled`,{profile,method:'PUT',body:{enabled:params.enabled}})
      if (method==='skill.expand') {
        const result=await rpc('command.dispatch',{session_id:params.session_id,name:params.name,arg:params.arg},profile)
        if (result.type!=='skill') throw new Error('此输入未解析为技能。')
        return result
      }
      return rpc(method,params,profile)
    },
    async saveBot(input) {
      let {profiles=[]}=await rpc('profiles.list',{include_sessions:true})
      let row=profiles.find(row=>row.name===input.profile)
      if (!row&&input.createId) {
        const created=await rpc('profiles.create',{name:input.profile,description:input.description,no_alias:true,
          ...(input.cloneFrom?{clone_from:input.cloneFrom}:{}),clone_channels:false,share_auth:true})
        if (!created.ok) throw new Error('AIWATA 未创建此 Bot。')
        botCreations.set(input.profile,input.createId)
        profiles=(await rpc('profiles.list',{include_sessions:true})).profiles
        row=profiles.find(row=>row.name===input.profile)
      }
      if (!row) throw new Error('Bot 已不存在。')
      const revision=row.ui_meta_revisions??{}, meta=row.ui_meta??{}, saved=meta['aiwata-app']?.createId
      if (input.createId ? saved!==input.createId&&botCreations.get(input.profile)!==input.createId
        : input.revision!==(revision['aiwata-app']??0)||input.desktopRevision!==(revision['hermes-bots']??0)) throw new Error('Bot 设置已经变化，请重新打开。')
      if (input.model&&(row.model!==input.model||row.provider!==input.provider)) {
        const result=await rpc('profiles.configure',{name:input.profile,model:input.model,provider:input.provider,
          ...(input.confirmedModel?{confirm_expensive_model:true}:{})})
        if (result.confirm_required) return {confirmRequired:true,message:result.confirm_message}
        if (!result.ok) throw new Error('Bot 模型未保存。')
      }
      if (input.avatar!==undefined) await rpc('profiles.set_asset',{name:input.profile,asset:'avatar',...(input.avatar?{data:input.avatar}:{clear:true})})
      const result=await rpc('profiles.configure',{name:input.profile,
        ...(input.originalDescription!==undefined&&input.description===input.originalDescription?{}:{description:input.description}),
        ...(input.originalSoul!==undefined&&input.soul===input.originalSoul?{}:{soul:input.soul}),
        ...Object.fromEntries(['disabled_skills','enabled_toolsets','enabled_mcp_servers'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]])),
        ui_meta:{'hermes-bots':{...meta['hermes-bots'],title:input.name},'aiwata-app':{...meta['aiwata-app'],createId:saved??input.createId,appearance:input.appearance}},
        ui_meta_expected_revisions:{'hermes-bots':revision['hermes-bots']??0,'aiwata-app':revision['aiwata-app']??0}})
      if (!result.ok) throw new Error('Bot 设置未完整保存，请重新打开检查。')
      const created = Boolean(input.createId && botCreations.get(input.profile) === input.createId)
      botCreations.delete(input.profile);return {ok:true,profile:input.profile,created}
    },
    async upload(session,entry,blob,profile) {
      const data=await dataURL(blob), key=JSON.stringify([profile||'',session,entry.blobId])
      const image=blob.type.startsWith('image/')
      const result=await rpc(image?'image.attach_bytes':'file.attach',image?{session_id:session,filename:entry.name,content_base64:data.split(',')[1]}:{session_id:session,name:entry.name,data_url:data},profile)
      if (!result.attached) throw new Error('AIWATA 未接收此附件。')
      uploads.set(key,{session,profile:profile||'',...(image?{image:{path:result.path,mime:result.mime}}:{ref:result.ref_text})})
      return {id:key}
    },
    prepareUploads(params,profile) {
      const {uploads:ids,...input}=params
      if (!ids) return params
      const entries=ids.map(id=>uploads.get(id))
      if(entries.some(row=>!row||row.session!==params.session_id||row.profile!==(profile||'')))throw new Error('附件归属已变化。')
      return {...input,text:[params.text,...entries.flatMap(r=>r.ref?[r.ref]:[])].filter(Boolean).join('\n\n'),
        attachments:entries.flatMap(r=>r.image?[r.image]:[])}
    },
    async uploadRoom(room_id,entry,blob) {
      const mime=blob.type||'application/octet-stream',kind=mime.startsWith('image/')?'image':mime==='application/pdf'?'pdf':'file'
      const result=await rpc('groups.attachment.upload',{room_id,upload_id:entry.blobId,name:entry.name,mime,kind,data_base64:(await dataURL(blob)).split(',')[1]})
      return {...result,name:entry.name,mime,kind}
    },
    async downloadRoom(room_id,entry) {
      const result=await rpc('groups.attachment.download',{room_id,event_id:entry.roomEvent,attachment_id:entry.roomAttachment})
      return new Blob([Uint8Array.fromBase64(result.data_base64)],{type:result.mime})
    },
    async skill(action,profile,params={}) {
      const opts={profile}, name=params.id
      if(action==='list')return api('/api/skills',opts)
      if(action==='catalog')return (await api('/api/skills/hub/official',opts)).skills
      if(action==='toggle'||action==='lock')return api('/api/skills/'+action,{...opts,method:'PUT',body:{name,[action==='toggle'?'enabled':'locked']:params.value}})
      if(action==='content')return api('/api/skills/content?name='+encode(name),opts)
      if(action==='create')return api('/api/skills',{...opts,method:'POST',body:{name,content:params.content}})
      if(action==='save'||action==='edit')return api('/api/skills/content',{...opts,method:'PUT',body:{name,content:params.content}})
      if(action==='install')return api('/api/skills/hub/install',{...opts,method:'POST',body:{identifier:name,source_id:'official'}})
      if(action==='remove')return api('/api/skills/hub/uninstall',{...opts,method:'POST',body:{name}})
      return unsupported('技能'+action)
    },
    async memory(action,profile,params={}) {
      const options={profile}
      if(action==='read') {
        const [config,graph,curator]=await Promise.all([api('/api/config',options),api('/api/learning/graph',options),api('/api/curator',options)])
        const memory=(config.config??config).memory??{}
        return {settings:{memoryEnabled:memory.memory_enabled!==false,userProfileEnabled:memory.user_profile_enabled!==false,writeApproval:memory.write_approval===true},
          nodes:(graph.nodes??[]).filter(n=>n.kind==='memory'||n.kind==='skill').map(n=>({id:n.id,title:n.label||n.id,type:n.kind==='skill'?'skill':n.memorySource==='profile'?'user':'memory',pinned:!!n.pinned})),
          pending:[],pendingAvailable:false,manualAddAvailable:false,reviewPreviewAvailable:false,curator}
      }
      if(action==='setting')return api('/api/config',{...options,method:'PUT',body:{config:{memory:{[{memoryEnabled:'memory_enabled',userProfileEnabled:'user_profile_enabled',writeApproval:'write_approval'}[params.key]]:params.value}}}})
      if(action==='pause')return api('/api/curator/paused',{...options,method:'PUT',body:{paused:params.value}})
      if(action==='review') {
        if(params.preview)return unsupported('技能整理预览')
        return {...await api('/api/curator/run',{...options,method:'POST'}),background:true}
      }
      if(action==='detail')return api('/api/learning/node?id='+encode(params.id),options)
      if(action==='edit'||action==='remove')return api('/api/learning/node',{...options,method:action==='edit'?'PUT':'DELETE',body:{id:params.id,...(action==='edit'?{content:params.content}:{})}})
      return unsupported('记忆'+action)
    },
    async task(action,params={}) {
      const {profile='default',id,data}=params,options={profile},base='/api/cron/jobs'
      if(action==='list')return api(base+'?profile=all')
      if(action==='targets')return (await api('/api/cron/delivery-targets',options)).targets
      if(action==='blueprints')return api('/api/cron/blueprints?profile='+encode(profile),options)
      if(action==='blueprint-create')return api('/api/cron/blueprints/instantiate?profile='+encode(profile),{...options,method:'POST',body:{blueprint:params.blueprint,values:params.values}})
      if(action==='save')return api(base+(id?'/'+encode(id):''),{...options,method:id?'PUT':'POST',body:id?{updates:data}:data})
      if(action==='history')return api(base+'/'+encode(id)+'/runs',options)
      if(action==='remove')return api(base+'/'+encode(id),{...options,method:'DELETE'})
      return api(base+'/'+encode(id)+'/'+({run:'trigger',stop:'cancel'}[action]||action),{...options,method:'POST',timeoutMs:action==='run'?1800000:60000})
    },
    async image(action,session,params={}) {
      if(action==='edit-status')return {available:false,editable:false,message:'原生界面尚未提供图像编辑调用契约。'}
      if(action==='edit')return unsupported('图像编辑')
      const result=await rpc('image.generate',action==='probe'?{probe:true}:{...params,max_bytes:8388608})
      return action==='probe'?result:resolveGeneratedImage(result,{api,host,route})
    },
    editImage:()=>unsupported('图像编辑'),
    video:async action=>action==='status'?{available:false}:unsupported('视频编辑'),
    async botVoice(profile, change) {
      const { provider, configProvider, field, value } = await readBotVoice(profile)
      if (!change) return { provider, field, value }
      if (!field || change.provider !== provider || change.previous !== value) {
        throw new Error('语音引擎或音色已变化，请重新读取。')
      }
      if (typeof change.value !== 'string' || !change.value.trim() || change.value.length > 160) {
        throw new Error('请输入有效音色。')
      }
      const saved = await api('/api/config', { profile, method: 'PUT', body: { config: { tts: { [configProvider]: { [field]: change.value } } } } })
      const next = await readBotVoice(profile)
      if (saved?.ok === false || saved?.success === false || next.provider !== provider || next.value !== change.value) {
        throw new Error('未保存音色，请重新读取当前配置。')
      }
      return { provider, field, value: next.value }
    },
    async voiceStatus(profile) {const config=await api('/api/audio/voice-config',{profile});return {available:config.stt?.enabled!==false}},
    async transcribeVoice(profile,audio,signal) { const data=await dataURL(audio);signal?.throwIfAborted();return api('/api/audio/transcribe',{profile,method:'POST',body:{data_url:data,mime_type:audio.type}}) },
    async connector(action,profile,params={}) {
      const options={profile},platform=params.platform
      if(action==='apply-plan')return connectorApplyPlan(api,profile)
      if(action==='apply')return applyNativeConnectorConfiguration(api,profile,params)
      if(action==='watch-restart')return watchNativeConnectorRestart(api,profile,params.signal)
      if(action.startsWith('relay')||action.startsWith('whatsapp'))return messagingFlows.call(action,profile,params)
      if(action==='read') {
        const [data,pairing]=await Promise.all([api('/api/messaging/platforms',options),api('/api/pairing',options)])
        return {platforms:data.platforms.map(row=>({id:row.id,name:row.name,description:row.description,state:row.state,errorCode:row.error_code,enabled:row.enabled,configured:row.configured,running:row.gateway_running,
          relay:row.relay_exclusive,relayFronted:row.relay_fronted,logs:[],needsApply:false,
          fields:(row.env_vars??[]).map(f=>({key:f.key,label:f.prompt,required:f.required,isSet:f.is_set,secret:f.is_password,value:f.is_list?f.value:null})),
          pending:(pairing.pending??[]).filter(r=>r.platform===row.id),approved:(pairing.approved??[]).filter(r=>r.platform===row.id)}))}
      }
      if(action==='save')return api('/api/messaging/platforms/'+encode(platform),{...options,method:'PUT',body:{enabled:params.enabled,env:params.env,clear_env:params.clear}})
      if(action==='test')return api('/api/messaging/platforms/'+encode(platform)+'/test',{...options,method:'POST'})
      if(action==='approve'||action==='revoke')return api('/api/pairing/'+action,{...options,method:'POST',body:{profile,platform,[action==='approve'?'request_id':'user_id']:params.id}})
      if(action.startsWith('telegram')) {
        const base='/api/messaging/telegram/onboarding'
        if(action==='telegramStart') {const r=await api(base+'/start',{...options,method:'POST',body:{}});return {id:r.pairing_id,deepLink:r.deep_link,expiresAt:r.expires_at}}
        if(action==='telegramStatus') {const r=await api(base+'/'+encode(params.id),options);return {status:r.status,username:r.bot_username,ownerId:r.owner_user_id,expiresAt:r.expires_at}}
        if(action==='telegramCancel')return api(base+'/'+encode(params.id),{...options,method:'DELETE'})
        if(action==='telegramApply')return api(base+'/'+encode(params.id)+'/apply',{...options,method:'POST',body:{allowed_user_ids:params.allowedUserIds,profile}})
      }
      return unsupported('连接器'+action)
    },
  }
}
