import { useState, type JSX } from 'react'
import { parseTab } from '../utils/tabParser'
import type { AnalysisResult } from '../types'

const PLACEHOLDER = `Paste guitar tab here, for example:

e|--0---3---5---3---0---|
B|--1---3---5---3---1---|
G|--0---2---4---2---0---|
D|--2---0---2---0---2---|
A|--3-----------3---3---|
E|----------------------|

BPM: 120 (optional — defaults to 120 if omitted)`

type Props = {
  onAnalysis: (result: AnalysisResult) => void
}

export function TabInput({ onAnalysis }: Props): JSX.Element {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleParse(): void {
    setError(null)
    const parsed = parseTab(text)
    if (parsed.errors.length > 0) {
      setError(parsed.errors[0])
      return
    }
    if (parsed.notes.length === 0) {
      setError('No notes found. Is this a valid tab?')
      return
    }
    const result: AnalysisResult = {
      bpm: parsed.analysisResult.bpm,
      timeSig: `${parsed.analysisResult.timeSignature.numerator}/${parsed.analysisResult.timeSignature.denominator}`,
      key: parsed.analysisResult.detectedKey ?? 'Unknown',
      notes: parsed.notes
    }
    onAnalysis(result)
  }

  return (
    <div className="tab-input">
      <textarea
        className="tab-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      <div className="tab-input-footer">
        {error && <p className="tab-input-error">{error}</p>}
        <button className="btn-parse" onClick={handleParse} disabled={text.trim().length === 0}>
          Parse Tab
        </button>
      </div>
    </div>
  )
}
