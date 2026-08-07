import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  exportSession: (payload: unknown) => ipcRenderer.invoke('export-session', payload),
  checkFluidSynth: () => ipcRenderer.invoke('check-fluidsynth'),
  pickExportFolder: () => ipcRenderer.invoke('pick-export-folder'),
  renderInstrumentWavEnhanced: (params: unknown) =>
    ipcRenderer.invoke('render-instrument-wav-enhanced', params),
  writeTextFile: (params: unknown) => ipcRenderer.invoke('write-text-file', params),
  writeBinaryFile: (params: unknown) => ipcRenderer.invoke('write-binary-file', params),

  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes?: string }) => void
  ): (() => void) => {
    const fn = (_: IpcRendererEvent, info: { version: string; releaseNotes?: string }): void =>
      callback(info)
    ipcRenderer.on('update-available', fn)
    return () => ipcRenderer.removeListener('update-available', fn)
  },

  onDownloadProgress: (callback: (data: { percent: number }) => void): (() => void) => {
    const fn = (_: IpcRendererEvent, data: { percent: number }): void => callback(data)
    ipcRenderer.on('update-download-progress', fn)
    return () => ipcRenderer.removeListener('update-download-progress', fn)
  },

  onUpdateDownloaded: (callback: () => void): (() => void) => {
    const fn: Parameters<typeof ipcRenderer.on>[1] = () => callback()
    ipcRenderer.on('update-downloaded', fn)
    return () => ipcRenderer.removeListener('update-downloaded', fn)
  },

  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkForUpdatesManual: () => ipcRenderer.invoke('check-for-updates-manual')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
