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
export type WakeState = 'held' | 'denied' | 'unsupported' | 'insecure' | 'native' | 'off'
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

/** Request keep-awake. MUST be called from inside a live user activation on web (a real click handler) —
 *  Safari denies `wakeLock.request` that isn't tied to one. The activation is spent by any `await` BEFORE the
 *  request, so on web we reach `navigator.wakeLock.request` with NO preceding await: the platform check is
 *  synchronous and the only `await import()` (the native plugin) happens on the native branch, where no
 *  activation is needed at all. Returns the resulting state; it also updates live via subscribeWakeState. */
export async function keepAwake(): Promise<WakeState> {
  // NATIVE FIRST — `isNativePlatform()` is SYNCHRONOUS (no activation spent). The dynamic import lives on this
  // branch only, so it never delays the web request. The plugin holds the lock with no gesture required.
  if (Capacitor.isNativePlatform()) {
    const { KeepAwake } = await import('@capacitor-community/keep-awake')
    await KeepAwake.keepAwake()
    setWakeState('native')
    return 'native'
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
 *  pointerdown-triggered request is exactly what failed on Safari. */
export function prepareKeepAwake(): void {
  if (Capacitor.isNativePlatform()) { void keepAwake(); return }
  keepAwakeEnabled = true
  ensureListeners()
  if (webLock) { setWakeState('held'); return }
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) { setWakeState(unsupportedOrInsecure()); return }
  setWakeState('off')   // supported, not yet held → banner button prompts + acquires on its click
}

export async function allowSleep(): Promise<void> {
  const plugin = await getPlugin()
  if (plugin) {
    await plugin.KeepAwake.allowSleep()
    setWakeState('off')
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
