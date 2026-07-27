// lib/provision-demo.ts
// THE demo provisioning service (spec Phase 2, step 8 + 9). ONE code path, three callers:
//   1. first run          — a prospect uploads a menu photo on the landing page
//   2. return visit       — they come back via the emailed link; the old event is stale, so re-provision
//   3. template fallback  — extraction failed, so build Pizza/Burgers/Curries from a fixed menu (§11)
// Keeping them on one path is the point: a bug fixed for first-run is fixed for all three, and the
// fallback can't drift into a different-shaped truck.
//
// Composition (each step is its own module, testable on its own):
//   provisionTruck({kind:'demo'})  → truck + van, hidden, demo- prefixed identity   [lib/provision-truck]
//   extractMenu                    → AI extraction, writes nothing                  [lib/menu-extract]
//   buildDemoAssumptions           → the wizard answers, incl. categoryPrep         [lib/demo-assumptions]
//   commitMenu                     → the one write of the menu                      [lib/menu-commit]
//   provisionDemoEvent             → live event + slot_capacity + occupancy rebuild [lib/provision-demo-event]
//   seedDemoOrders                 → ~10 real orders, customer_email NULL           [lib/seed-demo-orders]
//
// ORDERING MATTERS: menu BEFORE event. Seeding reads committed menu items to build realistic tickets, and
// the occupancy rebuild must run after the orders exist — so the event step (which ends in that rebuild)
// is re-run at the end when seeding placed anything.

import type { SupabaseClient } from '@supabase/supabase-js'
import { provisionTruck, ProvisionError } from '@/lib/provision-truck'
import { extractMenu, MenuExtractionError, type MenuExtraction } from '@/lib/menu-extract'
import { commitMenu, type CommitMenuResult } from '@/lib/menu-commit'
import { buildDemoAssumptions } from '@/lib/demo-assumptions'
import { provisionDemoEvent, type DemoEvent } from '@/lib/provision-demo-event'
import { seedDemoOrders } from '@/lib/seed-demo-orders'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { createDemoSession, touchDemoSession } from '@/lib/demo-session'
import type { Actor } from '@/lib/allergen-audit'

const DEMO_ACTOR: Actor = { actor_user_id: null, actor_role: null, auth_method: 'token' }
// FIX 6 — no VAN-level total. The demo's only ceiling is the MAINS category batch (4 per 5 min, set by
// buildDemoAssumptions), which the engine enforces independently of kitchen_capacity. One number, one
// story — and it removes the global-ceiling veto that produced the "over capacity — review" banner.
const DEMO_VAN_CAPACITY: number | null = null
/** The mains batch — the ceiling the seeder must respect. Mirrors MAIN_BATCH_SIZE in demo-assumptions. */
export const DEMO_MAINS_BATCH = 4

/** How the menu got here. Drives the honest-failure copy the caller shows (§11).
 *  `commit` carries the RAW CommitMenuResult so a caller can report the real numbers — notably
 *  `unaccounted`, the silently-dropped items that never appear in `failed[]`. */
export type MenuOutcome =
  | { kind: 'imported'; inserted: number; partial: boolean; shortfall: number; commit: CommitMenuResult }
  | { kind: 'template'; inserted: number; template: string; commit: CommitMenuResult }
  | { kind: 'failed'; reason: string; commit?: CommitMenuResult }

export interface ProvisionDemoResult {
  truckId: string
  slug: string
  dashboardToken: string
  vanId: string | null
  /** null when the menu failed — provisioning stops before the event (see the guard in provisionDemo). */
  event: DemoEvent | null
  menu: MenuOutcome
  seededOrders: number
  /** Non-fatal notes for logs — never shown to the visitor. */
  warnings: string[]
}

