import { useState, type JSX } from 'react'
import './assets/base.css'
import './assets/main.css'
import { MidiDropzone } from './components/MidiDropzone'
import { TabInput } from './components/TabInput'
import type { AnalysisResult } from './types'

type InputMode = 'midi' | 'tab'

function App(): JSX.Element {
  const [inputMode, setInputMode] = useState<InputMode>('midi')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)

  function switchMode(mode: InputMode): void {
    setInputMode(mode)
    setAnalysis(null) // clear stale results when switching input type
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
              </div>
            </div>
            {inputMode === 'midi' ? (
              <MidiDropzone onAnalysis={setAnalysis} />
            ) : (
              <TabInput onAnalysis={setAnalysis} />
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
          <button className="btn-export" disabled={analysis === null}>
            🎵 Generate Backing Track
          </button>
        </section>
      </main>
    </div>
  )
}

export default App
