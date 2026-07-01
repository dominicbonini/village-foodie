import { Capacitor } from '@capacitor/core'

// Module-level web lock — single instance per tab
let webLock: any = null
let keepAwakeEnabled = false      // tracks intent, survives auto-releases
let visibilityListenerAdded = false

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

async function requestWebLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
  try {
    webLock = await (navigator as any).wakeLock.request('screen')
    webLock.addEventListener('release', () => {
      webLock = null
      // Browser released the lock (page hidden, screen dimmed, etc.)
      // Re-acquire immediately if the intent is still on and page is visible
      if (keepAwakeEnabled && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        requestWebLock()
      }
    })
  } catch (err) {
    console.warn('[KeepAwake] wakeLock.request failed:', err)
  }
}

function ensureVisibilityListener(): void {
  if (visibilityListenerAdded || typeof document === 'undefined') return
  visibilityListenerAdded = true
  document.addEventListener('visibilitychange', () => {
    if (keepAwakeEnabled && document.visibilityState === 'visible' && !webLock) {
      requestWebLock()
    }
  })
}

export async function keepAwake(): Promise<void> {
  const plugin = await getPlugin()
  if (plugin) {
    await plugin.KeepAwake.keepAwake()
  } else {
    keepAwakeEnabled = true
    ensureVisibilityListener()
    if (!webLock) await requestWebLock()
  }
}

export async function allowSleep(): Promise<void> {
  const plugin = await getPlugin()
  if (plugin) {
    await plugin.KeepAwake.allowSleep()
  } else {
    keepAwakeEnabled = false
    if (webLock) {
      try {
        await webLock.release()
      } catch (err) {
        console.warn('[KeepAwake] wakeLock.release failed:', err)
      }
      webLock = null
    }
  }
}

// Legacy aliases (KDS page still imports these)
export const enableKeepAwake = keepAwake
export const disableKeepAwake = allowSleep
