import { Capacitor } from '@capacitor/core'

// Module-level web lock — single instance per tab
let webLock: any = null
let keepAwakeEnabled = false      // tracks intent, survives auto-releases
let listenersAdded = false

// ── TRUE state, not intent ────────────────────────────────────────────────────
// The toggle used to show "on" whenever it was ASKED for — but the request can be DENIED (Safari rejects
// `wakeLock.request` with NotAllowedError unless the document is visible AND focused). A toggle that says
// "Screen on" while the lock was denied is a lie that auto-pauses an event mid-service. So we publish the
// ACTUAL state and let the UI reflect it. States: held (lock acquired) · denied (requested, rejected —
// recoverable on focus) · unsupported (no API) · native (Capacitor plugin holds it) · off (intent off).
// ── 🔴 'unknown' — ADDED 5 August 2026. READ THIS BEFORE COLLAPSING IT INTO 'off'. ─────────────────
// 'off' used to be published when a RELEASE FAILED, on the reasoning that "our intent is off" and that a
// stuck-on screen is self-correcting because the flag is window-scoped. That reasoning is Android's
// (FLAG_KEEP_SCREEN_ON dies with its Window) and is FALSE on iOS, where the plugin sets
// UIApplication.shared.isIdleTimerDisabled — a PROCESS-WIDE property that survives backgrounding, view
// teardown and route changes, and clears only on an explicit `false` or process death.
// So a failed release left the screen on FOREVER while the UI said "off" — and because the toggle used to
// branch on this value, every subsequent tap took the ENABLE branch. The operator could not turn it off.
// 'unknown' means: WE DO NOT KNOW WHAT THE OS IS DOING. It must never be treated as off.
export type WakeState = 'held' | 'denied' | 'unsupported' | 'insecure' | 'native' | 'off' | 'unknown'
let wakeState: WakeState = 'off'
const wakeListeners = new Set<(s: WakeState) => void>()
function setWakeState(s: WakeState) {
  if (s === wakeState) return
  wakeState = s
  wakeListeners.forEach(f => { try { f(s) } catch { /* listener threw — ignore */ } })
}
export function getWakeState(): WakeState { return wakeState }
/** Subscribe to the ACTUAL keep-awake state (held vs denied vs unsupported). Fires immediately with the
 *  current value; returns an unsubscribe. The UI uses this so "Screen on" only shows when the lock is HELD. */
export function subscribeWakeState(cb: (s: WakeState) => void): () => void {
  wakeListeners.add(cb)
  cb(wakeState)
  return () => { wakeListeners.delete(cb) }
}

// NB: wrap the plugin in a plain object — do NOT resolve this promise to the bare KeepAwake proxy. A
// Capacitor plugin proxy returns a function for ANY property access (including `.then`), so it looks like a
// thenable; when an async function resolves to it, the Promise machinery calls `.then(resolve, reject)` to
// assimilate it → native invoke of a non-existent `then` method → "KeepAwake.then() is not implemented on
// ios". Returning `{ KeepAwake }` (a plain, non-thenable object) sidesteps the assimilation entirely.
async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  const { KeepAwake } = await import('@capacitor-community/keep-awake')
  return { KeepAwake }
}

// The Wake Lock API is SECURE-CONTEXT-ONLY: over http://<LAN-IP> the property is simply absent — a CONNECTION
// problem (https fixes it), NOT a browser one (a dev iPad can't use `localhost`, so it hits the Mac's LAN IP).
// Distinguish so the UI says "needs https" there instead of the misleading "unavailable".
function unsupportedOrInsecure(): WakeState {
  return (typeof window !== 'undefined' && window.isSecureContext === false) ? 'insecure' : 'unsupported'
}

async function requestWebLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) { setWakeState(unsupportedOrInsecure()); return }
  if (webLock) { setWakeState('held'); return }
  // The API rejects unless the document is VISIBLE (Safari also requires FOCUS). Firing while hidden is a
  // guaranteed NotAllowedError → don't; mark denied and let the visibility/focus listener retry.
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') { setWakeState('denied'); return }
  try {
    webLock = await (navigator as any).wakeLock.request('screen')
    setWakeState('held')
    webLock.addEventListener('release', () => {
      webLock = null
      // Browser released the lock (page hidden, screen dimmed, focus lost). Reflect NOT-held; re-acquire
      // immediately if the intent is still on and the page is visible (the focus listener covers the rest).
      if (keepAwakeEnabled) {
        setWakeState('denied')
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') requestWebLock()
      } else {
        setWakeState('off')
      }
    })
  } catch (err) {
    // e.g. Safari NotAllowedError when the document isn't focused (DevTools focused / opened unfocused).
    // RECOVERABLE — the focus listener re-requests when the page regains focus.
    console.warn('[KeepAwake] wakeLock.request denied:', err)
    setWakeState('denied')
  }
}

