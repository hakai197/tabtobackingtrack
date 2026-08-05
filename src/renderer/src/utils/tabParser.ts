import { detectKey } from './keyDetection'
import type { AnalysisResult, Note } from '../types'

// Matches a guitar tab string line in two common formats:
//   Ultimate Guitar:  e|--0---3---5--|     (pipe separator)
//   Dash format:      f-5\4-4-4-4-4---     (dash separator, no pipe)
const TAB_LINE_RE = /^\s*([a-gA-G])\s*[-|](.+)$/

// Bracket format used by many bass/guitar tabs: [--0---3---5--]
// No string label — string identity is inferred from line position within the block.
const BRACKET_LINE_RE = /^\s*\[(.+)\]\s*$/

const DEFAULT_BPM = 120

function extractBpm(text: string): number {
  const match = text.match(/(?:bpm|tempo)[:\s=]+(\d+)/i)
  if (match) {
    const bpm = parseInt(match[1], 10)
    if (bpm >= 20 && bpm <= 400) return bpm
  }
  return DEFAULT_BPM
}

// Map string label to open-string MIDI note (pipe/dash format).
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
      return blockHasLowercaseE ? 40 : 64 // low E2 or high e if no other e
    default:
      return 40
  }
}

// Default open-string MIDI notes for bracket format (index 0 = top string = highest pitch).
const BRACKET_MIDI_BASES: Record<number, number[]> = {
  4: [55, 50, 45, 40], // G D A E — standard 4-string bass
  5: [55, 50, 45, 40, 35], // G D A E B — 5-string bass (low B)
  6: [64, 59, 55, 50, 45, 40] // e B G D A E — standard guitar
}

function parseStringLine(content: string): Array<[number, number]> {
  const stripped = content.replace(/\|[^|]*$/, '')
  const notes: Array<[number, number]> = []
  let i = 0
  while (i < stripped.length) {
    if (/\d/.test(stripped[i])) {
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

// Collect groups of 4–6 consecutive pipe/dash-format lines.
// Accepts 4, 5, or 6 string blocks (previously required exactly 6).
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
      if (run.length >= 4) blocks.push([...run])
      run = []
    }
  }
  if (run.length >= 4) blocks.push([...run])

  return blocks
}

// Collect groups of consecutive bracket-format lines.
// Infers string count from the most common run length in the file.
function findBracketBlocks(lines: string[]): Array<string[]> {
  const runs: string[][] = []
  let run: string[] = []

  for (const line of lines) {
    if (BRACKET_LINE_RE.test(line)) {
      run.push(line)
    } else {
      if (run.length > 0) {
        runs.push([...run])
        run = []
      }
    }
  }
  if (run.length > 0) runs.push(run)
  if (runs.length === 0) return []

  // Find the most common run length in the valid 4–6 range.
  const freq = new Map<number, number>()
  for (const r of runs) {
    if (r.length >= 4 && r.length <= 6) freq.set(r.length, (freq.get(r.length) ?? 0) + 1)
  }
  let stringCount = 4
  let best = 0
  for (const [len, count] of freq) {
    if (count > best) {
      stringCount = len
      best = count
    }
  }

  const blocks: string[][] = []
  for (const r of runs) {
    if (r.length === stringCount) {
      blocks.push(r)
    } else if (r.length > stringCount && r.length % stringCount === 0) {
      // Multiple same-size blocks concatenated without a separator line.
      for (let i = 0; i < r.length; i += stringCount) {
        blocks.push(r.slice(i, i + stringCount))
      }
    } else if (r.length >= 4) {
      // Different string count (e.g. 5-string bridge in a 4-string tab) — accept as-is.
      blocks.push(r)
    }
  }

  return blocks
}

export function parseTab(text: string): AnalysisResult {
  const bpm = extractBpm(text)
  const beatDuration = 60 / bpm

  const lines = text.split('\n')

  // Try pipe/dash format first, then bracket format.
  const stdBlocks = findTabBlocks(lines)
  const isBracket = stdBlocks.length === 0
  const blocks = isBracket ? findBracketBlocks(lines) : stdBlocks

  if (blocks.length === 0) {
    throw new Error(
      'No tab found. Paste a standard tab (e|--0--|), dash tab (e-0--), or bracket tab ([--0--]).'
    )
  }

  const allNotes: Note[] = []
  let blockStartTime = 0

  for (const block of blocks) {
    const stringData: Array<{ midiBase: number; entries: Array<[number, number]> }> = []

    if (isBracket) {
      const basesForCount = BRACKET_MIDI_BASES[block.length] ?? BRACKET_MIDI_BASES[4]
      for (let i = 0; i < block.length; i++) {
        const match = block[i].match(BRACKET_LINE_RE)
        if (!match) continue
        const entries = parseStringLine(match[1])
        if (entries.length > 0) {
          stringData.push({ midiBase: basesForCount[i] ?? 40, entries })
        }
      }
    } else {
      const blockHasLowercaseE = block.some((line) => /^\s*e\s*[-|]/.test(line))
      for (const line of block) {
        const match = line.match(TAB_LINE_RE)
        if (!match) continue
        const midiBase = getMidiBase(match[1], blockHasLowercaseE)
        const entries = parseStringLine(match[2])
        if (entries.length > 0) {
          stringData.push({ midiBase, entries })
        }
      }
    }

    // Gather all unique column positions and sort them.
    const allColumns = new Set<number>()
    for (const { entries } of stringData) {
      for (const [col] of entries) allColumns.add(col)
    }
    const sortedColumns = [...allColumns].sort((a, b) => a - b)

    if (sortedColumns.length === 0) continue

    const columnToTime = new Map<number, number>()
    sortedColumns.forEach((col, beatIndex) => {
      columnToTime.set(col, blockStartTime + beatIndex * beatDuration)
    })

    for (const { midiBase, entries } of stringData) {
      for (let i = 0; i < entries.length; i++) {
        const [col, fret] = entries[i]
        const startTime = columnToTime.get(col)!
        const duration =
          i + 1 < entries.length ? columnToTime.get(entries[i + 1][0])! - startTime : beatDuration
        allNotes.push({ pitch: midiBase + fret, duration, startTime, velocity: 100 })
      }
    }

    blockStartTime += (sortedColumns.length + 1) * beatDuration
  }

  const key = detectKey(allNotes)

  return {
    bpm,
    timeSig: '4/4',
    key,
    notes: allNotes
  }
}
