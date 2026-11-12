import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,stat,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {nativeInstallation} from '../scripts/live-aiwata-runtime.mjs'
test('read-only discovery rejects an unregistered source before its launcher can provision anything',async t=>{
 const root=await mkdtemp(join(tmpdir(),'aiwata-discovery-'));t.after(()=>rm(root,{recursive:true,force:true}))
 const marker=join(root,'unexpected-install')
 await writeFile(join(root,'aiwata'),`#!/bin/sh\ntouch '${marker}'\nprintf '["/usr/bin/python3"]'\n`,{mode:0o755})
 await assert.rejects(nativeInstallation(root),/尚未注册|安装|registered/)
 await assert.rejects(stat(marker),{code:'ENOENT'})
})
