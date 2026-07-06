import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { NdiFrame, NdiSourceInfo, NdiStatus } from '../shared/ndi'

// Custom APIs for renderer
const api = {
  listNdiSources: () => ipcRenderer.invoke('ndi:list-sources') as Promise<NdiSourceInfo[]>,
  startNdiStream: (sourceName: string) =>
    ipcRenderer.invoke('ndi:start', sourceName) as Promise<void>,
  onNdiFrame: (handler: (frame: NdiFrame) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, frame: NdiFrame): void => handler(frame)
    ipcRenderer.on('ndi:frame', listener)
    return () => ipcRenderer.off('ndi:frame', listener)
  },
  onNdiStatus: (handler: (status: NdiStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: NdiStatus): void => handler(status)
    ipcRenderer.on('ndi:status', listener)
    return () => ipcRenderer.off('ndi:status', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
