// lib/slot-interval.ts
// ── THE COLLECTION-INTERVAL VOCABULARY, AND THE ONE PLACE A VAN'S INTERVALS ARE READ ────────────────
//
// 🔴 TWO INTERVALS, BOTH PER VAN. `truck_vans.collection_interval_mins` (the CUSTOMER grid — the order
// page, ASAP, the fallback picker, and customer placement) and
// `truck_vans.operator_collection_interval_mins` (the van's OVERRIDE for orders the operator adds —
// Add Order, operator ASAP and "Ready around", the day-load dots, detectCapacityBreaches, and the
// cached offline grid).
//
// 🔴 NULL IS NOT 5. A NULL override means "the operator follows the customer setting", so the
// EFFECTIVE truck interval is `operator_collection_interval_mins ?? collection_interval_mins`. Reading
// the override through normaliseInterval would turn NULL into 5 and silently give a customer-15 van a
// 5-minute operator grid — the one arithmetic mistake this file exists to make impossible. Every read
// goes through readVanIntervals, which is why there is no exported normaliser for the override alone.
//
// 🔴 A SELECTION SETTING, NOT A CAPACITY ONE. Nothing here is read by the engine. §31 is untouched.
//
// ── WHICH VAN, AND WHY THIS FILE DOES NOT DECIDE ────────────────────────────────────────────────────
// readVanIntervals takes a van id, never an event or a truck. The van is resolved by the caller, by
// the SAME path it already resolves kitchen_capacity and capacity_window_mins on — `event.van_id`,
// from the event that caller already has. That is deliberate: making this file resolve the event too
// would create a SECOND event-resolution rule beside the ones in /api/slots, /api/dashboard and
// eventKitchenCapacity, and the four could disagree about which van an order belongs to. Sharing the
// van ID shares the resolution; re-deriving it would fork it.
//
// ⚠️ THE DATABASE HAS A CHECK ON BOTH COLUMNS AND THIS LIST MUST MATCH IT (20260917_van_collection_intervals).
// The CHECK is the backstop; this is the layer that can say something useful in an error message.

import type { SupabaseClient } from '@supabase/supabase-js'

export const INTERVAL_CHOICES = [5, 10, 15, 20, 30] as const
export type IntervalChoice = (typeof INTERVAL_CHOICES)[number]

export const DEFAULT_INTERVAL: IntervalChoice = 5

/** The one validator — used by the settings route and by every reader that normalises a stored value. */
export const isIntervalChoice = (v: unknown): v is IntervalChoice =>
  typeof v === 'number' && Number.isInteger(v) && (INTERVAL_CHOICES as readonly number[]).includes(v)

/**
 * A stored value → a usable interval. 🔴 NEVER RETURNS ANYTHING OUTSIDE THE VOCABULARY. Null (the
 * customer column is nullable), undefined (the column is absent from a select), 0, or a value the
 * CHECK would refuse all read as 5 — the value every row holds today, so an unexpected shape can only
 * ever reproduce today's behaviour, never invent a new grid.
 */
export const normaliseInterval = (v: unknown): IntervalChoice => (isIntervalChoice(v) ? v : DEFAULT_INTERVAL)

// ── THE SETTINGS HINT (18 September 2026) ───────────────────────────────────────────────────────────
// A collection interval that is not a whole multiple of a cooking category's prep puts collection times
// BETWEEN batches: an order at such a time shares the grill with a batch that merely overlaps it, and
// the dots show it as full. Both Collection times boxes (Manage, dashboard) show ONE line saying so,
// for the longest-prep category that does not line up, and nothing when every cooking category does.
// Pure: no read, no query — the pages pass the categories they already hold.
export function misalignedCookingCategory(
  intervalMins: number,
  categories: ReadonlyArray<{ name: string; prep_secs?: number | null }>,
): { name: string; prepMins: number } | null {
  let worst: { name: string; prepMins: number } | null = null
  for (const c of categories) {
    const secs = Number(c.prep_secs) || 0
    if (secs <= 0) continue                                             // not a cooking category
    const prepMins = Math.max(1, Math.round(secs / 60))
    if (intervalMins % prepMins === 0) continue                          // lines up: every time is on a batch boundary
    if (!worst || prepMins > worst.prepMins) worst = { name: c.name, prepMins }
  }
  return worst
}
/** The one sentence the boxes show. */
export function collectionTimesHint(cat: { name: string; prepMins: number }): string {
  return `${cat.name} takes ${cat.prepMins} minutes to cook, so some times between batches will show as full.`
}

/** A van's resolved pair. `truck` is ALREADY the effective value — the override if set, else the
 *  customer value — so no caller ever has to remember the `?? customer` rule. */
