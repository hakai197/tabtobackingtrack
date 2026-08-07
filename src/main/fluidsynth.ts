import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

const execFileAsync = promisify(execFile)

const FLUIDSYNTH_TIMEOUT_MS = 60_000

export type FluidSynthStatus = {
  fluidSynthFound: boolean
  soundFontFound: boolean
  fluidSynthPath: string
  soundFontPath: string
}

export function getFluidSynthPath(): string {
  if (is.dev) {
    return path.join(process.cwd(), 'resources', 'fluidsynth', 'win', 'fluidsynth.exe')
  }
  return path.join(process.resourcesPath, 'fluidsynth', 'fluidsynth.exe')
}

export function getSoundFontPath(): string {
  return path.join(app.getPath('userData'), 'soundfonts', 'GeneralUser-GS.sf2')
}

export function checkFluidSynth(): FluidSynthStatus {
  const fluidSynthPath = getFluidSynthPath()
  const soundFontPath = getSoundFontPath()
  return {
    fluidSynthFound: existsSync(fluidSynthPath),
    soundFontFound: existsSync(soundFontPath),
    fluidSynthPath,
    soundFontPath
  }
}

export async function renderMidiToWav(midiPath: string, outputPath: string): Promise<void> {
  const fluidSynthPath = getFluidSynthPath()
  const soundFontPath = getSoundFontPath()
  const args = [
    '--quiet',
    '--no-shell',
    '--gain',
    '0.8',
    '--output-file',
    outputPath,
    '--fast-render',
    midiPath,
    soundFontPath
  ]
  const opts = { timeout: FLUIDSYNTH_TIMEOUT_MS, killSignal: 'SIGTERM' as const }
  try {
    if (process.env.NODE_ENV === 'development') {
      const start = Date.now()
      await execFileAsync(fluidSynthPath, args, opts)
      console.log(`FluidSynth render took: ${Date.now() - start}ms`)
    } else {
      await execFileAsync(fluidSynthPath, args, opts)
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { killed?: boolean }
    if (e.killed) {
      throw new Error(
        'FluidSynth render timed out after 60 seconds. Try a shorter section or use Standard mode.'
      )
    }
    throw err
  }
}
