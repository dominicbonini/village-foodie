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
import type { OfflineProtectionMode } from '@/lib/copy/offlineProtection'

/** Only the fields a resolver reads, so a caller may pass the row it already has. */
export type TypeFor = Pick<EventType,
  | 'buzzer_prompt' | 'takes_cash' | 'order_ready' | 'collection_interval_mins'
  | 'offline_protection' | 'offline_protection_mode' | 'offline_auto_reject_mins'>

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
 * Whether this event splits the paid action into Cash/Card:
 *
 *     event override  ??  type  ??  **THE VAN**  ??  truck default
 *
 * ── 🔴 THE VAN LINK, ADDED 12 OCTOBER 2026, AND THE DEFECT IT FIXES ───────────────────────────────
 * Dominic, on localhost: "Turning on 'Do you take cash?' for Van 1 also turned it on for Van 2."
 * It did, and the cause was that there was no per-van cash setting at all — `trucks.takes_cash` is
 * ONE column for the whole truck, so the Event types grid drew one switch per van column over a
 * single value and they moved together. (The second half of that report — "and showed Market
 * changing" — was the separate "faded follows Standard" rule; see `SERVICE_ROWS`.)
 *
 * 🔴 `truck_vans.takes_cash` IS NULLABLE WITH NO BACKFILL, which is what makes this change a no-op
 * for every existing truck: NULL falls through to `trucks.takes_cash` and this function returns
 * exactly what it returned before. Only a van the operator has explicitly set differs.
 * ⚠️ THE VAN SITS **BELOW** THE TYPE, NOT ABOVE IT. A type is a statement about THIS event ("at
 * festivals we take cash"); the van is the standing setup of the trailer running it. The more
 * specific statement wins, which is the order every other resolver in this file uses.
 *
 * ⚠️ OPERATOR-SIDE ONLY. `takes_cash` adds a BUTTON on the dashboard and the KDS; it is read by no
 * customer surface, it changes no price, and nothing in the fee engine may read it
 * (20260730_takes_cash_and_payment_method.sql:19-28).
 *
 * ⚠️ THE LAST LINK IS `?? false`, matching resolvePaidStep: "the state every truck is in today, in
 * which every paid-step affordance is inert".
 */
export function resolveTakesCashWithType(
  eventOverride: boolean | null | undefined,
  type: TypeFor | null | undefined,
  /**
   * 🔴 `truck_vans.takes_cash` FOR THE VAN RUNNING THIS EVENT. Omitted or null ⇒ the truck default,
   * which is every van before 20261012 is applied — so an omitted argument is today's behaviour and
   * no existing caller had to change to keep working.
   */
  vanDefault: boolean | null | undefined,
  truckDefault: boolean | null | undefined,
): boolean {
  return eventOverride ?? type?.takes_cash ?? vanDefault ?? truckDefault ?? false
}

/**
 * The same chain for a VAN with no event in sight — Settings' own per-van control.
 *
 * 🔴 IT IS THE TAIL OF THE FUNCTION ABOVE, NOT A SECOND EXPRESSION. Settings shows a van's cash
 * switch at the value that van will actually use, and if that were computed separately the screen and
 * the hatch could disagree about the same van.
 */
export function resolveVanTakesCash(
  vanDefault: boolean | null | undefined,
  truckDefault: boolean | null | undefined,
): boolean {
  return resolveTakesCashWithType(null, null, vanDefault, truckDefault)
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
// 5 · OFFLINE ORDER PROTECTION
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The van's defaults, as `truck_vans` holds them. */
export interface OfflineVanDefaults {
  auto_pause_on_offline?: boolean | null
  offline_protection_mode?: string | null
  offline_auto_reject_mins?: number | null
}

/** The event's own overrides, as `truck_events` holds them. */
export interface OfflineEventOverride {
  offline_protection_override?: boolean | null
  offline_protection_mode_override?: string | null
  offline_auto_reject_mins_override?: number | null
}

export interface ResolvedOffline {
  /** Does offline protection apply to this event at all? */
  enabled: boolean
  /** What it does when it applies. Meaningless when `enabled` is false — see below. */
  mode: OfflineProtectionMode
  /** The auto-reject delay. null = none stored anywhere, which means nothing auto-rejects. */
  autoRejectMins: number | null
}

const asMode = (v: unknown): OfflineProtectionMode | null =>
  v === 'pause' || v === 'no_auto_accept' ? v : null

/** 5-30, the bounds the van column, the CHECK and `set_offline_protection` all share. */
const asDelay = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 5 && v <= 30 ? v : null

/**
 * Offline order protection: the switch, the mode and the delay — each `event ?? type ?? van`.
 *
 * ── 🔴 THREE INDEPENDENT CHAINS, NOT ONE ──────────────────────────────────────────────────────────
 * This is the shape the feature already has and the shape this preserves. `set_offline_protection`
 * (app/api/dashboard/action/route.ts) treats the mode and the delay as "optional and independent":
 * either may arrive with or without the switch, and an absent one leaves its column untouched. So an
 * event may override the switch and inherit the mode, or override the mode and inherit the switch.
 * Resolving them as one unit would invent combinations no screen can produce and lose ones it can.
 *
 * ⚠️ THE MODE IS STILL RESOLVED WHEN THE SWITCH IS OFF, AND THAT IS DELIBERATE. `truck_vans`'s own
 * comment says the mode is "ignored entirely when the switch is OFF" — ignored by the MONITOR, which
 * is a statement about who acts on it, not about what it is. The screens show the stored mode so that
 * switching protection back on does not silently change what it will do, which is what returning a
 * hard-coded 'pause' here would cause.
 *
 * ⚠️ `?? 'pause'` IS THE LAST LINK ON THE MODE, matching `heartbeat-monitor/index.ts:106`
 * (`ev.offline_protection_mode_override ?? van.offline_protection_mode ?? 'pause'`) — "''pause'' is
 * what offline protection has always meant", per 20260818's header.
 *
 * ⚠️ THE DELAY'S LAST LINK IS `null`, NOT A DEFAULT. A van nobody has touched stores NULL and nothing
 * auto-rejects for it; inventing 15 here would start auto-rejecting orders for every truck that never
 * asked. The DEFAULT is written by the screens on the operator's own interaction, which is the rule
 * Settings › Kitchen and the dashboard already follow.
 *
 * ⚠️ WITH `type` NULL, ALL THREE REDUCE TO TODAY'S EXPRESSIONS EXACTLY. Proved against the pre-build
 * tree by scripts/event-types.cjs.
 */
export function resolveOfflineWithType(
  event: OfflineEventOverride | null | undefined,
  type: TypeFor | null | undefined,
  van: OfflineVanDefaults | null | undefined,
): ResolvedOffline {
  const enabled = event?.offline_protection_override
    ?? type?.offline_protection
    ?? van?.auto_pause_on_offline
    ?? false

  const mode = asMode(event?.offline_protection_mode_override)
    ?? asMode(type?.offline_protection_mode)
    ?? asMode(van?.offline_protection_mode)
    ?? 'pause'

  const autoRejectMins = asDelay(event?.offline_auto_reject_mins_override)
    ?? asDelay(type?.offline_auto_reject_mins)
    ?? asDelay(van?.offline_auto_reject_mins)
    ?? null

  return { enabled, mode, autoRejectMins }
}

/**
 * Which of offline protection's three columns this EVENT has set by hand.
 *
 * 🔴 USED BY THE SCREENS FOR THE "THIS EVENT" TAG, so the tag and the value come from one place. Any
 * one of the three being non-null is a hand change for the row, because the row is one row to an
 * operator even though it is three columns underneath.
 */
export function offlineIsHandChange(event: OfflineEventOverride | null | undefined): boolean {
  if (!event) return false
  return (event.offline_protection_override !== null && event.offline_protection_override !== undefined)
    || (event.offline_protection_mode_override !== null && event.offline_protection_mode_override !== undefined)
    || (event.offline_auto_reject_mins_override !== null && event.offline_auto_reject_mins_override !== undefined)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · WHAT THE SCREENS SAY
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
  /* ⚠️ ONE PHRASE FOR THE WHOLE OFFLINE ROW, because it is one row to an operator. "offline protection
   * off · pause · 15 mins" would read as three settings and two of them are meaningless on their own. */
  if (type.offline_protection === false) parts.push('offline protection off')
  else if (type.offline_protection === true || type.offline_protection_mode) {
    parts.push(type.offline_protection_mode === 'no_auto_accept'
      ? 'offline: keep taking orders'
      : 'offline: pause ordering')
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
  /* 🔴 THE OFFLINE ROW COUNTS ONCE, NOT THREE TIMES. Its three columns are one setting to the person
   * reading "2 of 5 service settings"; counting the mode and the delay separately would report a
   * number no screen shows. */
  if ((type.offline_protection !== null && type.offline_protection !== undefined)
    || (type.offline_protection_mode !== null && type.offline_protection_mode !== undefined)
    || (type.offline_auto_reject_mins !== null && type.offline_auto_reject_mins !== undefined)) n++
  return n
}

/** How many rows a type could change — the denominator in "2 of 5 service settings". */
export const SERVICE_ROW_COUNT = 5
