import type { Note } from '../types'

export type BassStyle = 'root' | 'root-fifth' | 'walking'

// Drop any pitch into bass range E1–C3 (MIDI 28–48).
function toBassRange(pitch: number): number {
  let p = pitch
  while (p > 48) p -= 12
  while (p < 28) p += 12
  return p
}

type ChordSegment = { startTime: number; duration: number; rootPitch: number }
type BassNote = { pitch: number; startTime: number; duration: number; velocity: number }

// Identify chord changes from the guitar notes, working in seconds throughout.
// Uses O(n log n) approach — sort once, scan linearly — instead of O(n²)
// filtering to prevent UI freeze on large GP5 files.
function extractChordSegments(notes: Note[], bpm: number): ChordSegment[] {
  if (notes.length === 0) return []

  // Sort notes by start time once
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime)
  const quarterSecs = 60 / bpm
  const segments: ChordSegment[] = []

  // Group notes into chords by proximity — O(n) scan
  let i = 0
  while (i < sorted.length) {
    const t = sorted[i].startTime
    const chord: Note[] = []

    // Collect all notes at this onset time
    while (i < sorted.length && Math.abs(sorted[i].startTime - t) < 0.002) {
      chord.push(sorted[i])
      i++
    }

    // Find next onset time for duration calculation
    const nextT = i < sorted.length ? sorted[i].startTime : t + quarterSecs * 4

    // Use reduce instead of spread to avoid call stack overflow
    const lowestPitch = chord.reduce((min, n) => Math.min(min, n.pitch), Infinity)
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

function mergeShortSegments(segments: ChordSegment[], bpm: number): ChordSegment[] {
  const minDuration = (60 / bpm) * 0.5
  const merged: ChordSegment[] = []

  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.rootPitch % 12 === seg.rootPitch % 12 &&
      seg.startTime - (last.startTime + last.duration) < minDuration
    ) {
      last.duration = seg.startTime + seg.duration - last.startTime
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

function buildBassNotes(segments: ChordSegment[], style: BassStyle, bpm: number): BassNote[] {
  const bassNotes: BassNote[] = []
  const beatSecs = 60 / bpm
  const twoBeats = beatSecs * 2
  const fourBeats = beatSecs * 4

  for (let i = 0; i < segments.length; i++) {
    const { startTime, duration, rootPitch } = segments[i]
    const fifth = toBassRange(rootPitch + 7)

    if (style === 'root') {
      bassNotes.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
      continue
    }

    if (style === 'root-fifth') {
      if (duration >= twoBeats) {
        const half = duration / 2
        bassNotes.push({ pitch: rootPitch, startTime, duration: half, velocity: 95 })
        bassNotes.push({
          pitch: fifth,
          startTime: startTime + half,
          duration: half,
          velocity: 80
        })
      } else {
        bassNotes.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
      }
      continue
    }

    // walking: root → major-third → fifth → chromatic approach to next root
    if (duration >= fourBeats) {
      const nextRoot = i + 1 < segments.length ? segments[i + 1].rootPitch : rootPitch
      const approach = nextRoot >= rootPitch ? nextRoot - 1 : nextRoot + 1
      const walkPitches = [rootPitch, rootPitch + 4, fifth, approach]
      for (let b = 0; b < walkPitches.length; b++) {
        bassNotes.push({
          pitch: toBassRange(walkPitches[b]),
          startTime: startTime + b * beatSecs,
          duration: beatSecs,
          velocity: b === 0 ? 95 : 80
        })
      }
    } else if (duration >= twoBeats) {
      const half = duration / 2
      bassNotes.push({ pitch: rootPitch, startTime, duration: half, velocity: 95 })
      bassNotes.push({
        pitch: fifth,
        startTime: startTime + half,
        duration: half,
        velocity: 80
      })
    } else {
      bassNotes.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
    }
  }

  return bassNotes
}

// Generate a bass line as a standard MIDI file.
// When notes are provided (e.g. from a GP5 file) they are written directly.
// When notes is empty the chosen groove pattern is generated from chord segments.
export function generateBassMidi(bpm: number, style: BassStyle, notes: Note[]): ArrayBuffer {
  const rawSegments = extractChordSegments(notes, bpm)
  const segments = mergeShortSegments(rawSegments, bpm)

  if (segments.length === 0) {
    segments.push({ startTime: 0, duration: (60 / bpm) * 4, rootPitch: 40 })
  }

  const bassNotes = buildBassNotes(segments, style, bpm)

  const ppq = 960
  const channel = 0
  const programNumber = 33 // Electric Bass (finger), GM 0-indexed

  function secondsToTicks(seconds: number): number {
    return Math.round(seconds * ((ppq * bpm) / 60))
  }

  function writeVLQ(value: number): number[] {
    const bytes: number[] = []
    bytes.unshift(value & 0x7f)
    value >>= 7
    while (value > 0) {
      bytes.unshift((value & 0x7f) | 0x80)
      value >>= 7
    }
    return bytes
  }

  type MidiEvent = { tick: number; data: number[] }
  const events: MidiEvent[] = []

  const microsecondsPerBeat = Math.round(60_000_000 / bpm)
  events.push({
    tick: 0,
    data: [
      0xff,
      0x51,
      0x03,
      (microsecondsPerBeat >> 16) & 0xff,
      (microsecondsPerBeat >> 8) & 0xff,
      microsecondsPerBeat & 0xff
    ]
  })

  events.push({ tick: 0, data: [0xc0 | channel, programNumber] })

  for (const note of bassNotes) {
    const pitch = Math.max(0, Math.min(127, note.pitch))
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity)))
    const startTick = secondsToTicks(note.startTime)
    const endTick = secondsToTicks(note.startTime + Math.max(note.duration, 0.05))
    events.push({ tick: startTick, data: [0x90 | channel, pitch, velocity] })
    events.push({ tick: endTick, data: [0x80 | channel, pitch, 0] })
  }

  events.sort((a, b) => a.tick - b.tick)
  events.push({ tick: events[events.length - 1]?.tick ?? 0, data: [0xff, 0x2f, 0x00] })

  const trackBytes: number[] = []
  let lastTick = 0
  for (const event of events) {
    const delta = Math.max(0, event.tick - lastTick)
    lastTick = event.tick
    trackBytes.push(...writeVLQ(delta))
    trackBytes.push(...event.data)
  }

  const headerChunk = [
    0x4d,
    0x54,
    0x68,
    0x64, // MThd
    0x00,
    0x00,
    0x00,
    0x06, // chunk length = 6
    0x00,
    0x00, // format 0
    0x00,
    0x01, // 1 track
    (ppq >> 8) & 0xff,
    ppq & 0xff
  ]

  const trackLength = trackBytes.length
  const trackChunk = [
    0x4d,
    0x54,
    0x72,
    0x6b, // MTrk
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff,
    ...trackBytes
  ]

  const allBytes = [...headerChunk, ...trackChunk]
  const ab = new ArrayBuffer(allBytes.length)
  new Uint8Array(ab).set(allBytes)
  return ab
}
