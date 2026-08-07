import type { Note } from '../types'

export type DrumStyle = 'rock' | 'shuffle' | 'ballad' | 'pop'

const TICKS_PER_QUARTER = 960
const TICKS_PER_BAR = TICKS_PER_QUARTER * 4

const KICK = 36
const SNARE = 38
const HH_CLOSED = 42
const CRASH = 49

type DrumHit = { tick: number; pitch: number; velocity: number }

const PATTERNS: Record<DrumStyle, DrumHit[]> = {
  rock: [
    ...[0, 480, 960, 1440, 1920, 2400, 2880, 3360].map((tick, i) => ({
      tick,
      pitch: HH_CLOSED,
      velocity: i % 2 === 0 ? 90 : 70
    })),
    { tick: 0, pitch: KICK, velocity: 100 },
    { tick: 1920, pitch: KICK, velocity: 95 },
    { tick: 960, pitch: SNARE, velocity: 100 },
    { tick: 2880, pitch: SNARE, velocity: 100 }
  ],

  shuffle: [
    ...[0, 640, 960, 1600, 1920, 2560, 2880, 3520].map((tick, i) => ({
      tick,
      pitch: HH_CLOSED,
      velocity: i % 2 === 0 ? 88 : 58
    })),
    { tick: 0, pitch: KICK, velocity: 100 },
    { tick: 1920, pitch: KICK, velocity: 95 },
    { tick: 960, pitch: SNARE, velocity: 100 },
    { tick: 2880, pitch: SNARE, velocity: 100 }
  ],

  ballad: [
    ...[0, 960, 1920, 2880].map((tick) => ({ tick, pitch: HH_CLOSED, velocity: 68 })),
    { tick: 0, pitch: KICK, velocity: 90 },
    { tick: 1920, pitch: SNARE, velocity: 95 }
  ],

  pop: [
    ...[
      0, 240, 480, 720, 960, 1200, 1440, 1680, 1920, 2160, 2400, 2640, 2880, 3120, 3360, 3600
    ].map((tick, i) => ({
      tick,
      pitch: HH_CLOSED,
      velocity: i % 4 === 0 ? 90 : i % 2 === 0 ? 68 : 52
    })),
    { tick: 0, pitch: KICK, velocity: 100 },
    { tick: 480, pitch: KICK, velocity: 78 },
    { tick: 1920, pitch: KICK, velocity: 100 },
    { tick: 960, pitch: SNARE, velocity: 100 },
    { tick: 2880, pitch: SNARE, velocity: 100 }
  ]
}

// Convert seconds to MIDI ticks
function secondsToTicks(seconds: number, bpm: number, ppq: number): number {
  return Math.round(seconds * ((ppq * bpm) / 60))
}

export function generateDrumMidi(bpm: number, style: DrumStyle, notes: Note[]): ArrayBuffer {
  if (import.meta.env.DEV) {
    console.log('generateDrumMidi:', {
      notesProvided: notes.length,
      usingGP5Notes: notes.length > 0,
      drumStyle: style
    })
  }

  const ppq = 960
  const secondsPerTick = 60 / (bpm * TICKS_PER_QUARTER)
  const barDuration = TICKS_PER_BAR * secondsPerTick
  const lastEnd =
    notes.length > 0 ? notes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0) : 0
  const barCount = Math.max(1, Math.ceil(lastEnd / barDuration)) + 1

  // Build raw MIDI bytes manually instead of using @tonejs/midi's
  // addNote() which re-sorts the entire array on every single call.
  // With 1777 notes that's O(n²) — it freezes the browser.
  // Instead we write the MIDI binary format directly.

  // MIDI file structure:
  // Header chunk + Track chunk
  // Each note = note-on event + note-off event

  type MidiEvent = {
    tick: number
    data: number[]
  }

  const events: MidiEvent[] = []
  const channel = 9 // GM percussion = channel 10 (0-indexed = 9)

  // Tempo meta event
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

  if (notes.length > 0) {
    // Use actual GP5 notes — sort by time first
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime)
    for (const note of sorted) {
      const pitch = Math.max(0, Math.min(127, note.pitch))
      const velocity = Math.max(1, Math.min(127, Math.round(note.velocity)))
      const startTick = secondsToTicks(note.startTime, bpm, ppq)
      const endTick = secondsToTicks(note.startTime + Math.max(note.duration, 0.05), bpm, ppq)
      events.push({ tick: startTick, data: [0x90 | channel, pitch, velocity] })
      events.push({ tick: endTick, data: [0x80 | channel, pitch, 0] })
    }
  } else {
    // No notes — generate groove pattern
    const pattern = PATTERNS[style]
    // Crash on beat 1
    events.push({ tick: 0, data: [0x90 | channel, CRASH, 110] })
    events.push({ tick: secondsToTicks(0.8, bpm, ppq), data: [0x80 | channel, CRASH, 0] })

    for (let bar = 0; bar < barCount; bar++) {
      const barOffsetTicks = bar * TICKS_PER_BAR
      for (const hit of pattern) {
        const startTick = barOffsetTicks + hit.tick
        const endTick = startTick + Math.round(ppq * 0.05)
        events.push({ tick: startTick, data: [0x90 | channel, hit.pitch, hit.velocity] })
        events.push({ tick: endTick, data: [0x80 | channel, hit.pitch, 0] })
      }
    }
  }

  // Sort all events by tick
  events.sort((a, b) => a.tick - b.tick)

  // Encode end of track
  events.push({ tick: events[events.length - 1]?.tick ?? 0, data: [0xff, 0x2f, 0x00] })

  // Write variable length quantity
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

  // Build track data
  const trackBytes: number[] = []
  let lastTick = 0
  for (const event of events) {
    const delta = Math.max(0, event.tick - lastTick)
    lastTick = event.tick
    trackBytes.push(...writeVLQ(delta))
    trackBytes.push(...event.data)
  }

  // Build complete MIDI file
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
    ppq & 0xff // ticks per quarter
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
