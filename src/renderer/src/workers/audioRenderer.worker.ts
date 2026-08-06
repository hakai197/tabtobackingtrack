// Runs in a DedicatedWorkerGlobalScope.
// Computes note scheduling data (pitch → frequency, timing offsets) off the main thread
// so OfflineAudioContext scheduling stays on the main thread where the Web Audio API lives.

type WorkerNote = {
  pitch: number
  startTime: number
  duration: number
  velocity: number
}

export type ScheduledNote = {
  frequency: number
  start: number
  end: number
  releaseStart: number
  gainPeak: number
}

type WorkerInput = {
  notes: WorkerNote[]
  chunkOffset: number
  attackSec: number
  releaseSec: number
  noteGain: number
}

addEventListener('message', (event: Event): void => {
  const { notes, chunkOffset, attackSec, releaseSec, noteGain } = (
    event as MessageEvent<WorkerInput>
  ).data
  const minDuration = attackSec + releaseSec

  const schedule: ScheduledNote[] = notes.map((note) => {
    const frequency = 440 * Math.pow(2, (note.pitch - 69) / 12)
    const start = note.startTime - chunkOffset
    const duration = Math.max(note.duration, minDuration)
    const end = start + duration
    const releaseStart = Math.max(start + attackSec, end - releaseSec)
    const gainPeak = (note.velocity / 127) * noteGain
    return { frequency, start, end, releaseStart, gainPeak }
  })

  // In worker context, postMessage sends results to the parent thread.
  // Cast through unknown to avoid the DOM lib's Window.postMessage signature conflict.
  const send = postMessage as unknown as (data: ScheduledNote[]) => void
  send(schedule)
})
