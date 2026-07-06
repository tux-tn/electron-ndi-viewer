import { useEffect, useRef, useState } from 'react'
import { convertUyvyToRgba } from './lib/video'
import type { NdiSourceInfo, NdiStatus } from '../../shared/ndi'

function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageDataRef = useRef<ImageData | null>(null)
  const videoAspectRatioRef = useRef('16 / 9')
  const hasVideoFrameRef = useRef(false)
  const selectedSourceRef = useRef('')
  const [sources, setSources] = useState<NdiSourceInfo[]>([])
  const [selectedSource, setSelectedSource] = useState('')
  const [status, setStatus] = useState<NdiStatus>({ state: 'idle', detail: 'Ready' })
  const [videoAspectRatio, setVideoAspectRatio] = useState('16 / 9')
  const [hasVideoFrame, setHasVideoFrame] = useState(false)

  const refreshSources = async (): Promise<void> => {
    try {
      const nextSources = await window.api.listNdiSources()
      setSources(nextSources)
      if (!selectedSourceRef.current && nextSources[0]?.name) {
        const firstSourceName = nextSources[0].name
        selectedSourceRef.current = firstSourceName
        setSelectedSource(firstSourceName)
        await startSource(firstSourceName)
      }
    } catch (error) {
      setStatus({ state: 'error', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  const startSource = async (sourceName: string): Promise<void> => {
    if (!sourceName) return
    try {
      hasVideoFrameRef.current = false
      setHasVideoFrame(false)
      await window.api.startNdiStream(sourceName)
    } catch (error) {
      setStatus({ state: 'error', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  const selectSource = (sourceName: string): void => {
    selectedSourceRef.current = sourceName
    setSelectedSource(sourceName)
    void startSource(sourceName)
  }

  useEffect(() => {
    void window.api
      .listNdiSources()
      .then((nextSources) => {
        setSources(nextSources)
        const firstSourceName = nextSources[0]?.name
        if (firstSourceName) {
          selectedSourceRef.current = firstSourceName
          setSelectedSource(firstSourceName)
          return window.api.startNdiStream(firstSourceName)
        }
        return undefined
      })
      .catch((error) => {
        setStatus({
          state: 'error',
          detail: error instanceof Error ? error.message : String(error)
        })
      })
    const unsubscribeStatus = window.api.onNdiStatus((nextStatus) => {
      if (nextStatus.state === 'idle' && selectedSourceRef.current) return
      setStatus(nextStatus)
    })
    const unsubscribeFrame = window.api.onNdiFrame((frame) => {
      const canvas = canvasRef.current
      if (!canvas) return
      if (!hasVideoFrameRef.current) {
        hasVideoFrameRef.current = true
        setHasVideoFrame(true)
      }
      const nextAspectRatio = `${frame.width} / ${frame.height}`
      if (videoAspectRatioRef.current !== nextAspectRatio) {
        videoAspectRatioRef.current = nextAspectRatio
        setVideoAspectRatio(nextAspectRatio)
      }

      const offscreenCanvas = offscreenCanvasRef.current ?? document.createElement('canvas')
      offscreenCanvasRef.current = offscreenCanvas
      if (offscreenCanvas.width !== frame.width || offscreenCanvas.height !== frame.height) {
        offscreenCanvas.width = frame.width
        offscreenCanvas.height = frame.height
        imageDataRef.current = null
      }

      const imageData = imageDataRef.current ?? new ImageData(frame.width, frame.height)
      convertUyvyToRgba(frame.data, frame.width, frame.height, frame.stride, imageData.data)
      imageDataRef.current = imageData

      const offscreenContext = offscreenCanvas.getContext('2d')
      const context = canvas.getContext('2d')
      if (!offscreenContext || !context) return

      offscreenContext.putImageData(imageData, 0, 0)
      canvas.width = canvas.clientWidth
      canvas.height = canvas.clientHeight
      context.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height)
    })

    return () => {
      unsubscribeStatus()
      unsubscribeFrame()
    }
  }, [])

  return (
    <main className="app">
      <section className="toolbar">
        <div>
          <h1>grandi + Electron NDI example</h1>
          <p>Pick an NDI stream and render its frames in the renderer process.</p>
        </div>

        <div className="controls">
          <select value={selectedSource} onChange={(event) => selectSource(event.target.value)}>
            <option value="">
              {sources.length ? 'Select an NDI source' : 'No NDI sources found'}
            </option>
            {sources.map((source) => (
              <option key={source.name} value={source.name}>
                {source.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void refreshSources()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="viewer-stage">
        <div
          className="viewer"
          style={{ '--video-aspect-ratio': videoAspectRatio } as React.CSSProperties}
        >
          <canvas ref={canvasRef} className="video-canvas" />
          <div className="status">
            {status.state}: {status.detail ?? 'waiting'}
          </div>
          {!hasVideoFrame && <div className="empty">No video yet</div>}
        </div>
      </section>
    </main>
  )
}

export default App
