import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

const execFileAsync = promisify(execFile)

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
  await execFileAsync(fluidSynthPath, [
    '--quiet',
    '--no-shell',
    '--gain',
    '0.8',
    '--output-file',
    outputPath,
    '--fast-render',
    midiPath,
    soundFontPath
  ])
}
