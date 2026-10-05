// ── THE PAID-STEP RESOLVER — ONE PLACE, EIGHT CALLERS ───────────────────────────────────────────────
// `show_paid_step` AND `takes_cash` are both TRUCK DEFAULTS with a PER-EVENT OVERRIDE.
// This module is the ONLY place that decides which value applies. Every consumer — the order card, the
// Add Order confirm bar, the dashboard state, the Settings render, and the two SERVER-side reads in
// `undo_collected` and the walk-up paid-at-order path — calls resolvePaidStep().
//
// 🔴 DO NOT RESOLVE THIS INLINE ANYWHERE. Two of the callers are server-side and two are client-side,
// and if they ever disagree the card offers "Mark paid" while `undo_collected` reverses both stages (or
// the reverse). That is the silent client/server divergence this codebase keeps rediscovering; a single
// resolver makes it impossible by construction rather than by discipline.
//
// ── NULLABLE-MEANS-INHERIT, RESOLVED AT READ TIME ───────────────────────────────────────────────────
//   showPaidStep = event.show_paid_step_override ?? truck.show_paid_step ?? false
//   takesCash    = event.takes_cash_override ?? type ?? THE VAN ?? truck.takes_cash ?? false
//                  (the VAN link added 5 October 2026 — truck_vans.takes_cash, nullable, no backfill)
// `??` and not `||`: an explicit override of FALSE must be honoured, not fall through to the default.
// `||` would treat `false` as "unset" and silently re-inherit — the bug this nullish chain avoids.
//
// ⚠️ DELIBERATELY UNLIKE `order_ready_override`, WHICH THIS OTHERWISE MIRRORS.
// That column is SEEDED at event creation and BULK-WRITTEN onto every existing event when the truck
// default flips (app/api/manage/route.ts:~981, "they reset to the new value, by design"). Correct for
// the order-ready step; WRONG here. An operator who set Saturday's festival to take payment at order
// must not lose that because they changed their general default a week later.
// So: NO seeding at event creation, NO bulk write. Null-means-inherit gives the right behaviour for
// free — changing the truck default reaches every event that has NOT been explicitly overridden, and
// leaves the overridden ones alone. It also means an override never carries forward to the next event,
// because a new event simply has no row value. Both properties come from doing nothing.
//
// ── BOTH SETTINGS ARE TRUCK DEFAULT + PER-EVENT OVERRIDE ────────────────────────────────────────────
// ⚠️ takes_cash WAS truck-level only, on the reasoning that whether a truck accepts cash is a property
// of the BUSINESS rather than of a pitch. That reasoning was INCOMPLETE and the decision was reversed on
// 30 July: **if the card terminal fails mid-service the operator needs cash enabled for TONIGHT, from
// the dashboard, without going into Manage.** That is a real event-level need, and a time-critical one.
// The override expires by itself — nothing is seeded, so the next event inherits the truck default
// again. Do not build an expiry mechanism; the absence of seeding IS the expiry.
//
// ── ⚠️ completion_presses IS A THIRD, INDEPENDENT SETTING — NOT A RENAME OF show_paid_step ──────────
// `show_paid_step` decides what the ADD ORDER panel offers (a Confirm button, so an order can be placed
// unpaid). `completion_presses` decides how an UNPAID order is COMPLETED on the card — one press or two.
// They were one boolean until 10 August 2026 and are now two settings, deliberately: a truck that never
// places an unpaid order still receives them from the customer path, so the two questions have different
// answers. Neither is derived from the other at read time.
// 🔴 TRUCK-LEVEL ONLY — no `completion_presses_override`, and do not add one without reading the
// reasoning in supabase/migrations/20260810_trucks_completion_presses.sql: this setting decides what
// `undo_collected` REVERSES, so flipping it mid-event can make an undo delete an hour-old payment.
/** The truck-level defaults. All optional so a partially-hydrated truck object is safe. */
import { resolveTakesCashWithType, type TypeFor } from '@/lib/event-types/resolve'

export interface PaidStepTruck {
  show_paid_step?: boolean | null
  takes_cash?: boolean | null
  completion_presses?: CompletionPresses | null
}

/** One press ("Mark paid and collected") or two ("Mark paid" then "Collected"). */
export type CompletionPresses = 'one' | 'two'

/** The event's overrides. NULL/undefined on any = inherit that truck default. */
export interface PaidStepEvent {
  show_paid_step_override?: boolean | null
  takes_cash_override?: boolean | null
  completion_presses_override?: CompletionPresses | null
  /**
   * ── 🔴 THE EVENT'S VAN'S OWN `takes_cash`, WHERE THE CALLER HAS IT ON THE ROW (5 October 2026) ──
   * `truck_vans.takes_cash` (20261012) is nullable and NULL means "use `trucks.takes_cash`".
   *
   * ⚠️ THERE ARE TWO WAYS IN AND THAT IS DELIBERATE, NOT INDECISION. The `vanTakesCash` ARGUMENT is
   * the primary one, because the three client call sites are handed a van value as a prop and an
   * argument is the one shape a caller cannot forget silently — TypeScript asks for it. This FIELD
   * exists for a caller that holds an event row the server has already joined the van onto and has no
   * van object of its own (`lib/printing/mapOrderToTicket.ts` is the shape, though it does not read
   * `takesCash` at all). The argument wins where both are present.
   * ⚠️ BOTH `undefined` ⇒ THE TRUCK DEFAULT, which is what every caller that sets neither gets. So a
   * partially-hydrated event, an old cached payload and a pre-migration database all resolve to
   * exactly today's answer.
   */
  van_takes_cash?: boolean | null
}

