import type { Note } from '../types'
import type { ScheduledNote } from '../workers/audioRenderer.worker'

export type ProgressCallback = (percent: number, message: string) => void

const SAMPLE_RATE = 44100
const ATTACK_SEC = 0.005
const RELEASE_SEC = 0.02
const NOTE_GAIN = 0.3
const MIN_DURATION = ATTACK_SEC + RELEASE_SEC
const CHUNK_SIZE = 500
const GAIN_POOL_SIZE = 32

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
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
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

// Offloads pitch-to-frequency and timing math to a dedicated Web Worker.
function computeScheduleAsync(notes: Note[], chunkOffset: number): Promise<ScheduledNote[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/audioRenderer.worker.ts', import.meta.url), {
      type: 'module'
    })
    const onMsg = (e: MessageEvent<ScheduledNote[]>): void => {
      resolve(e.data)
      worker.terminate()
    }
    const onErr = (e: ErrorEvent): void => {
      reject(new Error(e.message))
      worker.terminate()
    }
    worker.addEventListener('message', onMsg)
    worker.addEventListener('error', onErr)
    worker.postMessage({
      notes: notes.map((n) => ({
        pitch: n.pitch,
        startTime: n.startTime,
        duration: n.duration,
        velocity: n.velocity
      })),
      chunkOffset,
      attackSec: ATTACK_SEC,
      releaseSec: RELEASE_SEC,
      noteGain: NOTE_GAIN
    })
  })
}

// Renders one chunk of notes into the global output Float32Array.
// Each chunk gets its own OfflineAudioContext covering only the chunk's time range,
// which keeps per-context node counts at ≤ CHUNK_SIZE and memory pressure low.
// A pool of GAIN_POOL_SIZE GainNodes is shared across notes in the chunk via
// an earliest-free greedy scheduler — guitar has at most 6 simultaneous notes,
// so with 32 pool slots there is never forced gain reuse on overlapping notes.
async function renderChunk(notes: Note[], globalOutput: Float32Array): Promise<void> {
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

  const schedule = await computeScheduleAsync(notes, chunkOffset)

  for (const ev of schedule) {
    let gIdx = 0
    for (let i = 1; i < poolSize; i++) {
      if (gainFreeAt[i] < gainFreeAt[gIdx]) gIdx = i
    }
    gainFreeAt[gIdx] = ev.end

    const g = gainPool[gIdx]
    g.gain.setValueAtTime(0, ev.start)
    g.gain.linearRampToValueAtTime(ev.gainPeak, ev.start + ATTACK_SEC)
    g.gain.setValueAtTime(ev.gainPeak, ev.releaseStart)
    g.gain.linearRampToValueAtTime(0, ev.end)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = ev.frequency
    osc.connect(g)
    osc.start(ev.start)
    osc.stop(ev.end)
  }

  const rendered = await ctx.startRendering()
  const chunkData = rendered.getChannelData(0)
  const startSample = Math.floor(chunkOffset * SAMPLE_RATE)
  const copyLen = Math.min(chunkData.length, globalOutput.length - startSample)
  for (let i = 0; i < copyLen; i++) {
    globalOutput[startSample + i] += chunkData[i]
  }
}

export async function generateDiWav(
  notes: Note[],
  onProgress?: ProgressCallback
): Promise<ArrayBuffer> {
  if (notes.length === 0) throw new Error('No notes to render.')

  onProgress?.(5, 'Preparing audio engine...')

  const safeNotes = notes.filter(
    (n) =>
      isFinite(n.pitch) &&
      isFinite(n.startTime) &&
      n.startTime >= 0 &&
      isFinite(n.duration) &&
      n.duration > 0
  )
  if (safeNotes.length === 0) throw new Error('No valid notes to render.')

  safeNotes.sort((a, b) => a.startTime - b.startTime)

  const lastEnd = safeNotes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0)
  const totalSamples = Math.ceil((lastEnd + 0.5) * SAMPLE_RATE)
  const globalOutput = new Float32Array(totalSamples)

  const chunkCount = Math.ceil(safeNotes.length / CHUNK_SIZE)
  onProgress?.(10, 'Scheduling notes...')

  for (let ci = 0; ci < chunkCount; ci++) {
    const chunkNotes = safeNotes.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE)
    const pct = 10 + Math.floor((ci / chunkCount) * 75)
    onProgress?.(pct, `Rendering chunk ${ci + 1} of ${chunkCount}...`)
    await renderChunk(chunkNotes, globalOutput)
  }

  onProgress?.(90, 'Encoding WAV...')
  const wav = encodeWavFromFloat32(globalOutput)
  onProgress?.(100, 'Done')
  return wav
}
