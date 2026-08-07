import { spawn } from 'child_process'
import path from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

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
    '-a',
    'null',
    '-m',
    'null',
    '-r',
    '44100',
    '--gain',
    '0.8',
    '--fast-render',
    outputPath,
    soundFontPath,
    midiPath
  ]

  console.log('FluidSynth spawning:', fluidSynthPath)
  console.log('MIDI path:', midiPath)
  console.log('Output path:', outputPath)

  return new Promise((resolve, reject) => {
    const start = Date.now()
    const child = spawn(fluidSynthPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    let stderrOutput = ''

    child.stdout?.on('data', (data: Buffer) => {
      console.log('FluidSynth stdout:', data.toString().trim())
    })

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      stderrOutput += text
      console.log('FluidSynth stderr:', text.trim())
    })

    const timer = setTimeout(() => {
      console.error('FluidSynth timed out after 120s, sending SIGTERM')
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2000)
      reject(new Error('FluidSynth render timed out. Try Standard mode for large files.'))
    }, 120_000)

    child.on('close', (code) => {
      clearTimeout(timer)
      console.log(`FluidSynth render took: ${Date.now() - start}ms, exit code: ${code}`)
      if (code === 0) {
        resolve()
      } else {
        console.error('FluidSynth stderr output:', stderrOutput)
        reject(new Error(`FluidSynth failed (exit ${code}): ${stderrOutput || 'no output'}`))
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      console.error('FluidSynth spawn error:', err)
      reject(new Error(`FluidSynth spawn failed: ${err.message}`))
    })
  })
}
