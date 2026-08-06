import type { Note } from '../types'
import type { ProgressCallback } from './diWavGenerator'

export type DrumStyle = 'rock' | 'shuffle' | 'ballad' | 'pop'

const SAMPLE_RATE = 44100
const TICKS_PER_QUARTER = 960
const TICKS_PER_BAR = TICKS_PER_QUARTER * 4 // one 4/4 bar = 3840 ticks

const KICK = 36
const SNARE = 38
const HH_CLOSED = 42
const HH_OPEN = 46
const CRASH = 49

type DrumHit = { tick: number; pitch: number; velocity: number }

// Identical groove patterns to the MIDI generator; tick offsets are relative to bar start.
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

  // Swung 8ths: long-short triplet feel (640 + 320 ticks per beat pair).
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

  // Half-time feel: quarter-note hi-hat, kick on 1, snare on 3.
  ballad: [
    ...[0, 960, 1920, 2880].map((tick) => ({ tick, pitch: HH_CLOSED, velocity: 68 })),
    { tick: 0, pitch: KICK, velocity: 90 },
    { tick: 1920, pitch: SNARE, velocity: 95 }
  ],

  // 16th-note hi-hat; kick on 1, 1-and, 3; snare on 2 & 4.
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

function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = audioBuffer.numberOfChannels
  const numSamples = audioBuffer.length
  const dataByteLen = numSamples * numChannels * 2

  const buf = new ArrayBuffer(44 + dataByteLen)
  const v = new DataView(buf)
  const str = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i))
  }

  str(0, 'RIFF')
  v.setUint32(4, 36 + dataByteLen, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, numChannels, true)
  v.setUint32(24, SAMPLE_RATE, true)
  v.setUint32(28, SAMPLE_RATE * numChannels * 2, true)
  v.setUint16(32, numChannels * 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, dataByteLen, true)

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[i]))
      v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return buf
}

// White-noise AudioBuffer. Each call produces an independent buffer so consecutive hits
// of the same type don't sound identical (machine-gun effect).
function makeNoiseBuffer(ctx: OfflineAudioContext, durationSecs: number): AudioBuffer {
  const len = Math.max(1, Math.ceil(durationSecs * SAMPLE_RATE))
  const buffer = ctx.createBuffer(1, len, SAMPLE_RATE)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

export async function generateDrumDiWav(
  bpm: number,
  style: DrumStyle,
  notes: Note[],
  onProgress?: ProgressCallback
): Promise<ArrayBuffer> {
  const secondsPerTick = 60 / (bpm * TICKS_PER_QUARTER)
  const barDuration = TICKS_PER_BAR * secondsPerTick

  const lastEnd = notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0
  const barCount = Math.max(1, Math.ceil(lastEnd / barDuration)) + 1
  const totalDuration = barCount * barDuration + 1.0

  const ctx = new OfflineAudioContext(1, Math.ceil(totalDuration * SAMPLE_RATE), SAMPLE_RATE)

  // ── Drum synthesis helpers ─────────────────────────────────────────────────

  function synthKick(startTime: number, velocity: number): void {
    const peak = (velocity / 127) * 0.6
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, startTime)
    osc.frequency.exponentialRampToValueAtTime(50, startTime + 0.15)

    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startTime)
    osc.stop(startTime + 0.3)
  }

  function synthSnare(startTime: number, velocity: number): void {
    const peak = (velocity / 127) * 0.35
    const dur = 0.2

    // Layer 1: triangle oscillator for the body tone
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 200
    oscGain.gain.setValueAtTime(0, startTime)
    oscGain.gain.linearRampToValueAtTime(peak, startTime + 0.001)
    oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)
    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(startTime)
    osc.stop(startTime + dur)

    // Layer 2: noise for the snare rattle
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx, dur)
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0, startTime)
    noiseGain.gain.linearRampToValueAtTime(peak, startTime + 0.001)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)
    noise.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noise.start(startTime)
    noise.stop(startTime + dur)
  }

  function synthHiHat(startTime: number, velocity: number, open: boolean): void {
    const dur = open ? 0.3 : 0.05
    const peak = (velocity / 127) * 0.25

    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx, dur)

    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 8000

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(startTime)
    noise.stop(startTime + dur)
  }

  function synthCrash(startTime: number, velocity: number): void {
    const dur = 0.8
    const peak = (velocity / 127) * 0.35

    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx, dur)

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 5000
    filter.Q.value = 0.5

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(startTime)
    noise.stop(startTime + dur)
  }

  function synthFallback(startTime: number, velocity: number): void {
    const dur = 0.05
    const peak = (velocity / 127) * 0.25

    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx, dur)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)

    noise.connect(gain)
    gain.connect(ctx.destination)
    noise.start(startTime)
    noise.stop(startTime + dur)
  }

  function renderHit(pitch: number, startTime: number, velocity: number): void {
    if (pitch === KICK) {
      synthKick(startTime, velocity)
    } else if (pitch === SNARE) {
      synthSnare(startTime, velocity)
    } else if (pitch === HH_CLOSED) {
      synthHiHat(startTime, velocity, false)
    } else if (pitch === HH_OPEN) {
      synthHiHat(startTime, velocity, true)
    } else if (pitch === CRASH) {
      synthCrash(startTime, velocity)
    } else {
      synthFallback(startTime, velocity)
    }
  }

  // ── Build the timeline ─────────────────────────────────────────────────────

  if (import.meta.env.DEV) {
    console.log('generateDrumDiWav:', {
      notesProvided: notes.length,
      usingGP5Notes: notes.length > 0,
      drumStyle: style
    })
  }

  onProgress?.(10, 'Scheduling drum hits...')

  if (notes.length > 0) {
    // Use the actual notes from the GP5 file directly.
    for (const note of notes) {
      renderHit(note.pitch, note.startTime, note.velocity)
    }
  } else {
    // No notes provided — fall back to groove pattern generation.
    renderHit(CRASH, 0, 110)
    const pattern = PATTERNS[style]
    for (let bar = 0; bar < barCount; bar++) {
      const barOffset = bar * barDuration
      for (const hit of pattern) {
        renderHit(hit.pitch, barOffset + hit.tick * secondsPerTick, hit.velocity)
      }
      if (bar % 8 === 0) {
        const pct = 10 + Math.floor((bar / barCount) * 75)
        onProgress?.(pct, `Rendering bar ${bar + 1} of ${barCount}...`)
      }
    }
  }

  onProgress?.(90, 'Encoding WAV...')
  const result = encodeWav(await ctx.startRendering())
  onProgress?.(100, 'Done')
  return result
}
