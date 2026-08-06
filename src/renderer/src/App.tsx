import { useState, useRef, useEffect, type JSX } from 'react'
import { UpdateNotification } from './components/UpdateNotification'
import { Midi } from '@tonejs/midi'
import './assets/base.css'
import './assets/main.css'
import { InstrumentCard } from './components/InstrumentCard'
import { InstrumentTabs } from './components/InstrumentTabs'
import { ExportPanel } from './components/ExportPanel'
import { InstrumentSelectDialog } from './components/InstrumentSelectDialog'
import { parseGuitarPro } from './utils/guitarProParser'
import { parseMidi } from './utils/midiParser'
import { parseMusicXml } from './utils/musicXmlParser'
import { parseTab, runTabParserTests } from './utils/tabParser'
import { generateDiWav, type ProgressCallback } from './utils/diWavGenerator'
import { generateDrumDiWav, type DrumStyle } from './utils/drumDiGenerator'
import { generateBassDiWav, type BassStyle } from './utils/bassDiGenerator'
import { generateDrumMidi } from './utils/drumMidiGenerator'
import { generateBassMidi } from './utils/bassMidiGenerator'
import {
  detectInstrumentFromFilename,
  detectInstrumentFromGuitarPro
} from './utils/instrumentDetector'
import { drumPatternToNotes } from './utils/drumPatternToNotes'
import { extractBassNotes } from './utils/bassNoteExtractor'
import type { AudioQuality, InstrumentPresets } from './components/AudioQualityPanel'
import type {
  AnalysisResult,
  Note,
  TimeSig,
  InstrumentKey,
  InstrumentSlot,
  ExportMode
} from './types'

const GP_RE = /\.(gp|gp3|gp4|gp5|gpx|ptb)$/i
const MIDI_RE = /\.midi?$/i
const XML_RE = /\.(musicxml|xml)$/i

const TS_NUMERATORS = [2, 3, 4, 5, 6, 7, 8]
const TS_DENOMINATORS = [2, 4, 8, 16]

function emptySlot(): InstrumentSlot {
  return { loaded: false, fileName: null, notes: [], analysisResult: null }
}

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

function clampBPM(v: number): number {
  return Math.max(20, Math.min(300, Math.round(v)))
}