function ensureListeners(): void {
  if (listenersAdded || typeof document === 'undefined') return
  listenersAdded = true
  const retry = () => { if (keepAwakeEnabled && !webLock && document.visibilityState === 'visible') requestWebLock() }
  document.addEventListener('visibilitychange', retry)
  // Safari denies the lock when the document isn't FOCUSED, and `visibilitychange` does NOT fire on a
  // focus/blur change (only on tab hide/show) — so clicking BACK into the page (from DevTools / another
  // window) wouldn't recover it. Retry on window focus so a denial self-heals on the natural next gesture.
  if (typeof window !== 'undefined') window.addEventListener('focus', retry)
}

// ══ NATIVE: REALITY WINS OVER BELIEF ════════════════════════════════════════════════════════════════
// Everything below exists because iOS's idle-timer flag is PROCESS-WIDE (see the 'unknown' note above).
// Two consequences drive the whole design:
//   1. Nothing in the OS ever releases it for us, so WE must release it. 🔴 ON INTENT, NOT ON LIFECYCLE:
//      when the SETTING goes off, and when the app is BACKGROUNDED. NOT on component unmount or route
//      change — that is the operator stepping between screens mid-service, and releasing there strands
//      them on a slept screen (and on web cannot be undone without a tap). The listener below is
//      module-level precisely so backgrounding is caught on EVERY route, including ones with no
//      keep-awake code of their own, such as /manage.
//   2. Our belief about it can drift from the truth, so we must ASK rather than infer. The plugin exposes
//      isKeptAwake(); it was never called. Every acquire, release, mount and foreground now reconciles.
//
// `nativeIntent` is the SETTING (does the operator want the screen kept on), kept separately from
// `wakeState` (what the OS is actually doing). They are different questions and they are allowed to
// disagree — that disagreement is exactly what this module now detects instead of hiding.
let nativeIntent = false
let nativeListenersAdded = false

/** Ask the PLUGIN what the OS is actually doing and publish that. Reality wins; never infer. */
export async function reconcileWakeState(): Promise<WakeState> {
  if (!Capacitor.isNativePlatform()) return wakeState
  try {
    const plugin = await getPlugin()
    if (!plugin) return wakeState
    const { isKeptAwake } = await plugin.KeepAwake.isKeptAwake()
    setWakeState(isKeptAwake ? 'native' : 'off')
    return wakeState
  } catch (err) {
    // We asked and could not find out. That is 'unknown', NOT 'off' — see the type note above.
    console.error('[KeepAwake] 🔴 isKeptAwake() failed — actual screen state is UNKNOWN:', err)
    setWakeState('unknown')
    return 'unknown'
  }
}

/** Acquire, then reconcile. ⚠️ The result is whatever the OS reports, not what we asked for. */
async function nativeAcquire(): Promise<WakeState> {
  try {
    const plugin = await getPlugin()
    if (!plugin) return wakeState
    await plugin.KeepAwake.keepAwake()
  } catch (err) {
    // Do NOT assert 'off' here — the call may have set the flag before rejecting. Ask instead.
    console.error('[KeepAwake] 🔴 native keepAwake() failed:', err)
  }
  return reconcileWakeState()
}

/** Release, then reconcile. Does NOT touch `nativeIntent` — used by the background path, which must be
 *  able to restore the operator's setting on foreground. */
async function nativeRelease(): Promise<WakeState> {
  try {
    const plugin = await getPlugin()
    if (!plugin) return wakeState
    await plugin.KeepAwake.allowSleep()
  } catch (err) {
    // 🔴 THE FIX. This used to `setWakeState('off')` and return — reporting success for a release that
    // did not happen. On iOS the flag is process-wide, so "self-correcting" was never true: the screen
    // stayed on for the life of the app while the toggle said off.
    console.error('[KeepAwake] 🔴 native allowSleep() FAILED — the screen may still be forced on:', err)
    setWakeState('unknown')
    return 'unknown'
  }
  return reconcileWakeState()
}

/** Background ⇒ release (the process-wide flag must not outlive a visible screen).
 *  Foreground ⇒ reconcile, then restore whatever the SETTING says. */
