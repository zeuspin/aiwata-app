import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=resolve(process.env.AIWATA_APP_SOURCE || join(root,'../aiwata'))
let local={}
try { local=JSON.parse(await readFile(new URL('./native-host.local',import.meta.url),'utf8')) }
catch(error) { if(error.code!=='ENOENT')throw error }
const nativeApp=process.env.AIWATA_NATIVE_APP || local.application
if (!nativeApp) throw new Error('尚未指定原 AIWATA 桌面应用。设置 AIWATA_NATIVE_APP 为现有应用路径，不会安装另一套宿主。')
const application=resolve(nativeApp)
const info=await stat(application)
const executable=application.endsWith('.app')&&info.isDirectory()
  ? join(application,'Contents/MacOS',process.platform==='darwin'?'AIWATA':'AIWATA.exe'):application
await stat(executable)
process.env.AIWATA_APP_NATIVE='1'
process.env.AIWATA_APP_SOURCE=source
const server=await createServer({root,configFile:join(root,'vite.config.mjs'),server:{host:'127.0.0.1',port:4182,strictPort:true}})
await server.listen()
const child=spawn(executable,[],{cwd:root,stdio:'inherit',env:{...process.env,HERMES_DESKTOP_DEV_SERVER:'http://127.0.0.1:4182',AIWATA_APP_NATIVE:undefined,AIWATA_APP_LIVE:undefined,AIWATA_APP_ISOLATED:undefined}})
let closing=false
async function finish(code) {if(closing)return;closing=true;await server.close();process.exitCode=code??1}
child.on('error',error=>{console.error(error.message);void finish(1)})
child.on('exit',code=>void finish(code))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.kill('SIGTERM');void finish(0)})
console.log('AIWATA 原桌面宿主 + aiwata-app renderer；未启动联调网关。')
