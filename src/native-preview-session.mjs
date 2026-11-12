// StrictMode may acquire the replacement effect before the previous start's
// promise settles. Releasing one lease must not tear down the newer browser.
export function createNativePreviewSession(partition, onLastRelease) {
  let leases=0
  return {
    start() { leases++; return Promise.resolve(partition) },
    async stop() { if(leases>0)leases--; if(!leases)await onLastRelease() },
    get active() { return leases>0 },
  }
}
