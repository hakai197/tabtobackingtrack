import type { JSX } from 'react'
import type { InstrumentKey } from '../types'

type Props = {
  filename: string
  onSelect: (instrument: InstrumentKey) => void
  onCancel: () => void
}

// Modal dialog shown when a file is dropped globally but the instrument type
// cannot be determined from the filename or file contents.
export function InstrumentSelectDialog({ filename, onSelect, onCancel }: Props): JSX.Element {
  return (
    <div
      className="dialog-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Select instrument"
    >
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-title">Which instrument is this tab for?</p>
        <p className="dialog-filename">{filename}</p>
        <div className="dialog-buttons">
          <button type="button" className="dialog-btn" onClick={() => onSelect('guitar')}>
            🎸 Guitar
          </button>
          <button type="button" className="dialog-btn" onClick={() => onSelect('bass')}>
            🎵 Bass
          </button>
          <button type="button" className="dialog-btn" onClick={() => onSelect('drums')}>
            🥁 Drums
          </button>
        </div>
        <button type="button" className="btn-link dialog-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
