import { useRef, useState, type JSX } from 'react'
import { parseMusicXml } from '../utils/musicXmlParser'
import type { AnalysisResult } from '../types'

type Props = {
  onAnalysis: (result: AnalysisResult) => void
}

export function MusicXmlDropzone({ onAnalysis }: Props): JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [loadedFilename, setLoadedFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function processFile(file: File): void {
    if (!/\.(musicxml|xml)$/i.test(file.name)) {
      setError('Please load a MusicXML file (.musicxml or .xml)')
      return
    }
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target!.result as string
        const result = parseMusicXml(text)
        setLoadedFilename(file.name)
        onAnalysis(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not parse this MusicXML file.'
        setError(message)
      }
    }
    // MusicXML is text-based XML — read as UTF-8 string, not ArrayBuffer.
    reader.readAsText(file, 'UTF-8')
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
      aria-label="MusicXML file drop zone"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".musicxml,.xml"
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
          <span className="midi-dropzone-icon">♬</span>
          <span className="midi-dropzone-label">Drop a MusicXML file here</span>
          <span className="midi-dropzone-hint">or click to browse — .musicxml .xml</span>
        </div>
      )}

      {error && <p className="midi-dropzone-error">{error}</p>}
    </div>
  )
}