async function onNativeVisibilityChange(): Promise<void> {
  if (!Capacitor.isNativePlatform() || typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') {
    await nativeRelease()          // intent preserved, so foreground can restore it
    return
  }
  await reconcileWakeState()
  await (nativeIntent ? nativeAcquire() : nativeRelease())
}

function ensureNativeListeners(): void {
  if (nativeListenersAdded || typeof document === 'undefined') return
  nativeListenersAdded = true
  document.addEventListener('visibilitychange', () => { void onNativeVisibilityChange() })
}

/** Request keep-awake. MUST be called from inside a live user activation on web (a real click handler) —
 *  Safari denies `wakeLock.request` that isn't tied to one. The activation is spent by any `await` BEFORE the
 *  request, so on web we reach `navigator.wakeLock.request` with NO preceding await: the platform check is
 *  synchronous and the only `await import()` (the native plugin) happens on the native branch, where no
 *  activation is needed at all. Returns the resulting state; it also updates live via subscribeWakeState. */
export async function keepAwake(): Promise<WakeState> {
  // NATIVE FIRST — `isNativePlatform()` is SYNCHRONOUS (no activation spent). The dynamic import lives on this
  // branch only, so it never delays the web request. The plugin holds the lock with no gesture required.
  // ⚠️ THE CATCHES IN nativeAcquire/nativeRelease HANDLE JS-SIDE FAILURES ONLY: a failed dynamic import
  // and a bridge REJECTION (call.reject → a real rejected Promise). They do NOT — and cannot — protect
  // against a NATIVE throw. Android's Bridge rethrows a plugin exception as RuntimeException on a
  // background HandlerThread (Bridge.java:848-851) and executeOnMainThread is a bare post() with no catch
  // (Bridge.java:909-913), so a native throw kills the process before control returns. Not protection
  // against that; see push.ts:44-47.
  if (Capacitor.isNativePlatform()) {
    nativeIntent = true
    ensureNativeListeners()
    return nativeAcquire()
  }
  // WEB — fire the request with NOTHING awaited before it. requestWebLock runs its sync guards then awaits the
  // request() call itself, so request() is reached synchronously within the caller's click handler.
  keepAwakeEnabled = true
  ensureListeners()
  if (!webLock) await requestWebLock()
  return wakeState
}

/** Prepare keep-awake WITHOUT a user gesture (mount / pref-restore). Native acquires immediately (no
 *  activation needed). Web CANNOT acquire here — Safari denies a request outside a live user activation — so
 *  we only set the intent and reflect state: held (already locked), unsupported/insecure (no usable API), or
 *  'off' = supported-but-awaiting-a-tap. In the awaiting case the KeepAwakePrompt renders a real BUTTON whose
 *  own click (a `click` event, which WebKit honours as an activation — unlike a bare pointerdown) acquires the
 *  lock via the same keepAwake() path as the header toggle. No global one-shot gesture listener: an unreliable
 *  pointerdown-triggered request is exactly what failed on Safari.
 *
 *  🔴 `enabled` IS REQUIRED, and that is the fix for the unconditional-enable defect. This used to take no
 *  argument, so `prepareKeepAwake()` on KDS mount acquired the lock without ever consulting the operator's
 *  setting — on iOS that set a process-wide flag before anything had read the preference. A required
 *  boolean makes the unconditional form a compile error rather than a code-review question. */
export function prepareKeepAwake(enabled: boolean): void {
  if (Capacitor.isNativePlatform()) {
    nativeIntent = enabled
    ensureNativeListeners()
    void (enabled ? nativeAcquire() : nativeRelease())
    return
  }
  if (!enabled) { void allowSleep(); return }
  keepAwakeEnabled = true
  ensureListeners()
  if (webLock) { setWakeState('held'); return }
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) { setWakeState(unsupportedOrInsecure()); return }
  setWakeState('off')   // supported, not yet held → banner button prompts + acquires on its click
}

/** Release, and set the INTENT to off. Native failures publish 'unknown', never 'off'. */
export async function allowSleep(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    nativeIntent = false
    await nativeRelease()
    return
  }
  keepAwakeEnabled = false
  if (webLock) {
    try {
      await webLock.release()
    } catch (err) {
      console.warn('[KeepAwake] wakeLock.release failed:', err)
    }
    webLock = null
  }
  setWakeState('off')
}

// Legacy aliases (KDS page still imports these)
export const enableKeepAwake = keepAwake
export const disableKeepAwake = allowSleep
