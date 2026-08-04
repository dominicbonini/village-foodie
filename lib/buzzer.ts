// ── BUZZER NUMBERS — ONE MODULE, EVERY SURFACE ───────────────────────────────────────────────────
// Physical buzzers/pagers handed to a customer at the hatch. The van carries a fixed rack numbered
// 1..buzzer_count; a number is handed out with an order and comes back when the customer collects.
//
// This module holds the four things that MUST NOT be re-derived at a call site:
//   1. BUZZER_IN_USE_STATUSES — which orders are still holding a buzzer.
//   2. resolveBuzzerPrompt    — van default + per-event override, one nullish chain.
//   3. assignBuzzer           — the server-side write, including clearing the number from another order.
//   4. buzzerPill             — the ready-toast pill, so the two surfaces cannot render it differently.
//
// No 'use client' and no server-only imports: the constants + resolver are imported by client
// components, and assignBuzzer takes the Supabase client as a parameter (a TYPE-ONLY import, erased at
// build, so the client bundle never pulls the SDK in). Same shape as lib/slot-bookings.ts.
// `react` is isomorphic and is imported for `createElement` alone — see buzzerPill.

import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── 🔴 THE IN-USE STATUS LIST. READ THIS BEFORE REUSING ANY OTHER STATUS ARRAY. ───────────────────
// A buzzer is IN THE CUSTOMER'S HAND from the moment it is handed over until they collect. So it is
// still in use at 'ready' — the food is on the counter and the customer has not walked up yet, which
// is precisely the window the buzzer exists for. It frees at 'collected', and at 'cancelled' /
// 'rejected' (the order is gone; the buzzer comes back to the rack).
//
// ⚠️ DO NOT GRAFT THIS ONTO THE OCCUPYING-STATUS LIST.
// ['pending', 'confirmed', 'modified', 'cooking'] appears VERBATIM in five places —
//   lib/slot-bookings.ts:226, lib/slot-bookings.ts:474, lib/capacity-breach.ts:30,
//   lib/slot-capacity.ts:39, components/dashboard/AddOrderPanel.tsx:845
// — and it EXCLUDES 'ready' on purpose: OVEN capacity frees the moment cooking finishes. That is the
// opposite of a buzzer, which is only just becoming useful at 'ready'. Reusing that list would mark a
// buzzer free while the customer is still holding it and hand the same number to the next order —
// two people, one number, mid-rush. The lists look alike, mean different things, and must stay apart.
export const BUZZER_IN_USE_STATUSES = [
  'pending',
  'confirmed',
  'modified',
  'cooking',
  'ready',
] as const

/** Set form, for the O(1) membership tests the grid and the server handler both do. */
export const BUZZER_IN_USE_STATUS_SET: ReadonlySet<string> = new Set(BUZZER_IN_USE_STATUSES)

/** True when this order is still holding its buzzer. Null/absent buzzer_number ⇒ false. */
export function holdsBuzzer(order: { status?: string | null; buzzer_number?: number | null }): boolean {
  return order.buzzer_number != null && BUZZER_IN_USE_STATUS_SET.has(order.status ?? '')
}

// ── SETTINGS RESOLUTION ──────────────────────────────────────────────────────────────────────────

/** The van's rack. Null/undefined ⇒ this van has no buzzers and the feature is entirely hidden. */
export interface BuzzerVan {
  buzzer_count?: number | null
}

/** The event's override. NULL/undefined ⇒ inherit the van-derived default. */
export interface BuzzerEvent {
  buzzer_prompt?: boolean | null
}

export interface ResolvedBuzzer {
  /** 1..N, or null when this van has no buzzers. Gates EVERY buzzer affordance. */
  buzzerCount: number | null
  /** Does a new order open the grid automatically? Never true when buzzerCount is null. */
  buzzerPrompt: boolean
}

/**
 * Resolve the buzzer settings for one event.
 *
 * ⚠️ `??` and NOT `||`, for the reason recorded at lib/payments/paid-step.ts:15-16 — an explicit
 * override of FALSE must be honoured, not fall through to the default. `||` would read `false` as
 * "unset" and silently re-inherit, which is the bug this chain avoids.
 *
 * The DEFAULT when no override is set is "a van that has buzzers prompts": there is no van-level
 * prompt column, so having a rack IS the intent to use it. The event override exists to turn that off
 * for one service, and nothing seeds it, so it expires by itself.
 *
 * buzzerCount null ⇒ buzzerPrompt false, unconditionally. An event override can never conjure a
 * prompt for a van with no buzzers to hand out.
 */
