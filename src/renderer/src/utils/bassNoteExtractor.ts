import type { BassStyle } from './bassDiGenerator'
import type { Note } from '../types'

function toBassRange(pitch: number): number {
  let p = pitch
  while (p > 48) p -= 12
  while (p < 28) p += 12
  return p
}

type ChordSegment = { startTime: number; duration: number; rootPitch: number }

function extractChordSegments(notes: Note[], bpm: number): ChordSegment[] {
  if (notes.length === 0) return []

  const onsets = [...new Set(notes.map((n) => n.startTime))].sort((a, b) => a - b)
  const quarterSecs = 60 / bpm
  const segments: ChordSegment[] = []

  for (let i = 0; i < onsets.length; i++) {
    const t = onsets[i]
    const nextT = i + 1 < onsets.length ? onsets[i + 1] : t + quarterSecs * 4

    const chord = notes.filter((n) => Math.abs(n.startTime - t) < 0.002)
    if (chord.length === 0) continue

    const lowestPitch = Math.min(...chord.map((n) => n.pitch))
    const rootPitch = toBassRange(lowestPitch)
    const duration = nextT - t
    if (duration <= 0) continue

    const last = segments[segments.length - 1]
    if (last && last.rootPitch % 12 === rootPitch % 12) {
      last.duration = t + duration - last.startTime
    } else {
      segments.push({ startTime: t, duration, rootPitch })
    }
  }

  return segments
}

export function extractBassNotes(bpm: number, style: BassStyle, notes: Note[]): Note[] {
  const segments = extractChordSegments(notes, bpm)

  if (segments.length === 0) {
    segments.push({ startTime: 0, duration: (60 / bpm) * 4, rootPitch: 40 })
  }

  const beatSecs = 60 / bpm
  const twoBeats = beatSecs * 2
  const fourBeats = beatSecs * 4
  const result: Note[] = []

  for (let i = 0; i < segments.length; i++) {
    const { startTime, duration, rootPitch } = segments[i]
    const fifth = toBassRange(rootPitch + 7)

    if (style === 'root') {
      result.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
      continue
    }

    if (style === 'root-fifth') {
      if (duration >= twoBeats) {
        const half = duration / 2
        result.push({ pitch: rootPitch, startTime, duration: half, velocity: 95 })
        result.push({ pitch: fifth, startTime: startTime + half, duration: half, velocity: 80 })
      } else {
        result.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
      }
      continue
    }

    // walking
    if (duration >= fourBeats) {
      const nextRoot = i + 1 < segments.length ? segments[i + 1].rootPitch : rootPitch
      const approach = nextRoot >= rootPitch ? nextRoot - 1 : nextRoot + 1
      const walkPitches = [rootPitch, rootPitch + 4, fifth, approach]
      for (let b = 0; b < walkPitches.length; b++) {
        result.push({
          pitch: toBassRange(walkPitches[b]),
          startTime: startTime + b * beatSecs,
          duration: beatSecs,
          velocity: b === 0 ? 95 : 80
        })
      }
    } else if (duration >= twoBeats) {
      const half = duration / 2
      result.push({ pitch: rootPitch, startTime, duration: half, velocity: 95 })
      result.push({ pitch: fifth, startTime: startTime + half, duration: half, velocity: 80 })
    } else {
      result.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
    }
  }

  return result
}
