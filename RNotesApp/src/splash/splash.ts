import { invoke } from '@tauri-apps/api/core'

/**
 * This splash window only run the animation and sound and then hand over to the main window when the 
 * app say it's ready
 */

/** Animation minimum time  */
const MINIMUM_ANIMATION_TIME_MS = 3000

const FADE_SOUND_MS = 400

const READY_POLL_MS = 100

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait for editor report
 */
async function waitForAppNotification(): Promise<void> {
  for (;;) {
    try {
      if (await invoke<boolean>('is_main_window_ready')) return
    } catch {
      // Nothing happens
      return
    }
    await wait(READY_POLL_MS)
  }
}

function playIntroSound(): HTMLAudioElement | null {
  try {
    const audio = new Audio('/IntroSound.mp3')
    audio.volume = 1
    void audio.play().catch(() => {})
    return audio
  } catch {
    return null
  }
}

/** Lovwer the volume down instead of cutting it. */
function startFadeOut(audio: HTMLAudioElement | null): void {
  if (!audio) return

  const startedAt = performance.now()
  const from = audio.volume

  const step = () => {
    const audioProgress = Math.min(1, (performance.now() - startedAt) / FADE_SOUND_MS)
    audio.volume = from * (1 - audioProgress)
    if (audioProgress < 1) {
      requestAnimationFrame(step)
      return
    }
    audio.pause()
  }

  requestAnimationFrame(step)
}

async function start(): Promise<void> {
  const audio = playIntroSound()

  await Promise.all([wait(MINIMUM_ANIMATION_TIME_MS), waitForAppNotification()])

  startFadeOut(audio)
  document.body.classList.add('sp-leaving')
  await wait(FADE_SOUND_MS)

  try {
    await invoke('close_splash_window')
  } catch {
    // Nothing happens
  }
}

void start()
