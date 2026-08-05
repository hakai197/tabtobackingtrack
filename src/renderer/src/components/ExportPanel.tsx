import type { JSX } from 'react'
import type { DrumStyle } from '../utils/drumDiGenerator'
import type { BassStyle } from '../utils/bassDiGenerator'
import type { InstrumentSlot, ExportMode } from '../types'
import {
  AudioQualityPanel,
  type AudioQuality,
  type FluidSynthStatus,
  type InstrumentPresets
} from './AudioQualityPanel'

const DRUM_STYLES: { value: DrumStyle; label: string }[] = [
  { value: 'rock', label: 'Rock' },
  { value: 'shuffle', label: 'Shuffle' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'pop', label: 'Pop' }
]

const BASS_STYLES: { value: BassStyle; label: string }[] = [
  { value: 'root', label: 'Root' },
  { value: 'root-fifth', label: 'Root-Fifth' },
  { value: 'walking', label: 'Walking' }
]

type Props = {
  guitar: InstrumentSlot
  bass: InstrumentSlot
  drums: InstrumentSlot
  exportGuitar: boolean
  exportBass: boolean
  exportDrums: boolean
  onExportGuitarChange: (v: boolean) => void
  onExportBassChange: (v: boolean) => void
  onExportDrumsChange: (v: boolean) => void
  exportMode: ExportMode
  onExportModeChange: (m: ExportMode) => void
  drumStyle: DrumStyle
  onDrumStyleChange: (s: DrumStyle) => void
  bassStyle: BassStyle
  onBassStyleChange: (s: BassStyle) => void
  audioQuality: AudioQuality
  onAudioQualityChange: (q: AudioQuality) => void
  onCheckFluidSynth: () => Promise<FluidSynthStatus>
  instrumentPresets: InstrumentPresets
  onInstrumentPresetsChange: (presets: InstrumentPresets) => void
  onExport: () => void
  isGenerating: boolean
  generateError: string | null
  exportFolder: string | null
}

export function ExportPanel({
  guitar,
  bass,
  drums,
  exportGuitar,
  exportBass,
  exportDrums,
  onExportGuitarChange,
  onExportBassChange,
  onExportDrumsChange,
  exportMode,
  onExportModeChange,
  drumStyle,
  onDrumStyleChange,
  bassStyle,
  onBassStyleChange,
  audioQuality,
  onAudioQualityChange,
  onCheckFluidSynth,
  instrumentPresets,
  onInstrumentPresetsChange,
  onExport,
  isGenerating,
  generateError,
  exportFolder
}: Props): JSX.Element {
  const anyChecked = exportGuitar || exportBass || exportDrums

  const checkedNames: string[] = []
  if (exportGuitar) checkedNames.push('Guitar')
  if (exportBass) checkedNames.push('Bass')
  if (exportDrums) checkedNames.push('Drums')

  let exportLabel: string
  if (checkedNames.length === 0) exportLabel = 'Export'
  else if (checkedNames.length === 3) exportLabel = 'Export All Tracks'
  else exportLabel = `Export ${checkedNames.join(' + ')}`

  // Guitar is always WAV (it's a DI signal by definition).
  const bassFilename = exportMode === 'wav' ? 'bass_di.wav' : 'bass_track.mid'
  const drumFilename = exportMode === 'wav' ? 'drum_track.wav' : 'drum_track.mid'

  return (
    <section className="panel panel-export">
      <h2 className="panel-title">Export</h2>

      <div className="export-layout">
        {/* Left: audio quality + format radio + track checkboxes */}
        <div className="export-left">
          <AudioQualityPanel
            audioQuality={audioQuality}
            onAudioQualityChange={onAudioQualityChange}
            onCheckFluidSynth={onCheckFluidSynth}
            instrumentPresets={instrumentPresets}
            onInstrumentPresetsChange={onInstrumentPresetsChange}
          />

          <div className="export-format-row">
            <span className="export-format-label">Format</span>
            <label className="export-format-option">
              <input
                type="radio"
                name="exportMode"
                value="wav"
                checked={exportMode === 'wav'}
                onChange={() => onExportModeChange('wav')}
              />
              WAV (DI)
            </label>
            <label className="export-format-option">
              <input
                type="radio"
                name="exportMode"
                value="midi"
                checked={exportMode === 'midi'}
                onChange={() => onExportModeChange('midi')}
              />
              MIDI
            </label>
          </div>

          <div className="export-track-list">
            <div className="export-track-row">
              <label className={`export-track-label${!guitar.loaded ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={exportGuitar}
                  disabled={!guitar.loaded}
                  onChange={(e) => onExportGuitarChange(e.target.checked)}
                />
                <span className="export-track-name">Guitar DI</span>
                <span className="export-track-filename">guitar_di.wav</span>
              </label>
              <span className={`export-track-status${guitar.loaded ? ' loaded' : ''}`}>
                {guitar.loaded ? '✓ loaded' : 'empty'}
              </span>
            </div>

            <div className="export-track-row">
              <label className={`export-track-label${!bass.loaded ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={exportBass}
                  disabled={!bass.loaded}
                  onChange={(e) => onExportBassChange(e.target.checked)}
                />
                <span className="export-track-name">Bass DI</span>
                <span className="export-track-filename">{bassFilename}</span>
              </label>
              <span className={`export-track-status${bass.loaded ? ' loaded' : ''}`}>
                {bass.loaded ? '✓ loaded' : 'empty'}
              </span>
            </div>

            <div className="export-track-row">
              <label className={`export-track-label${!drums.loaded ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={exportDrums}
                  disabled={!drums.loaded}
                  onChange={(e) => onExportDrumsChange(e.target.checked)}
                />
                <span className="export-track-name">Drums</span>
                <span className="export-track-filename">{drumFilename}</span>
              </label>
              <span className={`export-track-status${drums.loaded ? ' loaded' : ''}`}>
                {drums.loaded ? '✓ loaded' : 'empty'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: style selectors + export button */}
        <div className="export-right">
          <div className="groove-row">
            <span className="groove-label">Groove</span>
            <div className="input-mode-tabs">
              {DRUM_STYLES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`input-mode-tab${drumStyle === value ? ' active' : ''}`}
                  onClick={() => onDrumStyleChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="groove-row">
            <span className="groove-label">Bass</span>
            <div className="input-mode-tabs">
              {BASS_STYLES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`input-mode-tab${bassStyle === value ? ' active' : ''}`}
                  onClick={() => onBassStyleChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="export-row">
            <button
              type="button"
              className={`btn-export${isGenerating ? ' btn-export--generating' : ''}`}
              disabled={!anyChecked || isGenerating}
              onClick={onExport}
            >
              {isGenerating ? 'Generating…' : `🎵 ${exportLabel}`}
            </button>
          </div>

          {generateError && <p className="export-error">{generateError}</p>}
          {exportFolder && !generateError && (
            <p className="export-success">Exported to {exportFolder}</p>
          )}
        </div>
      </div>
    </section>
  )
}
