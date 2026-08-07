import path from 'path'
import os from 'os'
import { writeFile, mkdir } from 'fs/promises'

type MidiNote = {
  pitch: number
  startTime: number
  duration: number
  velocity: number
}

// Write variable length quantity (VLQ) for MIDI delta times
function writeVLQ(value: number): number[] {
  const bytes: number[] = []
  bytes.unshift(value & 0x7F)
  value >>= 7
  while (value > 0) {
    bytes.unshift((value & 0x7F) | 0x80)
    value >>= 7
  }
  return bytes
}

// Build a raw MIDI file without using @tonejs/midi's addNote
// which re-sorts the entire array on every insert — O(n²) freeze
// on large note arrays like Enter Sandman (2250+ notes)
function buildMidiBuffer(
  notes: MidiNote[],
  instrument: 'guitar' | 'bass' | 'drums',
  bpm: number,
  timeSig: { numerator: number; denominator: number },
  gmProgram?: number,
  drumKitVariation?: number
): Buffer {
  const ppq = 960
  const channel = instrument === 'drums' ? 9 : 0

  function secondsToTicks(seconds: number): number {
    return Math.round(seconds * ppq * bpm / 60)
  }

  type MidiEvent = { tick: number; data: number[] }
  const events: MidiEvent[] = []

  // Tempo meta event
  const uspb = Math.round(60_000_000 / bpm)
  events.push({
    tick: 0,
    data: [
      0xFF, 0x51, 0x03,
      (uspb >> 16) & 0xFF,
      (uspb >> 8) & 0xFF,
      uspb & 0xFF
    ]
  })

  // Time signature meta event
  events.push({
    tick: 0,
    data: [
      0xFF, 0x58, 0x04,
      timeSig.numerator,
      Math.log2(timeSig.denominator),
      24,
      8
    ]
  })

  // Program change or drum kit setup
  if (instrument === 'drums') {
    if (drumKitVariation !== undefined && drumKitVariation !== 0) {
      // Bank select MSB
      events.push({ tick: 0, data: [0xB0 | channel, 0, 120] })
      // Bank select LSB
      events.push({ tick: 0, data: [0xB0 | channel, 32, 0] })
      // Program change for drum kit variation
      events.push({ tick: 0, data: [0xC0 | channel, drumKitVariation] })
    }
  } else {
    const program = gmProgram ?? (instrument === 'bass' ? 33 : 27)
    events.push({ tick: 0, data: [0xC0 | channel, program] })
  }

  // Sort notes by start time first — one sort, O(n log n)
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime)

  // Add note-on and note-off events for each note
  for (const note of sorted) {
    const pitch = Math.max(0, Math.min(127, note.pitch))
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity)))
    const startTick = secondsToTicks(note.startTime)
    const endTick = secondsToTicks(note.startTime + Math.max(note.duration, 0.05))

    events.push({ tick: startTick, data: [0x90 | channel, pitch, velocity] })
    events.push({ tick: endTick, data: [0x80 | channel, pitch, 0] })
  }

  // Sort all events by tick — one sort
  events.sort((a, b) => a.tick - b.tick)

  // End of track
  const lastTick = events[events.length - 1]?.tick ?? 0
  events.push({ tick: lastTick, data: [0xFF, 0x2F, 0x00] })

  // Encode track bytes with delta times
  const trackBytes: number[] = []
  let prevTick = 0
  for (const event of events) {
    const delta = Math.max(0, event.tick - prevTick)
    prevTick = event.tick
    trackBytes.push(...writeVLQ(delta))
    trackBytes.push(...event.data)
  }

  // MIDI header chunk
  const headerChunk = [
    0x4D, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // chunk length = 6
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    (ppq >> 8) & 0xFF,
    ppq & 0xFF
  ]

  // MIDI track chunk
  const trackLen = trackBytes.length
  const trackChunk = [
    0x4D, 0x54, 0x72, 0x6B, // MTrk
    (trackLen >> 24) & 0xFF,
    (trackLen >> 16) & 0xFF,
    (trackLen >> 8) & 0xFF,
    trackLen & 0xFF,
    ...trackBytes
  ]

  const allBytes = [...headerChunk, ...trackChunk]
  return Buffer.from(allBytes)
}

export async function writeTempMidi(
  notes: MidiNote[],
  instrument: 'guitar' | 'bass' | 'drums',
  bpm: number,
  timeSig: { numerator: number; denominator: number },
  gmProgram?: number,
  drumKitVariation?: number
): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), 'tab-to-backing-track')
  await mkdir(tmpDir, { recursive: true })
  const tmpPath = path.join(tmpDir, `${instrument}-${Date.now()}.mid`)

  console.log('Writing temp MIDI to:', tmpPath)
  console.log('Notes count:', notes.length, 'BPM:', bpm, 'Instrument:', instrument)

  const buf = buildMidiBuffer(
    notes,
    instrument,
    bpm,
    timeSig,
    gmProgram,
    drumKitVariation
  )

  await writeFile(tmpPath, buf)
  console.log('Temp MIDI written, size:', buf.byteLength, 'bytes')

  return tmpPath
}
