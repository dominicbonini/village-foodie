// lib/event-types/resolve.ts — the four service settings, resolved. ONE function each.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE RULE, ONCE, FOR ALL FOUR
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//     effective = the event's own hand-set override  ??  the type's value  ??  today's default
//
// Three properties follow, and all three come from NOT writing code:
//   • A TRUCK WITH NO TYPES IS UNTOUCHED. With `type` null every function below reduces to the exact
//     expression its caller used before this build. That is asserted byte-for-byte by
//     scripts/event-types.cjs, not claimed here.
//   • HAND CHANGES WIN. The truck's change on one event outranks the type, always, so switching an
//     event's type never loses work they did on that event.
//   • SWITCHING TYPE IS ONE COLUMN WRITE. Nothing was copied onto the event, so there is nothing to
//     re-apply and nothing to unwind.
//
// ⚠️ `??` AND NEVER `||`, EVERY TIME. `false` is a real instruction in this vocabulary — "switch this
// off for this type" — and `||` reads it as unset and silently re-inherits the default. That is the
// bug lib/payments/paid-step.ts:15-16 records, and it would be invisible: the setting would simply
// never take effect.
//
// ⚠️ PURE. No database, no network, no clock. Every input is passed in. lib/event-types/read.ts does
// the reading; this decides.

/* 🔴 FROM THE LEAF, NOT FROM lib/slot-interval.ts. That file imports THIS one, so importing it back
 * would be a cycle — see lib/slot-interval-core.ts's header for why one that "works" was not left. */
import { normaliseInterval, type VanIntervals } from '@/lib/slot-interval-core'
import type { EventType } from './types'

/** Only the fields a resolver reads, so a caller may pass the row it already has. */
export type TypeFor = Pick<EventType, 'buzzer_prompt' | 'takes_cash' | 'order_ready' | 'collection_interval_mins'>

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE BUZZER PROMPT
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The after-order buzzer prompt: event override ?? type ?? "this van has buzzers".
 *
 * 🔴 A VAN WITH NO RACK STILL WINS, AND THAT IS NOT A SPECIAL CASE — IT IS THE SUBJECT. `buzzerCount`
 * null means there are no buzzers to hand out, so there is nothing a prompt could ask for. A type
 * cannot conjure a rack any more than an event override can; this function is only ever asked the
 * question once the caller knows the van has one (lib/buzzer.ts returns early otherwise).
 *
 * ⚠️ THE DEFAULT IS `true`, NOT `false`. There is no van-level prompt column: having a rack IS the
 * intent to use it. That is lib/buzzer.ts's rule and it is preserved exactly — passing `type` null
 * gives `event?.buzzer_prompt ?? true`, which is what that file computed before this build.
 */
