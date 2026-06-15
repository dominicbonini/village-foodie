// lib/audio.ts
// Shared Web Audio for operator alert dings (new-order sound on dashboard + KDS).
//
// WHY A SINGLETON + UNLOCK: browsers start an AudioContext SUSPENDED and only allow it to make sound
// after resume() runs in/after a real user gesture (autoplay policy). The old code created a FRESH
// `new AudioContext()` inside non-gesture callbacks (a realtime/effect handler) every ding → each one
// was suspended and silently blocked (which is why no sound was ever heard). Here we keep ONE persistent
// context, prime (resume) it on the first user interaction (and on the Sound-toggle "enable" tap), and
// reuse it for every ding. No audio file needed — the ding is a synthesized oscillator.

let ctx: AudioContext | null = null
let unlockInstalled = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  return ctx
}

/** Resume the shared context — MUST be called from a user gesture (first tap / enabling the Sound toggle)
 *  for later programmatic dings to be audible. Safe to call repeatedly; no-op when already running. */
export function primeAudio(): void {
  const c = getCtx()
  if (c && c.state === 'suspended') { c.resume().catch(() => {}) }
}

/** Install one-time global gesture listeners that prime the audio on the first user interaction.
 *  Idempotent — call once per surface (dashboard / KDS) on mount. */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true
  const unlock = () => { primeAudio() }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  window.addEventListener('touchend', unlock, { once: true })
}

/** Play a short alert ding via the primed shared context. No-op if audio is unavailable or still
 *  blocked (no gesture yet). Defends by resuming first (works once the context has been unlocked). */
export function playDing(freq = 880, durationSecs = 0.6, gain = 0.3): void {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') { c.resume().catch(() => {}) }
  try {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g); g.connect(c.destination)
    osc.frequency.value = freq
    g.gain.setValueAtTime(gain, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + durationSecs)
    osc.start(c.currentTime); osc.stop(c.currentTime + durationSecs)
  } catch { /* context closed / blocked — silent */ }
}
