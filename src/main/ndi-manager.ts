import { EventEmitter } from 'node:events'
import { utilityProcess, type BrowserWindow } from 'electron'
import workerEntry from './ndi-worker.ts?modulePath'
import type { NdiFrame, NdiStatus, NdiSourceInfo } from '../shared/ndi'

type WorkerResponse =
  | { type: 'sources'; requestId: number; payload: NdiSourceInfo[] }
  | { type: 'started'; requestId: number }
  | { type: 'stopped'; requestId: number }
  | { type: 'frame'; payload: NdiFrame }
  | { type: 'status'; payload: NdiStatus }
  | { type: 'error'; requestId?: number; payload: string }

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

class NdiUtilityProcess extends EventEmitter {
  private child: Electron.UtilityProcess | null = null
  private spawned = false
  private queuedMessages: unknown[] = []
  private requestId = 0
  private pending = new Map<number, PendingRequest>()

  start(): void {
    if (this.child) return
    this.spawned = false
    this.child = utilityProcess.fork(workerEntry, [], { stdio: 'inherit' })
    this.child.once('spawn', () => {
      this.spawned = true
      for (const message of this.queuedMessages) {
        this.child?.postMessage(message)
      }
      this.queuedMessages = []
    })
    this.child.on('message', (message) => this.handleMessage(message as WorkerResponse))
    this.child.once('exit', () => {
      this.child = null
      this.spawned = false
      this.queuedMessages = []
      for (const [id, request] of this.pending) {
        clearTimeout(request.timer)
        request.reject(new Error('NDI utility process exited'))
        this.pending.delete(id)
      }
    })
  }

  stop(): void {
    this.child?.kill()
    this.child = null
  }

  request<T>(message: Record<string, unknown>, timeoutMs = 5000): Promise<T> {
    this.start()
    const id = ++this.requestId
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('NDI utility process request timed out'))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      this.postMessage({ ...message, id })
    })
  }

  private postMessage(message: unknown): void {
    if (this.spawned) {
      this.child?.postMessage(message)
    } else {
      this.queuedMessages.push(message)
    }
  }

  private settle(id: number, value: unknown): void {
    const request = this.pending.get(id)
    if (!request) return
    clearTimeout(request.timer)
    this.pending.delete(id)
    request.resolve(value)
  }

  private reject(id: number, message: string): void {
    const request = this.pending.get(id)
    if (!request) return
    clearTimeout(request.timer)
    this.pending.delete(id)
    request.reject(new Error(message))
  }

  private handleMessage(message: WorkerResponse): void {
    switch (message.type) {
      case 'sources':
        this.settle(message.requestId, message.payload)
        break
      case 'started':
      case 'stopped':
        this.settle(message.requestId, undefined)
        break
      case 'error':
        if (message.requestId) this.reject(message.requestId, message.payload)
        break
      case 'frame':
      case 'status':
        break
    }
    this.emit(message.type, 'payload' in message ? message.payload : undefined)
  }
}

class NdiManager {
  private utility = new NdiUtilityProcess()
  private windows = new Set<BrowserWindow>()

  start(): void {
    this.utility.start()
    this.utility.on('frame', (frame: NdiFrame) => this.broadcast('ndi:frame', frame))
    this.utility.on('status', (status: NdiStatus) => this.broadcast('ndi:status', status))
    this.utility.on('error', (error: string) =>
      this.broadcast('ndi:status', { state: 'error', detail: error })
    )
  }

  stop(): void {
    this.utility.stop()
  }

  registerWindow(window: BrowserWindow): void {
    this.windows.add(window)
    window.once('closed', () => this.windows.delete(window))
  }

  listSources(): Promise<NdiSourceInfo[]> {
    return this.utility.request<NdiSourceInfo[]>({ type: 'list-sources' })
  }

  startStream(sourceName: string): Promise<void> {
    return this.utility.request<void>({ type: 'start', sourceName })
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const window of this.windows) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload)
    }
  }
}

const ndiManager = new NdiManager()

export default ndiManager
