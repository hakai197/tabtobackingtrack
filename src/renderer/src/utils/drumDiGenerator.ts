import type { Note } from '../types'
import type { ProgressCallback } from './diWavGenerator'

export type DrumStyle = 'rock' | 'shuffle' | 'ballad' | 'pop'

const SAMPLE_RATE = 44100
const TICKS_PER_QUARTER = 960
const TICKS_PER_BAR = TICKS_PER_QUARTER * 4
const CHUNK_SIZE = 200 // max drum hits per OfflineAudioContext chunk

const KICK = 36
const SNARE = 38
const HH_CLOSED = 42
const HH_OPEN = 46
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

function encodeWav(samples: Float32Array): ArrayBuffer {
  const dataByteLen = samples.length * 2
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
  v.setUint16(22, 1, true)
  v.setUint32(24, SAMPLE_RATE, true)
  v.setUint32(28, SAMPLE_RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, dataByteLen, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buf
}

// Render one chunk of drum hits into a Float32Array of samples.
// Each chunk uses its own OfflineAudioContext to limit node count.
async function renderChunk(
  hits: Array<{ pitch: number; startTime: number; velocity: number }>,
  chunkStartTime: number,
  chunkDuration: number
): Promise<Float32Array> {
  const numSamples = Math.ceil(chunkDuration * SAMPLE_RATE)
  const ctx = new OfflineAudioContext(1, numSamples, SAMPLE_RATE)

  function makeNoise(dur: number): AudioBuffer {
    const len = Math.max(1, Math.ceil(dur * SAMPLE_RATE))
    const buffer = ctx.createBuffer(1, len, SAMPLE_RATE)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  function scheduleKick(t: number, vel: number): void {
    const peak = (vel / 127) * 0.6
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.15)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.3)
  }

  function scheduleSnare(t: number, vel: number): void {
    const peak = (vel / 127) * 0.35
    const dur = 0.2
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 200
    oscGain.gain.setValueAtTime(0, t)
    oscGain.gain.linearRampToValueAtTime(peak, t + 0.001)
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoise(dur)
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0, t)
    noiseGain.gain.linearRampToValueAtTime(peak, t + 0.001)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    noise.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noise.start(t)
    noise.stop(t + dur)
  }

  function scheduleHiHat(t: number, vel: number, open: boolean): void {
    const dur = open ? 0.3 : 0.05
    const peak = (vel / 127) * 0.25
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoise(dur)
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 8000
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(t)
    noise.stop(t + dur)
  }

  function scheduleCrash(t: number, vel: number): void {
    const dur = 0.8
    const peak = (vel / 127) * 0.35
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoise(dur)
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 5000
    filter.Q.value = 0.5
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(t)
    noise.stop(t + dur)
  }

  function scheduleFallback(t: number, vel: number): void {
    const dur = 0.05
    const peak = (vel / 127) * 0.25
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoise(dur)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    noise.connect(gain)
    gain.connect(ctx.destination)
    noise.start(t)
    noise.stop(t + dur)
  }

  // Schedule each hit — offset relative to chunk start
  for (const hit of hits) {
    const t = hit.startTime - chunkStartTime
    if (t < 0 || t >= chunkDuration) continue
    const vel = hit.velocity
    if (hit.pitch === KICK) scheduleKick(t, vel)
    else if (hit.pitch === SNARE) scheduleSnare(t, vel)
    else if (hit.pitch === HH_CLOSED) scheduleHiHat(t, vel, false)
    else if (hit.pitch === HH_OPEN) scheduleHiHat(t, vel, true)
    else if (hit.pitch === CRASH) scheduleCrash(t, vel)
    else scheduleFallback(t, vel)
  }

  const rendered = await ctx.startRendering()
  return rendered.getChannelData(0).slice()
}

export async function generateDrumDiWav(
  bpm: number,
  style: DrumStyle,
  notes: Note[],
  onProgress?: ProgressCallback
): Promise<ArrayBuffer> {
  if (import.meta.env.DEV) {
    console.log('generateDrumDiWav:', {
      notesProvided: notes.length,
      usingGP5Notes: notes.length > 0,
      drumStyle: style
    })
  }

  const secondsPerTick = 60 / (bpm * TICKS_PER_QUARTER)
  const barDuration = TICKS_PER_BAR * secondsPerTick

  // Build the full hit list
  type HitItem = { pitch: number; startTime: number; velocity: number }
  let allHits: HitItem[] = []

  if (notes.length > 0) {
    allHits = notes.map(n => ({
      pitch: n.pitch,
      startTime: n.startTime,
      velocity: n.velocity
    }))
  } else {
    const lastEnd = 0
    const barCount = Math.max(1, Math.ceil(lastEnd / barDuration)) + 16
    allHits.push({ pitch: CRASH, startTime: 0, velocity: 110 })
    const pattern = PATTERNS[style]
    for (let bar = 0; bar < barCount; bar++) {
      const barOffset = bar * barDuration
      for (const hit of pattern) {
        allHits.push({
          pitch: hit.pitch,
          startTime: barOffset + hit.tick * secondsPerTick,
          velocity: hit.velocity
        })
      }
    }
  }

  // Sort by time
  allHits.sort((a, b) => a.startTime - b.startTime)

  if (allHits.length === 0) {
    const silence = new Float32Array(SAMPLE_RATE)
    return encodeWav(silence)
  }

  const totalDuration =
    allHits.reduce((max, h) => Math.max(max, h.startTime + 1.0), 0) + 1.0

  onProgress?.(5, 'Preparing drum render...')

  // Split hits into time-based chunks to limit audio node count
  // Each chunk covers a fixed time window
  const chunkDuration = (CHUNK_SIZE / allHits.length) * totalDuration
  const safeChunkDuration = Math.max(2.0, Math.min(10.0, chunkDuration))

  const chunks: Array<{ hits: HitItem[]; startTime: number; duration: number }> = []
  let chunkStart = 0
  while (chunkStart < totalDuration) {
    const chunkEnd = Math.min(chunkStart + safeChunkDuration, totalDuration)
    const chunkHits = allHits.filter(
      h => h.startTime >= chunkStart && h.startTime < chunkEnd + 1.0
    )
    chunks.push({
      hits: chunkHits,
      startTime: chunkStart,
      duration: chunkEnd - chunkStart + 0.1
    })
    chunkStart = chunkEnd
  }

  // Render each chunk sequentially
  const totalSamples = Math.ceil(totalDuration * SAMPLE_RATE)
  const output = new Float32Array(totalSamples)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const pct = 10 + Math.floor((i / chunks.length) * 80)
    onProgress?.(pct, `Rendering drums ${i + 1}/${chunks.length}...`)

    const chunkSamples = await renderChunk(chunk.hits, chunk.startTime, chunk.duration)

    // Write chunk samples into the output buffer at the correct position
    const startSample = Math.floor(chunk.startTime * SAMPLE_RATE)
    for (let s = 0; s < chunkSamples.length; s++) {
      const pos = startSample + s
      if (pos < totalSamples) {
        output[pos] += chunkSamples[s] // add (mix) not overwrite
      }
    }
  }

  onProgress?.(95, 'Encoding WAV...')
  const result = encodeWav(output)
  onProgress?.(100, 'Done')
  return result
}
