import { detectKey } from './keyDetection'
import type { AnalysisResult, Note } from '../types'

// Matches a guitar tab string line in two common formats:
//   Ultimate Guitar:  e|--0---3---5--|     (pipe separator)
//   Dash format:      f-5\4-4-4-4-4---     (dash separator, no pipe)
// The separator is either | or - (dash at start of character class = literal dash).
// Note names cover all 7 letters a–g to support non-standard tunings.
const TAB_LINE_RE = /^\s*([a-gA-G])\s*[-|](.+)$/

// Seconds-per-beat constants for converting column positions to time.
// We treat each unique beat position (column where any string has a note) as one quarter note.
const DEFAULT_BPM = 120

function extractBpm(text: string): number {
  const match = text.match(/(?:bpm|tempo)[:\s=]+(\d+)/i)
  if (match) {
    const bpm = parseInt(match[1], 10)
    if (bpm >= 20 && bpm <= 400) return bpm
  }
  return DEFAULT_BPM
}

// Map the string label character to the open-string MIDI note.
// Standard guitar strings (E A D G B e) use exact values.
// Additional note names (C, F) are mapped to the nearest musically reasonable octave
// so that key detection works correctly on alternate-tuned and non-standard instruments.
// The `blockHasLowercaseE` flag disambiguates uppercase E:
//   - If the block also has a lowercase 'e' (high e), then 'E' must be low E (40).
//   - If there is no 'e' in the block, treat 'E' as high e (64) as a fallback.
function getMidiBase(label: string, blockHasLowercaseE: boolean): number {
  switch (label) {
    case 'e':
      return 64 // high E4
    case 'B':
    case 'b':
      return 59 // B3
    case 'G':
    case 'g':
      return 55 // G3
    case 'F':
    case 'f':
      return 53 // F3
    case 'D':
    case 'd':
      return 50 // D3
    case 'C':
    case 'c':
      return 48 // C3
    case 'A':
    case 'a':
      return 45 // A2
    case 'E':
      return blockHasLowercaseE ? 40 : 64 // low E2, or high e if no other e present
    default:
      return 40
  }
}

// Scans one string's tab content for fret numbers and their column positions.
// Returns [columnPosition, fretNumber] pairs.
// Strips trailing "| <annotation>" (e.g. "| x2") before scanning.
function parseStringLine(content: string): Array<[number, number]> {
  // Remove trailing | and anything after it (repeat markers, annotations).
  const stripped = content.replace(/\|[^|]*$/, '')
  const notes: Array<[number, number]> = []
  let i = 0
  while (i < stripped.length) {
    if (/\d/.test(stripped[i])) {
      // Read the full number — frets can be two digits (e.g. 10, 12, 24).
      let numStr = ''
      const col = i
      while (i < stripped.length && /\d/.test(stripped[i])) {
        numStr += stripped[i++]
      }
      notes.push([col, parseInt(numStr, 10)])
    } else {
      i++
    }
  }
  return notes
}

// Collects groups of exactly 6 consecutive lines that all match TAB_LINE_RE.
// When 12+ consecutive tab lines appear (two blocks with no blank line between),
// they are split into 6-line chunks automatically.
function findTabBlocks(lines: string[]): Array<string[]> {
  const blocks: Array<string[]> = []
  let run: string[] = []

  for (const line of lines) {
    if (TAB_LINE_RE.test(line)) {
      run.push(line)
      if (run.length === 6) {
        blocks.push([...run])
        run = []
      }
    } else {
      // Non-tab line: discard any incomplete run.
      run = []
    }
  }

  return blocks
}

export function parseTab(text: string): AnalysisResult {
  const bpm = extractBpm(text)
  const beatDuration = 60 / bpm // seconds per quarter note

  const lines = text.split('\n')
  const blocks = findTabBlocks(lines)

  if (blocks.length === 0) {
    throw new Error(
      'No tab found. Paste a 6-string tab using either pipe format (e|--0--|) or dash format (e-0--).'
    )
  }

  const allNotes: Note[] = []
  let blockStartTime = 0

  for (const block of blocks) {
    // Detect whether any line uses lowercase 'e' to disambiguate high vs low E.
    // Handles both pipe format (e|) and dash format (e-).
    const blockHasLowercaseE = block.some((line) => /^\s*e\s*[-|]/.test(line))

    // Parse each string's notes.
    const stringData: Array<{ midiBase: number; entries: Array<[number, number]> }> = []
    for (const line of block) {
      const match = line.match(TAB_LINE_RE)
      if (!match) continue
      const midiBase = getMidiBase(match[1], blockHasLowercaseE)
      const entries = parseStringLine(match[2])
      if (entries.length > 0) {
        stringData.push({ midiBase, entries })
      }
    }

    // Gather all unique column positions across all 6 strings and sort them.
    const allColumns = new Set<number>()
    for (const { entries } of stringData) {
      for (const [col] of entries) allColumns.add(col)
    }
    const sortedColumns = [...allColumns].sort((a, b) => a - b)

    if (sortedColumns.length === 0) continue

    // Map each column position to an absolute timestamp.
    // We treat each column as one quarter note — consistent, BPM-aware spacing.
    const columnToTime = new Map<number, number>()
    sortedColumns.forEach((col, beatIndex) => {
      columnToTime.set(col, blockStartTime + beatIndex * beatDuration)
    })

    // Convert string entries into Note objects.
    for (const { midiBase, entries } of stringData) {
      for (let i = 0; i < entries.length; i++) {
        const [col, fret] = entries[i]
        const startTime = columnToTime.get(col)!

        // Duration lasts until the next note on this string, or one beat if it's the last.
        const duration =
          i + 1 < entries.length ? columnToTime.get(entries[i + 1][0])! - startTime : beatDuration

        allNotes.push({ pitch: midiBase + fret, duration, startTime, velocity: 100 })
      }
    }

    // Add one beat of silence between blocks so they don't run together.
    blockStartTime += (sortedColumns.length + 1) * beatDuration
  }

  const key = detectKey(allNotes)

  return {
    bpm,
    timeSig: '4/4', // tabs don't encode time signature; 4/4 is the correct default
    key,
    notes: allNotes
  }
}
