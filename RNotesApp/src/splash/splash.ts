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
const CREDIT_TEXT = 'Powered by RzCorp'

const TYPE_DURATION_FROM = 0.69767
const TYPE_DURATION_TO = 0.93023

const CREDIT_CENTRE_PX = 136.5

/**
 * Type one letter at a time
 */
function typeAppCredit(): void {
  const credit = document.getElementById('credit')
  if (!credit) return

  credit.textContent = CREDIT_TEXT
  credit.style.left = `${CREDIT_CENTRE_PX - credit.offsetWidth / 2}px`
  credit.textContent = ''

  const animation = credit.getAnimations()[0]
  if (!animation) {
    credit.textContent = CREDIT_TEXT
    return
  }

  const total = Number(animation.effect?.getComputedTiming().duration ?? 0)
  if (!total) {
    credit.textContent = CREDIT_TEXT
    return
  }

  let shown = -1

  const step = () => {
    const timeElapsed = Number(animation.currentTime ?? 0) / total
    const progress = (timeElapsed - TYPE_DURATION_FROM) / (TYPE_DURATION_TO - TYPE_DURATION_FROM)
    // The first letter is already there when typing starts, hence the 1 plus the rest.
    const letters = Math.max(0, Math.min(CREDIT_TEXT.length, 1 + Math.floor(progress * (CREDIT_TEXT.length - 1))))

    if (letters !== shown) {
      shown = letters
      credit.textContent = CREDIT_TEXT.slice(0, letters)
    }

    if (letters < CREDIT_TEXT.length) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}

async function start(): Promise<void> {
  typeAppCredit()

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
