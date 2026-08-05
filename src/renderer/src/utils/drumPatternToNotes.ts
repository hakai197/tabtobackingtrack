import type { DrumStyle } from './drumDiGenerator'
import type { Note } from '../types'

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

export function drumPatternToNotes(bpm: number, style: DrumStyle, songLengthSec: number): Note[] {
  const secondsPerTick = 60 / (bpm * TICKS_PER_QUARTER)
  const barDuration = TICKS_PER_BAR * secondsPerTick
  const barCount = Math.max(1, Math.ceil(songLengthSec / barDuration)) + 1

  const notes: Note[] = []

  notes.push({ pitch: CRASH, startTime: 0, duration: 0.8, velocity: 110 })

  const pattern = PATTERNS[style]
  for (let bar = 0; bar < barCount; bar++) {
    const barOffset = bar * barDuration
    for (const hit of pattern) {
      notes.push({
        pitch: hit.pitch,
        startTime: barOffset + hit.tick * secondsPerTick,
        duration: 0.05,
        velocity: hit.velocity
      })
    }
  }

  return notes
}
