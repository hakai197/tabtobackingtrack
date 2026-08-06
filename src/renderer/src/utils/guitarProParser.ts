import { Settings, importer, model } from '@coderline/alphatab'
import { detectKey } from './keyDetection'
import type { AnalysisResult, Note, GpTrack } from '../types'

// Re-exported as the canonical name for callers that import from this module.
export type GuitarProTrack = GpTrack

function toSafeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 32) || 'track'
  )
}

const TICKS_PER_QUARTER = 960

// DynamicValue enum is 0=PPP … 7=FFF; values above 7 (PPPP, SF, etc.) are clamped.
const DYNAMIC_VELOCITIES = [16, 32, 48, 64, 80, 96, 112, 127]

type TempoSegment = { tick: number; bpm: number }

function buildTempoMap(score: model.Score): TempoSegment[] {
  const segments: TempoSegment[] = [{ tick: 0, bpm: score.tempo }]

  for (const masterBar of score.masterBars) {
    for (const automation of masterBar.tempoAutomations) {
      if (automation.type !== model.AutomationType.Tempo) continue
      const tick =
        masterBar.start + Math.round(automation.ratioPosition * masterBar.calculateDuration())
      segments.push({ tick, bpm: automation.value })
    }
  }

  return segments.sort((a, b) => a.tick - b.tick)
}

// Integrates through tempo changes to convert an absolute tick position to seconds.
function ticksToSeconds(targetTick: number, tempoMap: TempoSegment[]): number {
  let seconds = 0

  for (let i = 0; i < tempoMap.length; i++) {
    const segStart = tempoMap[i].tick
    const segEnd = i + 1 < tempoMap.length ? tempoMap[i + 1].tick : Infinity
    if (targetTick <= segStart) break

    const ticksInSeg = Math.min(targetTick, segEnd) - segStart
    seconds += ticksInSeg / ((tempoMap[i].bpm / 60) * TICKS_PER_QUARTER)

    if (targetTick <= segEnd) break
  }

  return seconds
}

function dynamicToVelocity(dynamic: model.DynamicValue): number {
  return DYNAMIC_VELOCITIES[Math.min(dynamic, 7)] ?? 80
}

// alphatab sometimes returns 1 for the numerator on GP5 files where the actual
// time signature is 4/4. Scan the first 8 bars for a more sensible value before
// falling back to 4/4.
function resolveTimeSignature(masterBars: model.MasterBar[]): {
  numerator: number
  denominator: number
} {
  const first = masterBars[0]
  if (!first) return { numerator: 4, denominator: 4 }

  const rawNum = first.timeSignatureNumerator
  const rawDen = first.timeSignatureDenominator

  if (rawNum === 1 && rawDen === 4) {
    for (const mb of masterBars.slice(0, 8)) {
      if (mb.timeSignatureNumerator > 1) {
        return { numerator: mb.timeSignatureNumerator, denominator: mb.timeSignatureDenominator }
      }
    }
    return { numerator: 4, denominator: 4 }
  }

  return { numerator: rawNum, denominator: rawDen }
}

// ── Single-track parser (used for explicit per-slot file drops) ────────────────

