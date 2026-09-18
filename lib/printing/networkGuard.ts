'use client'
// ── ONE PRINTING DEVICE PER VAN — the WIRED guard (17 September 2026) ────────────────────────────────
// A wired printer is reachable by every device on the kitchen router. The dedupe record is device-local
// (hg_printed_keys_<token>), so two devices with printing on would each print every ticket — not a race,
// a duplicate. Bluetooth is physically paired to one device and is left exactly as today; this guard
// applies ONLY when the device's printer kind is 'net'.
//
// The shared record is truck_vans.network_print_device_id (migration 20260919), read and written through
// /api/printing. This module is the client: fetch, claim, release, a per-van cached claim for when the
// route cannot be reached, and ONE pure decision function both usePrinting and the card call.
import { Preferences } from '@capacitor/preferences'

export type NetGuardState =
  | 'ok'        // this device holds the van (or just claimed it) — printing may run
  | 'other'     // another device holds it — do not print; offer "Move printing to this device"
  | 'unknown'   // the claim could not be read and there is no cached claim for this device — do not print
  | 'unbound'   // this device is not bound to a van — wired printing unavailable
  | 'pin'       // the truck has a dashboard PIN: /api/printing cannot be authenticated from here yet

export interface NetPrintingInfo {
  /** False when /api/printing could not read the two columns (PGRST204 / 42703). The setting degrades. */
  columnsAvailable: boolean
  vanId: string | null
  vanName: string | null
  truckName: string | null
  address: string | null
  printingDeviceId: string | null
}

/** What a GET of /api/printing can tell us, as three distinguishable answers.
 *  🔴 'pin' REPLACES THE STORAGE-KEY GUESSWORK (17 September 2026). lib/printing/dashboardPin.ts used to
 *  hunt four plausible keys for a PIN the dashboard page never stores (it keeps it in React state only),
 *  so it always returned undefined and a PIN-protected truck would have got a silent 401 → 'unknown' →
 *  "Can't check which device is printing right now.", which is not what is wrong. The PIN requirement is
 *  now OBSERVED, not guessed: verifyToken in app/api/printing/route.ts answers 401 with
 *  `requiresPin: true` exactly when trucks.dashboard_pin is set and the pin we sent does not match — and
 *  we deliberately send none. That response IS the signal, and it needs no change to the dashboard page. */
export type NetPrintingRead = NetPrintingInfo | 'pin' | null

const cacheKey = (vanId: string) => `hg_net_claim_${vanId}`

export async function readCachedClaim(vanId: string): Promise<string | null> {
  try { return (await Preferences.get({ key: cacheKey(vanId) })).value } catch { return null }
}
export async function writeCachedClaim(vanId: string, deviceId: string | null): Promise<void> {
  try {
    if (deviceId) await Preferences.set({ key: cacheKey(vanId), value: deviceId })
    else await Preferences.remove({ key: cacheKey(vanId) })
  } catch { /* best-effort: the next successful read rewrites it */ }
}

/**
 * THE DECISION. Pure, so the harness can exercise every branch without a device or a route.
 *  info 'pin'           → the truck has a dashboard PIN: 'pin', and NOTHING is claimed.
 *  info null            → the route could not be reached (offline, 5xx): trust the cached claim if it is
 *                         THIS device, else 'unknown'.
 *  columnsAvailable off → the columns are missing: same rule as offline.
 *  no van               → 'unbound'.
 *  nobody holds it      → 'ok', and the caller should claim.
 *  this device holds it → 'ok'.
 *  another device       → 'other'.
 */
