import type { Midi } from '@tonejs/midi'
import { detectKey } from './keyDetection'
import type { AnalysisResult, Note } from '../types'

// Takes a parsed @tonejs/midi Midi object and returns our AnalysisResult.
// @tonejs/midi already converts tick-based timing to seconds, so we just map fields.
export function parseMidi(midi: Midi): AnalysisResult {
  // Flatten all tracks into one note array, excluding percussion (channel 9).
  const notes: Note[] = midi.tracks
    .filter((track) => !track.instrument.percussion)
    .flatMap((track) =>
      track.notes.map((n) => ({
        pitch: n.midi,
        duration: n.duration,
        startTime: n.time,
        // @tonejs/midi stores velocity as a 0–1 float; convert to 0–127 integer.
        velocity: Math.round(n.velocity * 127)
      }))
    )
    .sort((a, b) => a.startTime - b.startTime)

  // Use the first tempo event; default to 120 BPM if the file has none.
  const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120

  // Use the first time signature; default to 4/4 if the file has none.
  const timeSig =
    midi.header.timeSignatures.length > 0
      ? `${midi.header.timeSignatures[0].timeSignature[0]}/${midi.header.timeSignatures[0].timeSignature[1]}`
      : '4/4'

  const key = detectKey(notes)

  return { bpm, timeSig, key, notes }
}