export function resolveBuzzerPrompt(
  van: BuzzerVan | null | undefined,
  event: BuzzerEvent | null | undefined,
): ResolvedBuzzer {
  const buzzerCount = van?.buzzer_count ?? null
  if (buzzerCount == null) return { buzzerCount: null, buzzerPrompt: false }
  return { buzzerCount, buzzerPrompt: event?.buzzer_prompt ?? true }
}

/** Upper bound on the rack size offered in Manage. Not a DB CHECK — see the migration comment. */
export const BUZZER_MAX_COUNT = 30

/** Default rack size when the operator first turns buzzers on. Chosen, not derived: the select is
 *  1..20 and sits immediately below the toggle, so this is a starting point they can see and change,
 *  not a value anything depends on. */
export const BUZZER_DEFAULT_COUNT = 10

// ── THE READY-TOAST PILL ─────────────────────────────────────────────────────────────────────────
// 🔴 ONE DEFINITION, BECAUSE TWO AGREEING LITERALS ARE TWO LITERALS THAT WILL DISAGREE. The dashboard
// and the KDS write their ready toast separately, and this markup was duplicated verbatim across both —
// identical by inspection, not by construction. The DEMO_COPY header (components/DemoGetStarted.tsx)
// records one string in this codebase diverging FOUR times, each fixed in one place and not the others,
// because nothing made the other copy visible while you edited one. This removes the possibility.
//
// ⚠️ RETURNED AS A NODE, NOT A CLASS STRING, AND THAT IS THE WHOLE POINT. Exporting only the classes
// would leave the `<span>` and the `🔔 ` prefix duplicated at both call sites — the bell, the spacing
// and the element are as driftable as the classes, and a literal would survive at each caller.
//
// ⚠️ createElement RATHER THAN JSX because this file is `.ts`, not `.tsx`. Renaming it would drag a
// server route (app/api/dashboard/action/route.ts imports assignBuzzer) onto a `.tsx` module for one
// span; a new component file would split the buzzer vocabulary across two homes. createElement is the
// smaller price.
//
// 🔴 SOLID WHITE, deliberately, and NOT the toast's own bg-white/20 undo treatment: the toast ground is
// `bg-green-600` with white text at 3.30:1 — below the 4.5:1 floor for its 14px bold text. This pill is
// slate-900 on solid white at 17.85:1, so the one number that cannot be re-derived is the most legible
// thing in the toast even though the text around it is not. That 3.30:1 is a real pre-existing defect on
// EVERY success toast and is deliberately not fixed here.
//
// ⚠️ TWO CHILDREN ('🔔 ' then the number), matching the JSX it replaces (`🔔 {n}`) exactly, so the
// rendered output is unchanged down to the text-node split.
export const BUZZER_PILL_CLASS = 'bg-white text-slate-900 rounded px-1.5 font-black'

/** The ready-toast buzzer pill. Callers pass the number only — never the markup. */
export function buzzerPill(buzzerNumber: number): ReactNode {
  return createElement('span', { className: BUZZER_PILL_CLASS }, '🔔 ', buzzerNumber)
}

// ── GRID STATE ───────────────────────────────────────────────────────────────────────────────────

/** One order currently holding a buzzer — what the grid shows in a taken cell. */
export interface BuzzerHolder {
  order_key: string
  /** Display number ("12"), NOT order_key. Human-facing. */
  id: string
  customer_name: string
}

/**
 * buzzer number → the order holding it, for ONE event. Orders outside the event, orders with no
 * buzzer, and orders whose status has freed the buzzer are all excluded by holdsBuzzer.
 *
 * `eventId` null ⇒ an empty map. A null-event order pools with nothing (the same rule
 * lib/slot-bookings.ts:213-215 applies to capacity), so there is no meaningful rack to show.
 */
export function buildBuzzerMap(
  orders: Array<{ order_key: string; id: string; customer_name: string; status?: string | null; event_id?: string | null; buzzer_number?: number | null }>,
  eventId: string | null,
): Map<number, BuzzerHolder> {
  const map = new Map<number, BuzzerHolder>()
  if (!eventId) return map
  for (const o of orders) {
    if (o.event_id !== eventId) continue
    if (!holdsBuzzer(o)) continue
    map.set(Number(o.buzzer_number), { order_key: o.order_key, id: String(o.id), customer_name: o.customer_name })
  }
  return map
}

