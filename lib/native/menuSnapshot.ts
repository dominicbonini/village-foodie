'use client'
// ── CACHED MENU SNAPSHOT — the read half of offline walk-up creation ──────────────────────────────────
// The WRITE half has been built since V11.x: AddOrderPanel emits gatedAction({kind:'create'}), the outbox
// accepts it, and the device-prefixed provisional numbering exists. What was missing is the thing to
// COMPOSE against: /api/menu is fetched with `nocache=<timestamp>` (a unique URL every call, so the
// service worker can never cache it) and public/sw.js caches only /api/dashboard and /api/events/manage.
// So an operator whose backend was degraded had a board but an empty menu, and could not add an order.
//
// WHAT IS STORED: the whole `menu` object from /api/menu — items with prices, categories with prep_secs /
// batch_size / allowNotes / subcategories, the per-category modifierGroups (options ride inside them),
// bundles and upsell_rules. VERIFIED against components/dashboard/types.ts:220-225 and the fetchMenu
// seeding at app/dashboard/[token]/page.tsx — every value that seeding reads is inside this object, so a
// snapshot restores categoryConfigs / categoryAllowNotes / menuGroups / itemCategoryMap identically.
//
// WHERE: @capacitor/preferences — the SAME store the outbox uses, chosen there because WKWebView can
// evict IndexedDB/localStorage under storage pressure and this must survive a cold app-kill.
//
// 🔴 NATIVE ONLY. Web has no durable outbox (lib/native/orderGate.ts), so an order composed offline on
// web could not be queued anyway — caching a menu there would offer a compose flow that cannot complete.
import { Preferences } from '@capacitor/preferences'
import { isNativeApp } from '@/lib/native/device'

const KEY_PREFIX = 'hg_menu_snap_'

/** 🔴 THE STALENESS BOUND — 24 HOURS, AND THE NUMBER IS A MONEY DECISION, NOT A CACHE-TUNING ONE.
 *  A cached PRICE takes real money at the wrong amount, so the bound is set by "how long may a price be
 *  wrong before we would rather refuse to trade from it".
 *  • Longer than one trading day plus the overnight gap, so a truck that went online this morning can
 *    still compose this evening — the actual case this exists for.
 *  • Short enough that a price edited yesterday cannot be charged tomorrow.
 *  • Every successful online fetch rewrites the snapshot, so in normal use its age is minutes.
 *  ⚠️ At the boundary we REFUSE rather than degrade: loadMenuSnapshot returns null and DELETES the entry,
 *  so the panel is exactly as it is today with no menu — an operator who cannot compose is better off
 *  than one composing at last week's prices. */
export const MENU_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface MenuSnapshot<T = unknown> {
  v: 1
  truck_id: string
  event_id: string | null
  saved_at: number
  menu: T
}

/** One key per truck+event. Event-scoped because /api/menu is fetched with `event_id` and returns THAT
 *  event's deals/pause state — a shared key would serve one event's deals while composing for another. */
function snapKey(truckId: string, eventId: string | null): string {
  return `${KEY_PREFIX}${truckId}_${eventId ?? 'noevent'}`
}

/** Write after a GOOD fetch. Fire-and-forget: a storage failure must never break the online path. */
export async function saveMenuSnapshot(truckId: string, eventId: string | null, menu: unknown): Promise<void> {
  if (!isNativeApp() || !truckId || !menu) return
  try {
    const snap: MenuSnapshot = { v: 1, truck_id: truckId, event_id: eventId ?? null, saved_at: Date.now(), menu }
    await Preferences.set({ key: snapKey(truckId, eventId), value: JSON.stringify(snap) })
  } catch { /* storage full / unavailable — the online path is unaffected */ }
}

/** Read when the backend did not answer. Returns null when there is none, when it is unreadable, or when
 *  it is past MAX_AGE — and in the last two cases REMOVES it, so a bad entry cannot linger. */
export async function loadMenuSnapshot(
  truckId: string, eventId: string | null,
): Promise<{ menu: unknown; savedAt: number; ageMs: number } | null> {
  if (!isNativeApp() || !truckId) return null
  const key = snapKey(truckId, eventId)
  try {
    const raw = (await Preferences.get({ key })).value
    if (!raw) return null
    const snap = JSON.parse(raw) as MenuSnapshot
    // Shape guard: a truncated or foreign value must not reach the panel as a menu.
    if (!snap || snap.v !== 1 || !snap.menu || typeof snap.saved_at !== 'number') {
      await Preferences.remove({ key }); return null
    }
    const ageMs = Date.now() - snap.saved_at
    if (ageMs > MENU_SNAPSHOT_MAX_AGE_MS) { await Preferences.remove({ key }); return null }
    return { menu: snap.menu, savedAt: snap.saved_at, ageMs }
  } catch { try { await Preferences.remove({ key }) } catch { /* ignore */ } ; return null }
}

/** Drop every stored snapshot — for a sign-out / truck switch. Not called on a failed fetch. */
export async function clearMenuSnapshots(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { keys } = await Preferences.keys()
    for (const k of keys) if (k.startsWith(KEY_PREFIX)) await Preferences.remove({ key: k })
  } catch { /* ignore */ }
}
