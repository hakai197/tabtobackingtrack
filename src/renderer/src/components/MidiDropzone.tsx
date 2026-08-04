import { useRef, useState, type JSX } from 'react'
import { Midi } from '@tonejs/midi'
import { parseMidi } from '../utils/midiParser'
import type { AnalysisResult } from '../types'

type Props = {
  onAnalysis: (result: AnalysisResult) => void
}

export function MidiDropzone({ onAnalysis }: Props): JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [loadedFilename, setLoadedFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function processFile(file: File): void {
    if (!/\.midi?$/i.test(file.name)) {
      setError('Please load a MIDI file (.mid or .midi)')
      return
    }
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target!.result as ArrayBuffer
        const midi = new Midi(buffer)
        const result = parseMidi(midi)
        setLoadedFilename(file.name)
        onAnalysis(result)
      } catch (err) {
        setError('Could not parse this MIDI file. Is it a valid .mid?')
        console.error(err)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function onDragOver(e: React.DragEvent): void {
    e.preventDefault()
    setIsDragging(true)
  }

  function onDragLeave(e: React.DragEvent): void {
    // Only clear dragging state when leaving the dropzone itself, not a child element.
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
    // Reset the input so the same file can be re-selected after a swap.
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
      aria-label="MIDI file drop zone"
    >
      {/* Hidden file input — triggered by clicking the zone */}
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
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
          <span className="midi-dropzone-icon">♩</span>
          <span className="midi-dropzone-label">Drop a MIDI file here</span>
          <span className="midi-dropzone-hint">or click to browse — .mid .midi</span>
        </div>
      )}

      {error && <p className="midi-dropzone-error">{error}</p>}
    </div>
  )
}
