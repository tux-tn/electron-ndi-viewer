export interface NdiFrame {
  width: number
  height: number
  stride: number
  timestamp: number
  data: Uint8Array
}

export type NdiStatusState = 'idle' | 'searching' | 'connecting' | 'receiving' | 'error'

export interface NdiStatus {
  state: NdiStatusState
  detail?: string
}

export { type Source as NdiSourceInfo } from 'grandi'