export function resolveBuzzerPromptWithType(
  eventOverride: boolean | null | undefined,
  type: TypeFor | null | undefined,
): boolean {
  return eventOverride ?? type?.buzzer_prompt ?? true
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · TAKE CASH
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Whether this event splits the paid action into Cash/Card: event override ?? type ?? truck default.
 *
 * ⚠️ OPERATOR-SIDE ONLY. `takes_cash` adds a BUTTON on the dashboard and the KDS; it is read by no
 * customer surface, it changes no price, and nothing in the fee engine may read it
 * (20260730_takes_cash_and_payment_method.sql:19-28). So a type setting it cannot affect what a
 * customer is charged or shown — which is why it is safe in a stage that explicitly does no pricing.
 *
 * ⚠️ THE LAST LINK IS `?? false`, matching resolvePaidStep: "the state every truck is in today, in
 * which every paid-step affordance is inert".
 */
export function resolveTakesCashWithType(
  eventOverride: boolean | null | undefined,
  type: TypeFor | null | undefined,
  truckDefault: boolean | null | undefined,
): boolean {
  return eventOverride ?? type?.takes_cash ?? truckDefault ?? false
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · 🔴 THE "MARK READY" STEP — THE ONE THAT NEEDED A SCHEMA CHANGE TO WORK AT ALL
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Who wrote `truck_events.order_ready_override`. See the migration's section 3. */
export type OrderReadySource = 'seed' | 'truck' | null | undefined

/**
 * The mark-ready step: event HAND CHANGE ?? type ?? van default.
 *
 * ── 🔴 WHY THIS ONE IS DIFFERENT ───────────────────────────────────────────────────────────────────
 * `order_ready_override` is the only per-event override that is SEEDED at creation by all three real
 * creation paths and BULK-WRITTEN onto every event when the van default flips
 * (app/api/manage/route.ts:1981-1988). So it is never null in practice, and under a plain
 * `override ?? type ?? default` chain **a type could never win for this setting** — it would be
 * offered on the type screen and silently do nothing.
 *
 * `order_ready_source` is what tells a CHOICE from a DEFAULT-OF-THE-DAY:
 *   • 'truck' — the dashboard's per-event toggle wrote it. A hand change. It wins.
 *   • 'seed'  — a creation path or the Settings master switch wrote it. Not a statement about this
 *               event, so the type outranks it.
 *   • null    — not recorded. Every row from before this build.
 *
 * ── 🔴 THE TWO RULES THAT KEEP TODAY'S TRUCKS EXACTLY AS THEY ARE ─────────────────────────────────
 * 1. **NO TYPE ⇒ `order_ready_source` IS NOT READ AT ALL**, and this returns `override ?? vanDefault`,
 *    which is character-for-character what app/api/dashboard/route.ts:635 computed before this build.
 *    An untyped event cannot be affected by any of this, whatever its source column says.
 * 2. **A TYPE WITH `source` NULL ⇒ THE STORED VALUE IS INFERRED**, because a pre-build dashboard
 *    toggle is genuinely indistinguishable from a seed. If the stored value DIFFERS from the van's
 *    current default, somebody chose it and it wins. If it EQUALS the default, it cannot be told from
 *    a seed and the type wins.
 *    ⚠️ THE INDISTINGUISHABLE CASE IS HARMLESS BY CONSTRUCTION. Where the stored value equals the van
 *    default, "the truck chose the default" and "nobody chose anything" are the same answer for every
 *    untyped event; and for a typed event, choosing the default a month ago is a weaker statement
 *    about today's festival than the type the truck just picked for it. It is stated here rather than
 *    hidden because it IS a judgement, and it is the only one in this file.
 */
export function resolveOrderReadyWithType(
  eventOverride: boolean | null | undefined,
  source: OrderReadySource,
  type: TypeFor | null | undefined,
  vanDefault: boolean | null | undefined,
): boolean {
  const fallback = vanDefault ?? false

  /* 🔴 RULE 1. The untyped path is a separate, earlier return so that nothing below it — not the
   * source column, not the inference — can reach an untyped event. */
  if (!type) return eventOverride ?? fallback

  if (eventOverride === null || eventOverride === undefined) {
    // No stored value at all: the type is unopposed.
    return type.order_ready ?? fallback
  }
  if (source === 'truck') return eventOverride                    // a deliberate per-event choice
  if (source === 'seed') return type.order_ready ?? fallback      // not a choice; the type outranks it
  // RULE 2: source not recorded. Differs from the default ⇒ somebody chose it.
  if (eventOverride !== fallback) return eventOverride
  return type.order_ready ?? fallback
}

/**
 * Is this event's mark-ready value a HAND CHANGE, by the same rules?
 *
 * 🔴 USED BY THE SCREENS, NOT BY THE RESOLVER, so the "THIS EVENT" badge on the dashboard and the
 * "N settings changed for this event only" count cannot disagree with what is actually being drawn.
 * Deriving the badge from a second expression is how a screen ends up labelling a value it is not
 * using.
 */
export function orderReadyIsHandChange(
  eventOverride: boolean | null | undefined,
  source: OrderReadySource,
  type: TypeFor | null | undefined,
  vanDefault: boolean | null | undefined,
): boolean {
  if (!type) return eventOverride !== null && eventOverride !== undefined
  if (eventOverride === null || eventOverride === undefined) return false
  if (source === 'truck') return true
  if (source === 'seed') return false
  return eventOverride !== (vanDefault ?? false)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE CUSTOMER COLLECTION GRID
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The event's own pair, as `applyEventIntervals` reads it. */
export interface EventIntervalPair {
  collection_interval_mins_override?: number | null
  operator_collection_interval_mins_override?: number | null
}

/**
 * The collection grid: the event's own pair ?? the type's customer value ?? the van's pair.
 *
 * 🔴 THE TYPE SUPPLIES THE CUSTOMER GRID ONLY, AND THE OPERATOR GRID FOLLOWS IT — which is exactly
 * what an event override does today. `applyEventIntervals` (lib/slot-interval.ts:238) returns
 * `{ customer, truck: op ?? customer }` for the same stated reason: the event's customer grid beside
 * the van's operator grid "is the one combination no operator asked for and no screen displays". A
 * type must not invent that combination either.
 *
 * ⚠️ THE EVENT'S PAIR IS CHECKED ON ITS CUSTOMER COLUMN, not on the operator one — an operator
 * override with a null customer override is an invalid pair the save route rejects and
 * `applyEventIntervals` ignores. The same test here means the two functions agree about what "the
 * event has its own grid" means.
 * ⚠️ `normaliseInterval` COERCES ANYTHING OUTSIDE THE FIVE CHOICES to the default, which is why the
 * type's column carries no CHECK constraint.
 */
export function resolveIntervalsWithType(
  van: VanIntervals,
  eventOverride: EventIntervalPair | null | undefined,
  type: TypeFor | null | undefined,
): VanIntervals {
  const customerRaw = eventOverride?.collection_interval_mins_override
  if (customerRaw !== null && customerRaw !== undefined) {
    /* The event's own grid wins — identical to applyEventIntervals, including the operator rule. */
    const customer = normaliseInterval(customerRaw)
    const op = eventOverride?.operator_collection_interval_mins_override
    return { customer, truck: op === null || op === undefined ? customer : normaliseInterval(op) }
  }
  const fromType = type?.collection_interval_mins
  if (fromType !== null && fromType !== undefined) {
    const customer = normaliseInterval(fromType)
    return { customer, truck: customer }
  }
  return van
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · WHAT THE SCREENS SAY
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A one-line summary of what a type changes, for the Add event picker and the dashboard chip.
 *
 * ⚠️ IT NAMES ONLY SETTINGS THIS BUILD RESOLVES. The AddEventType board's line reads "14 of 22 items ·
 * prices +£1.00 · buzzers on · Festival meal deal"; three of those four are later stages, and writing
 * them now would promise a truck something the next order does not do.
 * ⚠️ A TYPE THAT CHANGES NOTHING SAYS SO, rather than rendering an empty line that reads as a loading
 * state.
 */
export function summariseType(type: TypeFor | null | undefined): string {
  if (!type) return 'Your normal setup'
  const parts: string[] = []
  if (type.buzzer_prompt !== null && type.buzzer_prompt !== undefined) {
    parts.push(type.buzzer_prompt ? 'buzzers on' : 'buzzers off')
  }
  if (type.takes_cash !== null && type.takes_cash !== undefined) {
    parts.push(type.takes_cash ? 'take cash on' : 'take cash off')
  }
  if (type.order_ready !== null && type.order_ready !== undefined) {
    parts.push(type.order_ready ? 'mark-ready step on' : 'mark-ready step off')
  }
  if (type.collection_interval_mins !== null && type.collection_interval_mins !== undefined) {
    parts.push(`collection every ${normaliseInterval(type.collection_interval_mins)} min`)
  }
  return parts.length ? parts.join(' · ') : 'Same as Standard'
}

/** How many of a type's four settings differ from Standard — the "Changes" tag on the setup screen. */
export function changedCount(type: TypeFor | null | undefined): number {
  if (!type) return 0
  let n = 0
  if (type.buzzer_prompt !== null && type.buzzer_prompt !== undefined) n++
  if (type.takes_cash !== null && type.takes_cash !== undefined) n++
  if (type.order_ready !== null && type.order_ready !== undefined) n++
  if (type.collection_interval_mins !== null && type.collection_interval_mins !== undefined) n++
  return n
}
