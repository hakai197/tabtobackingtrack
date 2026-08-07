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

  // Argument order is critical for FluidSynth:
  // Options first, then SF2 file, then MIDI file.
  // -a null and -m null prevent audio/MIDI driver
  // initialization which causes hanging on Windows.
  const args = [
    '--quiet',
    '--no-shell',
    '-a', 'null',
    '-m', 'null',
    '-r', '44100',
    '--gain', '0.8',
    '--fast-render', outputPath,
    soundFontPath,   // SF2 must come before MIDI
    midiPath         // MIDI file always last
  ]

  const opts = {
    timeout: 120_000,
    killSignal: 'SIGTERM' as const
  }

  try {
    const start = Date.now()
    const { stderr } = await execFileAsync(fluidSynthPath, args, opts)
    console.log(`FluidSynth render took: ${Date.now() - start}ms`)
    if (stderr) console.log('FluidSynth stderr:', stderr)
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      killed?: boolean
      stderr?: string
      stdout?: string
    }
    console.error('FluidSynth failed')
    console.error('FluidSynth error message:', e.message)
    console.error('FluidSynth stderr:', e.stderr)
    console.error('FluidSynth stdout:', e.stdout)
    console.error('Args used:', args)
    console.error('FluidSynth path:', fluidSynthPath)
    console.error('SoundFont path:', soundFontPath)
    console.error('MIDI path:', midiPath)
    console.error('Output path:', outputPath)

    if (e.killed) {
      throw new Error(
        'FluidSynth render timed out. Try Standard mode for large files.'
      )
    }
    throw new Error(
      `FluidSynth failed: ${e.stderr || e.message}`
    )
  }
}
