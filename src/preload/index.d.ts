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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      exportSession: (payload: ExportSessionPayload) => Promise<ExportSessionResult>
    }
  }
}