export interface ProvisionDemoInput {
  /** The uploaded menu. Omit BOTH to build a template demo directly (the §11 fallback path). */
  file?: File | null
  text?: string | null
  /** Fixed template menu, used when extraction fails or when no upload is supplied. Pizza first (§11). */
  template?: { name: string; categories: string[]; items: { name: string; price: number; category: string }[] } | null
  /** Re-provision INTO an existing demo truck (return-visit path) instead of creating a new one. */
  existingTruckId?: string
  now?: Date
}

export class ProvisionDemoError extends Error {
  readonly truckId?: string
  constructor(message: string, truckId?: string) {
    super(message); this.name = 'ProvisionDemoError'; this.truckId = truckId
  }
}

/**
 * Build (or rebuild) a complete, playable demo.
 *
 * NOT TRANSACTIONAL — same constraint as everything else here. The steps are ordered so that a failure
 * leaves the truck in the most recoverable state possible, and the caller gets the truckId back on the
 * error so it can be swept.
 */
export async function provisionDemo(
  supabase: SupabaseClient,
  input: ProvisionDemoInput = {},
): Promise<ProvisionDemoResult> {
  const warnings: string[] = []
  const now = input.now ?? new Date()

  // ── 1. Truck + van ─────────────────────────────────────────────────────────────────────────────────
  let truckId: string
  let slug: string
  let dashboardToken: string
  let vanId: string | null

  if (input.existingTruckId) {
    // RETURN VISIT: reuse the truck (its menu is what they came back for) and only rebuild the event.
    const { data: existing } = await supabase
      .from('trucks').select('id, slug, dashboard_token').eq('id', input.existingTruckId).single()
    if (!existing) throw new ProvisionDemoError(`Demo truck ${input.existingTruckId} no longer exists`)
    truckId = existing.id as string
    slug = (existing.slug as string) ?? ''
    dashboardToken = existing.dashboard_token as string
    const { data: van } = await supabase
      .from('truck_vans').select('id').eq('truck_id', truckId).eq('active', true).limit(1).maybeSingle()
    vanId = (van?.id as string) ?? null
  } else {
    try {
      const provisioned = await provisionTruck(supabase, {
        kind: 'demo',
        van: { name: 'Van 1', kitchen_capacity: DEMO_VAN_CAPACITY },
      })
      truckId = provisioned.truck.id
      slug = provisioned.truck.slug
      dashboardToken = provisioned.truck.dashboard_token
      vanId = provisioned.van?.id ?? null
      warnings.push(...provisioned.warnings)
    } catch (err) {
      const orphan = err instanceof ProvisionError ? err.orphanTruckId : undefined
      throw new ProvisionDemoError(
        `Demo truck creation failed: ${err instanceof Error ? err.message : 'unknown'}`, orphan)
    }
  }

  // ── 2. Session lifecycle — OPENED HERE, before anything that can fail ─────────────────────────────
  // 🔴 THIS ORDER IS THE FIX, not a tidy-up. The session used to be written LAST, after seeding. Anything
  // that threw in between (a bad truck_events insert, a failed occupancy rebuild) left a truck with a menu
  // but NO session row — invisible to the expiry sweep (which reads demo_sessions) AND to the orphan sweep
  // (which only catches trucks with no menu). Those trucks were unsweepable forever. Opening the session
  // the moment the truck exists means every demo carries an expiry from birth, so the expiry sweep is the
  // backstop for EVERY mid-provision failure, whenever it happens.
  //
  // The window opened here is the SHORT one (24h, RETENTION_NO_EMAIL_HOURS). It is extended to 14 days
  // only when an email is captured (saveDemoEmail), which is also the only point at which we promise a
  // deletion date to a real person. A return visit pushes the existing tier out rather than resetting it.
  // Best-effort: if migration 20260723 isn't applied yet the demo still provisions, just unpersisted.
  if (input.existingTruckId) await touchDemoSession(supabase, truckId, now)
  else await createDemoSession(supabase, truckId, now)

  // ── 3. Menu (skipped on a return visit — theirs is already committed) ──────────────────────────────
  let menu: MenuOutcome
  if (input.existingTruckId) {
    const { count } = await supabase
      .from('menu_items_db').select('*', { count: 'exact', head: true })
      .eq('truck_id', truckId).eq('is_active', true)
    // Return visit: nothing is re-committed, so there is no CommitMenuResult. Synthesise one that
    // truthfully says "this many items already exist, nothing was attempted this run".
    const existingCount = count ?? 0
    menu = {
      kind: 'imported', inserted: existingCount, partial: false, shortfall: 0,
      commit: { ok: true, inserted: existingCount, skipped: 0, failed: [], groupsCreated: 0,
                optionsCreated: 0, linksCreated: 0, priceConflicts: [], submitted: existingCount, unaccounted: 0 },
    }
  } else {
    menu = await buildMenu(supabase, truckId, input, warnings)
  }

  // 🔴 STOP if the menu failed — do NOT provision an event/slot grid for a truck with zero items. Doing so
  // produced the items=0/events=1 orphan signature in the live data (an event + capacity grid over an empty
  // menu, then a menu_failed response the visitor never rides). The truck + session rows are KEPT: the
  // honest-failure screen correlates by truckId, and the session carries the expiry the cleanup needs. This
  // leaves items=0/events=0 → the orphan sweep gate `if (hasMenu && hasEvent) continue` is false → reclaimed
  // (and the 24h expiry sweep catches it regardless, since a failed demo is never claimed).
  if (menu.kind === 'failed') {
    return { truckId, slug, dashboardToken, vanId, event: null, menu, seededOrders: 0, warnings }
  }

  // ── 4. Live event + slot grid ─────────────────────────────────────────────────────────────────────
  // AFTER the menu: the slot grid doesn't depend on it, but the occupancy rebuild at the end of this step
  // reads category configs that only exist once the menu is committed.
  let event: DemoEvent
  try {
    event = await provisionDemoEvent(supabase, truckId, { now, replaceExisting: true })
  } catch (err) {
    throw new ProvisionDemoError(
      `Demo event creation failed: ${err instanceof Error ? err.message : 'unknown'}`, truckId)
  }

  // ── 5. Seeded orders ──────────────────────────────────────────────────────────────────────────────
  let seededOrders = 0
  try {
    const seeded = await seedDemoOrders(supabase, {
      truckId, eventId: event.id, eventDate: event.event_date,
      startTime: event.start_time, endTime: event.end_time,
      capacity: DEMO_MAINS_BATCH,
      // Floor the first collection to now+10 — demoEventWindow's half-hour start can be ≤29 min in the
      // past, and without this the front-weighted board would open with already-late orders.
      now,
    })
    seededOrders = seeded.inserted
    if (seeded.skippedNoMenu) warnings.push('No menu items to seed orders from — board left empty.')

    // Re-run the occupancy rebuild now that the orders exist. provisionDemoEvent ran it against an empty
    // board; the traffic lights read production_slot_usage, so without this second pass the seeded orders
    // would sit on the board without occupying anything and every slot would show green — the demo would
    // look busy while claiming it had infinite capacity.
    if (seeded.inserted > 0) {
      await rebuildProductionSlotUsage(supabase, truckId, event.event_date)
    }
  } catch (err) {
    // Non-fatal: a demo with a menu, an event and an empty board is still playable — they can place their
    // own test order. Losing the whole demo over decoration would be the wrong trade.
    warnings.push(`Order seeding failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`)
  }

  return { truckId, slug, dashboardToken, vanId, event, menu, seededOrders, warnings }
}

