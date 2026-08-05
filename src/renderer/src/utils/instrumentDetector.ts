import type { InstrumentKey } from '../types'
import { Settings, importer } from '@coderline/alphatab'

// Detect instrument type from filename alone (no file content read).
// Returns null if no hint is found.
export function detectInstrumentFromFilename(filename: string): InstrumentKey | null {
  const stem = filename.toLowerCase().replace(/\.[^.]+$/, '')
  if (stem.includes('bass')) return 'bass'
  if (stem.includes('drum') || stem.includes('perc') || stem.includes('kit')) return 'drums'
  if (
    stem.includes('guitar') ||
    stem.includes('gtr') ||
    stem.includes('lead') ||
    stem.includes('rhythm')
  )
    return 'guitar'
  return null
}

// Detect the primary instrument type from a Guitar Pro file by examining track names
// and the isPercussion flag. Returns the instrument of the first matched track, or null
// if no track matches a known category.
export function detectInstrumentFromGuitarPro(buffer: ArrayBuffer): InstrumentKey | null {
  try {
    const settings = new Settings()
    settings.core.useWorkers = false
    const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer), settings)

    for (const track of score.tracks) {
      if (track.isPercussion) return 'drums'
      const name = (track.name ?? '').toLowerCase()
      if (name.includes('bass')) return 'bass'
      if (name.includes('guitar') || name.includes('gtr')) return 'guitar'
    }
    return null
  } catch {
    return null
  }
}
