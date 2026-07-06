import { ElectronAPI } from '@electron-toolkit/preload'
import type { NdiFrame, NdiSourceInfo, NdiStatus } from '../shared/ndi'

export interface RendererApi {
  listNdiSources: () => Promise<NdiSourceInfo[]>
  startNdiStream: (sourceName: string) => Promise<void>
  onNdiFrame: (handler: (frame: NdiFrame) => void) => () => void
  onNdiStatus: (handler: (status: NdiStatus) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