// ── OPTIMISTIC BUZZER STATE ──────────────────────────────────────────────────────────────────────
// 🔴 WHY THIS EXISTS. Assigning a buzzer writes immediately, but the grid now STAYS OPEN afterwards,
// so there is a live window between "the write succeeded" and "fetchAll came back" in which the cells
// still render the PRE-CHANGE state. Worse, a fetchAll that STARTED before the write lands with stale
// rows: mergeOrders' version guard only rejects it when updated_at is strictly older, and on the
// equal/lateral branch (reconcileEqual) the READ wins — so a stale in-flight poll re-applied the old
// buzzer and the grid visibly reverted. Before the grid stayed open none of this was observable,
// because it closed before either could happen.
//
// 🔴 OPTIMISTIC, NOT DRAFT-AND-COMMIT. Every tap still writes the moment it happens. Done only CLOSES
// the grid — it must never become a save button. An operator who assigns a buzzer, hands the pager to
// the customer and walks off without pressing Done would otherwise have given out a buzzer with no
// record of it anywhere, which is the exact failure this whole feature exists to prevent.
//
// Modelled on updateCategoryAvailable (app/dashboard/[token]/page.tsx) — the closest existing pattern
// for an optimistic field on one row of a fetched collection: register a guard BEFORE the setState,
// apply the guard over every incoming read until the server echoes it, release on echo, and on a
// failed write drop the guard, revert, and TELL THE OPERATOR. Both surfaces call these two helpers, so
// the dashboard and the KDS cannot drift apart.

/** The minimum an order row needs for the two helpers below. */
export interface BuzzerPatchable {
  order_key: string
  buzzer_number?: number | null
}

/**
 * Look up a pending (written, not yet echoed) buzzer for an order.
 * Returns `undefined` when there is NO guard, and `null` when a DESELECT is pending — the two are
 * different and must not be collapsed, or a pending removal would read as "no guard" and the stale
 * server value would win straight back.
 */
export type PendingBuzzerPeek = (orderKey: string) => number | null | undefined

/**
 * Apply in-flight buzzer writes over a fresh read. Pure — returns a new array only where something
 * actually differs, so an unaffected poll keeps its object identities.
 * Call this AFTER mergeOrders, so the version guard runs first and this has the last word.
 */
export function applyPendingBuzzers<T extends BuzzerPatchable>(orders: T[], peek: PendingBuzzerPeek): T[] {
  if (!Array.isArray(orders)) return orders
  return orders.map(o => {
    const pendingValue = peek(o.order_key)
    if (pendingValue === undefined) return o                      // no guard → server value stands
    if ((o.buzzer_number ?? null) === pendingValue) return o      // already agrees → nothing to patch
    return { ...o, buzzer_number: pendingValue }
  })
}

/**
 * The buzzer an order currently holds, for the grid's `currentNumber` prop.
 *
 * 🔴 A PRESENCE TEST, NEVER A `??` CHAIN — this is the bug that made deselect fail. The call sites
 * used to read:
 *     orders.find(…)?.buzzer_number ?? target.buzzer_number ?? null
 * `??` falls through on `null`, and `null` is exactly what a DESELECT writes. So the moment the live
 * value became "holds no buzzer", the expression fell through to `target.buzzer_number` — the STALE
 * SNAPSHOT taken when the chip was tapped — and the cell stayed red with "This order". Every other
 * case worked, because every other case leaves a non-null live value. Same family as the
 * `??`-not-`||` note in lib/payments/paid-step.ts:15-16, in the other direction: there `false` is
 * meaningful, here `null` is.
 *
 * So: if the order is IN the list, its value wins — including `null`. The snapshot is used only when
 * the order is not in the list at all (it dropped out of the fetched window), which is a genuinely
 * different situation from "holds no buzzer".
 */
export function resolveCurrentBuzzer(
  orders: BuzzerPatchable[],
  target: { order_key: string; buzzer_number?: number | null },
): number | null {
  const live = Array.isArray(orders) ? orders.find(o => o.order_key === target.order_key) : undefined
  return live ? (live.buzzer_number ?? null) : (target.buzzer_number ?? null)
}

/**
 * The FULL optimistic effect of one buzzer write, as order_key → desired value, plus the prior values
 * to revert to. Mirrors what assignBuzzer does server-side, so local state matches the committed state
 * without waiting for a refetch:
 *   • the target order gets `buzzerNumber`, and
 *   • any OTHER in-use order in the SAME event holding that number gets `null` (it was taken from them).
 * Shared so the dashboard and the KDS cannot diverge on what "immediately" means.
 */
export function planOptimisticBuzzer<T extends BuzzerPatchable & { event_id?: string | null; status?: string | null }>(
  orders: T[],
  orderKey: string,
  buzzerNumber: number | null,
): { next: Record<string, number | null>; prior: Record<string, number | null> } {
  const list = Array.isArray(orders) ? orders : []
  const target = list.find(o => o.order_key === orderKey)
  const next: Record<string, number | null> = { [orderKey]: buzzerNumber }
  const prior: Record<string, number | null> = { [orderKey]: target?.buzzer_number ?? null }
  const eventId = target?.event_id ?? null
  if (buzzerNumber != null && eventId) {
    for (const o of list) {
      if (o.order_key === orderKey) continue
      if (o.event_id !== eventId) continue
      if ((o.buzzer_number ?? null) !== buzzerNumber) continue
      if (!BUZZER_IN_USE_STATUS_SET.has(o.status ?? '')) continue
      next[o.order_key] = null
      prior[o.order_key] = o.buzzer_number ?? null
    }
  }
  return { next, prior }
}

