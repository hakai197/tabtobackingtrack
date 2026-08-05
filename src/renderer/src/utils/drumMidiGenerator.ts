import { Midi } from '@tonejs/midi'
import type { Note } from '../types'

export type DrumStyle = 'rock' | 'shuffle' | 'ballad' | 'pop'

const TICKS_PER_QUARTER = 960
const TICKS_PER_BAR = TICKS_PER_QUARTER * 4

const KICK = 36
const SNARE = 38
const HH_CLOSED = 42
const CRASH = 49

type DrumHit = { tick: number; pitch: number; velocity: number }

// Identical groove patterns to the WAV generator; tick offsets are relative to bar start.
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

// Synthesize a drum pattern as a standard MIDI file using channel 9 (GM percussion).
export function generateDrumMidi(bpm: number, style: DrumStyle, notes: Note[]): ArrayBuffer {
  const secondsPerTick = 60 / (bpm * TICKS_PER_QUARTER)
  const barDuration = TICKS_PER_BAR * secondsPerTick

  const lastEnd = notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0
  const barCount = Math.max(1, Math.ceil(lastEnd / barDuration)) + 1

  const midi = new Midi()
  midi.header.tempos = [{ ticks: 0, bpm }]

  const track = midi.addTrack()
  track.channel = 9 // GM percussion channel

  // Crash cymbal on bar 1 beat 1 to mark the top of the song.
  track.addNote({ midi: CRASH, time: 0, duration: 0.8, velocity: 110 / 127 })

  // Tile the chosen groove pattern across all bars.
  const pattern = PATTERNS[style]
  for (let bar = 0; bar < barCount; bar++) {
    const barOffset = bar * barDuration
    for (const hit of pattern) {
      const time = barOffset + hit.tick * secondsPerTick
      track.addNote({ midi: hit.pitch, time, duration: 0.05, velocity: hit.velocity / 127 })
    }
  }

  const arr = midi.toArray()
  const ab = new ArrayBuffer(arr.byteLength)
  new Uint8Array(ab).set(arr)
  return ab
}
