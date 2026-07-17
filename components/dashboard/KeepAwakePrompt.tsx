import type { WakeState } from '@/lib/native/keepAwake'

/**
 * Screen-stays-on prompt — a real BUTTON, not a passive "tap anywhere" notice. The old banner relied on a
 * global one-shot pointerdown listener to acquire the lock; WebKit does NOT honour a bare pointerdown as a
 * user activation for `wakeLock.request` (it grants activation on the COMPLETED gesture — `click` — not the
 * pointer-DOWN that starts it), so that path failed on Safari while the header toggle (a real <button> →
 * `click`) succeeded on the very same tap. Fix: make this an actual <button> whose onClick runs the SAME
 * acquire path as the toggle (keepAwake via onAcquire), so it's granted the activation and succeeds.
 *
 * Shown ONLY when the operator wants the screen on but it ISN'T held — never when held (green toggle) or off.
 *   awaiting a tap / denied → a tappable "Keep screen on" button (its click acquires the lock)
 *   unsupported             → static notice "This device can't keep the screen on."
 *   insecure (dev only)     → static notice "The screen can't be kept on from this address."
 */
export function KeepAwakePrompt({ keepScreenOn, wakeState, onAcquire }: {
  keepScreenOn: boolean
  wakeState: WakeState
  onAcquire: () => void
}) {
  const held = wakeState === 'held' || wakeState === 'native'
  if (!keepScreenOn || held) return null

  // Not actionable — no gesture will help. Static, muted notice.
  if (wakeState === 'unsupported' || wakeState === 'insecure') {
    const text = wakeState === 'unsupported'
      ? "This device can't keep the screen on."
      : "The screen can't be kept on from this address."
    return (
      <div className="w-full bg-amber-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 shrink-0">
        <span aria-hidden>☀️</span><span>{text}</span>
      </div>
    )
  }

  // Actionable: 'off' (awaiting first tap) or 'denied' (previous attempt rejected — tap to retry). The click
  // IS the user activation, so acquiring happens right here.
  const retry = wakeState === 'denied'
  return (
    <button
      type="button"
      onClick={onAcquire}
      className={`w-full text-white text-xs font-semibold px-4 py-2.5 flex items-center justify-center gap-2 shrink-0 active:brightness-95 ${retry ? 'bg-amber-600' : 'bg-orange-500'}`}
    >
      <span aria-hidden>{retry ? '🔄' : '👆'}</span>
      <span>{retry ? 'Keep screen on — tap to try again' : 'Keep screen on'}</span>
    </button>
  )
}
