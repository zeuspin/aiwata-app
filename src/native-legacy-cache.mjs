// Only aggregate counts leave the legacy cache. Its owner has not been proved,
// so neither draft contents nor pending operations are imported into v2.
export function inspectLegacyNativeCache(storage,route) {
  let records
  try{records=JSON.parse(storage.getItem('aiwata-app-native:v1:'+JSON.stringify([route.connectionId,route.profile||'default']))||'null')}
  catch{return null}
  if(!records||typeof records!=='object')return null
  const accounts=Object.values(records).filter(record=>record&&typeof record==='object')
  if(!accounts.length)return null
  const sessions=accounts.flatMap(record=>[...Object.values(record.chats||{}),...(record.newChatDraft?[record.newChatDraft]:[]),...Object.values(record.gatewayCaptureDrafts||{})]).filter(chat=>chat&&typeof chat==='object')
  return {accounts:accounts.length,sessions:sessions.length,drafts:sessions.filter(chat=>typeof chat.draft==='string'&&chat.draft.trim()).length,
    attachments:sessions.reduce((sum,chat)=>sum+(Array.isArray(chat.attachments)?chat.attachments.length:0),0),pending:sessions.filter(chat=>chat.pending).length}
}
