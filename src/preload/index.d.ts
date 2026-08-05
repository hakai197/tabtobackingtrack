import { ElectronAPI } from '@electron-toolkit/preload'

export type ExportSessionPayload = {
  guitarDiWav: ArrayBuffer
  drumDiWav: ArrayBuffer
  bassDiWav: ArrayBuffer
  sessionTxt: string
}

export type ExportSessionResult = {
  canceled: boolean
  folder?: string
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      exportSession: (payload: ExportSessionPayload) => Promise<ExportSessionResult>
    }
  }
}
