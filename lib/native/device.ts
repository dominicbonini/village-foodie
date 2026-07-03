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

export type DeviceConfigData = {
  device: DeviceConfig | null
  vans: VanRef[]
  vanHint: string | null
  truck: { id: string; name: string | null } | null
}
/**
 * Result of reading this device's config. DISCRIMINATED so callers can tell a FETCH FAILURE
 * (`{ ok: false }` → offer Retry) apart from a successful read that genuinely has no active vans
 * (`{ ok: true, vans: [] }` → "no active van"). Previously BOTH collapsed to `null`, so a transient
 * 429/500/network error masqueraded as "no active van" and trapped the operator behind a dead-end modal.
 */
export type DeviceConfigResult = ({ ok: true } & DeviceConfigData) | { ok: false }

/** Read this device's config + the truck's vans + single-van staff hint + the current truck (name). */
export async function fetchDeviceConfig(token: string): Promise<DeviceConfigResult> {
  try {
    const res = await fetch(`/api/native/bind-device?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(getDeviceId())}`)
    if (!res.ok) return { ok: false }
    const data = await res.json()
    return { ok: true, device: data.device ?? null, vans: data.vans ?? [], vanHint: data.vanHint ?? null, truck: data.truck ?? null }
  } catch { return { ok: false } }
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

// ── Last-viewed screen (restart-to-last-screen) ──────────────────────────────────────────────────────
// Per-device memory of the screen the operator was last on (Dashboard vs KDS), so a cold-launch reopens
// THERE rather than the configured default. Stored in the same localStorage the device_id uses (survives
// cold-launch in the shell's WKWebView). The DB `van_devices.default_screen` remains the FALLBACK (used the
// first launch after setup, before any screen has been recorded).
const LAST_SCREEN_KEY = 'hg_last_screen'

/** Record the screen this device is currently on. Called by the dashboard/KDS pages (native). */
export function setLastScreen(screen: 'dashboard' | 'kds'): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LAST_SCREEN_KEY, screen) } catch { /* storage disabled — fall back to default */ }
}

/** The screen this device was last on, or null if none recorded yet (→ caller falls back to default_screen). */
export function getLastScreen(): 'dashboard' | 'kds' | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(LAST_SCREEN_KEY)
    return v === 'kds' || v === 'dashboard' ? v : null
  } catch { return null }
}
