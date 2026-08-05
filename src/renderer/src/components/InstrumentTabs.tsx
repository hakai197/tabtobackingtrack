import type { JSX } from 'react'
import type { InstrumentKey, InstrumentSlot } from '../types'

const LABELS: Record<InstrumentKey, { label: string; emoji: string }> = {
  guitar: { label: 'Guitar', emoji: '🎸' },
  bass: { label: 'Bass', emoji: '🎵' },
  drums: { label: 'Drums', emoji: '🥁' }
}

type Props = {
  guitar: InstrumentSlot
  bass: InstrumentSlot
  drums: InstrumentSlot
  activeTab: InstrumentKey
  onTabChange: (tab: InstrumentKey) => void
}

// Renders the instrument tab strip for the Analysis panel.
// Only rendered when two or more instrument slots are loaded.
export function InstrumentTabs({
  guitar,
  bass,
  drums,
  activeTab,
  onTabChange
}: Props): JSX.Element | null {
  const loaded: InstrumentKey[] = []
  if (guitar.loaded) loaded.push('guitar')
  if (bass.loaded) loaded.push('bass')
  if (drums.loaded) loaded.push('drums')

  if (loaded.length <= 1) return null

  return (
    <div className="instrument-tabs">
      {loaded.map((key) => (
        <button
          key={key}
          type="button"
          className={`instrument-tab${activeTab === key ? ' active' : ''}`}
          onClick={() => onTabChange(key)}
        >
          {LABELS[key].emoji} {LABELS[key].label}
        </button>
      ))}
    </div>
  )
}
