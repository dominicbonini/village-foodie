// lib/payments/online-payments-switch.ts
//
// 🔴 TEMPORARY. THIS WHOLE FILE IS MEANT TO BE DELETED.
// It exists so an operator can turn online card payments off during a payment incident and have every
// customer fall back to paying at the hatch. When that switch is removed, delete this file — the full
// removal list is in supabase/migrations/20260811_trucks_online_payments_paused_at.sql.
//
// ── WHY IT IS NOT IN lib/payments/paid-step.ts ──────────────────────────────────────────────────────
// That resolver answers "how does this truck take money in person, at this event" — three settings,
// truck default plus per-event override, all permanent. This answers "is a card offered to a customer
// online, right now", it is truck-wide, and it is temporary. Folding it in would mean unpicking it out
// of a resolver eight callers depend on. Kept separate so removing it is a delete, not a surgery.
//
// ── THE RULE, IN ONE PLACE ──────────────────────────────────────────────────────────────────────────
// A card is offered when the connected account can take charges AND the operator has not paused.
// Two inputs, from two different rows:
//   operators.stripe_charges_enabled  — readiness. Unchanged by this feature.
//   trucks.online_payments_paused_at  — the switch. NULL = enabled; a timestamp = paused, and when.
//
// 🔴 UNDEFINED MUST RESOLVE TO ENABLED, AND THAT IS LOAD-BEARING.
// `trucks` is read with select('*') on the menu, dashboard and action routes, so before the migration
// is applied the column simply is not on the object and arrives `undefined`. `== null` catches both
// null and undefined, so a truck with no column behaves exactly as it does today. That protects three
// of the four paths from a code-before-migration deploy.
// ⚠️ IT DOES NOT PROTECT THE FOURTH. app/api/stripe/checkout/route.ts reads `trucks` with a NAMED
// select, and a named select on a missing column is 42703 — the whole statement fails before this
// function is ever called. Migration first, then deploy. See the migration for the full reasoning.
//
// ⚠️ THE SWITCH IS NOT A REFUND AND NOT A GATE ON MONEY ALREADY TAKEN. It stops a NEW Checkout Session
// being created. A session already open on Stripe's hosted page will still succeed, and the webhook
// will still write the ledger row — deliberately, and it must stay that way.

/**
 * The ONLY place the online-card-payment rule lives. Both gates call this and neither reimplements it.
 *
 * @param operator the operators row (or the slice of it that was selected), or null
 * @param truck    the trucks row (or the slice of it that was selected), or null
 */
export function resolveOnlineCardPayments(
  operator: { stripe_charges_enabled?: boolean | null } | null | undefined,
  truck: { online_payments_paused_at?: string | null } | null | undefined,
): { offered: boolean; pausedAt: string | null } {
  // `== null` on purpose — it is true for BOTH null (never paused / un-paused) and undefined (the
  // column does not exist yet). `=== null` would treat a pre-migration truck as paused and switch
  // every card off. Do not tighten this.
  const pausedAt = truck?.online_payments_paused_at == null ? null : String(truck.online_payments_paused_at)
  return {
    // Readiness is still `=== true` and nothing else — never "a row exists", never "an account id
    // exists". That check is unchanged; this only adds the AND.
    offered: operator?.stripe_charges_enabled === true && pausedAt === null,
    pausedAt,
  }
}
