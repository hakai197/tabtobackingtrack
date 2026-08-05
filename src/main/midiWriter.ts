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
  timeSig: { numerator: number; denominator: number }
): Promise<string> {
  const midi = new Midi()
  midi.header.tempos = [{ ticks: 0, bpm }]
  midi.header.timeSignatures = [
    { ticks: 0, timeSignature: [timeSig.numerator, timeSig.denominator] }
  ]

  const track = midi.addTrack()

  if (instrument === 'drums') {
    track.channel = 9
  } else {
    track.instrument.number = GM_PROGRAMS[instrument]
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
  await writeFile(tmpPath, buf)

  return tmpPath
}
