// lib/private-events/type.ts — the built-in Private type row, created lazily and exactly once.
//
// 🔴 ONE PER TRUCK, AND THE UNIQUENESS IS THE DATABASE'S JOB, NOT THIS FILE'S.
// `event_types_one_private_per_truck_uidx` is a PARTIAL unique index on `(truck_id) where kind =
// 'private'`, so a second insert raises **23505** and this file's only job is to treat that as
// "somebody else just made it" and re-read.
//
// ⛔ AND IT MUST NEVER BE AN UPSERT. PostgREST's `on_conflict=` becomes `ON CONFLICT (cols)`, and
// conflict inference CANNOT target a partial index — that is 42P10, the error 20261013 was written to
// fix, and this index has exactly the shape that caused it. SELECT-then-INSERT with a 23505 retry is
// the correct pattern for a partial unique, and `scripts/event-pricing.cjs` §7b proves no `onConflict`
// anywhere in `app/` or `lib/` targets a partial index.

import type { SupabaseClient } from '@supabase/supabase-js'
import { PRIVATE_TYPE_NAME } from './copy'

/** Postgres' unique-violation code. */
const UNIQUE_VIOLATION = '23505'

const NOT_THERE = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

export interface PrivateTypeRow {
  id: string
  truck_id: string
  name: string
  kind: string
  sort_order: number
  private_link_ordering: boolean | null
  buzzer_prompt: boolean | null
  takes_cash: boolean | null
  order_ready: boolean | null
  collection_interval_mins: number | null
}

const COLS =
  'id, truck_id, name, kind, sort_order, private_link_ordering, ' +
  'buzzer_prompt, takes_cash, order_ready, collection_interval_mins'

/** Read the truck's Private type, or null. ⚠️ Never creates anything. */
export async function readPrivateType(
  supabase: SupabaseClient,
  truckId: string,
): Promise<PrivateTypeRow | null> {
  const { data, error } = await supabase
    .from('event_types')
    .select(COLS)
    .eq('truck_id', truckId)
    .eq('kind', 'private')
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as PrivateTypeRow
}

/**
 * The truck's Private type, created if it is not there yet.
 *
 * `serviceValues` is Van 1's RESOLVED service settings — the same copy a brand-new custom type gets
 * (§70.10: "a new type is a COPY of Van 1's resolved values"). Private is a type like any other in
 * that respect; it differs only in being built in and in carrying the link/QR switch.
 *
 * ⚠️ RETURNS NULL RATHER THAN THROWING WHEN THE MIGRATION IS ABSENT. The Event types grid is an
 * operator screen; it must render and say the feature is not available, not 500.
 *
 * ⛔ IT WILL NOT CREATE A ROW FOR A TRUCK YOU DID NOT MEAN. Every caller passes the token's own truck
 * id — there is no branch here that could reach another one, which is what keeps "never write on
 * Gusto's behalf" true while testing on Pizza Kitchen.
 */