// ── Menu: extract → assume → commit, with the honest three-outcome handling ──────────────────────────
async function buildMenu(
  supabase: SupabaseClient,
  truckId: string,
  input: ProvisionDemoInput,
  warnings: string[],
): Promise<MenuOutcome> {
  const { data: truckRow } = await supabase.from('trucks').select('id, name').eq('id', truckId).single()
  const truck = { id: truckId, name: (truckRow?.name as string) ?? 'Demo Kitchen' }

  const hasUpload = !!(input.file || (input.text && input.text.trim()))

  if (hasUpload) {
    let extraction: MenuExtraction | null = null
    try {
      extraction = await extractMenu(supabase, truck, { file: input.file, text: input.text })
    } catch (err) {
      warnings.push(`Extraction failed: ${err instanceof MenuExtractionError ? err.message : 'unknown'}`)
    }

    if (extraction && extraction.items.length > 0) {
      const result = await commitExtraction(supabase, truck, extraction, warnings)
      // OUTCOME 1: nothing landed → treat as an extraction failure so the caller can offer the honest
      // "we couldn't read that menu" + template choice (§11). NEVER silently substitute a stock menu.
      if (result.inserted === 0) {
        warnings.push('Commit inserted 0 items — treating as an extraction failure.')
      } else {
        // Persist the RAW extraction so signup can re-commit the menu into the operator's real truck.
        // See persistExtraction — RAW, not the commitExtraction-patched shape, is deliberate. 'upload' =
        // the visitor's OWN menu, so signup may re-commit it.
        await persistExtraction(supabase, truckId, extraction, 'upload')
        // OUTCOME 2/3: partial is acceptable for a disposable demo, but report the REAL shortfall —
        // `failed[]` alone under-reports, because items whose category failed are dropped silently.
        const shortfall = result.unaccounted + result.failed.filter(f => f.type === 'item').length
        if (!result.ok || shortfall > 0) {
          warnings.push(`Partial import: ${result.inserted} in, ${shortfall} missing (${result.failed.length} reported failures, ${result.unaccounted} silently dropped).`)
        }
        return { kind: 'imported', inserted: result.inserted, partial: !result.ok || shortfall > 0, shortfall, commit: result }
      }
    } else if (extraction) {
      warnings.push('Extraction returned zero items.')
    }
  }

  // ── Template fallback (§11) ────────────────────────────────────────────────────────────────────────
  // Reached when there was no upload at all, or extraction/commit produced nothing. The caller is
  // responsible for TELLING the visitor honestly that we couldn't read their menu — this function only
  // supplies the substitute; it must never be presented as their own.
  if (input.template) {
    const extraction: MenuExtraction = {
      categories: input.template.categories,
      items: input.template.items.map(i => ({
        name: i.name, description: null, price: i.price, price_missing: false,
        category: i.category, allergens: [], dietary: [], spiciness: null,
      })),
      existing_categories: [],
    }
    const result = await commitExtraction(supabase, truck, extraction, warnings)
    if (result.inserted > 0) {
      // Persist the template extraction too (the return path re-provisions from it, so Pizza stays Pizza),
      // but tag it 'template' — a SAMPLE the visitor picked, NOT their own menu. Signup ignores this so a
      // real truck can never inherit a sample (see /api/setup GET).
      await persistExtraction(supabase, truckId, extraction, 'template')
      return { kind: 'template', inserted: result.inserted, template: input.template.name, commit: result }
    }
    return { kind: 'failed', reason: 'Template commit inserted nothing', commit: result }
  }

  return { kind: 'failed', reason: 'Menu extraction produced nothing and no template was supplied' }
}

