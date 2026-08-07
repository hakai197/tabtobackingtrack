import { useState, useRef, useEffect, type JSX } from 'react'
import { UpdateNotification } from './components/UpdateNotification'
import { ConverterPanel } from './components/ConverterPanel'
import { Midi } from '@tonejs/midi'
import './assets/base.css'
import './assets/main.css'
import { InstrumentCard } from './components/InstrumentCard'
import { InstrumentTabs } from './components/InstrumentTabs'
import { ExportPanel } from './components/ExportPanel'
import { InstrumentSelectDialog } from './components/InstrumentSelectDialog'
import {
  parseGuitarPro,
  parseGuitarProMultiTrack,
  type GuitarProParseResult
} from './utils/guitarProParser'
import { parseMidi } from './utils/midiParser'
import { parseMusicXml } from './utils/musicXmlParser'
import { parseTab, runTabParserTests } from './utils/tabParser'
import { generateDiWav, type ProgressCallback } from './utils/diWavGenerator'
import { generateDrumDiWav, type DrumStyle } from './utils/drumDiGenerator'
import { generateBassDiWav, type BassStyle } from './utils/bassDiGenerator'
import { generateDrumMidi } from './utils/drumMidiGenerator'
import { generateBassMidi } from './utils/bassMidiGenerator'
import { detectInstrumentFromFilename } from './utils/instrumentDetector'
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

type AppMode = 'backing-track' | 'converter'

