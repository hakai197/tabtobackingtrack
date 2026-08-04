import { useState, type JSX } from 'react'
import './assets/base.css'
import './assets/main.css'
import { MidiDropzone } from './components/MidiDropzone'
import { TabInput } from './components/TabInput'
import { MusicXmlDropzone } from './components/MusicXmlDropzone'
import { generateDiWav } from './utils/diWavGenerator'
import type { AnalysisResult } from './types'

type InputMode = 'midi' | 'tab' | 'musicxml'

function App(): JSX.Element {
  const [inputMode, setInputMode] = useState<InputMode>('midi')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  function switchMode(mode: InputMode): void {
    setInputMode(mode)
    setAnalysis(null) // clear stale results when switching input type
  }

  // M5: generates guitar_di.wav and triggers a browser download.
  // M8 will replace this download with Electron's folder-picker + writing all output files.
  async function handleGenerate(): Promise<void> {
    if (!analysis) return
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const wavBuffer = await generateDiWav(analysis.notes)
      const blob = new Blob([wavBuffer], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'guitar_di.wav'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WAV generation failed.'
      setGenerateError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="app-header">
        <h1>
          🎸 Tab to <span className="accent">Backing Track</span>
        </h1>
      </header>

      {/* ── Main Body ──────────────────────────────────────── */}
      <main className="app-body">
        {/* ── Top Row: Input + Analysis ──────────────────── */}
        <div className="app-top-row">
          {/* Input Panel */}
          <section className="panel panel-input">
            {/* Panel header: title on left, mode toggle on right */}
            <div className="panel-header">
              <h2 className="panel-title">Input</h2>
              <div className="input-mode-tabs">
                <button
                  type="button"
                  className={`input-mode-tab ${inputMode === 'midi' ? 'active' : ''}`}
                  onClick={() => switchMode('midi')}
                >
                  MIDI
                </button>
                <button
                  type="button"
                  className={`input-mode-tab ${inputMode === 'tab' ? 'active' : ''}`}
                  onClick={() => switchMode('tab')}
                >
                  Tab
                </button>
                <button
                  type="button"
                  className={`input-mode-tab ${inputMode === 'musicxml' ? 'active' : ''}`}
                  onClick={() => switchMode('musicxml')}
                >
                  MusicXML
                </button>
              </div>
            </div>
            {inputMode === 'midi' ? (
              <MidiDropzone onAnalysis={setAnalysis} />
            ) : inputMode === 'tab' ? (
              <TabInput onAnalysis={setAnalysis} />
            ) : (
              <MusicXmlDropzone onAnalysis={setAnalysis} />
            )}
          </section>

          {/* Analysis Panel */}
          <section className="panel panel-analysis">
            <h2 className="panel-title">Analysis</h2>
            <div className="analysis-grid">
              <div className="analysis-stat">
                <span className="label">Key</span>
                <span className={`value ${analysis ? '' : 'empty'}`}>{analysis?.key ?? '—'}</span>
              </div>

              <div className="analysis-stat">
                <span className="label">BPM</span>
                <span className={`value ${analysis ? '' : 'empty'}`}>{analysis?.bpm ?? '—'}</span>
              </div>

              <div className="analysis-stat">
                <span className="label">Time Signature</span>
                <span className={`value ${analysis ? '' : 'empty'}`}>
                  {analysis?.timeSig ?? '—'}
                </span>
              </div>

              <div className="analysis-stat">
                <span className="label">Notes Detected</span>
                <span className={`value ${analysis ? '' : 'empty'}`}>
                  {analysis ? analysis.notes.length.toLocaleString() : '—'}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* ── Export Panel (full width bottom) ───────────── */}
        <section className="panel panel-export">
          <h2 className="panel-title">Export</h2>
          <div className="export-row">
            <button
              className="btn-export"
              disabled={analysis === null || isGenerating}
              onClick={handleGenerate}
            >
              {isGenerating ? 'Generating…' : '🎵 Generate Backing Track'}
            </button>
            {generateError && <p className="export-error">{generateError}</p>}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