export interface VanIntervals {
  /** truck_vans.collection_interval_mins — what a customer may pick. */
  customer: IntervalChoice
  /** operator_collection_interval_mins ?? collection_interval_mins — what the operator may pick. */
  truck: IntervalChoice
}

/** No van resolved. Both 5 — today's behaviour for every truck, and the answer this file returns for
 *  every failure as well, so an unreadable column can only ever reproduce today's grid. */
export const NO_VAN_INTERVALS: VanIntervals = { customer: DEFAULT_INTERVAL, truck: DEFAULT_INTERVAL }

/**
 * Read a van's two intervals with a capability probe.
 *
 * 🔴 THE MIGRATION IS APPLIED BY HAND, so there is a window in which this code is deployed and the
 * columns do not exist. In that window this must fall back to 5/5 — silently for the caller, LOUDLY in
 * the log — and never surface a 500. The two absent-column shapes are logged DISTINGUISHABLY because
 * they need different fixes:
 *   PGRST204  PostgREST's schema cache has not been reloaded → run `notify pgrst, 'reload schema'`.
 *   42703     Postgres itself has no such column → the migration has not been applied.
 * Any other error is logged as itself. Every failure returns NO_VAN_INTERVALS.
 *
 * ⚠️ IT IS A SEPARATE SELECT, NOT AN ADDITION TO AN EXISTING ONE, AND THAT IS THE POINT. The van reads
 * in /api/slots, /api/dashboard and eventKitchenCapacity are NAMED selects: adding these two columns to
 * any of them would make the WHOLE statement 42703 before the migration — which for eventKitchenCapacity
 * means customer placement stops resolving capacity at all. A separate tolerant read cannot do that.
 *
 * @param vanId the van the caller already resolved from its event. NULL ⇒ 5/5, no query.
 */
export async function readVanIntervals(supabase: SupabaseClient, vanId: string | null | undefined): Promise<VanIntervals> {
  if (!vanId) return NO_VAN_INTERVALS
  try {
    const { data, error } = await supabase
      .from('truck_vans')
      .select('collection_interval_mins, operator_collection_interval_mins')
      .eq('id', vanId)
      .maybeSingle()
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'PGRST204') console.warn(`[slot-interval] van ${vanId}: collection interval columns not in PostgREST's schema cache (PGRST204) — reload the schema; using 5/5`)
      else if (code === '42703') console.warn(`[slot-interval] van ${vanId}: collection interval columns absent (42703) — migration not applied; using 5/5`)
      else console.warn(`[slot-interval] van ${vanId}: interval read failed (${code ?? 'no code'}): ${error.message}; using 5/5`)
      return NO_VAN_INTERVALS
    }
    const row = data as { collection_interval_mins?: unknown; operator_collection_interval_mins?: unknown } | null
    if (!row) return NO_VAN_INTERVALS
    const customer = normaliseInterval(row.collection_interval_mins)
    // 🔴 NULL/undefined ⇒ FOLLOW THE CUSTOMER VALUE. Not normaliseInterval(override), which would read
    // NULL as 5 and give a customer-15 van a 5-minute operator grid.
    const override = row.operator_collection_interval_mins
    const truck = override === null || override === undefined ? customer : normaliseInterval(override)
    return { customer, truck }
  } catch (e) {
    console.warn(`[slot-interval] van ${vanId}: interval read threw; using 5/5:`, e instanceof Error ? e.message : String(e))
    return NO_VAN_INTERVALS
  }
}

/** What a batch interval read returned. `ok: false` means the columns could not be read AT ALL — the
 *  caller must then present every van at 5/null and say the setting is unavailable, never hide the van. */
export interface VanIntervalsBatch {
  ok: boolean
  /** 🔴 CARRIES THE RAW OVERRIDE AS WELL AS THE RESOLVED PAIR. The settings UI derives its tickbox from
   *  the override being non-null, so it needs the stored value, not `truck`. They are NOT
   *  interchangeable: an operator who ticks the box and leaves it on the customer value stores an
   *  override EQUAL to the customer value, and inferring "ticked" from `truck !== customer` would
   *  untick it on the next load. (That inference was written here first and is recorded because it
   *  type-checked and read plausibly.) */
  byVanId: Map<string, VanIntervals & { rawOverride: number | null }>
}