function App(): JSX.Element {
  // ── Dev-mode self-tests ─────────────────────────────────────
  useEffect(() => {
    if (import.meta.env.DEV) runTabParserTests()
  }, [])

  // ── Instrument slots ────────────────────────────────────────
  const [guitar, setGuitar] = useState<InstrumentSlot>(emptySlot())
  const [bass, setBass] = useState<InstrumentSlot>(emptySlot())
  const [drums, setDrums] = useState<InstrumentSlot>(emptySlot())

  // ── Global transport ────────────────────────────────────────
  const [userBPM, setUserBPM] = useState(120)
  const [userTimeSig, setUserTimeSig] = useState<TimeSig>({ numerator: 4, denominator: 4 })
  const bpmPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bpmPressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Export state ────────────────────────────────────────────
  const [exportMode, setExportMode] = useState<ExportMode>('wav')
  const [exportGuitar, setExportGuitar] = useState(false)
  const [exportBass, setExportBass] = useState(false)
  const [exportDrums, setExportDrums] = useState(false)
  const [drumStyle, setDrumStyle] = useState<DrumStyle>('rock')
  const [bassStyle, setBassStyle] = useState<BassStyle>('root')
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('standard')
  const [instrumentPresets, setInstrumentPresets] = useState<InstrumentPresets>({
    guitar: 27, // Electric Guitar (clean), 0-indexed
    bass: 33, // Electric Bass (finger), 0-indexed
    drumKit: 0 // Standard Kit
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [exportProgress, setExportProgress] = useState<{
    percent: number
    message: string
  } | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [exportFolder, setExportFolder] = useState<string | null>(null)

  // ── Analysis panel state ────────────────────────────────────
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<InstrumentKey>('guitar')

  // ── Global drag-and-drop ────────────────────────────────────
  const [globalDragging, setGlobalDragging] = useState(false)
  const [pendingDropFile, setPendingDropFile] = useState<File | null>(null)

  // ── Slot management ─────────────────────────────────────────

  function loadSlot(instrument: InstrumentKey, result: AnalysisResult, fileName: string): void {
    const slot: InstrumentSlot = {
      loaded: true,
      fileName,
      notes: result.notes,
      analysisResult: result
    }
    // Set global BPM/time sig from the first instrument loaded.
    const noneLoaded = !guitar.loaded && !bass.loaded && !drums.loaded
    if (noneLoaded) {
      setUserBPM(result.bpm)
      setUserTimeSig(parseTimeSig(result.timeSig))
    }
    setActiveAnalysisTab(instrument)
    if (instrument === 'guitar') {
      setGuitar(slot)
      setExportGuitar(true)
    } else if (instrument === 'bass') {
      setBass(slot)
      setExportBass(true)
    } else {
      setDrums(slot)
      setExportDrums(true)
    }
    setGenerateError(null)
    setExportFolder(null)
  }

  function clearSlot(instrument: InstrumentKey): void {
    const empty = emptySlot()
    if (instrument === 'guitar') {
      setGuitar(empty)
      setExportGuitar(false)
    } else if (instrument === 'bass') {
      setBass(empty)
      setExportBass(false)
    } else {
      setDrums(empty)
      setExportDrums(false)
    }
  }

  // ── BPM hold-to-repeat ──────────────────────────────────────

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

  // ── Global drag-and-drop ────────────────────────────────────

  function onAppDragOver(e: React.DragEvent): void {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setGlobalDragging(true)
    }
  }

  function onAppDragLeave(e: React.DragEvent): void {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setGlobalDragging(false)
    }
  }

  async function loadFileToSlot(file: File, instrument: InstrumentKey): Promise<void> {
    try {
      let result: AnalysisResult
      if (GP_RE.test(file.name)) {
        result = parseGuitarPro(await file.arrayBuffer())
      } else if (MIDI_RE.test(file.name)) {
        result = parseMidi(new Midi(await file.arrayBuffer()))
      } else if (XML_RE.test(file.name)) {
        result = parseMusicXml(await file.text())
      } else {
        const parsed = parseTab(await file.text())
        if (parsed.errors.length > 0) throw new Error(parsed.errors[0])
        result = {
          bpm: parsed.analysisResult.bpm,
          timeSig: `${parsed.analysisResult.timeSignature.numerator}/${parsed.analysisResult.timeSignature.denominator}`,
          key: parsed.analysisResult.detectedKey ?? 'Unknown',
          notes: parsed.notes
        }
      }
      loadSlot(instrument, result, file.name)
    } catch {
      // Per-card errors are shown in InstrumentCard; global drop errors are silent here.
    }
  }

  async function onAppDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault()
    setGlobalDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return

    // Try filename heuristic first.
    let detected = detectInstrumentFromFilename(file.name)

    // For Guitar Pro files, try reading track metadata.
    if (!detected && GP_RE.test(file.name)) {
      const buf = await file.arrayBuffer()
      detected = detectInstrumentFromGuitarPro(buf)
      if (detected) {
        const result = parseGuitarPro(buf)
        loadSlot(detected, result, file.name)
        return
      }
    }

    if (detected) {
      await loadFileToSlot(file, detected)
    } else {
      setPendingDropFile(file)
    }
  }

  async function onDialogSelect(instrument: InstrumentKey): Promise<void> {
    const file = pendingDropFile
    setPendingDropFile(null)
    if (file) await loadFileToSlot(file, instrument)
  }

  // ── Export ──────────────────────────────────────────────────

  async function handleGenerateStandard(): Promise<void> {
    const fileEntries: Array<[string, ArrayBuffer | string]> = []

    // Collect WAV generation tasks in display order so progress stages are sequential.
    type WavTask = {
      label: string
      run: (cb: ProgressCallback) => Promise<[string, ArrayBuffer]>
    }
    const wavTasks: WavTask[] = []

    if (exportGuitar && guitar.loaded) {
      const scaled = scaleNotes(guitar.notes, guitar.analysisResult!.bpm, userBPM)
      wavTasks.push({
        label: 'Guitar',
        run: async (cb) => ['guitar_di.wav', await generateDiWav(scaled, cb)]
      })
    }

    if (exportBass && bass.loaded) {
      const scaled = scaleNotes(bass.notes, bass.analysisResult!.bpm, userBPM)
      if (exportMode === 'wav') {
        wavTasks.push({
          label: 'Bass',
          run: async (cb) => [
            'bass_di.wav',
            await generateBassDiWav(userBPM, bassStyle, scaled, cb)
          ]
        })
      } else {
        fileEntries.push(['bass_track.mid', generateBassMidi(userBPM, bassStyle, scaled)])
      }
    }

    if (exportDrums && drums.loaded) {
      const scaled = scaleNotes(drums.notes, drums.analysisResult!.bpm, userBPM)
      if (exportMode === 'wav') {
        wavTasks.push({
          label: 'Drums',
          run: async (cb) => [
            'drum_track.wav',
            await generateDrumDiWav(userBPM, drumStyle, scaled, cb)
          ]
        })
      } else {
        fileEntries.push(['drum_track.mid', generateDrumMidi(userBPM, drumStyle, scaled)])
      }
    }

    setExportProgress({ percent: 5, message: 'Preparing...' })

    for (let i = 0; i < wavTasks.length; i++) {
      const task = wavTasks[i]
      const stageStart = 10 + Math.floor((i / wavTasks.length) * 80)
      const stageEnd = 10 + Math.floor(((i + 1) / wavTasks.length) * 80)
      const cb: ProgressCallback = (pct, msg) => {
        setExportProgress({
          percent: stageStart + Math.floor((pct / 100) * (stageEnd - stageStart)),
          message: `${task.label}: ${msg}`
        })
      }
      const [filename, wav] = await task.run(cb)
      fileEntries.push([filename, wav])
    }

    setExportProgress({ percent: 93, message: 'Writing files...' })

    fileEntries.push(['session.txt', buildSessionTxt()])

    const result = await window.api.exportSession({
      files: fileEntries.map(([filename, data]) => ({ filename, data }))
    })

    if (!result.canceled) {
      if (result.error) setGenerateError(result.error)
      else setExportFolder(result.folder ?? null)
    }
  }

  async function handleGenerateEnhanced(): Promise<void> {
    const folderResult = await window.api.pickExportFolder()
    if (folderResult.canceled || !folderResult.folder) return
    const folder = folderResult.folder

    const fsStatus = await window.api.checkFluidSynth()
    if (!fsStatus.fluidSynthFound || !fsStatus.soundFontFound) {
      const missing = !fsStatus.fluidSynthFound ? 'FluidSynth binary' : 'SoundFont file'
      setGenerateError(
        `Enhanced mode requires ${missing}. Use "View Setup Guide" in the Export panel.`
      )
      return
    }

    const tasks: Array<Promise<{ success: boolean; error?: string }>> = []

    if (exportGuitar && guitar.loaded) {
      const scaled = scaleNotes(guitar.notes, guitar.analysisResult!.bpm, userBPM)
      tasks.push(
        window.api.renderInstrumentWavEnhanced({
          notes: scaled,
          instrument: 'guitar',
          bpm: userBPM,
          timeSignature: userTimeSig,
          folder,
          filename: 'guitar_di.wav',
          gmProgram: instrumentPresets.guitar
        })
      )
    }

    if (exportBass && bass.loaded) {
      const scaled = scaleNotes(bass.notes, bass.analysisResult!.bpm, userBPM)
      const bassNotes = extractBassNotes(userBPM, bassStyle, scaled)
      tasks.push(
        window.api.renderInstrumentWavEnhanced({
          notes: bassNotes,
          instrument: 'bass',
          bpm: userBPM,
          timeSignature: userTimeSig,
          folder,
          filename: 'bass_di.wav',
          gmProgram: instrumentPresets.bass
        })
      )
    }

    if (exportDrums && drums.loaded) {
      const scaledDrums = scaleNotes(drums.notes, drums.analysisResult!.bpm, userBPM)
      const songLength =
        scaledDrums.length > 0
          ? Math.max(...scaledDrums.map((n) => n.startTime + n.duration))
          : (60 / userBPM) * 16
      const drumNotes = drumPatternToNotes(userBPM, drumStyle, songLength)
      tasks.push(
        window.api.renderInstrumentWavEnhanced({
          notes: drumNotes,
          instrument: 'drums',
          bpm: userBPM,
          timeSignature: userTimeSig,
          folder,
          filename: 'drum_track.wav',
          drumKitVariation: instrumentPresets.drumKit
        })
      )
    }

    const results = await Promise.all(tasks)
    const failed = results.find((r) => !r.success)
    if (failed) {
      setGenerateError(failed.error ?? 'FluidSynth rendering failed.')
      return
    }

    await window.api.writeTextFile({
      folder,
      filename: 'session.txt',
      content: buildSessionTxt(true)
    })

    setExportFolder(folder)
  }

  async function handleGenerate(): Promise<void> {
    setIsGenerating(true)
    setExportProgress(null)
    setGenerateError(null)
    setExportFolder(null)
    try {
      if (audioQuality === 'enhanced') {
        await handleGenerateEnhanced()
      } else {
        await handleGenerateStandard()
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setIsGenerating(false)
      setExportProgress(null)
    }
  }

  function buildSessionTxt(isEnhanced = false): string {
    const now = new Date()
    const timeStr = now.toTimeString().split(' ')[0] ?? ''
    const formatLabel = isEnhanced ? 'WAV (FluidSynth Enhanced)' : exportMode.toUpperCase()
    const lines: string[] = [
      'TAB TO BACKING TRACK — SESSION NOTES',
      '=====================================',
      `Date:            ${now.toDateString()} ${timeStr}`,
      `BPM:             ${userBPM}`,
      `Time Signature:  ${userTimeSig.numerator}/${userTimeSig.denominator}`,
      `Export Format:   ${formatLabel}`,
      ''
    ]

    const loadedKeys: Array<{ key: InstrumentKey; slot: InstrumentSlot }> = []
    if (exportGuitar && guitar.loaded) loadedKeys.push({ key: 'guitar', slot: guitar })
    if (exportBass && bass.loaded) loadedKeys.push({ key: 'bass', slot: bass })
    if (exportDrums && drums.loaded) loadedKeys.push({ key: 'drums', slot: drums })

    if (loadedKeys.length > 0) {
      lines.push('KEY DETECTION')
      lines.push('=====================================')
      for (const { key, slot } of loadedKeys) {
        const name = key.charAt(0).toUpperCase() + key.slice(1)
        lines.push(`${name.padEnd(8)} ${slot.analysisResult?.key ?? 'Unknown'}`)
      }
      lines.push('')
    }

    lines.push('OUTPUT FILES')
    lines.push('=====================================')
    if (exportGuitar && guitar.loaded) {
      lines.push('guitar_di.wav    — Guitar dry DI signal')
    }
    if (exportBass && bass.loaded) {
      const file = exportMode === 'wav' ? 'bass_di.wav' : 'bass_track.mid'
      const desc =
        exportMode === 'wav' ? `Bass dry DI signal (${bassStyle})` : `Bass MIDI (${bassStyle})`
      lines.push(`${file.padEnd(16)} — ${desc}`)
    }
    if (exportDrums && drums.loaded) {
      const file = exportMode === 'wav' ? 'drum_track.wav' : 'drum_track.mid'
      const desc = exportMode === 'wav' ? `Drum synthesis: ${drumStyle}` : `Drum MIDI: ${drumStyle}`
      lines.push(`${file.padEnd(16)} — ${desc}`)
    }
    lines.push('')
    lines.push(`Import all files into your DAW and set the project tempo to ${userBPM} BPM.`)

    return lines.join('\n')
  }

  // ── Derived: active analysis slot ───────────────────────────

  const activeSlot: InstrumentSlot | null = (() => {
    const candidates: InstrumentSlot[] = []
    if (activeAnalysisTab === 'guitar' && guitar.loaded) return guitar
    if (activeAnalysisTab === 'bass' && bass.loaded) return bass
    if (activeAnalysisTab === 'drums' && drums.loaded) return drums
    // Fall back to first loaded slot
    if (guitar.loaded) candidates.push(guitar)
    if (bass.loaded) candidates.push(bass)
    if (drums.loaded) candidates.push(drums)
    return candidates[0] ?? null
  })()

  const detectedTimeSig = activeSlot?.analysisResult
    ? parseTimeSig(activeSlot.analysisResult.timeSig)
    : null
  const bpmEdited = activeSlot !== null && userBPM !== activeSlot.analysisResult?.bpm
  const timeSigEdited =
    detectedTimeSig !== null &&
    (userTimeSig.numerator !== detectedTimeSig.numerator ||
      userTimeSig.denominator !== detectedTimeSig.denominator)

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="app" onDragOver={onAppDragOver} onDragLeave={onAppDragLeave} onDrop={onAppDrop}>
      {/* ── Update notification banner (hidden when no update) ── */}
      <UpdateNotification />

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
          {/* Input Panel — three instrument cards side by side */}
          <section className="panel panel-input">
            <h2 className="panel-title">Input</h2>
            <div className="instrument-cards">
              <InstrumentCard
                instrument="guitar"
                loaded={guitar.loaded}
                fileName={guitar.fileName}
                onLoad={(result, fileName) => loadSlot('guitar', result, fileName)}
                onClear={() => clearSlot('guitar')}
              />
              <InstrumentCard
                instrument="bass"
                loaded={bass.loaded}
                fileName={bass.fileName}
                onLoad={(result, fileName) => loadSlot('bass', result, fileName)}
                onClear={() => clearSlot('bass')}
              />
              <InstrumentCard
                instrument="drums"
                loaded={drums.loaded}
                fileName={drums.fileName}
                onLoad={(result, fileName) => loadSlot('drums', result, fileName)}
                onClear={() => clearSlot('drums')}
              />
            </div>
          </section>

          {/* Analysis Panel */}
          <section className="panel panel-analysis">
            <h2 className="panel-title">Analysis</h2>

            {/* Tab strip — only shown when 2+ slots are loaded */}
            <InstrumentTabs
              guitar={guitar}
              bass={bass}
              drums={drums}
              activeTab={activeAnalysisTab}
              onTabChange={setActiveAnalysisTab}
            />

            <div className="analysis-grid">
              {/* Key — per active slot */}
              {activeSlot?.analysisResult && (
                <div className="analysis-stat">
                  <span className="stat-label">Key</span>
                  <span className="stat-value">{activeSlot.analysisResult.key}</span>
                </div>
              )}

              {/* BPM — global, always editable */}
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

              {/* Time Signature — global, always editable */}
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

              {/* Notes detected — per active slot */}
              {activeSlot?.loaded && (
                <div className="analysis-stat">
                  <span className="stat-label">Notes Detected</span>
                  <span className="stat-value">{activeSlot.notes.length.toLocaleString()}</span>
                </div>
              )}
            </div>

            {!activeSlot && (
              <p className="analysis-empty">
                Load a file into any instrument slot to see analysis.
              </p>
            )}
          </section>
        </div>

        {/* ── Export Panel (full width bottom) ───────────── */}
        <ExportPanel
          guitar={guitar}
          bass={bass}
          drums={drums}
          exportGuitar={exportGuitar}
          exportBass={exportBass}
          exportDrums={exportDrums}
          onExportGuitarChange={setExportGuitar}
          onExportBassChange={setExportBass}
          onExportDrumsChange={setExportDrums}
          exportMode={exportMode}
          onExportModeChange={setExportMode}
          drumStyle={drumStyle}
          onDrumStyleChange={setDrumStyle}
          bassStyle={bassStyle}
          onBassStyleChange={setBassStyle}
          audioQuality={audioQuality}
          onAudioQualityChange={setAudioQuality}
          onCheckFluidSynth={() => window.api.checkFluidSynth()}
          instrumentPresets={instrumentPresets}
          onInstrumentPresetsChange={setInstrumentPresets}
          onExport={handleGenerate}
          isGenerating={isGenerating}
          exportProgress={exportProgress}
          generateError={generateError}
          exportFolder={exportFolder}
        />
      </main>

      {/* ── Global drag-and-drop overlay ───────────────────── */}
      {globalDragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <span className="drop-overlay-icon">⬇</span>
            <p className="drop-overlay-label">Drop to load</p>
            <p className="drop-overlay-hint">Guitar Pro · MIDI · MusicXML · Tab</p>
          </div>
        </div>
      )}

      {/* ── Instrument selection dialog ─────────────────────── */}
      {pendingDropFile && (
        <InstrumentSelectDialog
          filename={pendingDropFile.name}
          onSelect={onDialogSelect}
          onCancel={() => setPendingDropFile(null)}
        />
      )}
    </div>
  )
}

export default App
