// The internal note representation shared across all input parsers (MIDI, Tab, MusicXML).
// All time values are in seconds. Pitch follows the MIDI standard (60 = middle C).
export type Note = {
  pitch: number // MIDI note number 0–127
  duration: number // seconds
  startTime: number // seconds from the beginning of the piece
  velocity: number // 0–127; parsers that lack velocity data default to 100
}

export type TimeSig = {
  numerator: number
  denominator: number
}

export type AnalysisResult = {
  bpm: number
  timeSig: string // e.g. "4/4" or "3/4"
  key: string // e.g. "A minor" or "C major"
  notes: Note[]
}

export type InstrumentKey = 'guitar' | 'bass' | 'drums'

export type InstrumentSlot = {
  loaded: boolean
  fileName: string | null
  notes: Note[]
  analysisResult: AnalysisResult | null
}

export type ExportMode = 'wav' | 'midi'
