import { Midi } from '@tonejs/midi'
import path from 'path'
import os from 'os'
import { writeFile, mkdir } from 'fs/promises'

type MidiNote = {
  pitch: number
  startTime: number
  duration: number
  velocity: number
}

const GM_PROGRAMS: Record<'guitar' | 'bass', number> = {
  guitar: 27, // Electric Guitar (Clean)
  bass: 33 // Electric Bass (Finger)
}

export async function writeTempMidi(
  notes: MidiNote[],
  instrument: 'guitar' | 'bass' | 'drums',
  bpm: number,
  timeSig: { numerator: number; denominator: number },
  gmProgram?: number,
  drumKitVariation?: number
): Promise<string> {
  const midi = new Midi()
  midi.header.tempos = [{ ticks: 0, bpm }]
  midi.header.timeSignatures = [
    { ticks: 0, timeSignature: [timeSig.numerator, timeSig.denominator] }
  ]

  const track = midi.addTrack()

  if (instrument === 'drums') {
    track.channel = 9
    if (drumKitVariation !== undefined && drumKitVariation !== 0) {
      // GM2 bank select for drum kit variation: MSB=120 (0x78), LSB=0
      track.addCC({ number: 0, value: 120, ticks: 0 })
      track.addCC({ number: 32, value: 0, ticks: 0 })
      track.instrument.number = drumKitVariation
    }
  } else {
    track.instrument.number = gmProgram ?? GM_PROGRAMS[instrument]
  }

  for (const note of notes) {
    track.addNote({
      midi: note.pitch,
      time: note.startTime,
      duration: note.duration,
      velocity: note.velocity / 127
    })
  }

  const tmpDir = path.join(os.tmpdir(), 'tab-to-backing-track')
  await mkdir(tmpDir, { recursive: true })
  const tmpPath = path.join(tmpDir, `${instrument}-${Date.now()}.mid`)

  const arr = midi.toArray()
  const buf = Buffer.allocUnsafe(arr.byteLength)
  buf.set(arr)
  console.log('Writing temp MIDI to:', tmpPath)
  await writeFile(tmpPath, buf)
  console.log('Temp MIDI written, size:', buf.byteLength, 'bytes')

  return tmpPath
}