// ── Persist the RAW extraction to demo_sessions.extraction ────────────────────────────────────────────
// This is the source the signup menu migration re-commits from (spec §10 Phase 4). It closes a real gap:
// the column, the /api/setup GET read, and the ?import=demo bootstrap all existed, but nothing wrote here,
// so the migration silently fell through to a blank upload.
//
// 🔴 RAW, NOT the commitExtraction-patched items — deliberate. Signup re-feeds this through the wizard's
// OWN pipeline (withImpUids → ungroupAiVariantsForReview → autoSplitConflicts → makeGroupingRow), so the
// WIZARD makes the grouping/required decisions with the operator watching. Storing the patched shape would
// carry the demo's inline isRequired/singleSelect plaster — and the missing computeRegroupCandidates pass
// (reference-manual backlog, onboarding §9.4 G1) — onto a real operator truck. The raw object is still
// intact here: commitExtraction builds a new array via .map + spread and never mutates its input.
//
// BEST-EFFORT, matching the surrounding posture (createDemoSession/touchDemoSession also swallow): a failed
// session write must never fail demo provisioning. Worst case the migration falls back to re-upload, which
// is exactly today's behaviour. Also tolerant of the column not existing yet (migration unapplied).
//
// ⚠️ demo_sessions.truck_id → trucks is ON DELETE CASCADE, so this row (and the payload) dies with the demo
// truck. Retirement/cleanup must not delete the demo until the operator's menu is committed — see §7 and
// the note in lib/menu-commit.ts.
async function persistExtraction(
  supabase: SupabaseClient, truckId: string, extraction: MenuExtraction, source: 'upload' | 'template',
): Promise<void> {
  try {
    // update, not upsert: the session row is opened earlier in provisionDemo (createDemoSession/
    // touchDemoSession), so it exists by now; an upsert here could race that row's expiry tier.
    //
    // extraction_source distinguishes the visitor's OWN menu ('upload') from a sample they picked
    // ('template'). Signup (/api/setup GET) re-commits the stored extraction onto their REAL truck, and a
    // sample menu must NEVER land there — so it reads this to ignore template payloads. The return path
    // (/api/demo/return) ignores the source and re-provisions from whatever is stored (Pizza stays Pizza).
    const { error } = await supabase.from('demo_sessions')
      .update({ extraction, extraction_source: source }).eq('truck_id', truckId)
    if (error) console.warn(`[provision-demo] could not persist extraction for ${truckId} (migration applied?):`, error.message)
  } catch (err) {
    console.warn(`[provision-demo] extraction persist threw for ${truckId}:`, err)
  }
}

