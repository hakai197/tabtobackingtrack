import { useRef, useState, type JSX } from 'react'
import { parseGuitarPro } from '../utils/guitarProParser'
import type { AnalysisResult } from '../types'

type Props = {
  onAnalysis: (result: AnalysisResult) => void
  defaultFilename?: string
}

const GP_ACCEPT = '.gp,.gp3,.gp4,.gp5,.gpx,.ptb'
const GP_RE = /\.(gp|gp3|gp4|gp5|gpx|ptb)$/i

export function GuitarProDropzone({ onAnalysis, defaultFilename }: Props): JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [loadedFilename, setLoadedFilename] = useState<string | null>(defaultFilename ?? null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function processFile(file: File): void {
    if (!GP_RE.test(file.name)) {
      setError('Please load a Guitar Pro file (.gp, .gp3, .gp4, .gp5, .gpx, .ptb)')
      return
    }
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target!.result as ArrayBuffer
        const result = parseGuitarPro(buffer)
        setLoadedFilename(file.name)
        onAnalysis(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not parse this Guitar Pro file.'
        setError(message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function onDragOver(e: React.DragEvent): void {
    e.preventDefault()
    setIsDragging(true)
  }

  function onDragLeave(e: React.DragEvent): void {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault()
    e.stopPropagation() // prevent global drop handler from also firing
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const zoneClass = ['midi-dropzone', isDragging ? 'dragging' : '', loadedFilename ? 'loaded' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={zoneClass}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      aria-label="Guitar Pro file drop zone"
    >
      <input
        ref={inputRef}
        type="file"
        accept={GP_ACCEPT}
        className="midi-dropzone-input"
        onChange={onInputChange}
      />

      {loadedFilename ? (
        <div className="midi-dropzone-content">
          <span className="midi-dropzone-icon">✓</span>
          <span className="midi-dropzone-filename">{loadedFilename}</span>
          <span className="midi-dropzone-hint">Click to replace</span>
        </div>
      ) : (
        <div className="midi-dropzone-content">
          <span className="midi-dropzone-icon">🎸</span>
          <span className="midi-dropzone-label">Drop a Guitar Pro file here</span>
          <span className="midi-dropzone-hint">
            or click to browse — .gp .gp3 .gp4 .gp5 .gpx .ptb
          </span>
        </div>
      )}

      {error && <p className="midi-dropzone-error">{error}</p>}
    </div>
  )
}
