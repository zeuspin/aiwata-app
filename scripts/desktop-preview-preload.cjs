const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('aiwataPreview', {
  tour: (partition, guestId, url, action, requestId) => ipcRenderer.invoke('workbench-preview:tour', partition, guestId, url, action, requestId),
  selectPaths: account => ipcRenderer.invoke('workbench-preview:select-paths', account),
  openExternal: url => ipcRenderer.invoke('workbench-preview:open-external', url),
  readWindowBelow: () => ipcRenderer.invoke('workbench-preview:window-below'),
  start: account => ipcRenderer.invoke('workbench-preview:start', account),
  stop: partition => ipcRenderer.invoke('workbench-preview:stop', partition),
  inspect: (partition, guestId, url, method, params, requestId) =>
    ipcRenderer.invoke('workbench-preview:inspect', partition, guestId, url, method, params, requestId),
  cancelInspection: (partition, guestId, requestId) =>
    ipcRenderer.invoke('workbench-preview:inspect-cancel', partition, guestId, requestId),
  annotate: (partition, guestId, url, command) =>
    ipcRenderer.invoke('workbench-preview:annotate', partition, guestId, url, command),
  devTools: (partition, guestId, url, command) =>
    ipcRenderer.invoke('workbench-preview:devtools', partition, guestId, url, command),
  favicon: (partition, guestId, url) =>
    ipcRenderer.invoke('workbench-preview:favicon', partition, guestId, url),
  target: (partition, guestId, url, x, y) =>
    ipcRenderer.invoke('workbench-preview:target', partition, guestId, url, x, y),
})
