import type { WakeState } from '@/lib/native/keepAwake'

/**
 * Screen-stays-on prompt/notice — the last piece of the wake-lock fix. Gesture-based acquisition means an
 * operator who loads the screen and doesn't tap has the pref ON but no lock held → the screen would sleep.
 * This tells them exactly what to do; the SAME tap that reads/dismisses it also acquires the lock (any
 * pointerdown fires the global gesture-acquire), so it's self-fulfilling and vanishes the instant they act.
 *
 * Shown ONLY when the operator wants the screen on but it ISN'T held — never when held (green toggle) or off.
 * Copy is plain operator English (no "wake lock" / "https" / "secure context" / "not held"):
 *   awaiting a tap → "Tap anywhere to keep the screen on"          (orange, an action)
 *   denied         → "Couldn't keep the screen on. Tap the screen and try again."
 *   unsupported    → "This device can't keep the screen on."
 *   insecure (dev) → "The screen can't be kept on from this address."   (operators never see this)
 */
export function KeepAwakePrompt({ keepScreenOn, wakeState }: { keepScreenOn: boolean; wakeState: WakeState }) {
  const held = wakeState === 'held' || wakeState === 'native'
  if (!keepScreenOn || held) return null
  const awaiting = wakeState === 'off'   // armed, waiting for the first user gesture to acquire
  const text = awaiting ? 'Tap anywhere to keep the screen on'
    : wakeState === 'unsupported' ? "This device can't keep the screen on."
    : wakeState === 'insecure' ? "The screen can't be kept on from this address."
    : 'Couldn’t keep the screen on. Tap the screen and try again.'
  return (
    <div className={`w-full text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 shrink-0 ${awaiting ? 'bg-orange-500' : 'bg-amber-600'}`}>
      <span aria-hidden>{awaiting ? '👆' : '☀️'}</span>
      <span>{text}</span>
    </div>
  )
}
