import type { Note, TimeSig } from '../types'

export type DrumStyle = 'rock' | 'shuffle' | 'ballad' | 'pop'

const TICKS_PER_QUARTER = 960
const TICKS_PER_BAR = TICKS_PER_QUARTER * 4 // 3840 ticks per 4/4 bar
const HIT_DURATION = 30 // short release for percussive notes

// GM percussion note numbers (MIDI channel 10)
const KICK = 36
const SNARE = 38
const HH_CLOSED = 42
const CRASH = 49

type DrumHit = { tick: number; pitch: number; velocity: number }

// Each entry is one 4/4 bar. Ticks are relative to bar start (0–3839).
const PATTERNS: Record<DrumStyle, DrumHit[]> = {
  // Standard rock: 8th-note hi-hat, kick on 1 & 3, snare on 2 & 4.
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

  // Shuffle: swung 8ths (triplet feel — long-short per beat), kick 1 & 3, snare 2 & 4.
  // Triplet 8th pair = 640 + 320 ticks (2/3 + 1/3 of a quarter note).
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

  // Ballad: half-time feel — hi-hat on quarter notes, kick on 1, snare on 3 only.
  ballad: [
    ...[0, 960, 1920, 2880].map((tick) => ({
      tick,
      pitch: HH_CLOSED,
      velocity: 68
    })),
    { tick: 0, pitch: KICK, velocity: 90 },
    { tick: 1920, pitch: SNARE, velocity: 95 }
  ],

  // Pop: 16th-note hi-hat, kick on 1 / 1-and / 3, snare on 2 & 4.
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

// MIDI variable-length encoding (7 bits per byte, MSB = continuation flag).
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

export function generateDrumMidi(
  bpm: number,
  style: DrumStyle,
  notes: Note[],
  timeSig: TimeSig
): ArrayBuffer {
  // Derive total song duration in ticks from the guitar notes.
  const lastEnd = notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0
  const totalTicks = Math.round(lastEnd * (bpm / 60) * TICKS_PER_QUARTER)
  // Round up to bar boundary and add one bar of tail.
  const barCount = Math.max(1, Math.ceil(totalTicks / TICKS_PER_BAR)) + 1

  type MidiEvent = { tick: number; data: number[] }
  const events: MidiEvent[] = []

  // Tempo meta-event: 0xFF 0x51 0x03 + 3-byte microseconds-per-beat.
  const usecPerBeat = Math.round(60_000_000 / bpm)
  events.push({
    tick: 0,
    data: [
      0xff,
      0x51,
      0x03,
      (usecPerBeat >> 16) & 0xff,
      (usecPerBeat >> 8) & 0xff,
      usecPerBeat & 0xff
    ]
  })

  // Time signature meta-event: 0xFF 0x58 0x04 nn dd cc bb
  // nn=numerator, dd=log2(denominator), cc=24 MIDI clocks/click, bb=8 (32nds per quarter).
  events.push({
    tick: 0,
    data: [0xff, 0x58, 0x04, timeSig.numerator, Math.round(Math.log2(timeSig.denominator)), 24, 8]
  })

  // Crash cymbal on bar 1 beat 1 to mark the top of the song.
  events.push({ tick: 0, data: [0x99, CRASH, 110] })
  events.push({ tick: HIT_DURATION, data: [0x89, CRASH, 0] })

  // Tile the chosen pattern across all bars.
  const pattern = PATTERNS[style]
  for (let bar = 0; bar < barCount; bar++) {
    const offset = bar * TICKS_PER_BAR
    for (const hit of pattern) {
      const t = offset + hit.tick
      events.push({ tick: t, data: [0x99, hit.pitch, hit.velocity] })
      events.push({ tick: t + HIT_DURATION, data: [0x89, hit.pitch, 0] })
    }
  }

  // Sort: ascending tick; within same tick: meta (0xFF) < note-off (0x89) < note-on (0x99).
  const priority = (data: number[]): number => (data[0] === 0xff ? 0 : data[0] === 0x89 ? 1 : 2)
  events.sort((a, b) => a.tick - b.tick || priority(a.data) - priority(b.data))

  // End-of-track meta-event.
  events.push({ tick: barCount * TICKS_PER_BAR, data: [0xff, 0x2f, 0x00] })

  // Encode track bytes with delta times.
  const trackBytes: number[] = []
  let prevTick = 0
  for (const ev of events) {
    trackBytes.push(...varLen(ev.tick - prevTick), ...ev.data)
    prevTick = ev.tick
  }

  // Assemble: MThd header + MTrk chunk.
  const header = [
    0x4d,
    0x54,
    0x68,
    0x64, // "MThd"
    ...u32be(6), // chunk length
    ...u16be(0), // format 0 (single track)
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
