import { useRef, useState, type DragEvent, type ChangeEvent, type JSX } from 'react'
import { Midi } from '@tonejs/midi'
import { parseGuitarPro } from '../utils/guitarProParser'
import { parseMidi } from '../utils/midiParser'
import { parseMusicXml } from '../utils/musicXmlParser'
import { parseTab } from '../utils/tabParser'
import type { AnalysisResult, InstrumentKey } from '../types'

const GP_RE = /\.(gp|gp3|gp4|gp5|gpx|ptb)$/i
const MIDI_RE = /\.midi?$/i
const XML_RE = /\.(musicxml|xml)$/i

const CARD_META: Record<InstrumentKey, { title: string; emoji: string; hint: string }> = {
  guitar: { title: 'Guitar', emoji: '🎸', hint: 'Guitar Pro · MIDI · MusicXML · Tab' },
  bass: { title: 'Bass', emoji: '🎵', hint: 'Guitar Pro · MIDI · MusicXML · Tab' },
  drums: { title: 'Drums', emoji: '🥁', hint: 'Guitar Pro · MIDI · MusicXML · Tab' }
}

type Props = {
  instrument: InstrumentKey
  loaded: boolean
  fileName: string | null
  onLoad: (result: AnalysisResult, fileName: string) => void
  onClear: () => void
}

export function InstrumentCard({
  instrument,
  loaded,
  fileName,
  onLoad,
  onClear
}: Props): JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)
  const [tabText, setTabText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const meta = CARD_META[instrument]

  async function loadFile(file: File): Promise<void> {
    setError(null)
    try {
      let result: AnalysisResult
      if (GP_RE.test(file.name)) {
        result = parseGuitarPro(await file.arrayBuffer())
      } else if (MIDI_RE.test(file.name)) {
        result = parseMidi(new Midi(await file.arrayBuffer()))
      } else if (XML_RE.test(file.name)) {
        result = parseMusicXml(await file.text())
      } else {
        result = parseTab(await file.text())
      }
      onLoad(result, file.name)
      setShowText(false)
      setTabText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
    }
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  function onDragLeave(e: DragEvent): void {
    e.stopPropagation()
    setIsDragging(false)
  }

  async function onDrop(e: DragEvent): Promise<void> {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await loadFile(file)
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (file) void loadFile(file)
    e.target.value = ''
  }

  function onParseTab(): void {
    setError(null)
    try {
      const result = parseTab(tabText)
      onLoad(result, 'pasted tab')
      setShowText(false)
      setTabText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse tab')
    }
  }

  return (
    <div className="instrument-card">
      <div className="instrument-card-header">
        <span className="instrument-card-icon">{meta.emoji}</span>
        <span className="instrument-card-name">{meta.title}</span>
      </div>

      {loaded ? (
        <div className="instrument-card-loaded">
          <span className="instrument-loaded-check">✓</span>
          <span className="instrument-loaded-filename" title={fileName ?? ''}>
            {fileName}
          </span>
          <button type="button" className="btn-clear" onClick={onClear}>
            Clear
          </button>
        </div>
      ) : (
        <>
          <div
            className={`instrument-dropzone${isDragging ? ' dragging' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
            }}
            aria-label={`Drop ${meta.title} file here or click to browse`}
          >
            <span className="instrument-dropzone-icon">📂</span>
            <span className="instrument-dropzone-hint">{meta.hint}</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".gp,.gp3,.gp4,.gp5,.gpx,.ptb,.mid,.midi,.xml,.musicxml,.txt,.cho,.chordpro"
            style={{ display: 'none' }}
            onChange={onFileChange}
          />

          <div className="instrument-card-footer">
            <button
              type="button"
              className="btn-browse"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse
            </button>
            <button type="button" className="btn-link" onClick={() => setShowText((v) => !v)}>
              {showText ? 'Hide tab' : 'Paste tab'}
            </button>
          </div>

          {showText && (
            <div className="instrument-tab-input">
              <textarea
                className="instrument-tab-textarea"
                value={tabText}
                onChange={(e) => setTabText(e.target.value)}
                placeholder="Paste ASCII tab here…"
                rows={3}
              />
              <button
                type="button"
                className="btn-parse"
                disabled={!tabText.trim()}
                onClick={onParseTab}
              >
                Parse
              </button>
            </div>
          )}

          {error && <p className="instrument-card-error">{error}</p>}
        </>
      )}
    </div>
  )
}
