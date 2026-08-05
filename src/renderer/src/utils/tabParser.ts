// Universal plain-text tab parser.
// Handles guitar, bass, drum, ChordPro, chord-only, and chord-diagram input.
// Never throws — all errors are returned in ParsedTab.errors[].

import { detectKey } from './keyDetection'
import type { Note, Technique, TabFormat, TabAnalysisResult, ParsedTab, Section } from '../types'

// ── Shared utilities ──────────────────────────────────────────────────────────

const MAX_FRET = 36
const MIDI_MIN = 0
const MIDI_MAX = 127

function clampMidi(n: number): number {
  return Math.max(MIDI_MIN, Math.min(MIDI_MAX, n))
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function normalizeDashes(s: string): string {
  // Unicode en-dash, em-dash, horizontal bar, minus sign → ASCII hyphen
  return s.replace(/[–—―−⸺⸻]/g, '-')
}

function makeEmptyAnalysis(
  instrumentType: TabAnalysisResult['instrumentType'],
  bpm: number,
  timeSignature: { numerator: number; denominator: number }
): TabAnalysisResult {
  return {
    detectedTuning: [],
    stringCount: 0,
    instrumentType,
    sections: [],
    hasLyrics: false,
    noteCount: 0,
    estimatedDuration: 0,
    bpm,
    timeSignature
  }
}

// ── Format-detection regexes ──────────────────────────────────────────────────

// Drum labels followed by | or : (case-insensitive)
const DRUM_LABEL_RE =
  /^(BD|KD|K|SD|SS|HH|CH|OH|FH|HF|T1|T2|T3|FT|LT|HT|MT|RD|RC|CC|CB|CrCy|RdCy|HiHatFoot|Bass|Kick|Snare|Rim|Crash|Ride|Cowbell|hh|oh)\s*[|:]/i

// String label line — letter (+ optional accidental + optional explicit octave) then | or -
const STRING_LABEL_RE = /^([A-Ga-g][#b]?\d?)\s*[-|]/

// No-separator string label — letter + optional accidental, immediately followed by a digit
const NODASH_LABEL_RE = /^([A-Ga-g][#b]?)\d/

// Bracket-format tab line: entire line is [content]
const BRACKET_LINE_RE = /^\s*\[(.+)\]\s*$/

// ChordPro inline chord marker
const CHORDPRO_RE =
  /\[([A-Ga-g][#b]?(?:m(?:aj)?|min|dim|aug|sus2?|sus4|add)?\d*(?:\/[A-Ga-g][#b]?)?)\]/

// A single standalone chord name (for chord-only detection)
const CHORD_NAME_RE =
  /^[A-Ga-g][#b]?(?:m(?:aj)?|min|dim|aug|sus2?|sus4|add)?\d*(?:\/[A-Ga-g][#b]?)?$/

function isStdTabLine(line: string): boolean {
  return STRING_LABEL_RE.test(line) || NODASH_LABEL_RE.test(line)
}

function maxConsecutiveRun(lines: string[], pred: (l: string) => boolean): number {
  let best = 0
  let cur = 0
  for (const l of lines) {
    if (pred(l)) {
      cur++
      if (cur > best) best = cur
    } else cur = 0
  }
  return best
}

// ── Format detection ──────────────────────────────────────────────────────────

export function detectFormat(input: string): TabFormat {
  const lines = normalizeLineEndings(input).split('\n')
  const nonEmpty = lines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length === 0) return 'unknown'

  // 1. Drum tab — ≥2 lines start with drum labels
  const drumCount = nonEmpty.filter((l) => DRUM_LABEL_RE.test(l.trim())).length
  if (drumCount >= 2) return 'drum-tab'

  // 2. Standard guitar / bass tab
  const tabLines = nonEmpty.filter((l) => isStdTabLine(l.trim()))
  if (tabLines.length >= 2) {
    // Require at least one line to actually contain fret digits after the separator.
    // This prevents chord progressions like "G-D-Am-F" from being classified as tab.
    const hasDigitContent = tabLines.some((l) => {
      const m = l.trim().match(/^[A-Ga-g][#b]?\d?\s*([-|])(.*)$/)
      return m ? /\d/.test(m[2] ?? '') : /\d/.test(l.trim().slice(2))
    })
    if (hasDigitContent) {
      const labels = tabLines
        .map((l) => {
          const m = l.trim().match(/^([A-Ga-g][#b]?\d?)/)
          return m ? m[1] : ''
        })
        .filter(Boolean)
      const uniqueLabels = new Set(labels)
      const hasLowercaseE = labels.includes('e')
      // 6 unique labels including lowercase e → standard guitar
      if (uniqueLabels.size >= 6 && hasLowercaseE) return 'guitar-tab'
      // C or F labels → bass / baritone
      if ([...uniqueLabels].some((l) => /^[CcFf]/.test(l))) return 'bass-tab'
      // ≤5 strings, no high-e → bass
      if (uniqueLabels.size <= 5 && !hasLowercaseE) return 'bass-tab'
      return uniqueLabels.size >= 6 ? 'guitar-tab' : 'bass-tab'
    }
  }

  // 2b. Bracket-format tab (entire lines are [content])
  const bracketMax = maxConsecutiveRun(nonEmpty, (l) => BRACKET_LINE_RE.test(l.trim()))
  if (bracketMax >= 4) return bracketMax >= 6 ? 'guitar-tab' : 'bass-tab'

  // 3. ChordPro — [Chord] markers inline with lyrics
  if (nonEmpty.some((l) => CHORDPRO_RE.test(l))) return 'chordpro'

  // 4. Chord-only — every non-empty line is solely chord names + separators
  const allChordsOrSeps = nonEmpty.every((l) => {
    const tokens = l
      .trim()
      .split(/[\s\-|]+/)
      .filter(Boolean)
    return tokens.length > 0 && tokens.every((t) => CHORD_NAME_RE.test(t))
  })
  if (allChordsOrSeps) return 'chord-only'

  // 5. Number grid — lines of exactly 6 chars from [x0-9]
  if (nonEmpty.some((l) => /^[x0-9]{6}$/i.test(l.trim()))) return 'number-grid'

  return 'unknown'
}

// ── MIDI note utilities ───────────────────────────────────────────────────────

const NOTE_PC: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11
}

function noteLetterToMidi(letter: string, octave: number): number {
  const norm = letter.charAt(0).toUpperCase() + letter.slice(1)
  const pc = NOTE_PC[norm] ?? 0
  return (octave + 1) * 12 + pc
}

// Map a string label to its open-string MIDI note.
// blockHasLowercaseE: when both 'e' and 'E' appear in the same block, 'E' = low E2.
function labelToMidiBase(label: string, blockHasLowercaseE: boolean): number {
  // Explicit octave: "E2", "A1", etc.
  const withOctave = label.match(/^([A-Ga-g][#b]?)(\d)$/)
  if (withOctave) return noteLetterToMidi(withOctave[1], parseInt(withOctave[2], 10))

  switch (label) {
    case 'e':
      return 64 // high E4 (guitar)
    case 'B':
    case 'b':
      return 59 // B3
    case 'G':
    case 'g':
      return 55 // G3
    case 'D':
    case 'd':
      return 50 // D3
    case 'F':
    case 'f':
      return 53 // F3
    case 'C':
    case 'c':
      return 48 // C3
    case 'A':
    case 'a':
      return 45 // A2
    case 'Eb':
    case 'eb':
      return 51 // Eb3
    case 'Ab':
    case 'ab':
      return 44 // Ab2
    case 'Bb':
    case 'bb':
      return 46 // Bb2
    case 'E':
      return blockHasLowercaseE ? 40 : 64 // low E2 or high E4
    default: {
      const m = label.match(/^([A-Ga-g][#b]?)$/)
      return m ? noteLetterToMidi(m[1], 2) : 45 // A2 fallback
    }
  }
}

// ── String line parser ────────────────────────────────────────────────────────

type StringEntry = { col: number; fret: number; technique?: Technique; velocity: number }

function parseStringLine(content: string): StringEntry[] {
  const s = normalizeDashes(content)
  const entries: StringEntry[] = []
  let i = 0
  let pendingTechnique: Technique | undefined
  let ghostNote = false

  while (i < s.length) {
    const ch = s[i]

    if (ch === '(') {
      ghostNote = true
      i++
      continue
    }
    if (ch === ')') {
      ghostNote = false
      i++
      continue
    }
    if (ch === '/') {
      pendingTechnique = 'slide-up'
      i++
      continue
    }
    if (ch === '\\') {
      pendingTechnique = 'slide-down'
      i++
      continue
    }
    if (ch === 'h') {
      pendingTechnique = 'hammer'
      i++
      continue
    }
    if (ch === 'p') {
      pendingTechnique = 'pulloff'
      i++
      continue
    }
    if (ch === '~') {
      pendingTechnique = 'vibrato'
      i++
      continue
    }
    if (ch === 'b') {
      pendingTechnique = 'bend'
      i++
      while (i < s.length && /\d/.test(s[i])) i++ // skip bend-to fret number
      continue
    }

    if (ch === 'x' || ch === 'X') {
      // If followed by digits it is a repeat-count annotation — skip entirely.
      if (i + 1 < s.length && /\d/.test(s[i + 1])) {
        i++
        while (i < s.length && /\d/.test(s[i])) i++
        continue
      }
      entries.push({ col: i, fret: 0, technique: 'mute', velocity: 0 })
      pendingTechnique = undefined
      i++
      continue
    }

    if (/\d/.test(ch)) {
      const col = i
      let numStr = ''
      // Collect at most 2 digits — max fret is 36 (two digits)
      while (i < s.length && /\d/.test(s[i]) && numStr.length < 2) numStr += s[i++]
      let fret = parseInt(numStr, 10)
      if (fret > MAX_FRET) {
        // Rewind — take only the first digit
        fret = parseInt(numStr[0], 10)
        i = col + 1
      }
      entries.push({ col, fret, technique: pendingTechnique, velocity: ghostNote ? 50 : 100 })
      pendingTechnique = undefined
      continue
    }

    // | - space and any other character: advance column, no note
    i++
  }

  return entries
}

// ── Tab block finders ─────────────────────────────────────────────────────────

type StdBlock = { type: 'standard'; lines: string[]; startIndex: number }
type BracketBlock = { type: 'bracket'; lines: string[]; startIndex: number }
type TabBlock = StdBlock | BracketBlock

function findStandardBlocks(lines: string[]): StdBlock[] {
  const blocks: StdBlock[] = []
  let run: string[] = []
  let runStart = 0

  for (let i = 0; i < lines.length; i++) {
    if (isStdTabLine(lines[i].trim())) {
      if (run.length === 0) runStart = i
      run.push(lines[i])
      if (run.length === 8) {
        blocks.push({ type: 'standard', lines: [...run], startIndex: runStart })
        run = []
      }
    } else {
      if (run.length >= 2) blocks.push({ type: 'standard', lines: [...run], startIndex: runStart })
      run = []
    }
  }
  if (run.length >= 2) blocks.push({ type: 'standard', lines: [...run], startIndex: runStart })
  return blocks
}

function findBracketBlocks(lines: string[]): BracketBlock[] {
  const blocks: BracketBlock[] = []
  const runs: { lines: string[]; start: number }[] = []
  let run: string[] = []
  let runStart = 0

  for (let i = 0; i < lines.length; i++) {
    if (BRACKET_LINE_RE.test(lines[i].trim())) {
      if (run.length === 0) runStart = i
      run.push(lines[i])
    } else {
      if (run.length > 0) {
        runs.push({ lines: [...run], start: runStart })
        run = []
      }
    }
  }
  if (run.length > 0) runs.push({ lines: [...run], start: runStart })
  if (runs.length === 0) return []

  // Determine most common valid run length (4–8 strings)
  const freq = new Map<number, number>()
  for (const r of runs) {
    const len = r.lines.length
    if (len >= 4 && len <= 8) freq.set(len, (freq.get(len) ?? 0) + 1)
  }
  let stringCount = 6
  let best = 0
  for (const [len, count] of freq)
    if (count > best) {
      stringCount = len
      best = count
    }

  for (const r of runs) {
    if (r.lines.length === stringCount) {
      blocks.push({ type: 'bracket', lines: r.lines, startIndex: r.start })
    } else if (r.lines.length > stringCount && r.lines.length % stringCount === 0) {
      for (let j = 0; j < r.lines.length; j += stringCount)
        blocks.push({
          type: 'bracket',
          lines: r.lines.slice(j, j + stringCount),
          startIndex: r.start + j
        })
    } else if (r.lines.length >= 4) {
      blocks.push({ type: 'bracket', lines: r.lines, startIndex: r.start })
    }
  }
  return blocks
}

// ── Section marker detection ──────────────────────────────────────────────────

const SECTION_RE = [
  /\bintro\b/i,
  /\bverse\b/i,
  /\bchorus\b/i,
  /\bbridge\b/i,
  /\bsolo\b/i,
  /\boutro\b/i,
  /pre[\s-]?chorus/i,
  /\binterlude\b/i,
  /\bbreakdown\b/i,
  /\bhook\b/i,
  /\brefrain\b/i,
  /\bcoda\b/i,
  /\btag\b/i,
  /back\s+to/i,
  /\bmelody\b/i,
  /\brepeat\b/i
]

function detectSection(line: string): string | null {
  const t = line.trim()
  for (const re of SECTION_RE) {
    if (re.test(t))
      return t
        .replace(/[^a-zA-Z\s-]/g, '')
        .trim()
        .slice(0, 30)
  }
  return null
}

// MIDI bases for bracket format: index 0 = highest-pitch string
const BRACKET_MIDI_BASES: Record<number, number[]> = {
  4: [55, 50, 45, 40], // G D A E — 4-string bass
  5: [55, 50, 45, 40, 35], // G D A E B — 5-string bass
  6: [64, 59, 55, 50, 45, 40], // e B G D A E — standard guitar
  7: [64, 59, 55, 50, 45, 40, 35],
  8: [64, 59, 55, 50, 45, 40, 35, 28]
}

// ── Guitar / Bass tab parser ──────────────────────────────────────────────────

function parseGuitarBassTab(
  input: string,
  bpm: number,
  timeSignature: { numerator: number; denominator: number },
  format: 'guitar-tab' | 'bass-tab'
): Omit<ParsedTab, 'detectedFormat'> {
  const warnings: string[] = []
  const errors: string[] = []
  const notes: Note[] = []
  const sections: Section[] = []

  const lines = normalizeLineEndings(input).split('\n')
  const stdBlocks = findStandardBlocks(lines)
  const isBracket = stdBlocks.length === 0
  const blocks: TabBlock[] = isBracket ? findBracketBlocks(lines) : stdBlocks

  if (blocks.length === 0) {
    errors.push('No parseable tab blocks found — check formatting')
    return {
      notes: [],
      analysisResult: makeEmptyAnalysis(
        format === 'guitar-tab' ? 'guitar' : 'bass',
        bpm,
        timeSignature
      ),
      warnings,
      errors
    }
  }

  const beatDuration = 60 / bpm
  const sixteenth = beatDuration / 4
  let blockStartTime = 0
  const allLabels: string[] = []
  let hasLyrics = false
  let lastBlockEnd = 0

  for (const block of blocks) {
    // Check lines before this block for section markers and lyrics
    for (let li = lastBlockEnd; li < block.startIndex; li++) {
      const marker = detectSection(lines[li])
      if (marker) sections.push({ name: marker, startsAtTime: blockStartTime })
      if (/[a-zA-Z]{4,}/.test(lines[li]) && !isStdTabLine(lines[li].trim())) hasLyrics = true
    }
    lastBlockEnd = block.startIndex + block.lines.length

    type StringData = {
      label: string
      midiBase: number
      entries: StringEntry[]
      stringIndex: number
    }
    const stringData: StringData[] = []

    if (block.type === 'bracket') {
      const bases = BRACKET_MIDI_BASES[block.lines.length] ?? BRACKET_MIDI_BASES[6]
      for (let si = 0; si < block.lines.length; si++) {
        const m = block.lines[si].trim().match(BRACKET_LINE_RE)
        if (!m) continue
        const entries = parseStringLine(m[1])
        if (entries.length > 0)
          stringData.push({
            label: `str${si + 1}`,
            midiBase: bases[si] ?? 40,
            entries,
            stringIndex: si
          })
      }
    } else {
      const blockLabels = block.lines.map((l) => {
        const m = l.trim().match(/^([A-Ga-g][#b]?\d?)/)
        return m ? m[1] : ''
      })
      const blockHasLowercaseE = blockLabels.includes('e') && blockLabels.includes('E')

      for (let si = 0; si < block.lines.length; si++) {
        const trimmed = normalizeDashes(block.lines[si].trim())
        // Try pipe/dash format first, then no-separator format
        const labelMatch =
          trimmed.match(/^([A-Ga-g][#b]?\d?)\s*([-|].*)$/) ??
          trimmed.match(/^([A-Ga-g][#b]?)\s*(\d.+)$/)
        if (!labelMatch) {
          warnings.push(`Line skipped (unrecognized): "${trimmed.slice(0, 20)}"`)
          continue
        }
        const label = labelMatch[1]
        const content = labelMatch[2]
        allLabels.push(label)

        const midiBase = labelToMidiBase(label, blockHasLowercaseE)
        const entries = parseStringLine(content)
        if (entries.length > 0) stringData.push({ label, midiBase, entries, stringIndex: si })
      }
    }

    if (stringData.length === 0) continue

    // Union of all column positions across all strings in this block
    const allCols = new Set<number>()
    for (const { entries } of stringData) for (const e of entries) allCols.add(e.col)
    const sortedCols = [...allCols].sort((a, b) => a - b)
    if (sortedCols.length === 0) continue

    // Estimate note density to pick base timing unit (16th, 8th, or quarter)
    const sounding = stringData.reduce(
      (s, sd) => s + sd.entries.filter((e) => e.velocity > 0).length,
      0
    )
    const avgCols = sortedCols.length / Math.max(sounding, 1)
    const baseUnit = avgCols < 2 ? sixteenth : avgCols < 3.5 ? sixteenth * 2 : beatDuration

    // Map column → absolute start time
    const colToTime = new Map<number, number>()
    sortedCols.forEach((col, idx) => colToTime.set(col, blockStartTime + idx * baseUnit))

    for (const { midiBase, entries, stringIndex } of stringData) {
      for (let ei = 0; ei < entries.length; ei++) {
        const entry = entries[ei]
        const startTime = colToTime.get(entry.col) ?? blockStartTime
        const nextEntry = entries[ei + 1]
        let duration: number
        if (nextEntry) {
          const nextTime = colToTime.get(nextEntry.col) ?? startTime + beatDuration
          duration = Math.max(nextTime - startTime, sixteenth)
        } else {
          duration = beatDuration
        }
        duration = Math.min(duration, beatDuration * 16)

        notes.push({
          pitch: clampMidi(midiBase + entry.fret),
          duration,
          startTime,
          velocity: entry.velocity,
          technique: entry.technique,
          string: stringIndex
        })
      }
    }

    blockStartTime += (sortedCols.length + 1) * baseUnit
  }

  const uniqueLabels = [...new Set(allLabels)]
  const detectedKey = notes.length > 0 ? detectKey(notes) : undefined
  const estimatedDuration =
    notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0

  return {
    notes,
    analysisResult: {
      detectedTuning: uniqueLabels,
      stringCount: uniqueLabels.length,
      instrumentType: format === 'guitar-tab' ? 'guitar' : 'bass',
      sections,
      hasLyrics,
      noteCount: notes.length,
      estimatedDuration,
      bpm,
      timeSignature,
      detectedKey
    },
    warnings,
    errors
  }
}

// ── Drum tab parser ───────────────────────────────────────────────────────────

const DRUM_MIDI: Record<string, number> = {
  bd: 36,
  k: 36,
  kd: 36,
  bass: 36,
  kick: 36,
  sd: 38,
  s: 38,
  snare: 38,
  ss: 37,
  rim: 37,
  hh: 42,
  ch: 42,
  oh: 46,
  fh: 44,
  hf: 44,
  hihatfoot: 44,
  t1: 48,
  ht: 48,
  t2: 47,
  mt: 47,
  t3: 41,
  ft: 41,
  lt: 41,
  cc: 49,
  crcv: 49,
  crash: 49,
  rc: 51,
  rdcy: 51,
  ride: 51,
  cb: 56,
  cowbell: 56
}

function parseDrumTab(
  input: string,
  bpm: number,
  timeSignature: { numerator: number; denominator: number }
): Omit<ParsedTab, 'detectedFormat'> {
  const warnings: string[] = []
  const errors: string[] = []
  const notes: Note[] = []

  const lines = normalizeLineEndings(input).split('\n')
  const drumLines = lines.filter((l) => DRUM_LABEL_RE.test(l.trim()))

  if (drumLines.length === 0) {
    errors.push('No drum tab lines detected')
    return {
      notes: [],
      analysisResult: makeEmptyAnalysis('drums', bpm, timeSignature),
      warnings,
      errors
    }
  }

  // Detect subdivisions per bar from the first drum line's bar segments
  const firstContent = drumLines[0].replace(/^[A-Za-z0-9\s]+[|:]/, '')
  const barSegs = firstContent.split('|').filter((s) => s.length > 0)
  const subdivsPerBar =
    barSegs.length > 0
      ? Math.round(barSegs.reduce((s, seg) => s + seg.length, 0) / barSegs.length)
      : 16
  const barDuration = (60 / bpm) * timeSignature.numerator
  const subdivDur = barDuration / Math.max(subdivsPerBar, 1)

  for (const line of drumLines) {
    const m = line.trim().match(/^([A-Za-z0-9]+)\s*[|:](.+)$/)
    if (!m) continue

    const midiPitch = DRUM_MIDI[m[1].toLowerCase()] ?? 38
    const content = m[2]
    let globalTime = 0

    for (const seg of content.split('|')) {
      for (let ci = 0; ci < seg.length; ci++) {
        const ch = seg[ci]
        let velocity = 0
        if (ch === 'x' || ch === 'X') velocity = 100
        else if (ch === 'o' || ch === 'O') velocity = 127
        else if (ch === 'g' || ch === 'G') velocity = 50
        else if (ch === 'f') velocity = 100 // flam — simplified as accent
        if (velocity > 0) {
          notes.push({
            pitch: clampMidi(midiPitch),
            duration: subdivDur,
            startTime: globalTime + ci * subdivDur,
            velocity
          })
        }
      }
      globalTime += seg.length * subdivDur
    }
  }

  const estimatedDuration =
    notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0

  return {
    notes,
    analysisResult: {
      detectedTuning: [],
      stringCount: 0,
      instrumentType: 'drums',
      sections: [],
      hasLyrics: false,
      noteCount: notes.length,
      estimatedDuration,
      bpm,
      timeSignature
    },
    warnings,
    errors
  }
}

// ── Chord utilities (shared by ChordPro and chord-only parsers) ───────────────

const CHORD_ROOT_MIDI: Record<string, number> = {
  C: 60,
  'C#': 61,
  Db: 61,
  D: 62,
  'D#': 63,
  Eb: 63,
  E: 64,
  F: 65,
  'F#': 66,
  Gb: 66,
  G: 67,
  'G#': 68,
  Ab: 68,
  A: 69,
  'A#': 70,
  Bb: 70,
  B: 71
}

function chordToNotes(name: string, startTime: number, duration: number): Note[] {
  const m = name.match(
    /^([A-Ga-g][#b]?)(m(?:aj)?|min|dim|aug|sus2?|sus4|add)?(\d+)?(\/[A-Ga-g][#b]?)?$/
  )
  if (!m) return []

  const rootStr = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  const quality = m[2] ?? ''
  const root = CHORD_ROOT_MIDI[rootStr] ?? 60

  let intervals: number[]
  if (quality.startsWith('m') && !quality.startsWith('maj')) intervals = [0, 3, 7]
  else if (quality === 'dim') intervals = [0, 3, 6]
  else if (quality === 'aug') intervals = [0, 4, 8]
  else if (quality === 'sus2') intervals = [0, 2, 7]
  else if (quality === 'sus4' || quality === 'sus') intervals = [0, 5, 7]
  else intervals = [0, 4, 7] // major

  return intervals.map((iv) => ({ pitch: clampMidi(root + iv), duration, startTime, velocity: 80 }))
}

// ── ChordPro parser ───────────────────────────────────────────────────────────

function parseChordPro(
  input: string,
  bpm: number,
  timeSignature: { numerator: number; denominator: number }
): Omit<ParsedTab, 'detectedFormat'> {
  const barDuration = (60 / bpm) * timeSignature.numerator
  const notes: Note[] = []
  const chords: string[] = []
  for (const m of input.matchAll(new RegExp(CHORDPRO_RE.source, 'g'))) chords.push(m[1])
  for (let i = 0; i < chords.length; i++)
    notes.push(...chordToNotes(chords[i], i * barDuration, barDuration))

  const detectedKey = notes.length > 0 ? detectKey(notes) : undefined
  return {
    notes,
    analysisResult: {
      detectedTuning: [],
      stringCount: 0,
      instrumentType: 'unknown',
      sections: [],
      hasLyrics: true,
      noteCount: notes.length,
      estimatedDuration: chords.length * barDuration,
      bpm,
      timeSignature,
      detectedKey
    },
    warnings: [],
    errors: chords.length === 0 ? ['No chords found in ChordPro input'] : []
  }
}

// ── Chord-only parser ─────────────────────────────────────────────────────────

function parseChordOnly(
  input: string,
  bpm: number,
  timeSignature: { numerator: number; denominator: number }
): Omit<ParsedTab, 'detectedFormat'> {
  const barDuration = (60 / bpm) * timeSignature.numerator
  const notes: Note[] = []
  const chordRe = /[A-Ga-g][#b]?(?:m(?:aj)?|min|dim|aug|sus2?|sus4|add)?\d*(?:\/[A-Ga-g][#b]?)?/g
  const matches = [...input.matchAll(chordRe)].map((m) => m[0]).filter((s) => CHORD_NAME_RE.test(s))

  for (let i = 0; i < matches.length; i++)
    notes.push(...chordToNotes(matches[i], i * barDuration, barDuration))

  const detectedKey = notes.length > 0 ? detectKey(notes) : undefined
  return {
    notes,
    analysisResult: {
      detectedTuning: [],
      stringCount: 0,
      instrumentType: 'unknown',
      sections: [],
      hasLyrics: false,
      noteCount: notes.length,
      estimatedDuration: matches.length * barDuration,
      bpm,
      timeSignature,
      detectedKey
    },
    warnings: [],
    errors: matches.length === 0 ? ['No chord names found in input'] : []
  }
}

// ── Number-grid (chord diagram) parser ───────────────────────────────────────

// High string first: e B G D A E
const GRID_OPEN_MIDI = [64, 59, 55, 50, 45, 40]

function parseNumberGrid(
  input: string,
  bpm: number,
  timeSignature: { numerator: number; denominator: number }
): Omit<ParsedTab, 'detectedFormat'> {
  const barDuration = (60 / bpm) * timeSignature.numerator
  const notes: Note[] = []
  const lines = normalizeLineEndings(input).split('\n')
  const gridLines = lines.filter((l) => /^[x0-9]{6}$/i.test(l.trim()))

  for (let gi = 0; gi < gridLines.length; gi++) {
    const grid = gridLines[gi].trim()
    const startTime = gi * barDuration
    for (let si = 0; si < 6; si++) {
      const ch = grid[si]
      if (ch === 'x' || ch === 'X') continue
      const fret = parseInt(ch, 10)
      if (isNaN(fret)) continue
      notes.push({
        pitch: clampMidi((GRID_OPEN_MIDI[si] ?? 40) + fret),
        duration: barDuration,
        startTime,
        velocity: 80
      })
    }
  }

  const detectedKey = notes.length > 0 ? detectKey(notes) : undefined
  return {
    notes,
    analysisResult: {
      detectedTuning: ['e', 'B', 'G', 'D', 'A', 'E'],
      stringCount: 6,
      instrumentType: 'guitar',
      sections: [],
      hasLyrics: false,
      noteCount: notes.length,
      estimatedDuration: gridLines.length * barDuration,
      bpm,
      timeSignature,
      detectedKey
    },
    warnings: [],
    errors: gridLines.length === 0 ? ['No chord diagrams found in input'] : []
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function parseTab(
  input: string,
  bpm = 120,
  timeSignature = { numerator: 4, denominator: 4 }
): ParsedTab {
  if (!input || input.trim().length === 0) {
    return {
      notes: [],
      analysisResult: makeEmptyAnalysis('unknown', bpm, timeSignature),
      warnings: [],
      errors: ['No tab notation detected in input'],
      detectedFormat: 'unknown'
    }
  }

  // Override BPM if the text contains a tempo marker
  const bpmMatch = input.match(/(?:bpm|tempo)[:\s=]+(\d+)/i)
  if (bpmMatch) {
    const extracted = parseInt(bpmMatch[1], 10)
    if (extracted >= 20 && extracted <= 400) bpm = extracted
  }

  const format = detectFormat(input)
  let result: Omit<ParsedTab, 'detectedFormat'>

  switch (format) {
    case 'guitar-tab':
    case 'bass-tab':
      result = parseGuitarBassTab(input, bpm, timeSignature, format)
      break
    case 'drum-tab':
      result = parseDrumTab(input, bpm, timeSignature)
      break
    case 'chordpro':
      result = parseChordPro(input, bpm, timeSignature)
      break
    case 'chord-only':
      result = parseChordOnly(input, bpm, timeSignature)
      break
    case 'number-grid':
      result = parseNumberGrid(input, bpm, timeSignature)
      break
    default: {
      // Last-resort: attempt guitar-tab parsing on unknown input
      const fallback = parseGuitarBassTab(input, bpm, timeSignature, 'guitar-tab')
      if (fallback.notes.length > 0) return { ...fallback, detectedFormat: 'unknown' }
      return {
        notes: [],
        analysisResult: makeEmptyAnalysis('unknown', bpm, timeSignature),
        warnings: [],
        errors: ['No tab notation detected in input'],
        detectedFormat: 'unknown'
      }
    }
  }

  if (result.notes.length === 0 && result.errors.length === 0)
    result.errors.push(`Detected format: ${format} but could not parse any notes`)

  return { ...result, detectedFormat: format }
}

// ── Self-tests ────────────────────────────────────────────────────────────────

export function runTabParserTests(): void {
  const tests: Array<{
    name: string
    input: string
    expect: { format: TabFormat; minNotes: number; hasError?: boolean }
  }> = [
    {
      name: 'Standard guitar tab',
      input:
        'e|--0--2--3--\nB|--1--1--1--\nG|--0--0--0--\nD|--2--2--2--\nA|--3--3--3--\nE|----------\n',
      expect: { format: 'guitar-tab', minNotes: 5 }
    },
    {
      name: '4-string bass tab',
      input: 'G|--5--5--3--\nD|--5--5--3--\nA|--3--3--1--\nE|----------\n',
      expect: { format: 'bass-tab', minNotes: 3 }
    },
    {
      name: 'Drum tab',
      input: 'K|x---x---x---x---|\nS|----x-------x---|\nHH|x-x-x-x-x-x-x-x-|\n',
      expect: { format: 'drum-tab', minNotes: 8 }
    },
    {
      name: 'ChordPro',
      input: '[Am]I walked the [G]line\n[C]all the [F]way home\n',
      expect: { format: 'chordpro', minNotes: 3 }
    },
    {
      name: 'Chord only',
      input: 'Am - G - C - F\n',
      expect: { format: 'chord-only', minNotes: 4 }
    },
    {
      name: 'Custom tuning bass tab',
      input: 'D|--10-10-9--\nA|--7--7--7--\nF|--7--7--7--\nC|--7--7--7--\n',
      expect: { format: 'bass-tab', minNotes: 3 }
    },
    {
      name: 'Bracket format bass tab',
      input: '[--7--7--5--]\n[--5--5--3--]\n[--5--5--3--]\n[--3--3--1--]\n',
      expect: { format: 'bass-tab', minNotes: 3 }
    },
    {
      name: 'No-separator-dash format',
      input: 'D|--10-10-9--\nA|--7--7--7--\nF|--7--7--7--\nC1010101010-9-9-7---\n',
      expect: { format: 'bass-tab', minNotes: 5 }
    },
    {
      name: 'Empty input',
      input: '',
      expect: { format: 'unknown', minNotes: 0, hasError: true }
    }
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    const result = parseTab(test.input, 120)
    const formatOk = result.detectedFormat === test.expect.format
    const notesOk = result.notes.length >= test.expect.minNotes
    const errorOk = test.expect.hasError ? result.errors.length > 0 : result.errors.length === 0

    if (formatOk && notesOk && errorOk) {
      console.log(`✅ PASS: ${test.name}`)
      passed++
    } else {
      console.log(`❌ FAIL: ${test.name}`)
      if (!formatOk)
        console.log(`   Format: expected ${test.expect.format}, got ${result.detectedFormat}`)
      if (!notesOk)
        console.log(`   Notes: expected >=${test.expect.minNotes}, got ${result.notes.length}`)
      if (!errorOk)
        console.log(
          `   Errors: expected ${test.expect.hasError ? 'errors' : 'no errors'}, got ${result.errors}`
        )
      failed++
    }
  }

  console.log(`\nTab Parser Tests: ${passed} passed, ${failed} failed`)
}