export interface ResolvedPaidStep {
  /** Does THIS event split "Mark paid & done" into a paid step? */
  showPaidStep: boolean
  /** Does THIS event split the paid action into Cash/Card? */
  takesCash: boolean
  /** Does completing an UNPAID order take one press or two? Truck-level; no event override. */
  completionPresses: CompletionPresses
}

/**
 * Resolve the effective paid-step settings for one event.
 *
 * ⚠️ BOTH DEFAULTS OFF ⇒ `{ showPaidStep: false, takesCash: false }` — the state every truck is in
 * today, in which every paid-step affordance is inert and the operator surface is unchanged.
 * A missing truck, a missing event, and an event with no override all resolve to the truck default,
 * so a partially-loaded client renders the same thing the server computes.
 */
export function resolvePaidStep(
  truck: PaidStepTruck | null | undefined,
  event: PaidStepEvent | null | undefined,
  /* 🔴 THE EVENT'S TYPE, OPTIONAL (October 2026), AND IT REACHES `takesCash` ONLY. Omitted or null ⇒
   * every one of the three values below is what this function returned before event types existed.
   * ⚠️ `showPaidStep` AND `completionPresses` ARE DELIBERATELY NOT TYPED SETTINGS. The paid step is a
   * property of how a truck takes money, not of a pitch, and its own migration says so
   * (20260730_truck_events_show_paid_step_override.sql). Adding them here because they happen to be
   * in the same function would make a type change how payments are recorded. */
  type?: TypeFor | null,
  /**
   * 🔴 `truck_vans.takes_cash` FOR THE VAN RUNNING THIS EVENT (5 October 2026). Nullable:
   * null/undefined ⇒ the truck default, which is every van before 20261012 is applied — so an
   * omitted argument is today's behaviour exactly, and no existing caller had to change to keep
   * working. See `van_takes_cash` above for why there are two ways to supply it.
   */
  vanTakesCash?: boolean | null,
): ResolvedPaidStep {
  const showPaidStep = event?.show_paid_step_override ?? truck?.show_paid_step ?? false
  return {
    showPaidStep,
    /* 🔴 FOUR LINKS NOW: event ?? type ?? VAN ?? truck. ⚠️ `??` ON THE VAN TERM TOO, so a van that
     * has explicitly chosen `false` is honoured rather than read as "unset" — the bug
     * lib/event-types/resolve.ts's header is about, in the one place it would cost money to make. */
    takesCash: resolveTakesCashWithType(
      event?.takes_cash_override, type, vanTakesCash ?? event?.van_takes_cash, truck?.takes_cash),
    // ── THE SAME NULLABLE-MEANS-INHERIT CHAIN THE OTHER TWO USE — event, then truck, then fallback ──
    // ⚠️ `??` and never `||`: 'one' is truthy so `||` happens to work here, but the moment a value like
    // 0 or '' enters this vocabulary it would silently re-inherit. Same chain shape as its neighbours,
    // deliberately, so there is one pattern on this page and not two.
    //
    // 🔴 THE LAST LINK IS THE OLD FLAG, NOT A CONSTANT, AND THAT IS LOAD-BEARING.
    // `?? 'one'` would be wrong in the one window that matters. `trucks` is read with select('*')
    // everywhere, so a truck column that does not exist yet arrives `undefined` rather than raising
    // 42703 — which means a CODE-BEFORE-MIGRATION deploy silently resolves every truck here. With a
    // constant that would flip the three paid-step trucks from two presses to one AND make
    // undo_collected start deleting their payment rows, with no error anywhere. Deriving from the
    // RESOLVED showPaidStep instead reproduces today's behaviour exactly — including per-event
    // overrides, since that value has already been through the ?? chain above.
    // ⚠️ THE EVENT OVERRIDE IS NOT PROTECTED BY THAT FALLBACK, and cannot be. It is read through a
    // NAMED select (paidStepFor, /api/dashboard), so its column must EXIST before the code that names
    // it deploys — see supabase/migrations/20260810_truck_events_completion_presses_override.sql.
    // Migration first, then deploy.
    // ⚠️ The truck-level fallback is insurance, not the mechanism. After its migration that column is
    // NOT NULL and every row carries the value backfilled from its own show_paid_step, so the last link
    // stops firing. Do not "simplify" it to a constant, and do not read it as the two settings being
    // coupled: they are independent inputs, and this is the value used when the input is absent.
    completionPresses:
      event?.completion_presses_override ?? truck?.completion_presses ?? (showPaidStep ? 'two' : 'one'),
  }
}
