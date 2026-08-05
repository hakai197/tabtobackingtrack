import { useState, useEffect, type JSX } from 'react'

type UpdateState = 'idle' | 'available' | 'downloading' | 'downloaded'

export function UpdateNotification(): JSX.Element | null {
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const cleanup1 = window.api.onUpdateAvailable((info) => {
      setVersion(info.version)
      setUpdateState('available')
    })
    const cleanup2 = window.api.onDownloadProgress((data) => {
      setPercent(data.percent)
      setUpdateState('downloading')
    })
    const cleanup3 = window.api.onUpdateDownloaded(() => {
      setUpdateState('downloaded')
    })
    return () => {
      cleanup1()
      cleanup2()
      cleanup3()
    }
  }, [])

  if (dismissed || updateState === 'idle') return null

  return (
    <div className="update-banner">
      {updateState === 'available' && (
        <div className="update-banner-content">
          <span className="update-banner-text">🔔 Version {version} is available</span>
          <div className="update-banner-actions">
            <button
              type="button"
              className="btn-update-primary"
              onClick={() => {
                void window.api.startUpdateDownload()
              }}
            >
              Download Update
            </button>
            <button
              type="button"
              className="btn-update-secondary"
              onClick={() => setDismissed(true)}
            >
              Remind Me Later
            </button>
          </div>
        </div>
      )}

      {updateState === 'downloading' && (
        <div className="update-banner-content">
          <span className="update-banner-text">⬇ Downloading update... {percent}%</span>
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {updateState === 'downloaded' && (
        <div className="update-banner-content">
          <span className="update-banner-text">✓ Update ready — restart to install v{version}</span>
          <div className="update-banner-actions">
            <button
              type="button"
              className="btn-update-primary"
              onClick={() => {
                void window.api.installUpdate()
              }}
            >
              Restart Now
            </button>
            <button
              type="button"
              className="btn-update-secondary"
              onClick={() => setDismissed(true)}
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
