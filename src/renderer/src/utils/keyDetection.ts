import type { Note } from '../types'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Krumhansl-Schmuckler key profiles (starting at C).
// These weights represent how "characteristic" each scale degree is of the key.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

// Shift the array so that index `n` becomes index 0, wrapping around.
function rotate(arr: number[], n: number): number[] {
  return [...arr.slice(n), ...arr.slice(0, n)]
}

// Pearson correlation coefficient between two equal-length arrays.
function correlation(a: number[], b: number[]): number {
  const n = a.length
  const meanA = a.reduce((s, x) => s + x, 0) / n
  const meanB = b.reduce((s, x) => s + x, 0) / n
  let num = 0
  let denA = 0
  let denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }
  if (denA === 0 || denB === 0) return 0
  return num / Math.sqrt(denA * denB)
}

// Returns a string like "A minor" or "C major" by correlating
// note duration weights against major and minor profiles for all 12 roots.
export function detectKey(notes: Note[]): string {
  if (notes.length === 0) return 'Unknown'

  // Weight each pitch class by total sounding duration.
  const pitchClassWeights = new Array<number>(12).fill(0)
  for (const note of notes) {
    pitchClassWeights[note.pitch % 12] += note.duration
  }

  let bestCorr = -Infinity
  let bestKey = 'C major'

  for (let root = 0; root < 12; root++) {
    // Rotate so that `root` aligns with position 0 (the tonic) of the profile.
    const rotated = rotate(pitchClassWeights, root)

    const majorCorr = correlation(rotated, MAJOR_PROFILE)
    if (majorCorr > bestCorr) {
      bestCorr = majorCorr
      bestKey = `${NOTE_NAMES[root]} major`
    }

    const minorCorr = correlation(rotated, MINOR_PROFILE)
    if (minorCorr > bestCorr) {
      bestCorr = minorCorr
      bestKey = `${NOTE_NAMES[root]} minor`
    }
  }

  return bestKey
}
