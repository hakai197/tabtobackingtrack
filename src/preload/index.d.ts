import { ElectronAPI } from '@electron-toolkit/preload'

export type ExportFile = {
  filename: string
  data: ArrayBuffer | string
}

export type ExportSessionPayload = {
  files: ExportFile[]
}

export type ExportSessionResult = {
  canceled: boolean
  folder?: string
  error?: string
}

export type FluidSynthStatus = {
  fluidSynthFound: boolean
  soundFontFound: boolean
  fluidSynthPath: string
  soundFontPath: string
}

export type PickExportFolderResult = {
  canceled: boolean
  folder?: string
}

export type EnhancedRenderParams = {
  notes: { pitch: number; startTime: number; duration: number; velocity: number }[]
  instrument: 'guitar' | 'bass' | 'drums'
  bpm: number
  timeSignature: { numerator: number; denominator: number }
  folder: string
  filename: string
  gmProgram?: number
  drumKitVariation?: number
}

export type EnhancedRenderResult = {
  success: boolean
  error?: string
}

export type WriteTextFileResult = {
  success: boolean
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      exportSession: (payload: ExportSessionPayload) => Promise<ExportSessionResult>
      checkFluidSynth: () => Promise<FluidSynthStatus>
      pickExportFolder: () => Promise<PickExportFolderResult>
      renderInstrumentWavEnhanced: (params: EnhancedRenderParams) => Promise<EnhancedRenderResult>
      writeTextFile: (params: {
        folder: string
        filename: string
        content: string
      }) => Promise<WriteTextFileResult>
      onUpdateAvailable: (
        callback: (info: { version: string; releaseNotes?: string }) => void
      ) => () => void
      onDownloadProgress: (callback: (data: { percent: number }) => void) => () => void
      onUpdateDownloaded: (callback: () => void) => () => void
      startUpdateDownload: () => Promise<void>
      installUpdate: () => Promise<void>
      checkForUpdatesManual: () => Promise<void>
    }
  }
}
