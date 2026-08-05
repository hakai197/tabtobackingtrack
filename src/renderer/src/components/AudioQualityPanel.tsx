import { useState, type JSX } from 'react'
import { GUITAR_PRESETS, BASS_PRESETS, DRUM_KITS } from '../utils/instrumentPresets'

export type AudioQuality = 'standard' | 'enhanced'

export type FluidSynthStatus = {
  fluidSynthFound: boolean
  soundFontFound: boolean
  fluidSynthPath: string
  soundFontPath: string
}

export type InstrumentPresets = {
  guitar: number
  bass: number
  drumKit: number
}

type Props = {
  audioQuality: AudioQuality
  onAudioQualityChange: (q: AudioQuality) => void
  onCheckFluidSynth: () => Promise<FluidSynthStatus>
  instrumentPresets: InstrumentPresets
  onInstrumentPresetsChange: (presets: InstrumentPresets) => void
}

export function AudioQualityPanel({
  audioQuality,
  onAudioQualityChange,
  onCheckFluidSynth,
  instrumentPresets,
  onInstrumentPresetsChange
}: Props): JSX.Element {
  const [showSetup, setShowSetup] = useState(false)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<FluidSynthStatus | null>(null)

  async function checkStatus(): Promise<void> {
    setChecking(true)
    try {
      const result = await onCheckFluidSynth()
      setStatus(result)
    } finally {
      setChecking(false)
    }
  }

  function handleQualityChange(q: AudioQuality): void {
    onAudioQualityChange(q)
    // Auto-check FluidSynth the first time Enhanced is selected
    if (q === 'enhanced' && status === null) {
      void checkStatus()
    }
  }

  const fsReady = status !== null && status.fluidSynthFound && status.soundFontFound

  return (
    <div className="audio-quality-panel">
      <span className="audio-quality-title">Audio Quality</span>

      <div className="audio-quality-options">
        <label className="audio-quality-option">
          <input
            type="radio"
            name="audioQuality"
            value="standard"
            checked={audioQuality === 'standard'}
            onChange={() => handleQualityChange('standard')}
          />
          <div className="audio-quality-option-body">
            <span className="audio-quality-option-name">Standard (Built-in)</span>
            <span className="audio-quality-option-desc">
              Synthesized audio — works out of the box
            </span>
          </div>
        </label>

        <label className="audio-quality-option">
          <input
            type="radio"
            name="audioQuality"
            value="enhanced"
            checked={audioQuality === 'enhanced'}
            onChange={() => handleQualityChange('enhanced')}
          />
          <div className="audio-quality-option-body">
            <span className="audio-quality-option-name">Enhanced (FluidSynth + SoundFont)</span>
            <span className="audio-quality-option-desc">
              Real instrument samples — requires setup
            </span>
          </div>
        </label>
      </div>

      <button type="button" className="btn-setup-guide" onClick={() => setShowSetup(true)}>
        View Setup Guide
      </button>

      {/* Preset selectors — only shown in Enhanced mode */}
      {audioQuality === 'enhanced' && (
        <div className="preset-select-group animate-fade-in">
          <div className={`fluidsynth-status${fsReady ? ' ready' : ' not-ready'}`}>
            {checking ? (
              <span>Checking FluidSynth…</span>
            ) : fsReady ? (
              <span>✅ FluidSynth Ready</span>
            ) : (
              <>
                <span>❌ FluidSynth not configured</span>
                <button type="button" className="btn-link" onClick={() => setShowSetup(true)}>
                  View Setup Guide
                </button>
              </>
            )}
          </div>

          <label className="preset-select-label">Guitar Preset</label>
          <select
            className="preset-select"
            value={instrumentPresets.guitar}
            disabled={!fsReady}
            title={!fsReady ? 'Configure FluidSynth first' : undefined}
            onChange={(e) =>
              onInstrumentPresetsChange({
                ...instrumentPresets,
                guitar: parseInt(e.target.value, 10)
              })
            }
          >
            {GUITAR_PRESETS.map((p) => (
              <option key={p.program} value={p.program}>
                {p.label}
              </option>
            ))}
          </select>

          <label className="preset-select-label">Bass Preset</label>
          <select
            className="preset-select"
            value={instrumentPresets.bass}
            disabled={!fsReady}
            title={!fsReady ? 'Configure FluidSynth first' : undefined}
            onChange={(e) =>
              onInstrumentPresetsChange({
                ...instrumentPresets,
                bass: parseInt(e.target.value, 10)
              })
            }
          >
            {BASS_PRESETS.map((p) => (
              <option key={p.program} value={p.program}>
                {p.label}
              </option>
            ))}
          </select>

          <label className="preset-select-label">Drum Kit</label>
          <select
            className="preset-select"
            value={instrumentPresets.drumKit}
            disabled={!fsReady}
            title={!fsReady ? 'Configure FluidSynth first' : undefined}
            onChange={(e) =>
              onInstrumentPresetsChange({
                ...instrumentPresets,
                drumKit: parseInt(e.target.value, 10)
              })
            }
          >
            {DRUM_KITS.map((k) => (
              <option key={k.variation} value={k.variation}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showSetup && (
        <div className="setup-guide-overlay" onClick={() => setShowSetup(false)}>
          <div className="setup-guide" onClick={(e) => e.stopPropagation()}>
            <div className="setup-guide-header">
              <span className="setup-guide-title">Enhanced Audio Setup</span>
              <button
                type="button"
                className="setup-guide-close"
                onClick={() => setShowSetup(false)}
              >
                ✕
              </button>
            </div>

            <div className="setup-guide-body">
              <div className="setup-guide-step">
                <span className="setup-guide-step-title">Step 1 — Install FluidSynth</span>
                <ol className="setup-guide-list">
                  <li>
                    Download FluidSynth from <strong>fluidsynth.org</strong>
                  </li>
                  <li>
                    Place <code>fluidsynth.exe</code> at:
                    <br />
                    <code className="setup-guide-path">
                      resources/fluidsynth/win/fluidsynth.exe
                    </code>
                  </li>
                </ol>
              </div>

              <div className="setup-guide-step">
                <span className="setup-guide-step-title">Step 2 — Download a SoundFont</span>
                <ol className="setup-guide-list">
                  <li>
                    Download <strong>GeneralUser GS</strong> (free, CC license)
                  </li>
                  <li>
                    Place the <code>.sf2</code> file at:
                    <br />
                    <code className="setup-guide-path">
                      %APPDATA%\tab-to-backing-track\soundfonts\GeneralUser-GS.sf2
                    </code>
                  </li>
                </ol>
              </div>

              <div className="setup-guide-step">
                <span className="setup-guide-step-title">Step 3 — Verify</span>
                <p className="setup-guide-desc">
                  Click the button below to confirm both files are found before exporting.
                </p>
              </div>

              <div className="setup-guide-actions">
                <button
                  type="button"
                  className="btn-check-status"
                  disabled={checking}
                  onClick={() => void checkStatus()}
                >
                  {checking ? 'Checking…' : 'Check FluidSynth Status'}
                </button>

                {status && (
                  <div className="setup-status-results">
                    <div
                      className={`setup-status-row${status.fluidSynthFound ? ' status-ok' : ' status-fail'}`}
                    >
                      <span>{status.fluidSynthFound ? '✓' : '✗'} FluidSynth binary</span>
                      {!status.fluidSynthFound && (
                        <code className="setup-status-path">{status.fluidSynthPath}</code>
                      )}
                    </div>
                    <div
                      className={`setup-status-row${status.soundFontFound ? ' status-ok' : ' status-fail'}`}
                    >
                      <span>{status.soundFontFound ? '✓' : '✗'} SoundFont file</span>
                      {!status.soundFontFound && (
                        <code className="setup-status-path">{status.soundFontPath}</code>
                      )}
                    </div>
                    {status.fluidSynthFound && status.soundFontFound && (
                      <p className="setup-status-ready">Ready — select Enhanced mode to use it.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="setup-guide-step">
                <span className="setup-guide-step-title">Using Instrument Presets</span>
                <p className="setup-guide-desc">
                  Once Enhanced mode is configured, choose the sound preset for each instrument
                  before exporting:
                </p>
                <ul className="setup-guide-list">
                  <li>
                    <strong>Guitar Preset</strong> — Electric Guitar (clean) works best for NAM
                    reamping. Use Distortion Guitar only for a quick rough preview.
                  </li>
                  <li>
                    <strong>Bass Preset</strong> — Electric Bass (finger) gives a warm fingerstyle
                    tone. Electric Bass (pick) has a punchier attack.
                  </li>
                  <li>
                    <strong>Drum Kit</strong> — Standard Kit for rock and pop, Power Kit for heavy
                    music, Jazz Kit for jazz and brushwork, Electronic/TR-808 for electronic genres.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
