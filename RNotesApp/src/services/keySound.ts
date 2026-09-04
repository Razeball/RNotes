const KEY_SOUND_SAMPLES = ['/keys/key1.mp3', '/keys/key2.mp3', '/keys/key3.mp3', '/keys/key4.mp3', '/keys/key5.mp3']
const MIN_TIME_BETWEEN_KEY_CLICKS_MS = 25
const MAX_CONCURRENT_KEY_CLICK_VOCES = 6
const KEY_CLICK_VOICE_LIFETIME_MS = 300

let audioContextInstance: AudioContext | null = null
let decodedSoundBuffers: AudioBuffer[] = []
let isPreloadingSoundsInProgress: Promise<void> | null = null
let lastKeyClickTimestamp = 0
let lastSelectedSampleIndex = -1
let activeClickVoicesTimestamps: number[] = []

function ensureAudioContextInitialized(): AudioContext | null {
  if (audioContextInstance) return audioContextInstance
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  audioContextInstance = new Ctor()
  return audioContextInstance
}

export function loadKeySoundSamples(): Promise<void> {
  if (isPreloadingSoundsInProgress) return isPreloadingSoundsInProgress

  const ctx = ensureAudioContextInitialized()
  if (!ctx) return Promise.resolve()

  isPreloadingSoundsInProgress = Promise.all(
    KEY_SOUND_SAMPLES.map(async (url) => {
      const response = await fetch(url)
      return ctx.decodeAudioData(await response.arrayBuffer())
    })
  )
    .then((decodedBuffers) => {
      decodedSoundBuffers = decodedBuffers
    })
    .catch(() => {
      decodedSoundBuffers = []
    })

  return isPreloadingSoundsInProgress
}

function selectRandomAudioBuffer(): AudioBuffer | null {
  if (decodedSoundBuffers.length === 0) return null
  if (decodedSoundBuffers.length === 1) return decodedSoundBuffers[0]

  let selectedIndex = Math.floor(Math.random() * decodedSoundBuffers.length)
  if (selectedIndex === lastSelectedSampleIndex) selectedIndex = (selectedIndex + 1) % decodedSoundBuffers.length
  lastSelectedSampleIndex = selectedIndex
  return decodedSoundBuffers[selectedIndex]
}

export function triggerMechanicalKeyClick(): void {
  const ctx = ensureAudioContextInitialized()
  if (!ctx) return

  const currentTime = performance.now()
  if (currentTime - lastKeyClickTimestamp < MIN_TIME_BETWEEN_KEY_CLICKS_MS) return

  activeClickVoicesTimestamps = activeClickVoicesTimestamps.filter((startedAt) => currentTime - startedAt < KEY_CLICK_VOICE_LIFETIME_MS)
  if (activeClickVoicesTimestamps.length >= MAX_CONCURRENT_KEY_CLICK_VOCES) return

  const audioBuffer = selectRandomAudioBuffer()
  if (!audioBuffer) {
    void loadKeySoundSamples()
    return
  }

  if (ctx.state === 'suspended') void ctx.resume()

  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  source.playbackRate.value = 0.94 + Math.random() * 0.12

  const gainNode = ctx.createGain()
  gainNode.gain.value = 0.5 + Math.random() * 0.15

  source.connect(gainNode).connect(ctx.destination)
  source.start()

  lastKeyClickTimestamp = currentTime
  activeClickVoicesTimestamps.push(currentTime)
}

export function shouldBeSoundedKey(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete'
}