export function parseGuitarPro(buffer: ArrayBuffer): AnalysisResult {
  const settings = new Settings()
  settings.core.useWorkers = false

  let score: model.Score
  try {
    score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer), settings)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not parse Guitar Pro file: ${message}`)
  }

  const bpm = score.tempo || 120
  const { numerator: tsNum, denominator: tsDen } = resolveTimeSignature(score.masterBars)
  const timeSig = `${tsNum}/${tsDen}`

  const tempoMap = buildTempoMap(score)
  const notes: Note[] = []

  for (const track of score.tracks) {
    if (track.isPercussion) continue

    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          if (voice.isEmpty) continue

          for (const beat of voice.beats) {
            if (beat.isRest) continue

            const startSec = ticksToSeconds(beat.absolutePlaybackStart, tempoMap)
            const endSec = ticksToSeconds(
              beat.absolutePlaybackStart + beat.playbackDuration,
              tempoMap
            )
            const durationSec = endSec - startSec

            if (durationSec <= 0) continue

            for (const note of beat.notes) {
              if (note.isTieDestination) continue
              if (note.isDead) continue

              const pitch = Math.max(0, Math.min(127, note.realValue))
              const velocity = note.isGhost
                ? Math.round(dynamicToVelocity(beat.dynamics) * 0.5)
                : dynamicToVelocity(beat.dynamics)

              notes.push({ pitch, duration: durationSec, startTime: startSec, velocity })
            }
          }
        }
      }
    }
  }

  notes.sort((a, b) => a.startTime - b.startTime)

  if (notes.length === 0) {
    throw new Error('No pitched notes found in this Guitar Pro file.')
  }

  const key = detectKey(notes)
  return { bpm, timeSig, key, notes }
}

// ── Multi-track parser (used for global file drops — routes each track to its slot) ──

export type GuitarProTrackInfo = {
  name: string
  type: 'guitar' | 'bass' | 'drums' | 'unknown'
  noteCount: number
  program: number
  isDrums: boolean
}

export type GuitarProParseResult = {
  tracks: GuitarProTrack[]
  guitar: Note[]
  bass: Note[]
  drums: Note[]
  detectedTracks: GuitarProTrackInfo[]
  bpm: number
  timeSignature: { numerator: number; denominator: number }
  key: string
  warnings: string[]
}

function classifyTrack(track: model.Track): 'guitar' | 'bass' | 'drums' | 'unknown' {
  const name = (track.name ?? '').toLowerCase()
  const program = track.playbackInfo?.program ?? -1
  const channel = track.playbackInfo?.primaryChannel ?? -1

  // Vocals and keyboards: skip before any instrument classification so program
  // numbers in the bass range (32-39) don't cause misclassification.
  const isVocal =
    name.includes('vox') ||
    name.includes('vocal') ||
    name.includes('voice') ||
    name.includes('sing') ||
    name.includes('lyric')
  if (isVocal) return 'unknown'

  const isKeyboard =
    name.includes('key') ||
    name.includes('piano') ||
    name.includes('organ') ||
    name.includes('synth')
  if (isKeyboard) return 'unknown'

  const isDrums =
    track.isPercussion ||
    channel === 9 ||
    name.includes('drum') ||
    name.includes('perc') ||
    name === 'drums'
  if (isDrums) return 'drums'

  const isBass = (program >= 32 && program <= 39) || name.includes('bass')
  if (isBass) return 'bass'

  if (
    name.includes('guitar') ||
    name.includes('guit') ||
    name.includes('gtr') ||
    name.includes('lead') ||
    name.includes('rhythm')
  )
    return 'guitar'

  // Non-percussion, non-bass, unnamed — treat as guitar (melody instrument)
  if (!track.isPercussion) return 'guitar'

  return 'unknown'
}

function extractMelodicNotes(track: model.Track, tempoMap: TempoSegment[]): Note[] {
  const notes: Note[] = []

  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        if (voice.isEmpty) continue
        for (const beat of voice.beats) {
          if (beat.isRest) continue
          const startSec = ticksToSeconds(beat.absolutePlaybackStart, tempoMap)
          const endSec = ticksToSeconds(
            beat.absolutePlaybackStart + beat.playbackDuration,
            tempoMap
          )
          const durationSec = endSec - startSec
          if (durationSec <= 0) continue

          for (const note of beat.notes) {
            if (note.isTieDestination) continue
            if (note.isDead) continue
            const pitch = Math.max(0, Math.min(127, note.realValue))
            const velocity = note.isGhost
              ? Math.round(dynamicToVelocity(beat.dynamics) * 0.5)
              : dynamicToVelocity(beat.dynamics)
            notes.push({ pitch, duration: durationSec, startTime: startSec, velocity })
          }
        }
      }
    }
  }

  return notes
}

// note.percussionArticulation is the GM MIDI note number per the alphatab model.
function extractDrumNotes(track: model.Track, tempoMap: TempoSegment[]): Note[] {
  const notes: Note[] = []
  let debugCount = 0

  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        if (voice.isEmpty) continue
        for (const beat of voice.beats) {
          if (beat.isRest) continue
          const startSec = ticksToSeconds(beat.absolutePlaybackStart, tempoMap)
          const endSec = ticksToSeconds(
            beat.absolutePlaybackStart + beat.playbackDuration,
            tempoMap
          )
          const durationSec = endSec - startSec
          if (durationSec <= 0) continue

          for (const note of beat.notes) {
            if (note.isTieDestination) continue
            if (note.isDead) continue

            const pitch = note.percussionArticulation
            if (pitch <= 0 || pitch > 127) continue

            const velocity = note.isGhost
              ? 50
              : note.accentuated !== 0
                ? 120
                : dynamicToVelocity(beat.dynamics)

            if (import.meta.env.DEV && debugCount < 10) {
              console.log('Drum note:', {
                percussionArticulation: note.percussionArticulation,
                resolvedPitch: pitch,
                startTime: startSec,
                velocity
              })
              debugCount++
            }

            notes.push({ pitch, duration: durationSec, startTime: startSec, velocity })
          }
        }
      }
    }
  }

  return notes
}

export function parseGuitarProMultiTrack(buffer: ArrayBuffer): GuitarProParseResult {
  const settings = new Settings()
  settings.core.useWorkers = false

  let score: model.Score
  try {
    score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer), settings)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not parse Guitar Pro file: ${message}`)
  }

  const bpm = score.tempo || 120
  const timeSignature = resolveTimeSignature(score.masterBars)

  const tempoMap = buildTempoMap(score)
  const tracks: GuitarProTrack[] = []
  const guitarNotes: Note[] = []
  const bassNotes: Note[] = []
  const drumNotes: Note[] = []
  const detectedTracks: GuitarProTrackInfo[] = []
  const warnings: string[] = []

  // Track safe-name usage to deduplicate collisions (James, James → James, James_2).
  const usedSafeNames = new Map<string, number>()

  score.tracks?.forEach((track, i) => {
    const type = classifyTrack(track)
    const program = track.playbackInfo?.program ?? -1
    const isDrums = type === 'drums'

    const rawName = track.name?.trim() || `Track_${i + 1}`
    const baseSafe = toSafeFilename(rawName)
    const count = (usedSafeNames.get(baseSafe) ?? 0) + 1
    usedSafeNames.set(baseSafe, count)
    const safeName = count === 1 ? baseSafe : `${baseSafe}_${count}`

    const trackNotes = isDrums
      ? extractDrumNotes(track, tempoMap)
      : extractMelodicNotes(track, tempoMap)

    if (type !== 'unknown') {
      tracks.push({ name: rawName, safeName, notes: trackNotes, type })
    }

    detectedTracks.push({
      name: rawName,
      type,
      noteCount: trackNotes.length,
      program,
      isDrums
    })

    if (type === 'guitar') {
      guitarNotes.push(...trackNotes)
    } else if (type === 'bass') {
      bassNotes.push(...trackNotes)
    } else if (type === 'drums') {
      drumNotes.push(...trackNotes)
    } else {
      warnings.push(
        `Track "${rawName}" (program ${program}) could not be classified and was skipped.`
      )
    }
  })

  guitarNotes.sort((a, b) => a.startTime - b.startTime)
  bassNotes.sort((a, b) => a.startTime - b.startTime)
  drumNotes.sort((a, b) => a.startTime - b.startTime)

  // Key detection uses melodic content only (drums don't have pitch).
  const melodicNotes = [...guitarNotes, ...bassNotes]
  const key = melodicNotes.length > 0 ? detectKey(melodicNotes) : 'Unknown'

  return {
    tracks,
    guitar: guitarNotes,
    bass: bassNotes,
    drums: drumNotes,
    detectedTracks,
    bpm,
    timeSignature,
    key,
    warnings
  }
}
