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
//   takesCash    = event.takes_cash_override     ?? truck.takes_cash     ?? false
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
/** The truck-level defaults. Both optional so a partially-hydrated truck object is safe. */
export interface PaidStepTruck {
  show_paid_step?: boolean | null
  takes_cash?: boolean | null
}

/** The event's overrides. NULL/undefined on either = inherit that truck default. */
export interface PaidStepEvent {
  show_paid_step_override?: boolean | null
  takes_cash_override?: boolean | null
}

export interface ResolvedPaidStep {
  /** Does THIS event split "Mark paid & done" into a paid step? */
  showPaidStep: boolean
  /** Does THIS event split the paid action into Cash/Card? */
  takesCash: boolean
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
): ResolvedPaidStep {
  return {
    showPaidStep: event?.show_paid_step_override ?? truck?.show_paid_step ?? false,
    takesCash: event?.takes_cash_override ?? truck?.takes_cash ?? false,
  }
}