/**
 * Every van of one truck, in ONE capability-probed query.
 *
 * ── 🔴 WHY THIS EXISTS, AND IT IS NOT AN OPTIMISATION ───────────────────────────────────────────────
 * OBSERVED ON LOCALHOST, 17 September 2026: Manage → Settings showed NO VANS for test-truck. `get_vans`
 * had added the two interval columns to its NAMED select, and PostgREST fails the WHOLE statement with
 * 42703 when one named column does not exist — so the van list came back empty and with it every van's
 * Kitchen capacity box, offline protection, buzzers and display settings. Deployed ahead of the
 * migration that would have hidden Pizzeria Gusto's only van and its kitchen_capacity ceiling from its
 * own operator.
 *
 * 🔴 THE RULE THIS ENFORCES: THE VAN LIST MUST NEVER DEPEND ON THESE COLUMNS. The list is read with its
 * original column set; the intervals are read HERE, separately, and a failure degrades to 5/null —
 * which is what every van holds anyway — rather than to no vans.
 *
 * Failures are logged the same two ways readVanIntervals logs them, because they need different fixes:
 *   PGRST204  PostgREST's schema cache has not been reloaded → run `notify pgrst, 'reload schema'`.
 *   42703     Postgres itself has no such column → the migration has not been applied.
 */
export async function readVanIntervalsForTruck(supabase: SupabaseClient, truckId: string): Promise<VanIntervalsBatch> {
  const byVanId = new Map<string, VanIntervals & { rawOverride: number | null }>()
  try {
    const { data, error } = await supabase
      .from('truck_vans')
      .select('id, collection_interval_mins, operator_collection_interval_mins')
      .eq('truck_id', truckId)
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'PGRST204') console.warn(`[slot-interval] truck ${truckId}: collection interval columns not in PostgREST's schema cache (PGRST204) — reload the schema; every van reads 5/null`)
      else if (code === '42703') console.warn(`[slot-interval] truck ${truckId}: collection interval columns absent (42703) — migration not applied; every van reads 5/null`)
      else console.warn(`[slot-interval] truck ${truckId}: van interval read failed (${code ?? 'no code'}): ${error.message}; every van reads 5/null`)
      return { ok: false, byVanId }
    }
    for (const row of (data ?? []) as Array<{ id: string; collection_interval_mins?: unknown; operator_collection_interval_mins?: unknown }>) {
      const customer = normaliseInterval(row.collection_interval_mins)
      const override = row.operator_collection_interval_mins
      const hasOverride = override !== null && override !== undefined
      byVanId.set(row.id, {
        customer,
        truck: hasOverride ? normaliseInterval(override) : customer,
        rawOverride: hasOverride ? normaliseInterval(override) : null,
      })
    }
    return { ok: true, byVanId }
  } catch (e) {
    console.warn(`[slot-interval] truck ${truckId}: van interval read threw; every van reads 5/null:`, e instanceof Error ? e.message : String(e))
    return { ok: false, byVanId }
  }
}

// ══ THE EVENT LAYER ═════════════════════════════════════════════════════════════════════════════════

/** An event's stored pair. Both NULL ⇒ the event follows its van, which is every event today. */
export interface EventIntervalOverride {
  /** 🔴 THE SWITCH. Non-null ⇒ this event's pair is fully its own and the van is ignored for it. */
  collection_interval_mins_override?: number | null
  /** Meaningful ONLY when the customer override above is non-null — see applyEventIntervals. */
  operator_collection_interval_mins_override?: number | null
}

/** No event override could be read (or there is none). Distinct from `{ ok: true, override: null }`
 *  only in what the UI says: `ok: false` means the columns are unreadable, so the box must say so
 *  rather than offer controls over a value it cannot see. Ordering is unaffected either way. */
export interface EventIntervalRead {
  ok: boolean
  override: EventIntervalOverride | null
}

export const NO_EVENT_OVERRIDE: EventIntervalRead = { ok: true, override: null }

/**
 * 🔴 THE ONE PLACE THE THREE LAYERS MEET. Every reader resolves through this and nothing re-derives it.
 *
 * The rule, in full:
 *   event.collection_interval_mins_override === null  ⇒ the van's pair, untouched. Byte-identical to
 *                                                       the behaviour before the event layer existed.
 *   event.collection_interval_mins_override !== null  ⇒ {
 *                                                         customer: that value,
 *                                                         truck:    event.operator_…_override ?? that value
 *                                                       }
 *                                                       The VAN IS NOT CONSULTED. Not merged — ignored.
 *
 * ⚠️ THE `??` IS ON THE EVENT'S OWN CUSTOMER VALUE, NOT THE VAN'S. An event that overrides the customer
 * grid to 15 and leaves its operator column null gives the operator 15, NOT the van's operator value
 * and NOT 5. Falling back to the van there would produce a pair that exists in neither place — the
 * event's customer grid beside the van's operator grid — which is the one combination no operator asked
 * for and no screen displays.
 *
 * ⚠️ An operator override with a NULL customer override is INVALID (the save route rejects it). If one
 * ever reaches here — a hand-written row, a future writer — it is IGNORED and the van wins, because the
 * alternative is inventing a customer grid for it.
 */