function App(): JSX.Element {
  // ── Dev-mode self-tests ─────────────────────────────────────
  useEffect(() => {
    if (import.meta.env.DEV) runTabParserTests()
  }, [])

  // ── App mode ────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>('backing-track')

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
    guitar: 27,
    bass: 33,
    drumKit: 0
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

  function loadGuitarProResult(result: GuitarProParseResult, fileName: string): void {
    const noneLoaded = !guitar.loaded && !bass.loaded && !drums.loaded
    if (noneLoaded) {
      setUserBPM(result.bpm)
      setUserTimeSig(result.timeSignature)
    }

    const shared = {
      bpm: result.bpm,
      timeSig: `${result.timeSignature.numerator}/${result.timeSignature.denominator}`,
      key: result.key
    }

    if (result.guitar.length > 0) {
      setGuitar({
        loaded: true,
        fileName,
        notes: result.guitar,
        analysisResult: { ...shared, notes: result.guitar },
        gpTracks: result.tracks.filter((t) => t.type === 'guitar')
      })
      setExportGuitar(true)
      setActiveAnalysisTab('guitar')
    }

    if (result.bass.length > 0) {
      setBass({
        loaded: true,
        fileName,
        notes: result.bass,
        analysisResult: { ...shared, notes: result.bass },
        gpTracks: result.tracks.filter((t) => t.type === 'bass')
      })
      setExportBass(true)
      if (result.guitar.length === 0) setActiveAnalysisTab('bass')
    }

    if (result.drums.length > 0) {
      setDrums({
        loaded: true,
        fileName,
        notes: result.drums,
        analysisResult: { ...shared, notes: result.drums },
        gpTracks: result.tracks.filter((t) => t.type === 'drums')
      })
      setExportDrums(true)
      if (result.guitar.length === 0 && result.bass.length === 0) setActiveAnalysisTab('drums')
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
      // Per-card errors are shown in InstrumentCard
    }
  }

  async function onAppDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault()
    setGlobalDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return

    const target = e.target as HTMLElement
    const isInstrumentCardDrop =
      target.closest('.instrument-dropzone') !== null ||
      target.closest('.instrument-card') !== null
    if (isInstrumentCardDrop) {
      console.log('DROP handled by InstrumentCard — skipping App onAppDrop')
      return
    }

    console.log('DROP FILE:', file.name, '| GP_RE match:', GP_RE.test(file.name))

    if (GP_RE.test(file.name)) {
      const buf = await file.arrayBuffer()
      try {
        const multiResult = parseGuitarProMultiTrack(buf)
        console.log('GP5 multiResult:', {
          guitarNotes: multiResult.guitar.length,
          bassNotes: multiResult.bass.length,
          drumNotes: multiResult.drums.length,
          tracks: multiResult.detectedTracks,
          bpm: multiResult.bpm,
          timeSignature: multiResult.timeSignature
        })
        const hasAny =
          multiResult.guitar.length > 0 ||
          multiResult.bass.length > 0 ||
          multiResult.drums.length > 0
        if (hasAny) {
          loadGuitarProResult(multiResult, file.name)
          return
        }
        console.warn('GP5 parsed but all tracks empty — showing dialog')
      } catch (err) {
        console.error('parseGuitarProMultiTrack error:', err)
      }
      setPendingDropFile(file)
      return
    }

    const detected = detectInstrumentFromFilename(file.name)
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

  async function handleGuitarProDrop(file: File): Promise<void> {
    const buf = await file.arrayBuffer()
    try {
      const multiResult = parseGuitarProMultiTrack(buf)
      console.log('GP5 multiResult:', {
        guitarNotes: multiResult.guitar.length,
        bassNotes: multiResult.bass.length,
        drumNotes: multiResult.drums.length,
        tracks: multiResult.detectedTracks,
        bpm: multiResult.bpm,
        timeSignature: multiResult.timeSignature
      })
      const hasAny =
        multiResult.guitar.length > 0 ||
        multiResult.bass.length > 0 ||
        multiResult.drums.length > 0
      if (hasAny) {
        loadGuitarProResult(multiResult, file.name)
        return
      }
      console.warn('GP5 parsed but all tracks empty')
    } catch (err) {
      console.error('parseGuitarProMultiTrack error:', err)
    }
  }

  // ── Export ──────────────────────────────────────────────────

  async function handleGenerateStandard(): Promise<void> {
    const fileEntries: Array<[string, ArrayBuffer | string]> = []

    type WavTask = {
      label: string
      run: (cb: ProgressCallback) => Promise<[string, ArrayBuffer]>
    }
    const wavTasks: WavTask[] = []

    if (exportGuitar && guitar.loaded) {
      const gpTracks = guitar.gpTracks
      if (gpTracks && gpTracks.length > 0) {
        for (const track of gpTracks) {
          const scaledTrack = scaleNotes(track.notes, guitar.analysisResult!.bpm, userBPM)
          wavTasks.push({
            label: track.name,
            run: async (cb) => [
              `${track.safeName}_di.wav`,
              await generateDiWav(scaledTrack, cb)
            ]
          })
        }
      } else {
        const scaled = scaleNotes(guitar.notes, guitar.analysisResult!.bpm, userBPM)
        wavTasks.push({
          label: 'Guitar',
          run: async (cb) => ['guitar_di.wav', await generateDiWav(scaled, cb)]
        })
      }
    }

    if (exportBass && bass.loaded) {
      const gpTracks = bass.gpTracks
      if (exportMode === 'wav') {
        if (gpTracks && gpTracks.length > 0) {
          for (const track of gpTracks) {
            const scaledTrack = scaleNotes(track.notes, bass.analysisResult!.bpm, userBPM)
            wavTasks.push({
              label: track.name,
              run: async (cb) => [
                `${track.safeName}_di.wav`,
                await generateDiWav(scaledTrack, cb)
              ]
            })
          }
        } else {
          const scaled = scaleNotes(bass.notes, bass.analysisResult!.bpm, userBPM)
          wavTasks.push({
            label: 'Bass',
            run: async (cb) => [
              'bass_di.wav',
              await generateBassDiWav(userBPM, bassStyle, scaled, cb)
            ]
          })
        }
      } else {
        const scaled = scaleNotes(bass.notes, bass.analysisResult!.bpm, userBPM)
        fileEntries.push(['bass_track.mid', generateBassMidi(userBPM, bassStyle, scaled)])
      }
    }

    if (exportDrums && drums.loaded) {
      const gpTracks = drums.gpTracks
      if (exportMode === 'wav') {
        if (gpTracks && gpTracks.length > 0) {
          for (const track of gpTracks) {
            const scaledTrack = scaleNotes(track.notes, drums.analysisResult!.bpm, userBPM)
            wavTasks.push({
              label: track.name,
              run: async (cb) => [
                `${track.safeName}_drum.wav`,
                await generateDrumDiWav(userBPM, drumStyle, scaledTrack, cb)
              ]
            })
          }
        } else {
          const scaled = scaleNotes(drums.notes, drums.analysisResult!.bpm, userBPM)
          wavTasks.push({
            label: 'Drums',
            run: async (cb) => [
              'drum_track.wav',
              await generateDrumDiWav(userBPM, drumStyle, scaled, cb)
            ]
          })
        }
      } else {
        const scaled = scaleNotes(drums.notes, drums.analysisResult!.bpm, userBPM)
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

    setExportProgress({ percent: 10, message: 'Starting FluidSynth...' })

    // ── Guitar — one file per GP5 track if available ──────────
    if (exportGuitar && guitar.loaded) {
      const gpTracks = guitar.gpTracks
      if (gpTracks && gpTracks.length > 0) {
        for (let i = 0; i < gpTracks.length; i++) {
          const track = gpTracks[i]
          const pct = 20 + Math.floor((i / gpTracks.length) * 25)
          setExportProgress({ percent: pct, message: `Rendering ${track.name}...` })
          const scaledTrack = scaleNotes(track.notes, guitar.analysisResult!.bpm, userBPM)
          const result = await window.api.renderInstrumentWavEnhanced({
            notes: scaledTrack,
            instrument: 'guitar',
            bpm: userBPM,
            timeSignature: userTimeSig,
            folder,
            filename: `${track.safeName}_di.wav`,
            gmProgram: instrumentPresets.guitar
          })
          if (!result.success) {
            setGenerateError(result.error ?? `${track.name} render failed.`)
            return
          }
        }
      } else {
        setExportProgress({ percent: 20, message: 'Rendering guitar...' })
        const scaled = scaleNotes(guitar.notes, guitar.analysisResult!.bpm, userBPM)
        const result = await window.api.renderInstrumentWavEnhanced({
          notes: scaled,
          instrument: 'guitar',
          bpm: userBPM,
          timeSignature: userTimeSig,
          folder,
          filename: 'guitar_di.wav',
          gmProgram: instrumentPresets.guitar
        })
        if (!result.success) {
          setGenerateError(result.error ?? 'Guitar render failed.')
          return
        }
      }
    }

    // ── Bass — one file per GP5 track if available ────────────
    if (exportBass && bass.loaded) {
      const gpTracks = bass.gpTracks
      if (gpTracks && gpTracks.length > 0) {
        for (let i = 0; i < gpTracks.length; i++) {
          const track = gpTracks[i]
          const pct = 45 + Math.floor((i / gpTracks.length) * 20)
          setExportProgress({ percent: pct, message: `Rendering ${track.name}...` })
          const scaledTrack = scaleNotes(track.notes, bass.analysisResult!.bpm, userBPM)
          const result = await window.api.renderInstrumentWavEnhanced({
            notes: scaledTrack,
            instrument: 'bass',
            bpm: userBPM,
            timeSignature: userTimeSig,
            folder,
            filename: `${track.safeName}_di.wav`,
            gmProgram: instrumentPresets.bass
          })
          if (!result.success) {
            setGenerateError(result.error ?? `${track.name} render failed.`)
            return
          }
        }
      } else {
        setExportProgress({ percent: 50, message: 'Rendering bass...' })
        const scaled = scaleNotes(bass.notes, bass.analysisResult!.bpm, userBPM)
        const result = await window.api.renderInstrumentWavEnhanced({
          notes: scaled,
          instrument: 'bass',
          bpm: userBPM,
          timeSignature: userTimeSig,
          folder,
          filename: 'bass_di.wav',
          gmProgram: instrumentPresets.bass
        })
        if (!result.success) {
          setGenerateError(result.error ?? 'Bass render failed.')
          return
        }
      }
    }

    // ── Drums — one file per GP5 track if available ───────────
    if (exportDrums && drums.loaded) {
      const gpTracks = drums.gpTracks
      if (gpTracks && gpTracks.length > 0) {
        for (let i = 0; i < gpTracks.length; i++) {
          const track = gpTracks[i]
          const pct = 70 + Math.floor((i / gpTracks.length) * 20)
          setExportProgress({ percent: pct, message: `Rendering ${track.name}...` })
          const scaledTrack = scaleNotes(track.notes, drums.analysisResult!.bpm, userBPM)
          const result = await window.api.renderInstrumentWavEnhanced({
            notes: scaledTrack,
            instrument: 'drums',
            bpm: userBPM,
            timeSignature: userTimeSig,
            folder,
            filename: `${track.safeName}_drum.wav`,
            drumKitVariation: instrumentPresets.drumKit
          })
          if (!result.success) {
            setGenerateError(result.error ?? `${track.name} render failed.`)
            return
          }
        }
      } else {
        setExportProgress({ percent: 75, message: 'Rendering drums...' })
        const scaledDrums = scaleNotes(drums.notes, drums.analysisResult!.bpm, userBPM)
        const result = await window.api.renderInstrumentWavEnhanced({
          notes: scaledDrums,
          instrument: 'drums',
          bpm: userBPM,
          timeSignature: userTimeSig,
          folder,
          filename: 'drum_track.wav',
          drumKitVariation: instrumentPresets.drumKit
        })
        if (!result.success) {
          setGenerateError(result.error ?? 'Drum render failed.')
          return
        }
      }
    }

    setExportProgress({ percent: 90, message: 'Writing session file...' })

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
      const gpTracks = guitar.gpTracks
      if (gpTracks && gpTracks.length > 0) {
        for (const track of gpTracks) {
          lines.push(`${`${track.safeName}_di.wav`.padEnd(24)} — ${track.name} (guitar DI)`)
        }
      } else {
        lines.push('guitar_di.wav    — Guitar dry DI signal')
      }
    }
    if (exportBass && bass.loaded) {
      const gpTracks = bass.gpTracks
      if (gpTracks && gpTracks.length > 0) {
        for (const track of gpTracks) {
          lines.push(`${`${track.safeName}_di.wav`.padEnd(24)} — ${track.name} (bass DI)`)
        }
      } else {
        const file = exportMode === 'wav' ? 'bass_di.wav' : 'bass_track.mid'
        const desc =
          exportMode === 'wav' ? `Bass dry DI signal (${bassStyle})` : `Bass MIDI (${bassStyle})`
        lines.push(`${file.padEnd(16)} — ${desc}`)
      }
    }
    if (exportDrums && drums.loaded) {
      const gpTracks = drums.gpTracks
      if (gpTracks && gpTracks.length > 0) {
        for (const track of gpTracks) {
          lines.push(`${`${track.safeName}_drum.wav`.padEnd(24)} — ${track.name} (drums)`)
        }
      } else {
        const file = exportMode === 'wav' ? 'drum_track.wav' : 'drum_track.mid'
        const desc =
          exportMode === 'wav' ? `Drum synthesis: ${drumStyle}` : `Drum MIDI: ${drumStyle}`
        lines.push(`${file.padEnd(16)} — ${desc}`)
      }
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
    <div
      className="app"
      onDragOver={onAppDragOver}
      onDragLeave={onAppDragLeave}
      onDrop={onAppDrop}
    >
      <UpdateNotification />

      <header className="app-header">
        <h1>
          🎸 Tab to <span className="accent">Backing Track</span>
        </h1>
        <div className="mode-toggle">
          <button
            type="button"
            className={`btn-mode${appMode === 'backing-track' ? ' active' : ''}`}
            onClick={() => setAppMode('backing-track')}
          >
            🎸 Backing Track
          </button>
          <button
            type="button"
            className={`btn-mode${appMode === 'converter' ? ' active' : ''}`}
            onClick={() => setAppMode('converter')}
          >
            🔄 File Converter
          </button>
        </div>
      </header>

      <main className="app-body">
        {appMode === 'converter' && <ConverterPanel />}

        {appMode === 'backing-track' && (
          <div className="app-top-row">
            <section className="panel panel-input">
              <h2 className="panel-title">Input</h2>
              <div className="instrument-cards">
                <InstrumentCard
                  instrument="guitar"
                  loaded={guitar.loaded}
                  fileName={guitar.fileName}
                  gpTracks={guitar.gpTracks}
                  onLoad={(result, fileName) => loadSlot('guitar', result, fileName)}
                  onClear={() => clearSlot('guitar')}
                  onGuitarProDrop={handleGuitarProDrop}
                />
                <InstrumentCard
                  instrument="bass"
                  loaded={bass.loaded}
                  fileName={bass.fileName}
                  gpTracks={bass.gpTracks}
                  onLoad={(result, fileName) => loadSlot('bass', result, fileName)}
                  onClear={() => clearSlot('bass')}
                  onGuitarProDrop={handleGuitarProDrop}
                />
                <InstrumentCard
                  instrument="drums"
                  loaded={drums.loaded}
                  fileName={drums.fileName}
                  gpTracks={drums.gpTracks}
                  onLoad={(result, fileName) => loadSlot('drums', result, fileName)}
                  onClear={() => clearSlot('drums')}
                  onGuitarProDrop={handleGuitarProDrop}
                />
              </div>
            </section>

            <section className="panel panel-analysis">
              <h2 className="panel-title">Analysis</h2>

              <InstrumentTabs
                guitar={guitar}
                bass={bass}
                drums={drums}
                activeTab={activeAnalysisTab}
                onTabChange={setActiveAnalysisTab}
              />

              <div className="analysis-grid">
                {activeSlot?.analysisResult && (
                  <div className="analysis-stat">
                    <span className="stat-label">Key</span>
                    <span className="stat-value">{activeSlot.analysisResult.key}</span>
                  </div>
                )}

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

                {activeSlot?.loaded && (
                  <div className="analysis-stat">
                    <span className="stat-label">Notes Detected</span>
                    <span className="stat-value">
                      {activeSlot.notes.length.toLocaleString()}
                    </span>
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
        )}

        {appMode === 'backing-track' && (
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
        )}
      </main>

      {globalDragging && appMode === 'backing-track' && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <span className="drop-overlay-icon">⬇</span>
            <p className="drop-overlay-label">Drop to load</p>
            <p className="drop-overlay-hint">Guitar Pro · MIDI · MusicXML · Tab</p>
          </div>
        </div>
      )}

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
