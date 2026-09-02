'use client'
// ── CACHED TRUCK CONFIG — what makes the Add-order panel REACHABLE on a cold, degraded launch ────────
//
// The menu snapshot (lib/native/menuSnapshot.ts) gives the panel something to compose FROM. It does not
// make the panel RENDER. Two gates stand in front of it in app/dashboard/[token]/page.tsx:
//   • the full-page "Access denied" return, taken whenever a first load fails; and
//   • `{truck && ( <AddOrderPanel …/> )}` — the panel is mounted only when `truck` is non-null, and
//     `setTruck` runs ONLY on a successful /api/dashboard.
// So on a cold launch against a degraded backend the panel was unreachable no matter what the menu
// snapshot held. This stores the truck config that both gates need.
//
// 🔴 THIS DELIBERATELY DOES NOT STORE ORDERS. A board seeded with yesterday's orders, shown to an
// operator mid-service, is worse than an empty one: they would work rows that may already be collected.
// The board stays empty and SAYS it could not be loaded (see the dashboard's own copy), which is the
// distinction the requirement turns on — an empty board and an unreachable board are not the same thing.
//
// WHERE: @capacitor/preferences, the same store as the outbox and the menu snapshot — WKWebView evicts
// localStorage/IndexedDB under pressure, and this must survive a cold app-kill.
// 🔴 NATIVE ONLY, for the same reason as the menu snapshot: web has no durable outbox, so an order
// composed there could not be queued anyway.
import { Preferences } from '@capacitor/preferences'
import { isNativeApp } from '@/lib/native/device'

const KEY_PREFIX = 'hg_truck_snap_'

/** 🔴 SEVEN DAYS, and shorter than the menu snapshot's 24h bound is NOT what is wanted here — this is
 *  longer, deliberately, and the reasoning is different.
 *  The menu carries PRICES, so a stale one takes money at the wrong amount and 24h is a money decision.
 *  This carries CONFIG — plan, feature overrides, payment settings, emoji. A stale plan could briefly
 *  offer a feature the truck no longer has, which is a wrong affordance, not a wrong charge. Seven days
 *  spans a full trading week so a truck that trades weekends can still open the panel; beyond that the
 *  config is old enough that refusing is safer than guessing.
 *  ⚠️ Every successful load rewrites it, so in normal use its age is minutes. */
export const TRUCK_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface TruckSnapshot<T = unknown> { v: 1; token: string; saved_at: number; truck: T }

/** Keyed by the dashboard token, so a device that has held two trucks cannot serve one for the other. */
function snapKey(token: string): string { return KEY_PREFIX + token }

/** Write after a SUCCESSFUL /api/dashboard. Fire-and-forget — storage must never break the online path. */
export async function saveTruckSnapshot(token: string, truck: unknown): Promise<void> {
  if (!isNativeApp() || !token || !truck) return
  try {
    const snap: TruckSnapshot = { v: 1, token, saved_at: Date.now(), truck }
    await Preferences.set({ key: snapKey(token), value: JSON.stringify(snap) })
  } catch { /* storage full / unavailable — the online path is unaffected */ }
}

/** Read when a first load failed. Returns null when absent, unreadable or past the bound — and in the
 *  last two cases REMOVES it, so a bad entry cannot linger. */
export async function loadTruckSnapshot(
  token: string,
): Promise<{ truck: unknown; savedAt: number } | null> {
  if (!isNativeApp() || !token) return null
  const key = snapKey(token)
  try {
    const raw = (await Preferences.get({ key })).value
    if (!raw) return null
    const snap = JSON.parse(raw) as TruckSnapshot
    if (!snap || snap.v !== 1 || !snap.truck || typeof snap.saved_at !== 'number' || snap.token !== token) {
      await Preferences.remove({ key }); return null
    }
    if (Date.now() - snap.saved_at > TRUCK_SNAPSHOT_MAX_AGE_MS) { await Preferences.remove({ key }); return null }
    return { truck: snap.truck, savedAt: snap.saved_at }
  } catch { try { await Preferences.remove({ key }) } catch { /* ignore */ } ; return null }
}