export function applyEventIntervals(van: VanIntervals, override: EventIntervalOverride | null | undefined): VanIntervals {
  const customerRaw = override?.collection_interval_mins_override
  if (customerRaw === null || customerRaw === undefined) return van
  const customer = normaliseInterval(customerRaw)
  const op = override?.operator_collection_interval_mins_override
  return { customer, truck: op === null || op === undefined ? customer : normaliseInterval(op) }
}

/** True when the event carries its own pair. The dashboard's revert control is shown only then. */
export function hasEventOverride(override: EventIntervalOverride | null | undefined): boolean {
  const v = override?.collection_interval_mins_override
  return v !== null && v !== undefined
}

/**
 * Read ONE event's override pair, capability-probed.
 *
 * ⚠️ A SEPARATE SELECT, AND THE NAMED-SELECT RULE IS WHY. /api/dashboard reads truck_events with a
 * NAMED select whose own comment records that one absent column returns 42703 and fails the whole
 * statement onto "the silent-empty-board path". Adding these two columns there would blank an
 * operator's board the moment the code shipped ahead of the migration. This read cannot do that: every
 * failure returns "no override", so the event falls back to its van and ordering is untouched.
 *
 *   PGRST204  PostgREST's schema cache has not been reloaded → run `notify pgrst, 'reload schema'`.
 *   42703     Postgres itself has no such column → the migration has not been applied.
 */
export async function readEventIntervals(supabase: SupabaseClient, eventId: string | null | undefined): Promise<EventIntervalRead> {
  if (!eventId) return NO_EVENT_OVERRIDE
  try {
    const { data, error } = await supabase
      .from('truck_events')
      .select('collection_interval_mins_override, operator_collection_interval_mins_override')
      .eq('id', eventId)
      .maybeSingle()
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'PGRST204') console.warn(`[slot-interval] event ${eventId}: override columns not in PostgREST's schema cache (PGRST204) — reload the schema; the event follows its van`)
      else if (code === '42703') console.warn(`[slot-interval] event ${eventId}: override columns absent (42703) — migration not applied; the event follows its van`)
      else console.warn(`[slot-interval] event ${eventId}: override read failed (${code ?? 'no code'}): ${error.message}; the event follows its van`)
      return { ok: false, override: null }
    }
    return { ok: true, override: (data as EventIntervalOverride | null) ?? null }
  } catch (e) {
    console.warn(`[slot-interval] event ${eventId}: override read threw; the event follows its van:`, e instanceof Error ? e.message : String(e))
    return { ok: false, override: null }
  }
}

/**
 * THE RESOLVER EVERY READER CALLS: van + event, in one step, from ids the caller already has.
 * `vanId` and `eventId` come from the event the caller resolved by its own existing path — the same
 * van_id kitchen_capacity is read from. This function resolves no events and chooses no vans.
 */
export async function resolveIntervalsFor(
  supabase: SupabaseClient,
  vanId: string | null | undefined,
  eventId: string | null | undefined,
): Promise<VanIntervals & { fromEvent: boolean; eventReadOk: boolean }> {
  const van = await readVanIntervals(supabase, vanId)
  const ev = await readEventIntervals(supabase, eventId)
  return { ...applyEventIntervals(van, ev.override), fromEvent: hasEventOverride(ev.override), eventReadOk: ev.ok }
}

/** Every event of one truck that carries an override, for the dashboard's per-event box. One probed
 *  query, so a missing column costs the box and nothing else. */
export async function readEventIntervalsForTruck(supabase: SupabaseClient, truckId: string): Promise<{ ok: boolean; byEventId: Map<string, EventIntervalOverride> }> {
  const byEventId = new Map<string, EventIntervalOverride>()
  try {
    const { data, error } = await supabase
      .from('truck_events')
      .select('id, collection_interval_mins_override, operator_collection_interval_mins_override')
      .eq('truck_id', truckId)
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'PGRST204') console.warn(`[slot-interval] truck ${truckId}: event override columns not in PostgREST's schema cache (PGRST204) — reload the schema; every event follows its van`)
      else if (code === '42703') console.warn(`[slot-interval] truck ${truckId}: event override columns absent (42703) — migration not applied; every event follows its van`)
      else console.warn(`[slot-interval] truck ${truckId}: event override read failed (${code ?? 'no code'}): ${error.message}; every event follows its van`)
      return { ok: false, byEventId }
    }
    for (const row of (data ?? []) as Array<{ id: string } & EventIntervalOverride>) {
      byEventId.set(row.id, {
        collection_interval_mins_override: row.collection_interval_mins_override ?? null,
        operator_collection_interval_mins_override: row.operator_collection_interval_mins_override ?? null,
      })
    }
    return { ok: true, byEventId }
  } catch (e) {
    console.warn(`[slot-interval] truck ${truckId}: event override read threw; every event follows its van:`, e instanceof Error ? e.message : String(e))
    return { ok: false, byEventId }
  }
}
