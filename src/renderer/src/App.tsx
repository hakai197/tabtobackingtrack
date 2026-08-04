import { useState, useEffect, useRef, type JSX } from 'react'
import { Midi } from '@tonejs/midi'
import './assets/base.css'
import './assets/main.css'
import { GuitarProDropzone } from './components/GuitarProDropzone'
import { MidiDropzone } from './components/MidiDropzone'
import { TabInput } from './components/TabInput'
import { MusicXmlDropzone } from './components/MusicXmlDropzone'
import { parseGuitarPro } from './utils/guitarProParser'
import { parseMidi } from './utils/midiParser'
import { parseMusicXml } from './utils/musicXmlParser'
import { generateDiWav } from './utils/diWavGenerator'
import { generateDrumMidi, type DrumStyle } from './utils/drumMidiGenerator'
import { generateBassMidi, type BassStyle } from './utils/bassMidiGenerator'
import type { AnalysisResult, Note, TimeSig } from './types'

type InputMode = 'guitarpro' | 'midi' | 'tab' | 'musicxml'

const DRUM_STYLES: { value: DrumStyle; label: string }[] = [
  { value: 'rock', label: 'Rock' },
  { value: 'shuffle', label: 'Shuffle' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'pop', label: 'Pop' }
]

const BASS_STYLES: { value: BassStyle; label: string }[] = [
  { value: 'root', label: 'Root' },
  { value: 'root-fifth', label: 'Root-Fifth' },
  { value: 'walking', label: 'Walking' }
]

const TS_NUMERATORS = [2, 3, 4, 5, 6, 7, 8]
const TS_DENOMINATORS = [2, 4, 8, 16]

// Extension → input mode for global drag-and-drop routing.
const GP_RE = /\.(gp|gp3|gp4|gp5|gpx|ptb)$/i
const MIDI_RE = /\.midi?$/i
const XML_RE = /\.(musicxml|xml)$/i

function detectMode(filename: string): InputMode | null {
  if (GP_RE.test(filename)) return 'guitarpro'
  if (MIDI_RE.test(filename)) return 'midi'
  if (XML_RE.test(filename)) return 'musicxml'
  return null
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target!.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsArrayBuffer(file)
  })
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target!.result as string)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsText(file, 'UTF-8')
  })
}

// Re-time notes from detectedBPM to targetBPM by scaling all time values.
// Notes are stored in seconds; the ratio gives correct absolute positions at
// the new tempo without touching pitch or velocity.
function scaleNotes(notes: Note[], fromBPM: number, toBPM: number): Note[] {
  if (fromBPM === toBPM) return notes
  const factor = fromBPM / toBPM
  return notes.map((n) => ({
    ...n,
    startTime: n.startTime * factor,
    duration: n.duration * factor
  }))
}

function parseTimeSig(raw: string): TimeSig {
  const parts = raw.split('/')
  const num = parseInt(parts[0] ?? '4', 10)
  const den = parseInt(parts[1] ?? '4', 10)
  return {
    numerator: isNaN(num) || num < 1 ? 4 : num,
    denominator: isNaN(den) || den < 1 ? 4 : den
  }
}

