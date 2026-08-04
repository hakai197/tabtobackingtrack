import { Settings, importer, model } from '@coderline/alphatab'
import { detectKey } from './keyDetection'
import type { AnalysisResult, Note } from '../types'

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
  const firstBar = score.masterBars[0]
  const timeSig = firstBar
    ? `${firstBar.timeSignatureNumerator}/${firstBar.timeSignatureDenominator}`
    : '4/4'

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
