import { useState, type JSX } from 'react'

export type AudioQuality = 'standard' | 'enhanced'

export type FluidSynthStatus = {
  fluidSynthFound: boolean
  soundFontFound: boolean
  fluidSynthPath: string
  soundFontPath: string
}

type Props = {
  audioQuality: AudioQuality
  onAudioQualityChange: (q: AudioQuality) => void
  onCheckFluidSynth: () => Promise<FluidSynthStatus>
}

export function AudioQualityPanel({
  audioQuality,
  onAudioQualityChange,
  onCheckFluidSynth
}: Props): JSX.Element {
  const [showSetup, setShowSetup] = useState(false)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<FluidSynthStatus | null>(null)

  async function handleCheck(): Promise<void> {
    setChecking(true)
    try {
      const result = await onCheckFluidSynth()
      setStatus(result)
    } finally {
      setChecking(false)
    }
  }

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
            onChange={() => onAudioQualityChange('standard')}
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
            onChange={() => onAudioQualityChange('enhanced')}
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
                  onClick={handleCheck}
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
