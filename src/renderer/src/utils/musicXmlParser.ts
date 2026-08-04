import { detectKey } from './keyDetection'
import type { AnalysisResult, Note } from '../types'

// Semitone offset from C for each note letter name (no accidentals).
const STEP_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
}

function stepOctaveToMidi(step: string, octave: number, alter: number): number {
  return (octave + 1) * 12 + (STEP_SEMITONE[step.toUpperCase()] ?? 0) + Math.round(alter)
}

// Safe text extraction from a potentially-missing element.
function getText(el: Element | null): string {
  return el?.textContent?.trim() ?? ''
}

function extractBpm(doc: Document): number {
  // <sound tempo="120"/> — the most common way DAWs export tempo to MusicXML
  const soundEl = doc.querySelector('sound[tempo]')
  if (soundEl) {
    const t = parseFloat(soundEl.getAttribute('tempo') ?? '')
    if (t >= 20 && t <= 400) return Math.round(t)
  }
  // <metronome><per-minute>120</per-minute></metronome>
  const perMinute = doc.querySelector('per-minute')
  if (perMinute?.textContent) {
    const t = parseFloat(perMinute.textContent)
    if (t >= 20 && t <= 400) return Math.round(t)
  }
  return 120
}

function extractTimeSig(doc: Document): string {
  const beats = getText(doc.querySelector('time > beats')) || '4'
  const beatType = getText(doc.querySelector('time > beat-type')) || '4'
  return `${beats}/${beatType}`
}

// Walks the direct children of a measure (or part-inside-measure for timewise),
// handling <note>, <backup>, <forward>, and <attributes> in document order.
// Appends any pitched notes to `out` and returns the updated time cursor + divisions.
function processMeasureChildren(
  children: HTMLCollectionOf<Element>,
  divisions: number,
  quarterDuration: number,
  measureStartTime: number,
  out: Note[]
): { endTime: number; divisions: number } {
  let t = measureStartTime
  let lastNonChordTime = measureStartTime
  let divs = divisions

  for (const child of Array.from(children)) {
    switch (child.tagName) {
      case 'attributes': {
        // divisions may be redefined mid-piece
        const d = parseInt(getText(child.querySelector('divisions')), 10)
        if (d > 0) divs = d
        break
      }

      case 'note': {
        // Grace notes have no real duration and don't move the time cursor.
        if (child.querySelector('grace')) break

        const isChord = !!child.querySelector('chord')
        const isRest = !!child.querySelector('rest')
        const dur = parseInt(getText(child.querySelector('duration')), 10) || 0
        const durationSec = (dur / divs) * quarterDuration

        if (!isRest) {
          const step = getText(child.querySelector('step')) || 'C'
          const octave = parseInt(getText(child.querySelector('octave')), 10) || 4
          const alter = parseFloat(getText(child.querySelector('alter'))) || 0
          out.push({
            pitch: stepOctaveToMidi(step, octave, alter),
            duration: durationSec,
            // Chord notes sound at the same time as the previous non-chord note.
            startTime: isChord ? lastNonChordTime : t,
            velocity: 100
          })
        }

        if (!isChord) {
          lastNonChordTime = t
          t += durationSec
        }
        break
      }

      case 'backup': {
        // Rewind the time cursor to write a second voice in the same measure.
        const dur = parseInt(getText(child.querySelector('duration')), 10) || 0
        t -= (dur / divs) * quarterDuration
        // Clamp so we never rewind before the measure boundary.
        t = Math.max(t, measureStartTime)
        break
      }

      case 'forward': {
        const dur = parseInt(getText(child.querySelector('duration')), 10) || 0
        t += (dur / divs) * quarterDuration
        break
      }
    }
  }

  return { endTime: t, divisions: divs }
}

// score-partwise: outer loop = parts, inner loop = measures
function extractNotesPartwise(doc: Document, bpm: number): Note[] {
  const quarterDuration = 60 / bpm
  const notes: Note[] = []

  for (const part of Array.from(doc.querySelectorAll('score-partwise > part'))) {
    let divisions = 1
    let currentTime = 0

    for (const measure of Array.from(part.querySelectorAll(':scope > measure'))) {
      const result = processMeasureChildren(
        measure.children,
        divisions,
        quarterDuration,
        currentTime,
        notes
      )
      divisions = result.divisions
      currentTime = result.endTime
    }
  }

  return notes
}

// score-timewise: outer loop = measures, inner loop = parts
// Each part maintains its own time cursor since they may have different tempos in edge cases.
function extractNotesTimewise(doc: Document, bpm: number): Note[] {
  const quarterDuration = 60 / bpm
  const notes: Note[] = []
  const partTimes = new Map<string, number>()
  const partDivisions = new Map<string, number>()

  for (const measure of Array.from(doc.querySelectorAll('score-timewise > measure'))) {
    for (const part of Array.from(measure.querySelectorAll(':scope > part'))) {
      const id = part.getAttribute('id') ?? 'P1'
      const currentTime = partTimes.get(id) ?? 0
      const divisions = partDivisions.get(id) ?? 1

      const result = processMeasureChildren(
        part.children,
        divisions,
        quarterDuration,
        currentTime,
        notes
      )
      partTimes.set(id, result.endTime)
      partDivisions.set(id, result.divisions)
    }
  }

  return notes
}

export function parseMusicXml(xmlText: string): AnalysisResult {
  // Compressed MusicXML (.mxl) is a ZIP archive — its first two bytes are 'PK'.
  // DOMParser would give a cryptic parsererror, so we intercept it early.
  if (xmlText.startsWith('PK')) {
    throw new Error(
      'Compressed MusicXML (.mxl) is not supported. Export from your notation app as .musicxml or .xml instead.'
    )
  }

  const domParser = new DOMParser()
  const doc = domParser.parseFromString(xmlText, 'application/xml')

  if (doc.querySelector('parsererror')) {
    throw new Error('This file is not valid XML. Is it a real MusicXML file?')
  }

  const isPartwise = !!doc.querySelector('score-partwise')
  const isTimewise = !!doc.querySelector('score-timewise')

  if (!isPartwise && !isTimewise) {
    throw new Error(
      'No MusicXML score found. The file must contain a <score-partwise> or <score-timewise> root element.'
    )
  }

  const bpm = extractBpm(doc)
  const timeSig = extractTimeSig(doc)
  const notes = isTimewise ? extractNotesTimewise(doc, bpm) : extractNotesPartwise(doc, bpm)

  notes.sort((a, b) => a.startTime - b.startTime)

  if (notes.length === 0) {
    throw new Error('No pitched notes found in this MusicXML file.')
  }

  const key = detectKey(notes)
  return { bpm, timeSig, key, notes }
}
