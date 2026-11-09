import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('printAgent', {
  getState: () => ipcRenderer.invoke('agent:getState'),
  listPrinters: () => ipcRenderer.invoke('agent:listPrinters'),
  register: (payload: { apiUrl: string; code: string; name: string }) =>
    ipcRenderer.invoke('agent:register', payload),
  saveSettings: (payload: unknown) => ipcRenderer.invoke('agent:saveSettings', payload),
  disconnect: () => ipcRenderer.invoke('agent:disconnect'),
  testPrint: (payload: { role: 'carrier-label' | 'plant-label' }) =>
    ipcRenderer.invoke('agent:testPrint', payload),
  drainPending: () => ipcRenderer.invoke('agent:drainPending'),
  onState: (cb: (state: unknown) => void) => {
    const listener = (_: unknown, state: unknown) => cb(state)
    ipcRenderer.on('agent:state', listener)
    return () => ipcRenderer.removeListener('agent:state', listener)
  },
})
