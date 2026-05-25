import { Capacitor } from '@capacitor/core'

// Module-level web lock — single instance per tab
let webLock: any = null

async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  const { KeepAwake } = await import('@capacitor-community/keep-awake')
  return KeepAwake
}

export async function keepAwake(): Promise<void> {
  const plugin = await getPlugin()
  if (plugin) {
    await plugin.keepAwake()
  } else if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      webLock = await (navigator as any).wakeLock.request('screen')
    } catch (err) {
      console.warn('[KeepAwake] wakeLock.request failed:', err)
    }
  }
}

export async function allowSleep(): Promise<void> {
  const plugin = await getPlugin()
  if (plugin) {
    await plugin.allowSleep()
  } else if (webLock) {
    try {
      await webLock.release()
      webLock = null
    } catch (err) {
      console.warn('[KeepAwake] wakeLock.release failed:', err)
    }
  }
}

// Legacy aliases (KDS page still imports these)
export const enableKeepAwake = keepAwake
export const disableKeepAwake = allowSleep
