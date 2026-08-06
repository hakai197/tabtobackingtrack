import { useState, useRef, type JSX } from 'react'
import { parseGuitarProMultiTrack } from '../utils/guitarProParser'
import { convertTracksToMidi } from '../utils/gpToMidi'
import { convertTracksToAsciiTab } from '../utils/gpToAsciiTab'
import type { ConvertedTrack } from '../types'

const GP_RE = /\.(gp|gp3|gp4|gp5|gpx|ptb)$/i

const TRACK_ICONS: Record<string, string> = {
  guitar: '🎸',
  bass: '🎵',
  drums: '🥁',
  unknown: '?'
}

export function ConverterPanel(): JSX.Element {
  const [converterFile, setConverterFile] = useState<File | null>(null)
  const [convertedTracks, setConvertedTracks] = useState<ConvertedTrack[]>([])
  const [bpm, setBpm] = useState(120)
  const [timeSignature, setTimeSignature] = useState({ numerator: 4, denominator: 4 })
  const [exportMidi, setExportMidi] = useState(true)
  const [exportAsciiTab, setExportAsciiTab] = useState(true)
  const [isConverting, setIsConverting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [exportFolder, setExportFolder] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadFile(file: File): Promise<void> {
    if (!GP_RE.test(file.name)) {
      setConvertError('Only Guitar Pro files (.gp, .gp3, .gp4, .gp5, .gpx, .ptb) are supported.')
      return
    }
    setConvertError(null)
    setExportFolder(null)
    try {
      const buf = await file.arrayBuffer()
      const result = parseGuitarProMultiTrack(buf)
      const tracks: ConvertedTrack[] = result.tracks.map((track) => {
        const info = result.detectedTracks.find((d) => d.name === track.name)
        const defaultProgram = track.type === 'guitar' ? 27 : track.type === 'bass' ? 33 : 0
        return {
          name: track.name,
          safeName: track.safeName,
          type: track.type,
          notes: track.notes,
          program: info?.program ?? defaultProgram
        }
      })
      setConverterFile(file)
      setConvertedTracks(tracks)
      setBpm(result.bpm)
      setTimeSignature(result.timeSignature)
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Failed to parse Guitar Pro file.')
    }
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

  async function onDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await loadFile(file)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    if (file) await loadFile(file)
    e.target.value = ''
  }

  async function handleConvert(): Promise<void> {
    if (convertedTracks.length === 0 || (!exportMidi && !exportAsciiTab)) return
    setIsConverting(true)
    setConvertError(null)
    try {
      const fileEntries: Array<{ filename: string; data: ArrayBuffer | string }> = []
      if (exportMidi) {
        const midiFiles = await convertTracksToMidi(convertedTracks, bpm, timeSignature)
        fileEntries.push(...midiFiles)
      }
      if (exportAsciiTab) {
        const tabFiles = convertTracksToAsciiTab(convertedTracks, bpm, timeSignature)
        fileEntries.push(...tabFiles)
      }
      if (fileEntries.length === 0) {
        setConvertError('No files to export — the file may have empty tracks.')
        return
      }
      const result = await window.api.exportSession({ files: fileEntries })
      if (!result.canceled) {
        if (result.error) setConvertError(result.error)
        else setExportFolder(result.folder ?? null)
      }
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Conversion failed.')
    } finally {
      setIsConverting(false)
    }
  }

  const canConvert = convertedTracks.length > 0 && (exportMidi || exportAsciiTab) && !isConverting

  let buttonLabel = '🔄 Convert and Export'
  if (isConverting) buttonLabel = '⏳ Converting...'
  else if (exportFolder) buttonLabel = `✅ Exported to ${exportFolder}`

  return (
    <div className="converter-panel">
      {/* Drop zone */}
      <div
        className={`converter-dropzone${isDragging ? ' dragging' : ''}${converterFile ? ' loaded' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        aria-label="Drop a Guitar Pro file or click to browse"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".gp,.gp3,.gp4,.gp5,.gpx,.ptb"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
        {converterFile ? (
          <>
            <div className="converter-dropzone-icon">📂</div>
            <div className="converter-dropzone-filename">{converterFile.name}</div>
            <div className="converter-dropzone-hint">Click or drop to change file</div>
          </>
        ) : (
          <>
            <div className="converter-dropzone-icon">📂</div>
            <div className="converter-dropzone-label">Drop a Guitar Pro file here</div>
            <div className="converter-dropzone-hint">
              .gp .gp3 .gp4 .gp5 .gpx .ptb · or click to browse
            </div>
          </>
        )}
      </div>

      {/* Detected tracks + tempo info */}
      {convertedTracks.length > 0 && (
        <div className="converter-section-row">
          <div className="converter-section-col">
            <h3 className="converter-section-title">DETECTED TRACKS</h3>
            <div className="converter-tracks">
              {convertedTracks.map((track) => (
                <div key={track.safeName} className="converter-track">
                  <span className="converter-track-icon">{TRACK_ICONS[track.type] ?? '?'}</span>
                  <span className="converter-track-name">{track.name}</span>
                  <span className="converter-track-type">— {track.type}</span>
                  <span className="converter-track-notes">
                    {track.notes.length.toLocaleString()} notes
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="converter-section-col converter-section-col--narrow">
            <h3 className="converter-section-title">BPM</h3>
            <span className="converter-stat-value">{bpm}</span>
            <h3 className="converter-section-title converter-section-title--spaced">TIME SIG</h3>
            <span className="converter-stat-value">
              {timeSignature.numerator}/{timeSignature.denominator}
            </span>
          </div>
        </div>
      )}

      {/* Format checkboxes */}
      <div>
        <h3 className="converter-section-title">CONVERT TO</h3>
        <div className="converter-options">
          <label className="converter-option">
            <input
              type="checkbox"
              checked={exportMidi}
              onChange={(e) => {
                setExportMidi(e.target.checked)
                setExportFolder(null)
              }}
            />
            <span className="converter-option-label">MIDI (.mid) — one file per track</span>
          </label>
          <label className="converter-option">
            <input
              type="checkbox"
              checked={exportAsciiTab}
              onChange={(e) => {
                setExportAsciiTab(e.target.checked)
                setExportFolder(null)
              }}
            />
            <span className="converter-option-label">ASCII Tab (.txt) — one file per track</span>
          </label>
          <label className="converter-option">
            <input type="checkbox" disabled />
            <span className="converter-option-label disabled">MusicXML (.xml) — coming soon</span>
          </label>
          <p className="converter-option-sub">MusicXML export is planned for a future release.</p>
        </div>
      </div>

      {/* Convert button */}
      <div className="converter-actions">
        <button type="button" className="btn-export" disabled={!canConvert} onClick={handleConvert}>
          {buttonLabel}
        </button>
        {convertError && <p className="export-error">{convertError}</p>}
      </div>
    </div>
  )
}
