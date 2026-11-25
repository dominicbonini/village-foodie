// lib/till/guard-errors.ts — 🔴 till-pack-2 (25 November 2026, docs/till-pack-2-report.md): THE TILL GUARD'S REFUSALS, AS ONE SHORT 409.
//
// PURE AND CLIENT-SAFE. The till's database guard raises with its own sqlstates:
//   HGT01 — an append-only record (till_chain, action_audit_log, the till's own tables) was asked to change: till-pack-1, raised today;
//   HGT02 — a sealed sale changed after its trading day's close            ┐
//   HGT03 — a sealed order, or a till truck's payment, was asked to go     ├ till-pack-3's ENFORCE mode — RESERVED here, so the routes
//   HGT04 — a chained payment's sealed fields were asked to change         ┘ already answer them; in observe mode nothing raises them.
// A route that meets one answers HTTP 409 with ONE short operator message — errorsKitchen.sale_closed, "This sale is closed. Record a
// refund instead." — in the truck's language (the body carries `code`, so each screen words it from its own message file). In observe
// mode (today) no write is refused, so nobody sees it yet.

export const TILL_GUARD_SQLSTATES = ['HGT01', 'HGT02', 'HGT03', 'HGT04'] as const
export type TillGuardSqlstate = (typeof TILL_GUARD_SQLSTATES)[number]

/** True when an error (a PostgREST error object, or an Error carrying `code`) is the till guard refusing a write. */
export function isTillGuardError(err: unknown): err is { code: TillGuardSqlstate } {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined
  return typeof code === 'string' && (TILL_GUARD_SQLSTATES as readonly string[]).includes(code)
}