/**
 * Which guards the SERVER has now caught up on, so the caller can release them.
 * ⚠️ Judged against the RAW SERVER ROWS, never against merged client state — the guard exists
 * precisely because client state may still be carrying the optimistic value, so comparing against it
 * would release every guard immediately and defeat the whole mechanism.
 */
export function echoedBuzzerKeys(serverOrders: BuzzerPatchable[], peek: PendingBuzzerPeek): string[] {
  if (!Array.isArray(serverOrders)) return []
  const out: string[] = []
  for (const o of serverOrders) {
    const pendingValue = peek(o.order_key)
    if (pendingValue === undefined) continue
    if ((o.buzzer_number ?? null) === pendingValue) out.push(o.order_key)
  }
  return out
}

// ── THE SERVER WRITE ─────────────────────────────────────────────────────────────────────────────

export interface AssignBuzzerResult {
  /** Did the TARGET end up with the buzzer? False only on a replay it lost on placed_at. */
  assigned: boolean
  /** The order the number was taken FROM, if any — so the caller can report it. */
  clearedFrom: { order_key: string; id: string } | null
  /** The order left WITHOUT a buzzer by automatic conflict resolution (never by a confirmed take).
   *  May be the target itself when the replay lost. Drives the operator banner. */
  lost: { order_key: string; id: string } | null
}

/**
 * Set `buzzer_number` on one order, clearing the same number from any OTHER order in the same event
 * that is still holding it. Writes NOTHING else — no status, no timestamps, no capacity, no email.
 *
 * ⚠️ PHASE 2 REPLACES THIS WITH AN RPC. Today this is TWO sequential statements from the API route,
 * so a failure between them can leave the number cleared from the old order but not yet set on the
 * new one. That window is small and the operator-visible outcome is a buzzer showing as free when it
 * is in a customer's hand — recoverable by re-assigning, and strictly better than the reverse order
 * (which would show the same number on two cards). The clear runs FIRST for that reason. Phase 2
 * folds both updates into a single plpgsql function so the pair is atomic, following the
 * place_order_atomic pattern (supabase/migrations/20260728_orders_total_minor_deal_savings.sql:59).
 *
 * ⚠️ Uniqueness is enforced HERE and in the grid, not by a DB constraint — see the migration comment
 * on orders.buzzer_number for why a unique index would 500 the confirmed take-it path.
 *
 * `buzzerNumber` null clears this order's buzzer and touches nothing else.
 */
export async function assignBuzzer(
  supabase: SupabaseClient,
  args: {
    truckId: string
    eventId: string | null
    orderKey: string
    buzzerNumber: number | null
    /** TRUE only for an offline op being replayed. Switches the RPC from "the operator confirmed this
     *  take, just do it" to "nobody was asked — arbitrate on placed_at and flag the loser". */
    replay?: boolean
  },
): Promise<AssignBuzzerResult> {
  const { truckId, eventId, orderKey, buzzerNumber, replay = false } = args

  // ── ONE RPC, ONE TRANSACTION (phase 2) ─────────────────────────────────────────────────────────
  // This used to be two sequential UPDATEs from the route, with the clear deliberately first and a
  // documented window in which a buzzer could read as free while a customer held it. That window is
  // closed: assign_buzzer_atomic does both rows in one transaction, so the number is never on two
  // orders and never on neither.
  // It also owns REPLAY CONFLICT RESOLUTION (later placed_at keeps the buzzer) — see the migration
  // 20260804_assign_buzzer_atomic.sql, including why wall-clock is acceptable HERE and nowhere else
  // in offline replay.
  const { data, error } = await supabase.rpc('assign_buzzer_atomic', {
    p_truck_id: truckId,
    p_event_id: eventId,
    p_order_key: orderKey,
    p_buzzer: buzzerNumber,
    p_replay: replay,
  })
  if (error) throw new Error(error.message)
  const r = (data ?? {}) as { assigned?: boolean; cleared_from?: { order_key: string; id: string } | null; lost?: { order_key: string; id: string } | null }
  return {
    assigned: r.assigned !== false,
    clearedFrom: r.cleared_from ? { order_key: r.cleared_from.order_key, id: String(r.cleared_from.id) } : null,
    lost: r.lost ? { order_key: r.lost.order_key, id: String(r.lost.id) } : null,
  }
}
