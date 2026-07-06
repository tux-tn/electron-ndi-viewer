import type { MessagePort } from 'node:worker_threads'
import type grandiDefault from 'grandi'
import type { Source } from 'grandi'
import type { NdiFrame, NdiStatus, NdiStatusState } from '../shared/ndi'

type WorkerRequest =
  | { id: number; type: 'list-sources' }
  | { id: number; type: 'start'; sourceName: string }
  | { id: number; type: 'stop' }

const parentPort = (process as NodeJS.Process & { parentPort?: MessagePort }).parentPort
const FIND_WAIT_MS = 5000
const VIDEO_TIMEOUT_MS = 1000

let streamVersion = 0
let activeReceiver: { destroy(): void } | null = null
let grandiPromise: Promise<typeof grandiDefault> | null = null

const send = (message: unknown): void => parentPort?.postMessage(message)

const sendStatus = (state: NdiStatusState, detail?: string): void => {
  send({ type: 'status', payload: { state, detail } satisfies NdiStatus })
}

const sendError = (error: unknown, requestId?: number): void => {
  const message = error instanceof Error ? error.message : String(error)
  send({ type: 'error', requestId, payload: message })
}

async function loadGrandi(): Promise<typeof grandiDefault> {
  if (!grandiPromise) {
    grandiPromise = import('grandi').then(({ default: grandi }) => {
      if (!grandi.initialize()) {
        throw new Error('Failed to initialize NDI via grandi')
      }
      return grandi
    })
  }
  return grandiPromise
}

async function findSources(): Promise<Source[]> {
  const grandi = await loadGrandi()
  const finder = await grandi.find({ showLocalSources: true })
  try {
    finder.wait(FIND_WAIT_MS)
    return finder.sources()
  } finally {
    finder.destroy()
  }
}

async function listSources(requestId: number): Promise<void> {
  const sources = await findSources()
  send({ type: 'sources', requestId, payload: sources })
}

async function startStream(requestId: number, sourceName: string): Promise<void> {
  const grandi = await loadGrandi()
  streamVersion += 1
  const currentVersion = streamVersion

  sendStatus('connecting', sourceName)
  const source = (await findSources()).find((candidate) => candidate.name === sourceName)
  if (!source) {
    throw new Error(`NDI source not found: ${sourceName}`)
  }
  if (streamVersion !== currentVersion) {
    send({ type: 'started', requestId })
    return
  }

  const receiver = await grandi.receive({
    source,
    colorFormat: grandi.COLOR_FORMAT_FASTEST,
    bandwidth: grandi.BANDWIDTH_HIGHEST,
    allowVideoFields: false,
    name: 'grandi-electron-example'
  })
  if (streamVersion !== currentVersion) {
    receiver.destroy()
    send({ type: 'started', requestId })
    return
  }
  activeReceiver = receiver
  send({ type: 'started', requestId })
  sendStatus('receiving', source.name)

  try {
    while (streamVersion === currentVersion) {
      const frame = await receiver.video(VIDEO_TIMEOUT_MS).catch((error) => {
        if (streamVersion !== currentVersion) return null
        throw error
      })
      if (!frame) return
      if (streamVersion !== currentVersion) return
      const payload: NdiFrame = {
        width: frame.xres,
        height: frame.yres,
        stride: frame.lineStrideBytes,
        timestamp: Date.now(),
        data: new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
      }
      send({ type: 'frame', payload })
    }
  } finally {
    if (activeReceiver === receiver) activeReceiver = null
    receiver.destroy()
  }
}

function stopStream(requestId?: number): void {
  streamVersion += 1
  sendStatus('idle', 'Stopped')
  if (requestId) send({ type: 'stopped', requestId })
}

parentPort?.on('message', (event: { data: WorkerRequest }) => {
  const request = event.data
  if (request.type === 'list-sources') {
    void listSources(request.id).catch((error) => sendError(error, request.id))
    return
  }

  if (request.type === 'start') {
    void startStream(request.id, request.sourceName).catch((error) => {
      sendError(error, request.id)
      sendStatus('error', error instanceof Error ? error.message : String(error))
    })
    return
  }

  stopStream(request.id)
})

process.on('SIGTERM', () => {
  stopStream()
  process.exit(0)
})

process.on('uncaughtException', (error) => {
  sendError(error)
  process.exit(1)
})

process.on('unhandledRejection', (error) => {
  sendError(error)
  process.exit(1)
})
