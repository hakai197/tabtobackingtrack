import { Midi } from '@tonejs/midi'
import type { ConvertedTrack } from '../types'

export async function convertTracksToMidi(
  tracks: ConvertedTrack[],
  bpm: number,
  timeSignature: { numerator: number; denominator: number }
): Promise<Array<{ filename: string; data: ArrayBuffer }>> {
  const results: Array<{ filename: string; data: ArrayBuffer }> = []

  for (const track of tracks) {
    if (track.notes.length === 0) continue

    const midi = new Midi()
    midi.header.tempos = [{ ticks: 0, bpm }]
    midi.header.timeSignatures = [
      {
        ticks: 0,
        timeSignature: [timeSignature.numerator, timeSignature.denominator]
      }
    ]

    const midiTrack = midi.addTrack()
    midiTrack.name = track.name
    midiTrack.channel = track.type === 'drums' ? 9 : 0
    if (track.type !== 'drums') {
      midiTrack.instrument.number = track.program >= 0 ? track.program : 27
    }

    for (const note of track.notes) {
      midiTrack.addNote({
        midi: note.pitch,
        time: note.startTime,
        duration: Math.max(note.duration, 0.05),
        velocity: note.velocity / 127
      })
    }

    const arr = midi.toArray()
    const ab = new ArrayBuffer(arr.byteLength)
    new Uint8Array(ab).set(arr)

    const filename =
      track.type === 'drums' ? `${track.safeName}_drums.mid` : `${track.safeName}.mid`
    results.push({ filename, data: ab })
  }

  return results
}
