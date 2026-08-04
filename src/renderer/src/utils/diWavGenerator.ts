import type { Note } from '../types'

const SAMPLE_RATE = 44100
const ATTACK_SEC = 0.005 // 5ms ramp-up prevents click at note onset
const RELEASE_SEC = 0.02 // 20ms ramp-down prevents click at note end
const NOTE_GAIN = 0.3 // per-oscillator amplitude; headroom for chords (3 notes = 0.9)

// Standard equal-temperament: A4 (MIDI 69) = 440 Hz
function midiToHz(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12)
}

// Encodes an AudioBuffer to a 16-bit PCM WAV ArrayBuffer.
// WAV structure: RIFF header (12 B) + fmt chunk (24 B) + data chunk (8 B + samples).
function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = audioBuffer.numberOfChannels
  const numSamples = audioBuffer.length
  const dataByteLen = numSamples * numChannels * 2 // 2 bytes per 16-bit sample

  const buf = new ArrayBuffer(44 + dataByteLen)
  const v = new DataView(buf)

  const str = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i))
  }

  // RIFF chunk
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataByteLen, true)
  str(8, 'WAVE')

  // fmt sub-chunk (PCM = format 1)
  str(12, 'fmt ')
  v.setUint32(16, 16, true) // sub-chunk size
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, numChannels, true)
  v.setUint32(24, SAMPLE_RATE, true)
  v.setUint32(28, SAMPLE_RATE * numChannels * 2, true) // byte rate
  v.setUint16(32, numChannels * 2, true) // block align
  v.setUint16(34, 16, true) // bits per sample

  // data sub-chunk
  str(36, 'data')
  v.setUint32(40, dataByteLen, true)

  // Interleave channels as signed 16-bit little-endian samples
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

// Renders all notes as a mono sawtooth-wave DI track and returns a WAV ArrayBuffer.
// Each note gets an attack/release envelope to prevent clicks at boundaries.
export async function generateDiWav(notes: Note[]): Promise<ArrayBuffer> {
  if (notes.length === 0) throw new Error('No notes to render.')

  // Find the end of the last note and add a short tail of silence.
  const lastEnd = Math.max(...notes.map((n) => n.startTime + n.duration))
  const totalDuration = lastEnd + 0.5

  const context = new OfflineAudioContext(
    1, // mono — correct for a guitar DI track
    Math.ceil(totalDuration * SAMPLE_RATE),
    SAMPLE_RATE
  )

  for (const note of notes) {
    const osc = context.createOscillator()
    const env = context.createGain()

    osc.type = 'sawtooth'
    osc.frequency.value = midiToHz(note.pitch)

    const start = note.startTime
    const end = note.startTime + note.duration
    // releaseStart must never be earlier than the end of the attack ramp.
    const releaseStart = Math.max(start + ATTACK_SEC, end - RELEASE_SEC)

    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(NOTE_GAIN, start + ATTACK_SEC)
    env.gain.setValueAtTime(NOTE_GAIN, releaseStart)
    env.gain.linearRampToValueAtTime(0, end)

    osc.connect(env)
    env.connect(context.destination)

    osc.start(start)
    osc.stop(end)
  }

  const rendered = await context.startRendering()
  return encodeWav(rendered)
}