/** Apply the wizard assumptions, then commit. Shared by the imported and template paths so both get an
 *  identical capacity model — a template demo with no prep would be just as broken as an imported one. */
async function commitExtraction(
  supabase: SupabaseClient,
  truck: { id: string },
  extraction: MenuExtraction,
  warnings: string[],
): Promise<CommitMenuResult> {
  const assumptions = buildDemoAssumptions(extraction.categories, extraction.items)
  if (assumptions.usedFallback) warnings.push(`Category inference: ${assumptions.note}`)

  // ── INFERRED VARIANT GROUPS ARE REQUIRED + SINGLE-SELECT ──────────────────────────────────────────
  // A protein/size axis is structurally a must-choose-one, so a collapsed "Pad Thai [Chicken|Beef|Prawn]"
  // must not commit as an OPTIONAL group. The operator wizard already does this in makeGroupingRow
  // (manage/page.tsx) — but the demo commits the AI's payload DIRECTLY, bypassing that pass, and the
  // extraction prompt deliberately defaults isRequired:false ("when in doubt, false"). So the demo was
  // getting optional protein groups while real imports got required ones.
  //
  // ⚠️ DEMO-ONLY BY CONSTRUCTION: this runs in provision-demo, so no operator import is touched. The real
  // fix is extracting the wizard's grouping pass to lib/ so both paths share it — logged in the reference
  // manual backlog as the root cause of TWO demo divergences (this, and auto-choosing grouped variants).
  const items = extraction.items.map(it => {
    const groups = it.modifierGroups
    if (!Array.isArray(groups) || !groups.length) return it
    return {
      ...it,
      modifierGroups: groups.map(g =>
        g?._inferredFromVariants === true ? { ...g, isRequired: true, singleSelect: true } : g),
    }
  })

  return commitMenu(supabase, truck, {
    categories: extraction.categories,
    items,
    categoryPrep: assumptions.categoryPrep,
  }, DEMO_ACTOR)
}