export function decideNetPrinting(input: { deviceId: string; info: NetPrintingRead; cachedHolder: string | null }): { state: NetGuardState; shouldClaim: boolean } {
  const { deviceId, info, cachedHolder } = input
  // 🔴 FIRST, AND IT NEVER CLAIMS. A PIN truck cannot authenticate this route from the card, so every
  // write would 401. Saying so plainly beats retrying, and beats a cached claim deciding it.
  if (info === 'pin') return { state: 'pin', shouldClaim: false }
  if (!info || !info.columnsAvailable) return { state: cachedHolder && cachedHolder === deviceId ? 'ok' : 'unknown', shouldClaim: false }
  if (!info.vanId) return { state: 'unbound', shouldClaim: false }
  if (!info.printingDeviceId) return { state: 'ok', shouldClaim: true }
  if (info.printingDeviceId === deviceId) return { state: 'ok', shouldClaim: false }
  return { state: 'other', shouldClaim: false }
}

/** What the card shows for each blocked state. ONE line each, and the button text for 'other'. */
export const NET_GUARD_COPY: Record<Exclude<NetGuardState, 'ok'>, string> = {
  other: 'Printing is on another device. Move printing to this device?',
  unknown: "Can't check which device is printing right now.",
  unbound: "This device isn't set to a van yet, so wired printing isn't available.",
  pin: "Wired printing isn't available on dashboards with a PIN yet.",
}
export const NET_GUARD_MOVE_BUTTON = 'Move printing to this device'

// ── THE ROUTE CLIENT ───────────────────────────────────────────────────────────────────────────────
const q = (o: Record<string, string>) => new URLSearchParams(o).toString()

/** GET the van's wired-printer state for THIS device. Null when the route could not be reached. */
export async function fetchNetPrinting(token: string, deviceId: string): Promise<NetPrintingRead> {
  try {
    // NO `pin` PARAMETER, BY DESIGN — see NetPrintingRead. A PIN truck answers 401 + requiresPin, and
    // that is the thing we want to know; sending a guessed PIN could only turn the signal into noise.
    const res = await fetch(`/api/printing?${q({ token, device_id: deviceId })}`, { cache: 'no-store' })
    if (!res.ok) {
      if (res.status === 401) {
        const j = await res.json().catch(() => ({}))
        if (j?.requiresPin) return 'pin'
      }
      return null
    }
    const j = await res.json()
    return {
      columnsAvailable: j.columnsAvailable !== false,
      vanId: j.vanId ?? null, vanName: j.vanName ?? null, truckName: j.truckName ?? null,
      address: j.address ?? null, printingDeviceId: j.printingDeviceId ?? null,
    }
  } catch { return null }
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/printing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: j?.error ?? `Request failed (${res.status})` }
    return { ok: true }
  } catch { return { ok: false, error: 'Could not reach HatchGrab right now.' } }
}
export const claimNetPrinting = (token: string, deviceId: string) => post({ token, device_id: deviceId, action: 'claim' })
export const releaseNetPrinting = (token: string, deviceId: string) => post({ token, device_id: deviceId, action: 'release' })
export const setNetPrinterAddress = (token: string, deviceId: string, address: string) => post({ token, device_id: deviceId, action: 'set_address', address })

/**
 * Resolve the guard for THIS device end to end: fetch → decide → claim if nobody holds it → cache.
 * Returns the state usePrinting gates `active` on.
 */
export async function resolveNetGuard(token: string, deviceId: string): Promise<NetGuardState> {
  const info = await fetchNetPrinting(token, deviceId)
  const vanId = info && info !== 'pin' ? info.vanId : null
  const cached = vanId ? await readCachedClaim(vanId) : null
  const d = decideNetPrinting({ deviceId, info, cachedHolder: cached })
  if (d.state === 'ok' && d.shouldClaim) {
    const r = await claimNetPrinting(token, deviceId)
    if (!r.ok) return 'unknown'
  }
  if (vanId && d.state === 'ok') await writeCachedClaim(vanId, deviceId)
  return d.state
}

// ── CARD → HOOK: the card's "Move printing to this device" must make usePrinting re-check ──────────
type Listener = () => void
const listeners = new Set<Listener>()
export function subscribeNetGuard(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l) } }
export function bumpNetGuard(): void { for (const l of listeners) l() }
