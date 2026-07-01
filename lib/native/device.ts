// Per-device operator config client (Package 3). Stable device_id (localStorage UUID, generated first
// launch — persists across cold-launch in the shell's WKWebView). All calls guard on isNativePlatform via
// the callers; the helpers themselves are browser-safe (localStorage/fetch) and simply unused on web.
import { Capacitor } from '@capacitor/core'

const DEVICE_ID_KEY = 'hg_device_id'

export interface VanRef { id: string; name: string }
export interface DeviceConfig {
  id: string
  truck_id: string
  van_id: string | null
  device_id: string
  push_token: string | null
  platform: string | null
  default_screen: 'dashboard' | 'kds'
  notify_enabled: boolean
}

/** True inside the native iOS shell. */
export function isNativeApp(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
}

/** Stable per-device id. Generated once and persisted (localStorage → survives cold-launch in the shell). */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = (crypto?.randomUUID?.() ?? `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/** Read this device's config + the truck's vans + single-van staff hint + the current truck (name). */
export async function fetchDeviceConfig(token: string): Promise<{ device: DeviceConfig | null; vans: VanRef[]; vanHint: string | null; truck: { id: string; name: string | null } | null } | null> {
  try {
    const res = await fetch(`/api/native/bind-device?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(getDeviceId())}`)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

/** Upsert this device's row (van / default screen / notify / push token). Truck-scoped server-side. */
export async function saveDeviceConfig(
  token: string,
  patch: { van_id?: string | null; default_screen?: 'dashboard' | 'kds'; notify_enabled?: boolean; push_token?: string | null },
): Promise<DeviceConfig | null> {
  try {
    const res = await fetch('/api/native/bind-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.device ?? null
  } catch { return null }
}