export async function ensurePrivateType(
  supabase: SupabaseClient,
  truckId: string,
  serviceValues: Partial<Pick<PrivateTypeRow,
    'buzzer_prompt' | 'takes_cash' | 'order_ready' | 'collection_interval_mins'>> = {},
): Promise<PrivateTypeRow | null> {
  const existing = await readPrivateType(supabase, truckId)
  if (existing) return existing

  /* ── 🔴 THE "ALREADY CALLED IT PRIVATE" CASE, AND WHY IT ADOPTS RATHER THAN DUPLICATES ────────
   * `event_types_truck_name_uidx` is unique on `(truck_id, lower(name))`, so a truck that had already
   * made a CUSTOM type called "Private" would make the insert below fail on the NAME index — and a
   * grid showing two columns headed "Private" would be indistinguishable to the operator anyway.
   * So such a row is PROMOTED to the built-in: it is plainly what they meant by it, its service
   * settings are kept, and no second column appears.
   * ⚠️ NO TRUCK HAS ONE TODAY (test-kitchen's only type is "Market"), so this path is exercised by
   * scripts/private-events.cjs rather than by production — which is exactly why it is written down. */
  const { data: named } = await supabase
    .from('event_types')
    .select(COLS)
    .eq('truck_id', truckId)
    .ilike('name', PRIVATE_TYPE_NAME)
    .maybeSingle()

  if (named) {
    const { data: promoted, error: pErr } = await supabase
      .from('event_types')
      .update({ kind: 'private', updated_at: new Date().toISOString() })
      .eq('id', (named as unknown as { id: string }).id)
      .eq('truck_id', truckId)
      .select(COLS)
      .single()
    if (!pErr && promoted) return promoted as unknown as PrivateTypeRow
    /* A 23505 here means another request promoted a different row first. Re-read and take theirs. */
    return await readPrivateType(supabase, truckId)
  }

  /* 🔴 LAST, SO PRIVATE IS THE RIGHTMOST COLUMN. `sort_order` is the grid's left-to-right order, so
   * the built-in sits after every custom type by taking max+1 at creation.
   * ⚠️ AND THE GRID DOES NOT RELY ON THIS ALONE — it sorts `kind='private'` last explicitly, because
   * a custom type created afterwards would otherwise get a higher sort_order and jump past it. This
   * is the sensible initial value, not the guarantee. */
  const { data: last } = await supabase
    .from('event_types')
    .select('sort_order')
    .eq('truck_id', truckId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = ((last as unknown as { sort_order: number } | null)?.sort_order ?? 0) + 1

  const { data: made, error } = await supabase
    .from('event_types')
    .insert({
      truck_id: truckId,
      name: PRIVATE_TYPE_NAME,
      kind: 'private',
      sort_order: sortOrder,
      buzzer_prompt: serviceValues.buzzer_prompt ?? null,
      takes_cash: serviceValues.takes_cash ?? null,
      order_ready: serviceValues.order_ready ?? null,
      collection_interval_mins: serviceValues.collection_interval_mins ?? null,
    })
    .select(COLS)
    .single()

  if (!error && made) return made as unknown as PrivateTypeRow

  /* ── 🔴 23505 IS THE EXPECTED RACE, NOT A FAULT ──────────────────────────────────────────────
   * Two requests can reach the insert at once — the grid loading in two tabs is enough. The partial
   * unique index refuses the second, and the right answer is the row the first one made.
   * ⚠️ EITHER INDEX MAY HAVE RAISED IT: the one-private-per-truck index, or the name index if a
   * "Private" row appeared between the ilike above and here. Re-reading by `kind` handles the first;
   * the second resolves on the next call through the adoption branch. */
  if (error?.code === UNIQUE_VIOLATION) return await readPrivateType(supabase, truckId)

  if (error && !NOT_THERE.has(error.code || '')) {
    console.error(`[private-events] ensurePrivateType(${truckId}) failed: ${error.code} ${error.message}`)
  }
  return null
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE GRID'S EXTRA COLUMNS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * `kind` and `private_link_ordering` for every one of a truck's types, as a map.
 *
 * ⛔ A SEPARATE PROBED READ, AND IT MUST STAY SEPARATE. `lib/event-types/read.ts`'s `TYPE_COLS` also
 * feeds the SERVICE resolver — the one that supplies collection times, the mark-ready step and
 * offline protection to a live event. Naming `kind` there would mean a missing 20261014 failed that
 * select and took all of them down: a private-events migration breaking the collection grid. Two
 * reads; one blast radius each. That is the same argument `lib/event-pricing/read.ts` makes.
 *
 * ⚠️ FAILS **OPEN** HERE, AND THAT IS NOT AN INCONSISTENCY. Everything in
 * `lib/private-events/read.ts` fails closed because it decides what the PUBLIC sees. This decides
 * what the OPERATOR'S GRID DRAWS, and the safe answer for a screen is "no Private column" — the
 * feature is simply not available yet, which is true. Nothing is published either way.
 */
export async function readTypeKinds(
  supabase: SupabaseClient,
  truckId: string,
): Promise<{ ok: boolean; byId: Map<string, { kind: 'custom' | 'private'; private_link_ordering: boolean }> }> {
  const byId = new Map<string, { kind: 'custom' | 'private'; private_link_ordering: boolean }>()
  const { data, error } = await supabase
    .from('event_types')
    .select('id, kind, private_link_ordering')
    .eq('truck_id', truckId)
  if (error) {
    if (!NOT_THERE.has(error.code || '')) {
      console.warn(`[private-events] readTypeKinds(${truckId}) failed: ${error.code} ${error.message}`)
    }
    return { ok: false, byId }
  }
  for (const r of (data as unknown as Array<{ id: string; kind: string; private_link_ordering: boolean }> | null) ?? []) {
    byId.set(r.id, {
      kind: r.kind === 'private' ? 'private' : 'custom',
      private_link_ordering: r.private_link_ordering !== false,
    })
  }
  return { ok: true, byId }
}
