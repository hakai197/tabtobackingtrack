import type { Note } from '../types'
import type { ProgressCallback } from './diWavGenerator'

export type BassStyle = 'root' | 'root-fifth' | 'walking'

const SAMPLE_RATE = 44100
const ATTACK_SEC = 0.01
const RELEASE_SEC = 0.05
const NOTE_GAIN = 0.5
const MIN_DURATION = ATTACK_SEC + RELEASE_SEC
const CHUNK_SIZE = 500
const GAIN_POOL_SIZE = 32

function midiToHz(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12)
}

function encodeWavFromFloat32(data: Float32Array): ArrayBuffer {
  const numSamples = data.length
  const dataByteLen = numSamples * 2

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
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buf
}

function toBassRange(pitch: number): number {
  let p = pitch
  while (p > 48) p -= 12
  while (p < 28) p += 12
  return p
}

type ChordSegment = { startTime: number; duration: number; rootPitch: number }
type BassNote = { pitch: number; startTime: number; duration: number; velocity: number }

function extractChordSegments(notes: Note[], bpm: number): ChordSegment[] {
  if (notes.length === 0) return []

  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime)
  const quarterSecs = 60 / bpm
  const segments: ChordSegment[] = []

  let i = 0
  while (i < sorted.length) {
    const t = sorted[i].startTime
    const chord: Note[] = []

    while (i < sorted.length && Math.abs(sorted[i].startTime - t) < 0.002) {
      chord.push(sorted[i])
      i++
    }

    const nextT = i < sorted.length ? sorted[i].startTime : t + quarterSecs * 4

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
        bassNotes.push({ pitch: fifth, startTime: startTime + half, duration: half, velocity: 80 })
      } else {
        bassNotes.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
      }
      continue
    }

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
      bassNotes.push({ pitch: fifth, startTime: startTime + half, duration: half, velocity: 80 })
    } else {
      bassNotes.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
    }
  }

  return bassNotes
}

async function renderBassChunk(notes: BassNote[], globalOutput: Float32Array): Promise<void> {
  let chunkOffset = Infinity
  let chunkEndTime = 0
  for (const n of notes) {
    if (n.startTime < chunkOffset) chunkOffset = n.startTime
    const end = n.startTime + Math.max(n.duration, MIN_DURATION)
    if (end > chunkEndTime) chunkEndTime = end
  }

  const chunkDuration = chunkEndTime - chunkOffset + 0.1
  const ctx = new OfflineAudioContext(1, Math.ceil(chunkDuration * SAMPLE_RATE), SAMPLE_RATE)

  const poolSize = Math.min(GAIN_POOL_SIZE, notes.length)
  const gainPool: GainNode[] = []
  const gainFreeAt: number[] = []
  for (let i = 0; i < poolSize; i++) {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, 0)
    g.connect(ctx.destination)
    gainPool.push(g)
    gainFreeAt.push(0)
  }

  for (const note of notes) {
    const start = note.startTime - chunkOffset
    const duration = Math.max(note.duration, MIN_DURATION)
    const end = start + duration
    const releaseStart = Math.max(start + ATTACK_SEC, end - RELEASE_SEC)
    const gainPeak = (note.velocity / 127) * NOTE_GAIN

    let gIdx = 0
    for (let i = 1; i < poolSize; i++) {
      if (gainFreeAt[i] < gainFreeAt[gIdx]) gIdx = i
    }
    gainFreeAt[gIdx] = end

    const g = gainPool[gIdx]
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(gainPeak, start + ATTACK_SEC)
    g.gain.setValueAtTime(gainPeak, releaseStart)
    g.gain.linearRampToValueAtTime(0, end)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = midiToHz(note.pitch - 12)
    osc.connect(g)
    osc.start(start)
    osc.stop(end)
  }

  const rendered = await ctx.startRendering()
  const chunkData = rendered.getChannelData(0)
  const startSample = Math.floor(chunkOffset * SAMPLE_RATE)
  const copyLen = Math.min(chunkData.length, globalOutput.length - startSample)
  for (let i = 0; i < copyLen; i++) {
    globalOutput[startSample + i] += chunkData[i]
  }
}

export async function generateBassDiWav(
  bpm: number,
  style: BassStyle,
  notes: Note[],
  onProgress?: ProgressCallback
): Promise<ArrayBuffer> {
  onProgress?.(5, 'Analyzing chord segments...')

  const segments = extractChordSegments(notes, bpm)
  if (segments.length === 0) {
    segments.push({ startTime: 0, duration: (60 / bpm) * 4, rootPitch: 40 })
  }

  const bassNotes = buildBassNotes(segments, style, bpm)

  const safeBassNotes = bassNotes.filter(
    (n) =>
      isFinite(n.pitch) &&
      isFinite(n.startTime) &&
      n.startTime >= 0 &&
      isFinite(n.duration) &&
      n.duration > 0
  )

  if (safeBassNotes.length === 0) throw new Error('No valid bass notes to render.')

  safeBassNotes.sort((a, b) => a.startTime - b.startTime)

  const lastEnd = Math.max(
    safeBassNotes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0),
    0.5
  )
  const totalSamples = Math.ceil((lastEnd + 0.5) * SAMPLE_RATE)
  const globalOutput = new Float32Array(totalSamples)

  const chunkCount = Math.ceil(safeBassNotes.length / CHUNK_SIZE)
  onProgress?.(15, 'Scheduling bass notes...')

  for (let ci = 0; ci < chunkCount; ci++) {
    const chunkNotes = safeBassNotes.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE)
    const pct = 15 + Math.floor((ci / chunkCount) * 70)
    onProgress?.(pct, `Rendering chunk ${ci + 1} of ${chunkCount}...`)
    await renderBassChunk(chunkNotes, globalOutput)
  }

  onProgress?.(90, 'Encoding WAV...')
  const wav = encodeWavFromFloat32(globalOutput)
  onProgress?.(100, 'Done')
  return wav
}
