import type { Note, TimeSig } from '../types'

export type BassStyle = 'root' | 'root-fifth' | 'walking'

const TICKS_PER_QUARTER = 960
// MIDI channel 2 (0-indexed 1): status bytes for note-on/off.
const NOTE_ON = 0x91
const NOTE_OFF = 0x81

type ChordSegment = {
  startTick: number
  durationTicks: number
  rootPitch: number // already in bass range
}

type MidiEvent = { tick: number; data: number[] }

function secsToTicks(secs: number, bpm: number): number {
  return Math.round(secs * (bpm / 60) * TICKS_PER_QUARTER)
}

// Drop a pitch into bass range E1–C3 (MIDI 28–48) by shifting octaves.
function toBassRange(pitch: number): number {
  let p = pitch
  while (p > 48) p -= 12
  while (p < 28) p += 12
  return p
}

// Identify chord changes from the guitar notes.
// At each unique onset, reads notes that START there and takes the lowest pitch as the root.
// Adjacent segments sharing the same pitch class are merged into one longer segment.
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
    const startTick = secsToTicks(t, bpm)
    const durationTicks = secsToTicks(nextT, bpm) - startTick

    if (durationTicks <= 0) continue

    const last = segments[segments.length - 1]
    if (last && last.rootPitch % 12 === rootPitch % 12) {
      // Same pitch class as previous — extend rather than adding a new segment.
      last.durationTicks = startTick + durationTicks - last.startTick
    } else {
      segments.push({ startTick, durationTicks, rootPitch })
    }
  }

  return segments
}

function emit(
  events: MidiEvent[],
  startTick: number,
  durationTicks: number,
  pitch: number,
  velocity: number
): void {
  // Leave a 30-tick gap before release to prevent consecutive notes bleeding together.
  const releaseTick = startTick + Math.max(1, durationTicks - 30)
  events.push({ tick: startTick, data: [NOTE_ON, pitch, velocity] })
  events.push({ tick: releaseTick, data: [NOTE_OFF, pitch, 0] })
}

function buildNoteEvents(segments: ChordSegment[], style: BassStyle): MidiEvent[] {
  const events: MidiEvent[] = []
  const twoBeats = TICKS_PER_QUARTER * 2
  const fourBeats = TICKS_PER_QUARTER * 4

  for (let i = 0; i < segments.length; i++) {
    const { startTick, durationTicks, rootPitch } = segments[i]
    const fifth = rootPitch + 7

    if (style === 'root') {
      emit(events, startTick, durationTicks, rootPitch, 95)
      continue
    }

    if (style === 'root-fifth') {
      if (durationTicks >= twoBeats) {
        const half = Math.floor(durationTicks / 2)
        emit(events, startTick, half, rootPitch, 95)
        emit(events, startTick + half, durationTicks - half, fifth, 80)
      } else {
        emit(events, startTick, durationTicks, rootPitch, 95)
      }
      continue
    }

    // walking: root → major-third → fifth → chromatic approach to next root
    if (durationTicks >= fourBeats) {
      const nextRoot = i + 1 < segments.length ? segments[i + 1].rootPitch : rootPitch
      // Approach from one semitone below if ascending, one above if descending.
      const approach = nextRoot >= rootPitch ? nextRoot - 1 : nextRoot + 1
      const walkPitches = [rootPitch, rootPitch + 4, fifth, approach]
      walkPitches.forEach((pitch, b) => {
        emit(events, startTick + b * TICKS_PER_QUARTER, TICKS_PER_QUARTER, pitch, b === 0 ? 95 : 80)
      })
    } else if (durationTicks >= twoBeats) {
      const half = Math.floor(durationTicks / 2)
      emit(events, startTick, half, rootPitch, 95)
      emit(events, startTick + half, durationTicks - half, fifth, 80)
    } else {
      emit(events, startTick, durationTicks, rootPitch, 95)
    }
  }

  return events
}

// ── MIDI encoding helpers ─────────────────────────────────────────────────────

function varLen(value: number): number[] {
  if (value < 0x80) return [value]
  const bytes: number[] = [value & 0x7f]
  value >>= 7
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80)
    value >>= 7
  }
  return bytes
}

function u32be(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function u16be(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff]
}

export function generateBassMidi(
  bpm: number,
  style: BassStyle,
  notes: Note[],
  timeSig: TimeSig
): ArrayBuffer {
  const segments = extractChordSegments(notes, bpm)

  if (segments.length === 0) {
    // Return an empty (but valid) MIDI file if no chord data could be extracted.
    segments.push({ startTick: 0, durationTicks: TICKS_PER_QUARTER * 4, rootPitch: 40 })
  }

  const noteEvents = buildNoteEvents(segments, style)
  const lastSegment = segments[segments.length - 1]
  const endTick = lastSegment.startTick + lastSegment.durationTicks

  const usecPerBeat = Math.round(60_000_000 / bpm)

  // Time signature meta-event: nn=numerator, dd=log2(denominator), cc=24, bb=8.
  const timeSigDd = Math.round(Math.log2(timeSig.denominator))

  const events: MidiEvent[] = [
    // Tempo meta-event so DAW reads BPM correctly.
    {
      tick: 0,
      data: [
        0xff,
        0x51,
        0x03,
        (usecPerBeat >> 16) & 0xff,
        (usecPerBeat >> 8) & 0xff,
        usecPerBeat & 0xff
      ]
    },
    { tick: 0, data: [0xff, 0x58, 0x04, timeSig.numerator, timeSigDd, 24, 8] },
    // Program Change: GM patch 33 Electric Bass (finger), channel 2 (0-indexed).
    { tick: 0, data: [0xc1, 0x20] },
    ...noteEvents
  ]

  // Sort: ascending tick; meta (0xFF) < note-off (0x81) < note-on (0x91).
  const priority = (data: number[]): number =>
    data[0] === 0xff ? 0 : data[0] === 0x81 ? 1 : data[0] === 0xc1 ? 0 : 2
  events.sort((a, b) => a.tick - b.tick || priority(a.data) - priority(b.data))

  events.push({ tick: endTick, data: [0xff, 0x2f, 0x00] })

  const trackBytes: number[] = []
  let prevTick = 0
  for (const ev of events) {
    trackBytes.push(...varLen(ev.tick - prevTick), ...ev.data)
    prevTick = ev.tick
  }

  const header = [
    0x4d,
    0x54,
    0x68,
    0x64, // "MThd"
    ...u32be(6),
    ...u16be(0), // format 0
    ...u16be(1), // 1 track
    ...u16be(TICKS_PER_QUARTER)
  ]

  const trackChunk = [
    0x4d,
    0x54,
    0x72,
    0x6b, // "MTrk"
    ...u32be(trackBytes.length),
    ...trackBytes
  ]

  return new Uint8Array([...header, ...trackChunk]).buffer
}