function App(): JSX.Element {
  const [inputMode, setInputMode] = useState<InputMode>('guitarpro')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [drumStyle, setDrumStyle] = useState<DrumStyle>('rock')
  const [bassStyle, setBassStyle] = useState<BassStyle>('root')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [exportFolder, setExportFolder] = useState<string | null>(null)
  // Global drag-and-drop state
  const [globalDragging, setGlobalDragging] = useState(false)
  const [globalFilename, setGlobalFilename] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  // Incrementing key forces the active dropzone to remount on clear or global drop.
  const [clearKey, setClearKey] = useState(0)
  // User-editable transport values — initialised from detected values on each new analysis.
  const [userBPM, setUserBPM] = useState<number>(120)
  const [userTimeSig, setUserTimeSig] = useState<TimeSig>({ numerator: 4, denominator: 4 })
  // Refs for BPM hold-to-repeat behaviour.
  const bpmPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bpmPressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync transport values whenever analysis changes (new file or clear).
  useEffect(() => {
    if (analysis) {
      setUserBPM(analysis.bpm)
      setUserTimeSig(parseTimeSig(analysis.timeSig))
    } else {
      setUserBPM(120)
      setUserTimeSig({ numerator: 4, denominator: 4 })
    }
  }, [analysis])

  function switchMode(mode: InputMode): void {
    setInputMode(mode)
    setAnalysis(null)
    setGlobalFilename(null)
    setParseError(null)
    setExportFolder(null)
    setClearKey((k) => k + 1)
  }

  function handleClear(): void {
    setAnalysis(null)
    setGlobalFilename(null)
    setParseError(null)
    setExportFolder(null)
    setClearKey((k) => k + 1)
  }

  // ── BPM control ─────────────────────────────────────────────────────────────

  function clampBPM(v: number): number {
    return Math.max(20, Math.min(300, Math.round(v)))
  }

  function stepBPM(delta: number): void {
    setUserBPM((prev) => clampBPM(prev + delta))
  }

  function onBpmDown(delta: number): void {
    stepBPM(delta)
    bpmPressTimer.current = setTimeout(() => {
      bpmPressInterval.current = setInterval(() => stepBPM(delta), 80)
    }, 400)
  }

  function onBpmUp(): void {
    if (bpmPressTimer.current) {
      clearTimeout(bpmPressTimer.current)
      bpmPressTimer.current = null
    }
    if (bpmPressInterval.current) {
      clearInterval(bpmPressInterval.current)
      bpmPressInterval.current = null
    }
  }

  // ── Global drag-and-drop ────────────────────────────────────────────────────

  function onAppDragOver(e: React.DragEvent): void {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setGlobalDragging(true)
    }
  }

  function onAppDragLeave(e: React.DragEvent): void {
    // Only dismiss overlay when the drag truly leaves the app window.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setGlobalDragging(false)
    }
  }

  async function onAppDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault()
    setGlobalDragging(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    const mode = detectMode(file.name)
    if (!mode) {
      setParseError(`Unsupported file: .${file.name.split('.').pop() ?? ''}`)
      return
    }

    setParseError(null)
    setAnalysis(null)
    setExportFolder(null)

    try {
      let result: AnalysisResult
      if (mode === 'guitarpro') {
        result = parseGuitarPro(await readAsArrayBuffer(file))
      } else if (mode === 'midi') {
        result = parseMidi(new Midi(await readAsArrayBuffer(file)))
      } else {
        result = parseMusicXml(await readAsText(file))
      }
      setGlobalFilename(file.name)
      setInputMode(mode)
      setClearKey((k) => k + 1)
      setAnalysis(result)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse file.')
      setGlobalFilename(null)
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  async function handleGenerate(): Promise<void> {
    if (!analysis) return
    setIsGenerating(true)
    setGenerateError(null)
    setExportFolder(null)
    try {
      // Scale note times from the originally-detected BPM to the user's chosen BPM.
      // Pitches and velocities are left untouched.
      const scaledNotes = scaleNotes(analysis.notes, analysis.bpm, userBPM)

      const guitarDiWav = await generateDiWav(scaledNotes)
      const drumMidi = generateDrumMidi(userBPM, drumStyle, scaledNotes, userTimeSig)
      const bassMidi = generateBassMidi(userBPM, bassStyle, scaledNotes, userTimeSig)

      const grooveLabel = DRUM_STYLES.find((s) => s.value === drumStyle)?.label ?? drumStyle
      const bassLabel = BASS_STYLES.find((s) => s.value === bassStyle)?.label ?? bassStyle
      const sessionTxt = [
        'TAB TO BACKING TRACK — SESSION NOTES',
        '=====================================',
        `Date:            ${new Date().toDateString()}`,
        `Key:             ${analysis.key}`,
        `BPM:             ${userBPM}`,
        `Time Signature:  ${userTimeSig.numerator}/${userTimeSig.denominator}`,
        `Notes Detected:  ${analysis.notes.length}`,
        '',
        'OUTPUT FILES',
        '=====================================',
        'guitar_di.wav    — Dry instrument signal (DI)',
        `drum_track.mid   — Drum groove: ${grooveLabel}`,
        `bass_track.mid   — Bass line: ${bassLabel}`,
        '',
        `Import all three files into your DAW and set the project tempo to ${userBPM} BPM.`
      ].join('\n')

      const result = await window.api.exportSession({ guitarDiWav, drumMidi, bassMidi, sessionTxt })

      if (result.canceled) return
      if (result.error) {
        setGenerateError(result.error)
      } else {
        setExportFolder(result.folder ?? null)
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Derived: edited-badge visibility ─────────────────────────────────────────

  const detectedTimeSig = analysis ? parseTimeSig(analysis.timeSig) : null
  const bpmEdited = analysis !== null && userBPM !== analysis.bpm
  const timeSigEdited =
    detectedTimeSig !== null &&
    (userTimeSig.numerator !== detectedTimeSig.numerator ||
      userTimeSig.denominator !== detectedTimeSig.denominator)

  // ── Render ──────────────────────────────────────────────────────────────────

  const activeDropzone = (() => {
    const props = { key: clearKey, defaultFilename: globalFilename ?? undefined }
    if (inputMode === 'guitarpro') return <GuitarProDropzone {...props} onAnalysis={setAnalysis} />
    if (inputMode === 'midi') return <MidiDropzone {...props} onAnalysis={setAnalysis} />
    if (inputMode === 'tab') return <TabInput key={clearKey} onAnalysis={setAnalysis} />
    return <MusicXmlDropzone {...props} onAnalysis={setAnalysis} />
  })()

  return (
    <div className="app" onDragOver={onAppDragOver} onDragLeave={onAppDragLeave} onDrop={onAppDrop}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="app-header">
        <h1>
          🎸 Tab to <span className="accent">Backing Track</span>
        </h1>
      </header>

      {/* ── Main Body ──────────────────────────────────────── */}
      <main className="app-body">
        {/* ── Top Row: Input + Analysis ──────────────────── */}
        <div className="app-top-row">
          {/* Input Panel */}
          <section className="panel panel-input">
            <div className="panel-header">
              <h2 className="panel-title">Input</h2>
              <div className="input-mode-tabs">
                {(
                  [
                    { value: 'guitarpro', label: 'Guitar Pro' },
                    { value: 'midi', label: 'MIDI' },
                    { value: 'tab', label: 'Tab' },
                    { value: 'musicxml', label: 'MusicXML' }
                  ] as { value: InputMode; label: string }[]
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`input-mode-tab ${inputMode === value ? 'active' : ''}`}
                    onClick={() => switchMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {parseError && <p className="parse-error">{parseError}</p>}
            {activeDropzone}
          </section>

          {/* Analysis Panel */}
          <section className="panel panel-analysis">
            <div className="panel-header">
              <h2 className="panel-title">Analysis</h2>
              {analysis && (
                <button type="button" className="btn-clear" onClick={handleClear}>
                  Clear
                </button>
              )}
            </div>

            <div className="analysis-grid">
              {/* Key — read-only, only when analysis is loaded */}
              {analysis && (
                <div className="analysis-stat">
                  <span className="stat-label">Key</span>
                  <span className="stat-value">{analysis.key}</span>
                </div>
              )}

              {/* BPM — always editable */}
              <div className="analysis-stat">
                <span className="stat-label">
                  BPM
                  {bpmEdited && <span className="badge-edited">edited</span>}
                </span>
                <div className="bpm-control">
                  <button
                    type="button"
                    className="btn-bpm-step"
                    onMouseDown={() => onBpmDown(-1)}
                    onMouseUp={onBpmUp}
                    onMouseLeave={onBpmUp}
                    aria-label="Decrease BPM"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    className="bpm-input"
                    value={userBPM}
                    min={20}
                    max={300}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v)) setUserBPM(clampBPM(v))
                    }}
                    aria-label="BPM"
                  />
                  <button
                    type="button"
                    className="btn-bpm-step"
                    onMouseDown={() => onBpmDown(1)}
                    onMouseUp={onBpmUp}
                    onMouseLeave={onBpmUp}
                    aria-label="Increase BPM"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Time Signature — always editable */}
              <div className="analysis-stat">
                <span className="stat-label">
                  Time Signature
                  {timeSigEdited && <span className="badge-edited">edited</span>}
                </span>
                <div className="timesig-control">
                  <select
                    className="timesig-select"
                    value={userTimeSig.numerator}
                    onChange={(e) =>
                      setUserTimeSig((prev) => ({
                        ...prev,
                        numerator: parseInt(e.target.value, 10)
                      }))
                    }
                    aria-label="Time signature numerator"
                  >
                    {TS_NUMERATORS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="timesig-sep">/</span>
                  <select
                    className="timesig-select"
                    value={userTimeSig.denominator}
                    onChange={(e) =>
                      setUserTimeSig((prev) => ({
                        ...prev,
                        denominator: parseInt(e.target.value, 10)
                      }))
                    }
                    aria-label="Time signature denominator"
                  >
                    {TS_DENOMINATORS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes detected — read-only, only when analysis is loaded */}
              {analysis && (
                <div className="analysis-stat">
                  <span className="stat-label">Notes Detected</span>
                  <span className="stat-value">{analysis.notes.length.toLocaleString()}</span>
                </div>
              )}
            </div>

            {!analysis && (
              <p className="analysis-empty">Load a file to see detected key and note count.</p>
            )}
          </section>
        </div>

        {/* ── Export Panel (full width bottom) ───────────── */}
        <section className="panel panel-export">
          <h2 className="panel-title">Export</h2>
          <div className="groove-row">
            <span className="groove-label">Groove</span>
            <div className="input-mode-tabs">
              {DRUM_STYLES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`input-mode-tab ${drumStyle === value ? 'active' : ''}`}
                  onClick={() => setDrumStyle(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="groove-row">
            <span className="groove-label">Bass</span>
            <div className="input-mode-tabs">
              {BASS_STYLES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`input-mode-tab ${bassStyle === value ? 'active' : ''}`}
                  onClick={() => setBassStyle(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="export-row">
            <button
              type="button"
              className={`btn-export${isGenerating ? ' btn-export--generating' : ''}`}
              disabled={analysis === null || isGenerating}
              onClick={handleGenerate}
            >
              {isGenerating ? 'Generating…' : '🎵 Export Backing Track'}
            </button>
            {generateError && <p className="export-error">{generateError}</p>}
            {exportFolder && !generateError && (
              <p className="export-success">Exported to {exportFolder}</p>
            )}
          </div>
        </section>
      </main>

      {/* ── Global drag-and-drop overlay ───────────────────── */}
      {globalDragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <span className="drop-overlay-icon">⬇</span>
            <p className="drop-overlay-label">Drop to load</p>
            <p className="drop-overlay-hint">Guitar Pro · MIDI · MusicXML</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
