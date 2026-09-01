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

/**
 * Result of WRITING this device's config. DISCRIMINATED, mirroring `DeviceConfigResult` above — the
 * read path has had this shape since a transient 429 could masquerade as "no active van"; the write
 * path had nothing equivalent and collapsed every outcome to `null`.
 *
 * 🔴 WHAT `null` COST. The route has FIVE distinct rejections (401 unauthorised, 400 device_id
 * required, 404 cross-truck van, 400 invalid default_screen, 400 upsert failed) and a network throw
 * is a sixth outcome. All six arrived at the caller as the same `null`, with no console line and no
 * text — so a failed save left the picker sitting on "Continue", a failed toggle silently kept its old
 * value, and diagnosing ONE instance meant streaming production logs.
 *
 * ⚠️ `reason` IS INTERNAL AND MUST NOT BE SHOWN TO AN OPERATOR. It is the server's machine-readable
 * cause (`BindDeviceReason` in app/api/native/bind-device/route.ts) and exists for the console line
 * this module already emits. Operators get a plain sentence and a retry, decided by the call site.
 * `null` where the server sent no `reason` — an older deploy, or a body that would not parse.
 * ⚠️ `networkError` SEPARATES "we never reached the server" FROM "the server said no". They need
 * different words in front of an operator: one is worth retrying immediately, the other is not.
 * `status` is null in exactly that case, and a number in every other.
 */
export type SaveDeviceConfigResult =
  | { ok: true; device: DeviceConfig | null }
  | { ok: false; status: number | null; reason: string | null; networkError: boolean }

/** Upsert this device's row (van / default screen / notify / push token). Truck-scoped server-side. */
export async function saveDeviceConfig(
  token: string,
  patch: { van_id?: string | null; default_screen?: 'dashboard' | 'kds'; notify_enabled?: boolean; push_token?: string | null },
): Promise<SaveDeviceConfigResult> {
  // 🔴 LOGGED HERE, ONCE, NOT AT FOUR CALL SITES. Every writer goes through this function, so this is
  // the only place that cannot be forgotten by a future caller. Prefix matches the convention the
  // webhook route uses (`[webhook/meta-whatsapp] …`) so the tag is greppable in the same way.
  const fail = (r: { status: number | null; reason: string | null; networkError: boolean }): SaveDeviceConfigResult => {
    console.error(
      `[native/bind-device] write failed — ${r.networkError ? 'network throw (server not reached)' : `status ${r.status}`}` +
      `, reason=${r.reason ?? 'none'}, patch keys=[${Object.keys(patch).join(', ')}]`
    )
    return { ok: false, ...r }
  }
  try {
    const res = await fetch('/api/native/bind-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
    })
    if (!res.ok) {
      // The body is the ONLY thing separating two different 400s. Parsed defensively: a rejection whose
      // body is not JSON must still surface as that status, not as a network error.
      const body = await res.json().catch(() => null as { reason?: unknown } | null)
      const reason = body && typeof body.reason === 'string' ? body.reason : null
      return fail({ status: res.status, reason, networkError: false })
    }
    // ⚠️ A 200 WHOSE BODY WILL NOT PARSE IS A SERVER FAILURE, NOT A NETWORK ONE. It used to land in the
    // bare catch below and be indistinguishable from an unreachable server. Named so it can be told apart.
    const data = await res.json().catch(() => null as { device?: DeviceConfig } | null)
    if (!data) return fail({ status: res.status, reason: 'bad_json', networkError: false })
    return { ok: true, device: data.device ?? null }
  } catch {
    // Genuinely could not reach the server: DNS, offline, aborted, TLS. No status exists.
    return fail({ status: null, reason: null, networkError: true })
  }
}

/** The ONE operator-facing sentence for a failed write. 🔴 IT NEVER NAMES `reason`: the internal cause
 *  is for the console line above, not for a hatch. Only the network/server split changes the wording,
 *  because only that changes what the operator should do about it. */
export function saveFailureMessage(r: Extract<SaveDeviceConfigResult, { ok: false }>): string {
  return r.networkError
    ? 'Couldn’t reach the server — check the connection and try again.'
    : 'Couldn’t save that just now. Please try again.'
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
