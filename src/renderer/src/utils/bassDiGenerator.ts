import type { Note } from '../types'

export type BassStyle = 'root' | 'root-fifth' | 'walking'

const SAMPLE_RATE = 44100
const ATTACK_SEC = 0.01
const RELEASE_SEC = 0.05
const NOTE_GAIN = 0.5 // per-note amplitude; bass is mono so headroom is comfortable

function midiToHz(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12)
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
// At each unique onset, reads notes that start there and takes the lowest pitch as the root.
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
      bassNotes.push({ pitch: fifth, startTime: startTime + half, duration: half, velocity: 80 })
    } else {
      bassNotes.push({ pitch: rootPitch, startTime, duration, velocity: 95 })
    }
  }

  return bassNotes
}

export async function generateBassDiWav(
  bpm: number,
  style: BassStyle,
  notes: Note[]
): Promise<ArrayBuffer> {
  const segments = extractChordSegments(notes, bpm)

  if (segments.length === 0) {
    // Fallback: one bar of E2 (MIDI 40) at the requested BPM.
    segments.push({ startTime: 0, duration: (60 / bpm) * 4, rootPitch: 40 })
  }

  const bassNotes = buildBassNotes(segments, style, bpm)

  // Filter out any notes with non-finite or non-positive values.
  const MIN_DURATION = ATTACK_SEC + RELEASE_SEC
  const safeBassNotes = bassNotes.filter(
    (n) =>
      isFinite(n.pitch) &&
      isFinite(n.startTime) &&
      n.startTime >= 0 &&
      isFinite(n.duration) &&
      n.duration > 0
  )

  const lastEnd = Math.max(...safeBassNotes.map((n) => n.startTime + n.duration), 0.5)
  const totalDuration = lastEnd + 0.5

  const ctx = new OfflineAudioContext(1, Math.ceil(totalDuration * SAMPLE_RATE), SAMPLE_RATE)

  for (const note of safeBassNotes) {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()

    osc.type = 'sawtooth'
    // Subtract 12 to place the bass one octave below the detected chord root.
    osc.frequency.value = midiToHz(note.pitch - 12)

    const gainValue = (note.velocity / 127) * NOTE_GAIN
    const start = note.startTime
    // Clamp duration so the envelope always has room for both attack and release.
    const duration = Math.max(note.duration, MIN_DURATION)
    const end = start + duration
    const releaseStart = Math.max(start + ATTACK_SEC, end - RELEASE_SEC)

    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(gainValue, start + ATTACK_SEC)
    env.gain.setValueAtTime(gainValue, releaseStart)
    env.gain.linearRampToValueAtTime(0, end)

    osc.connect(env)
    env.connect(ctx.destination)

    osc.start(start)
    osc.stop(end)
  }

  return encodeWav(await ctx.startRendering())
}
