import { HermesGateway } from '@aiwata/native-client'
import { startUiPreferencesSync } from '@/lib/ui-preferences/sync'
import * as groupPolicy from './native-group-original.mjs'
import { canonicalOwnerProfile } from '@aiwata/native-protocol'
import { previewPartitionForProfile } from '@aiwata/native-preview-scope'
import { createNativeRuntime } from './native-runtime.mjs'
import { createNativeDesktopClient } from './native-desktop-client.mjs'
import { installNativePreviewBridge } from './native-preview-bridge.mjs'

export async function initializeNativeDesktop() {
  const host = window.hermesDesktop
  if (!host) throw new Error('请从原 AIWATA 桌面应用打开此界面。')
  startUiPreferencesSync(host.uiPreferences)
  let disposePreview
  const runtime = await createNativeRuntime({host,user:window.aiwataLocalUser,search:window.location.search,
    connect:route => createNativeDesktopClient({host,Gateway:HermesGateway,route,ownerProfile:canonicalOwnerProfile,groupPolicy})
      .then(client => Object.assign(client,{previewPartitionForProfile:profile=>previewPartitionForProfile(profile || route.profile)})),
    onPublish:snapshot => {
      disposePreview?.()
      disposePreview=undefined
      if(snapshot.status==='ready'){
        disposePreview=installNativePreviewBridge(host,previewPartitionForProfile(snapshot.route.profile))
      }
    },
  }).catch(error => {
    disposePreview?.()
    throw error
  })
  window.addEventListener('pagehide',()=>{runtime.dispose();disposePreview?.()},{once:true})
  runtime.loadPrimary=()=>import('./native-primary-original.mjs')
  window.aiwataNativeRuntime=runtime
}
