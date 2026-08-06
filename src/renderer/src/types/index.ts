// The internal note representation shared across all input parsers (MIDI, Tab, MusicXML).
// All time values are in seconds. Pitch follows the MIDI standard (60 = middle C).

export type Technique =
  'slide-up' | 'slide-down' | 'hammer' | 'pulloff' | 'bend' | 'mute' | 'vibrato'

export type Note = {
  pitch: number // MIDI note number 0–127
  duration: number // seconds
  startTime: number // seconds from the beginning of the piece
  velocity: number // 0–127; parsers that lack velocity data default to 100
  technique?: Technique // optional articulation from tab notation
  string?: number // optional 0-indexed string number within a tab block
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

// A single track extracted from a Guitar Pro file, with its original name preserved.
export type GpTrack = {
  name: string
  safeName: string
  notes: Note[]
  type: 'guitar' | 'bass' | 'drums'
}

export type InstrumentSlot = {
  loaded: boolean
  fileName: string | null
  notes: Note[]
  analysisResult: AnalysisResult | null
  gpTracks?: GpTrack[]
}

export type ExportMode = 'wav' | 'midi'

export type ConvertedTrack = {
  name: string
  safeName: string
  type: 'guitar' | 'bass' | 'drums' | 'unknown'
  notes: Note[]
  program: number
}

// ── Tab parser types ──────────────────────────────────────────────────────────

export type TabFormat =
  'guitar-tab' | 'bass-tab' | 'drum-tab' | 'chordpro' | 'chord-only' | 'number-grid' | 'unknown'

export type Section = { name: string; startsAtTime: number }

export type TabAnalysisResult = {
  detectedTuning: string[]
  stringCount: number
  instrumentType: 'guitar' | 'bass' | 'drums' | 'unknown'
  sections: Section[]
  hasLyrics: boolean
  noteCount: number
  estimatedDuration: number
  bpm: number
  timeSignature: { numerator: number; denominator: number }
  detectedKey?: string
}

export type ParsedTab = {
  notes: Note[]
  analysisResult: TabAnalysisResult
  warnings: string[]
  errors: string[]
  detectedFormat: TabFormat
}
