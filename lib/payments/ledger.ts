// ── THE PAYMENT LEDGER (V9.4, payments phase 1a) ─────────────────────────────────────────────────────
// `order_payments` is the CANONICAL record of money: one row per money event, integer minor units only.
// `orders.payment_status` and `orders.amount_paid` are DERIVED CACHES recomputed from it here.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────────────
// NOTHING may COMPUTE or MUTATE payment state outside this module. Every write of `payment_status` /
// `amount_paid` goes through recalcOrderPayment().
//   DELIBERATE EXCEPTION, ruled on and recorded so it is not re-litigated: the three order-CREATION sites
//   (app/api/dashboard/action/route.ts:~879 walk-up, app/api/orders/submit/route.ts:~902 customer,
//   lib/seed-demo-orders.ts:~323 demo seed) each insert the literal `payment_status: 'unpaid'`. That is
//   creation-time initialisation to the column's own default, not a derived-cache violation — no payment
//   state is computed or mutated. They are left alone: editing two LIVE insert paths for zero functional
//   change is unjustified risk. Do not "fix" them.
//
// ── ATOMICITY: TWO SEQUENTIAL WRITES, NOT A DB FUNCTION (ruled on 29 July) ──────────────────────────
// The ledger insert and the write-back to `orders` are two separate PostgREST calls. That is deliberate.
// The LEDGER is the truth; payment_status/amount_paid are caches. If the insert succeeds and the
// write-back fails, the truth is intact and only the cache is stale — repairable by re-running the
// recalc. A Postgres function would buy real atomicity at the cost of the `create or replace function`
// silent-failure hazard (§35) that took customer ordering down for ~15 minutes on 28 July — buying it to
// protect a cache rather than the source of truth. Wrong trade today. Revisit when Stripe webhooks land
// and concurrency genuinely matters.
// CONSEQUENCE: recalcOrderPayment() MUST be idempotent — it recomputes from the ledger every time and
// never accumulates, so re-running it on any order converges. Ledger insert first, recalc second. A
// failed recalc is surfaced loudly and does NOT roll back the ledger row.
//
// ── RECONCILIATION QUERY — run this to detect cache drift ───────────────────────────────────────────
// Lists any order whose cached payment state disagrees with its own ledger rows. Expect ZERO rows.
//
//   select o.order_key, o.id, o.truck_id, o.total_minor, o.payment_status, o.amount_paid,
//          coalesce(l.paid_minor, 0)                              as ledger_paid_minor,
//          round(coalesce(l.paid_minor, 0) / 100.0, 2)            as ledger_paid_pounds,
//          o.total_minor - coalesce(l.paid_minor, 0)              as balance_minor
//     from orders o
//     left join (
//       select order_key,
//              sum(case when kind = 'charge' then amount_minor else -amount_minor end) as paid_minor,
//              count(*) filter (where kind = 'refund')                                  as refund_rows
//         from order_payments
//        where state = 'succeeded'
//        group by order_key
//     ) l on l.order_key = o.order_key
//    where round(coalesce(l.paid_minor, 0) / 100.0, 2) is distinct from coalesce(o.amount_paid, 0)
//       or o.payment_status is distinct from case
//            when coalesce(l.paid_minor, 0) = 0 and coalesce(l.refund_rows, 0) > 0 then 'refunded'
//            when coalesce(l.paid_minor, 0) = 0                                    then 'unpaid'
//            when o.total_minor - coalesce(l.paid_minor, 0) < 0                     then 'refund_due'
//            when o.total_minor - coalesce(l.paid_minor, 0) = 0                     then 'paid'
//            else 'part_paid' end
//    order by o.created_at desc;
//
// `import type` (not a value import) is load-bearing: getOrderBalance is called from CLIENT components
// (OrderCard, AddOrderPanel) and a value import would pull the supabase client into the browser bundle.
// The server-only functions below are simply never called there.
import type { SupabaseClient } from '@supabase/supabase-js'
import { toMinor, fromMinor } from '@/lib/order-repricing'

export type PaymentKind = 'charge' | 'refund'
export type PaymentChannel = 'online' | 'in_person_stripe' | 'in_person_other'
export type PaymentEventState = 'pending' | 'succeeded' | 'failed'
/** HOW the money physically arrived. ORTHOGONAL to channel — see the migration header. Null = not
 *  recorded (every pre-split row, and every Stripe row whose method is implicit in its channel).
 *  ⚠️ Affects NO arithmetic: getOrderBalance never reads it. It is a label on a money event. */
export type PaymentMethod = 'cash' | 'card'
export type PaymentStatus = 'unpaid' | 'paid' | 'part_paid' | 'refunded' | 'part_refunded' | 'refund_due' | 'failed'

/** A row of `order_payments`. amount_minor is ALWAYS POSITIVE — `kind` carries the sign. */
export interface LedgerRow {
  kind: PaymentKind
  channel: PaymentChannel
  amount_minor: number
  state: PaymentEventState
  external_ref?: string | null
  /** ── IS THIS MONEY REAL? (20260807_order_payments_livemode.sql) ────────────────────────────────
   *  NOT NULL in the database, so a row read from Postgres ALWAYS carries a boolean. Optional here for
   *  exactly one reason: a caller may construct a LedgerRow by hand (the ticket preview does). It is
   *  NEVER optional because a SELECT might omit it — see LEDGER_ROW_COLUMNS, which exists so that
   *  cannot happen.
   *  ⚠️ ABSENT IS TREATED AS TEST, NOT AS LIVE. See isLiveRow for why that direction is the only safe
   *  one. If you are adding a reader and your rows come back without this field, the fix is to select
   *  it — not to relax the check. */
  livemode?: boolean
  /** ── DOES THE TRUCK'S CONNECTED STRIPE ACCOUNT ITSELF RUN IN TEST MODE? ─────────────────────────
   *  NOT a column on order_payments. It is stamped onto the row by whichever reader fetched it, from
   *  `operators.stripe_account_livemode === false` for the truck that owns the row. Only two readers
   *  set it — readLedger and /api/dashboard — and both resolve it from the database.
   *  🔴 ABSENT MEANS "NO", exactly like `livemode`. A caller that hand-builds a row, or a reader that
   *  does not resolve the account, gets today's behaviour unchanged. See isLiveRow. */
  account_is_test?: boolean
  /** The owning truck, selected so a reader can resolve `account_is_test` without a second query per
   *  row. Present on every row read from the database; absent on hand-built fixtures. */
  truck_id?: string
}

/** The column list EVERY reader of `order_payments` selects. Exported and shared so the select list
 *  cannot drift between call sites — a reader that omits `livemode` would hand getOrderBalance rows it
 *  cannot classify, and isLiveRow would (correctly, but unhelpfully) drop all of them. One list, one
 *  place, three readers: readLedger below, reverseCollectionPayment below, and /api/dashboard. */
// 🔴 `order_key` IS LOAD-BEARING IN THIS LIST, NOT DECORATION. readLedger's scope assertion compares
// every returned row's order_key against the one it asked for; without the column selected, that field
// is `undefined` on every row and the assertion is INERT. Removing it from this string silently disarms
// the only guard that can see the 7 August defect. If you shorten this list, do not shorten it here.
// ⚠️ `truck_id` was added on 11 August 2026 so a reader can resolve the owning operator's account mode
// without a per-row lookup. It is SELECTED but never summed, exactly like `external_ref`.
export const LEDGER_ROW_COLUMNS = 'order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode'

/**
 * 🔴 THE SINGLE TEST FOR "THIS ROW IS REAL MONEY", AND THE DEFAULT IS EXCLUDE.
 *
 * `livemode === true`, not `!== false`. That strictness is the whole point, and it is chosen for its
 * FAILURE DIRECTION rather than its elegance:
 *   • A consumer that forgets to select the column sees every row as ineligible → the order reads
 *     UNPAID → the operator asks for money that was already taken. Embarrassing, visible, recoverable
 *     in one tap.
 *   • The lenient form (`!== false`) fails the other way: a forgotten column makes a TEST payment count
 *     as real → the customer is shown as PAID → food goes out the hatch against money that does not
 *     exist, and nothing anywhere reports it. Not visible, and not recoverable.
 * Between "under-report" and "over-report" on a money column there is no symmetry, so the check is not
 * symmetric either. DO NOT relax this to `!== false` to make a fixture pass; give the fixture a livemode.
 *
 * ── 🔴 ARM (b), ADDED 11 AUGUST 2026 — AND IT IS STRICTLY ADDITIVE ──────────────────────────────────
 * Stripe decides `livemode` from the API key that authenticated the request, so a TEST-mode card payment
 * can ONLY ever be `livemode: false` — no Stripe feature changes that, and this build refuses live keys
 * outright. Under arm (a) alone a card payment that genuinely succeeded is invisible everywhere, which
 * is what §37's "store the livemode flag with the account id" exists to fix.
 *
 * A row also counts when ALL THREE hold:
 *   1. `account_is_test === true`  — the truck's connected Stripe account is ITSELF a test account
 *                                     (operators.stripe_account_livemode === false, resolved by the
 *                                     reader; NULL — no connected account — never satisfies this)
 *   2. `livemode === false`         — it is test money
 *   3. `channel === 'online'`       — it came from Stripe
 *
 * 🔴 WHY THIS CANNOT REMOVE A ROW, WHICH IS THE ACCEPTANCE CRITERION AND NOT A PREFERENCE:
 * arm (a) is tested FIRST, alone, and returns immediately. Nothing below it can be reached by a
 * `livemode: true` row, so no row that counts today can stop counting — including every in-person
 * collection, which `recordCollectionPayment` hardcodes to `livemode: true` because there is no test
 * mode for cash. A truck with NO connected Stripe account has `account_is_test` unset on every row and
 * is therefore byte-identical to before.
 * ⚠️ THE TEMPTING WRONG SHAPE IS A COMPARISON: `row.livemode === accountIsLive`. It reads as symmetrical
 * and it is a SUBTRACTION — a cash row (`livemode: true`) on a test-account truck would stop counting,
 * and the truck's takings would vanish. If you find yourself writing that, you have inverted the rule.
 * ⚠️ CHANNEL IS IN THE PREDICATE ON PURPOSE. It confines arm (b) to money Stripe reported. An in-person
 * row can never be `livemode: false` today, but the guard means that if one ever were — a bad writer, a
 * bad backfill — it would still be excluded rather than admitted by an account-level flag.
 */
export function isLiveRow(row: { livemode?: boolean; channel?: PaymentChannel; account_is_test?: boolean }): boolean {
  // ── ARM (a) — UNCHANGED, AND FIRST. Every row that counted yesterday returns here. ────────────────
  if (row.livemode === true) return true
  // ── ARM (b) — test money, from Stripe, on an account that is itself test. Absent flags fail closed. ─
  return row.account_is_test === true && row.livemode === false && row.channel === 'online'
}

/** The full stored shape of a collect row, as read immediately before deletion. Every column is
 *  included deliberately: this is what gets written to action_audit_log.before_state, and the deletion
 *  must be fully reconstructable from the log alone. */
export interface DeletedCollectRow extends LedgerRow {
  id: string
  currency?: string | null
  note?: string | null
  idempotency_key?: string | null
  created_at?: string | null
  created_by?: string | null
}

/** The minimum an order must supply to be balanced. total_minor is authoritative; `total` is the
 *  fallback for rows written before 20260728_orders_total_minor_deal_savings.sql populated it. */
export interface BalanceableOrder {
  total_minor?: number | null
  total?: number | null
}

export interface OrderBalance {
  paidMinor: number
  balanceMinor: number
  status: PaymentStatus
}

/** The order's charge amount in pence. total_minor when present; otherwise derived from the pounds
 *  column — safe because every money column is numeric(8,2) and Postgres rounds at the insert boundary,
 *  so `total` never carries sub-penny error (0 of 346 rows exceed 2dp, live-verified 29 July). */
export function orderTotalMinor(order: BalanceableOrder): number {
  if (order.total_minor != null) return Math.round(order.total_minor)
  return toMinor(Number(order.total ?? 0))
}

/**
 * THE DERIVATION. Pure — no I/O — so the next pass's UI can call it with rows it already has.
 *   paid    = Σ succeeded charges − Σ succeeded refunds
 *   balance = total_minor − paid
 */
export function getOrderBalance(order: BalanceableOrder, ledgerRows: LedgerRow[]): OrderBalance {
  // ── 🔴 THE TEST-ROW EXCLUSION LIVES HERE, AND HERE IS WHY ─────────────────────────────────────────
  // This function is the CHOKEPOINT: OrderCard, the dashboard's confirmedPaid, mapOrderToTicket (the
  // printed kitchen ticket), recalcOrderPayment (which writes orders.payment_status/amount_paid) and
  // recordCollectionPayment ALL derive paid-ness by calling it, and nothing derives paid-ness any other
  // way. Filtering at this one point means a consumer added NEXT YEAR is correct because it called the
  // resolver, not because its author remembered a rule — which is the only kind of correctness that
  // survives a codebase.
  // ⚠️ The SQL filters in readLedger / reverseCollectionPayment / /api/dashboard are the FIRST line, not
  // the only one: they stop test rows travelling to a browser at all. This is the second, and it is what
  // makes the guarantee hold for rows that arrive by any route — including a caller that hand-builds
  // them. Both layers, deliberately.
  // ⚠️ IT IS A FILTER, NEVER A TERM. Nothing below changes: paid is still Σcharges − Σrefunds. This only
  // decides which rows are eligible to be summed, exactly as `state === 'succeeded'` already does.
  const succeeded = (ledgerRows ?? []).filter(r => isLiveRow(r) && r.state === 'succeeded')
  const chargeMinor = succeeded.filter(r => r.kind === 'charge').reduce((s, r) => s + Math.round(r.amount_minor), 0)
  const refundMinor = succeeded.filter(r => r.kind === 'refund').reduce((s, r) => s + Math.round(r.amount_minor), 0)

  const paidMinor = chargeMinor - refundMinor
  const totalMinor = orderTotalMinor(order)
  const balanceMinor = totalMinor - paidMinor
  const hasRefundRow = succeeded.some(r => r.kind === 'refund')

  // ── BRANCH ORDER IS LOAD-BEARING ──────────────────────────────────────────────────────────────────
  // 'refunded' is tested FIRST and keys on refund-row PRESENCE, never on the sum. "Charged then fully
  // refunded back to zero" and "never paid at all" are the SAME arithmetic state (paidMinor === 0);
  // only the existence of a refund row tells them apart. Reordering these two silently reports every
  // fully-refunded order as 'unpaid'.
  let status: PaymentStatus
  if (paidMinor === 0 && hasRefundRow) status = 'refunded'
  else if (paidMinor === 0) status = 'unpaid'
  // Refunds exceeding charges is not reachable while amount_minor > 0 (CHECK) and undo DELETES rather
  // than over-refunding — but it is bucketed explicitly rather than being allowed to fall through into
  // 'part_paid', where a negative paid figure would read as a normal outstanding balance.
  else if (paidMinor < 0) status = 'refund_due'
  else if (balanceMinor < 0) status = 'refund_due'
  else if (balanceMinor === 0) status = 'paid'
  // ── 🔴 A PARTIAL REFUND IS NOT AN OUTSTANDING BALANCE, AND SAYING SO WAS DANGEROUS. ──────────────
  // 6.50 charged, 2.00 refunded gives paidMinor 450, balanceMinor 200 — arithmetically identical to an
  // order that has only ever paid £4.50 of £6.50. Until this branch existed both fell to 'part_paid',
  // so the card printed the amber "4.50 / 2.00 due" chip and the ticket printed "TO PAY 2.00" —
  // an instruction to collect 200p from a customer who had just been REFUNDED 200p. Wrong in the
  // direction that takes money from the wrong person.
  // ⚠️ SAME TEST AS THE 'refunded' BRANCH ABOVE — refund-row PRESENCE, never the sum — for the same
  // reason: the two states are the same arithmetic and only a refund row tells them apart.
  // ⚠️ IT ADDS A BRANCH AND CHANGES NO ARITHMETIC. paidMinor, refundMinor and balanceMinor are computed
  // exactly as before; this only decides which name that arithmetic is given.
  // 🔴 DEPLOY-COUPLED. `orders.payment_status` carries a CHECK, and recalcOrderPayment writes this value
  // into it: 20260817_orders_payment_status_part_refunded.sql MUST be applied before a partial refund
  // lands, or the write-back fails with 23514. recalcOrderPayment already names that error explicitly.
  else if (hasRefundRow) status = 'part_refunded'
  else status = 'part_paid'

  return { paidMinor, balanceMinor, status }
}

/**
 * ── "THE MONEY WRITE FAILED AND IS STILL MISSING" — THE PERSISTENT MARKER'S ONE PREDICATE ───────────
 *
 * 🔴 TWO HALVES, AND BOTH ARE REQUIRED. Either alone is wrong, and this was measured against the live
 * database rather than reasoned about:
 *
 *   • PROVENANCE (`writeFailed`) — this order has an `action_audit_log` row whose after_state carries
 *     `ledger_failed: true`, written by the fail-open catch in 'collected' / 'mark_paid' / the walk-up
 *     paid-at-order path. Precise: 159 of 159 money-action audit rows carry the key, so the signal is
 *     complete for every money action since the ledger landed. Alone it is STICKY FOREVER — the audit
 *     log is append-only, so a repaired order would keep its marker for good.
 *   • STATE (an outstanding balance) — the money is still not recorded, right now, per the ledger.
 *     Alone it is CATASTROPHICALLY NOISY: 145 of 221 collected orders in the live database have no
 *     ledger rows at all, because they were collected BEFORE the ledger existed (117 on pizzeria-gusto,
 *     28 on test-truck). A balance-only rule lights all 145 up as "PAYMENT NOT RECORDED" and the marker
 *     is dead on arrival.
 *
 * AND-ing them gives a marker with no false positives on today's data (0 of 221) that CLEARS ITSELF the
 * moment the payment is recorded — no acknowledge, no dismissal, no second state to keep in step.
 *
 * ⚠️ It goes through getOrderBalance, the chokepoint, and derives nothing itself — same rule as every
 * other consumer. The test-row exclusion and the refund branch order come along for free.
 *
 * ⚠️ ONE CASE IT DELIBERATELY DOES NOT REPORT: `recordPaymentEvent` inserts the ledger row and THEN
 * recalcs, so a failed write-back throws with the row already committed. The audit row says
 * ledger_failed, but the balance is settled — the money IS recorded and only orders.payment_status is
 * stale. That is a cache repair, not missing money, and the operator must not be told money is missing
 * when it is not. The toast at the moment of failure still fires; the persistent marker does not.
 */
export function hasUnrecordedPayment(
  order: BalanceableOrder,
  ledgerRows: LedgerRow[],
  writeFailed: boolean,
): boolean {
  if (!writeFailed) return false
  return getOrderBalance(order, ledgerRows).balanceMinor > 0
}

/**
 * The idempotency key for an in-person charge — a STATE-TRANSITION key: *"from this ledger position,
 * settle this amount"*.
 *
 * 🔴 IT WAS `collect:{order_key}`, A CONSTANT PER ORDER, AND THAT SILENTLY SWALLOWED EVERY CHARGE AFTER
 * THE FIRST. Pay £9.50 → edit up to £15 → tap "Mark £5.50 paid" → 23505 → treated as a successful
 * no-op → the money was never recorded, with no error. The phase-1a migration header explicitly rejected
 * a composite unique index so that "£10 cash now, £5 later" would stay possible; the constant key
 * forbade it anyway. Header and implementation disagreed from day one and nobody noticed because
 * part-paid had never been exercised.
 *
 * ── WHY paidBefore:balance, AND NOT total OR balance ALONE ─────────────────────────────────────────
 * Both simpler schemes have holes, found by simulation before adopting either (7 sequences × 4 schemes):
 *   • `:{balance}`  — collides when the same amount is settled twice. Pay a £9.50 order IN FULL, then
 *                     the customer doubles it to £19.00: the outstanding balance is £9.50 AGAIN, same
 *                     key, charge vanishes. Also breaks on equal successive top-ups. Very plausible.
 *   • `:{total}`    — survives that, but collides when a total repeats: pay, edit up, pay, edit back
 *                     down, refund, edit up to the SAME total again.
 *   • `:{paidBefore}:{balance}` — survives both. It encodes the actual transition, so it only collides
 *                     if the LEDGER STATE returns to a previous position AND the same amount is settled
 *                     from it again.
 *
 * ⚠️ NO PURELY SERVER-DERIVED KEY CAN BE COMPLETE, and this one is not. If the key is a function of
 * ledger state, then any sequence that returns the ledger to an earlier state and repeats the same
 * transition WILL collide — that is a property of determinism, not a bug in the choice. The one
 * remaining case is a REFUND that exactly reverses a charge, followed by re-charging the same amount
 * (refunds are not built yet; see §37). A client-minted per-tap key is the only complete answer — the
 * outbox already mints `op_id` for exactly this purpose but never transmits it (see the audit review).
 * Adopting it means changing the live offline gate, so it is deliberately NOT done here.
 * INSTEAD: recordCollectionPayment carries an expected-vs-actual detector that makes any residual
 * collision LOUD rather than silent. Read that before changing this function.
 */
export function collectIdempotencyKey(orderKey: string, paidBeforeMinor: number, balanceMinor: number): string {
  return `collect:${orderKey}:${paidBeforeMinor}:${balanceMinor}`
}

async function readLedger(supabase: SupabaseClient, orderKey: string): Promise<LedgerRow[]> {
  const { data, error } = await supabase
    .from('order_payments')
    .select(LEDGER_ROW_COLUMNS)
    // ── 🔴 TWO FILTERS. BOTH MANDATORY. NEITHER REPLACES THE OTHER. ─────────────────────────────────
    // THIS IS THE 7 AUGUST INCIDENT, WRITTEN AT THE SCENE. On 7 August commit 3a1d082 added the
    // `livemode` filter below by REPLACING the `order_key` filter above it. Every balance was then
    // computed from the ENTIRE order_payments table — every order, every truck — so `paidMinor` became
    // the whole-table sum, `balanceMinor` went negative, and recordCollectionPayment short-circuited on
    // its `balanceMinor <= 0` guard: no row written, NO ERROR RAISED, `chargedMinor: 0` returned as a
    // success. Pizzeria Gusto recorded £0 for an afternoon of real collections with nothing anywhere
    // reporting a fault. It passed `tsc` and it passed lint, because the deleted filter left `orderKey`
    // still referenced in the error string below, so the parameter was never "unused".
    //
    // They answer DIFFERENT questions and are not interchangeable:
    //   .eq('order_key', orderKey) → WHOSE money is this?   Scope. Without it the sum is everyone's.
    //   .eq('livemode', true)      → is this money REAL?    Mode.  Without it a test row counts as cash.
    // If you are adding a third, ADD it. Do not edit either of these two lines to make room.
    //
    // ── 🔴 11 AUGUST 2026 — THE MODE FILTER IS WIDENED, NOT REMOVED. READ THIS BEFORE EDITING IT. ──
    // The `.or(...)` below replaces `.eq('livemode', true)` and is a STRICT SUPERSET of it: the first
    // disjunct IS the old filter, character for character. Every row the old query returned, this query
    // returns. The second disjunct additionally fetches TEST rows that came from Stripe — and fetching
    // is not counting. Whether such a row counts is decided by isLiveRow, which additionally requires
    // the truck's connected account to be a test account. This query cannot admit a row to a balance on
    // its own, which is why widening it here is safe.
    // ⚠️ THE SCOPE FILTER IS UNTOUCHED AND STILL SEPARATE. The 7 August incident was one filter eating
    // another; that is exactly what must not happen again, so `.eq('order_key', orderKey)` keeps its line.
    .eq('order_key', orderKey)
    .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
  if (error) throw new Error(`[ledger] could not read order_payments for ${orderKey}: ${error.message}`)

  // ── 🔴 RUNTIME SCOPE ASSERTION — the guard for the class, not the instance ──────────────────────
  // Every row this function returns MUST belong to the order it was asked about. A `WHERE` clause is
  // invisible to every static check in this repo: `tsc` cannot see a missing filter, lint cannot see a
  // missing filter, and the 7 August change proved both by passing them. This can see it, because it
  // checks the RESULT rather than the query.
  // It THROWS rather than filtering the stray rows out, deliberately: every caller of readLedger already
  // fails safe on a throw — `collected` and `mark_paid` catch it and fail OPEN (the order still
  // completes, a paymentWarning is set, the server log names the order_key), and `undo_collected` fails
  // CLOSED. Silently correcting the data would hide the defect for exactly as long as it took someone to
  // notice the money was wrong, which is the failure mode this exists to end.
  // COST: one comparison per row, on a set that is single-digit for any real order. It is free.
  // ⚠️ `!== orderKey`, with NO `!== undefined` escape. That escape was in the first draft of this guard
  // and made it inert: `order_key` was not in LEDGER_ROW_COLUMNS, so every row's value was `undefined`
  // and every row passed. Comparing strictly means a row whose order_key was not SELECTED also fails —
  // so the guard catches its own precondition being removed, which is the only way it stays alive.
  const rows = (data ?? []) as unknown as (LedgerRow & { order_key?: string })[]
  const strays = rows.filter(r => r.order_key !== orderKey).length
  if (strays > 0) {
    throw new Error(
      `[ledger] SCOPE VIOLATION reading order_payments for ${orderKey}: ${strays} of ${rows.length} rows ` +
      `belong to a DIFFERENT order. The order_key filter is missing or wrong — every balance computed ` +
      `from this read would be the sum of other orders' money. Refusing to return it.`,
    )
  }
  return annotateTestAccountRows(supabase, rows as LedgerRow[])
}

/**
 * Stamp `account_is_test` onto any TEST-ONLINE rows, so isLiveRow's arm (b) can decide.
 *
 * ── 🔴 IT IS LAZY, AND THAT IS THE POINT ────────────────────────────────────────────────────────────
 * It returns IMMEDIATELY unless the set actually contains a `livemode: false` + `channel: 'online'` row.
 * On every order in the database today except three, that is zero extra queries and zero extra latency —
 * this function sits on `recalcOrderPayment`, which runs on the hatch, on every collect and every undo.
 * The common path must not pay for a case it does not have.
 *
 * ── ⚠️ TWO READS, AND THERE IS NO WAY TO DO IT IN ONE ───────────────────────────────────────────────
 * `readLedger` is given an order_key and nothing else. The mode lives on `operators`, which is two hops
 * away: order_payments.truck_id -> trucks.operator_id -> operators.stripe_account_livemode. PostgREST
 * can embed across a foreign key, but embedding it into the LEDGER SELECT would put a NAMED nested
 * select on the money read — and a named select that cannot resolve is 42703, which fails the WHOLE
 * statement and would take every balance in the product down with it. That is the exact failure class
 * §35 records twice. So the hop is a SEPARATE query, deliberately, and its worst case is that the flag
 * stays unset — which is today's behaviour, not a broken one. Stated rather than worked around.
 *
 * ── 🔴 NULL IS NOT "LIVE" AND IT IS NOT "TEST" ─────────────────────────────────────────────────────
 * `stripe_account_livemode` is NULL when there is no connected account. The test below is `=== false`,
 * never `!== true`: a NULL operator must contribute nothing to arm (b).
 * ⚠️ A FAILED LOOKUP LEAVES THE ROWS UNANNOTATED, which means they do not count — the same direction
 * every other failure on this path takes. Under-report, never over-report.
 */
async function annotateTestAccountRows(supabase: SupabaseClient, rows: LedgerRow[]): Promise<LedgerRow[]> {
  const candidates = rows.filter(r => r.livemode === false && r.channel === 'online')
  if (candidates.length === 0) return rows

  const truckIds = [...new Set(candidates.map(r => r.truck_id).filter(Boolean))] as string[]
  if (truckIds.length === 0) return rows

  const { data: truckRows, error: truckErr } = await supabase
    .from('trucks')
    .select('id, operator_id')
    .in('id', truckIds)
  if (truckErr || !truckRows?.length) {
    console.error('[ledger] could not resolve trucks for test-account annotation — test rows stay excluded:', truckErr?.message)
    return rows
  }

  const operatorIds = [...new Set(truckRows.map(t => t.operator_id).filter(Boolean))] as string[]
  if (operatorIds.length === 0) return rows

  const { data: opRows, error: opErr } = await supabase
    .from('operators')
    .select('id, stripe_account_livemode')
    .in('id', operatorIds)
  if (opErr || !opRows?.length) {
    console.error('[ledger] could not resolve operator account mode — test rows stay excluded:', opErr?.message)
    return rows
  }

  // `=== false` — see the header. NULL (no connected account) is not a test account.
  const testOperators = new Set(opRows.filter(o => o.stripe_account_livemode === false).map(o => o.id))
  const testTrucks = new Set(truckRows.filter(t => t.operator_id && testOperators.has(t.operator_id)).map(t => t.id))
  if (testTrucks.size === 0) return rows

  // Returns NEW row objects for the annotated ones; the others are passed through untouched.
  return rows.map(r =>
    r.livemode === false && r.channel === 'online' && r.truck_id && testTrucks.has(r.truck_id)
      ? { ...r, account_is_test: true }
      : r,
  )
}

async function readOrder(supabase: SupabaseClient, orderKey: string): Promise<BalanceableOrder> {
  const { data, error } = await supabase
    .from('orders')
    .select('total, total_minor')
    .eq('order_key', orderKey)
    .single()
  if (error || !data) throw new Error(`[ledger] could not read order ${orderKey}: ${error?.message ?? 'not found'}`)
  return data as BalanceableOrder
}

/**
 * RECOMPUTE the derived caches from the ledger and write them back to `orders`.
 * IDEMPOTENT by construction: it reads the full ledger and writes an absolute value, never a delta, so
 * re-running it converges from any starting state. This is the ONLY writer of payment_status/amount_paid.
 *
 * The write-back is also STRUCTURAL, not a convenience: a row in a separate table does not touch
 * `orders.updated_at`, and lib/orders/mergeOrders.ts version-guards on that value — so without this
 * update a cached dashboard would never learn a balance changed.
 *
 * Throws on any failure. Callers must surface it, never swallow it.
 */
/**
 * 🔴 WHAT DOES THIS ORDER STILL OWE? READ-ONLY.
 *
 * recalcOrderPayment without the write-back — the same two reads, the same getOrderBalance, and nothing
 * touched. It exists because CAPTURE needs to ask this question and must not answer it any other way.
 *
 * ── WHY A NEW EXPORT RATHER THAN A HAND-ROLLED SELECT AT THE CALL SITE ─────────────────────────────
 * 🔴 BECAUSE readLedger IS NOT A SELECT, IT IS FOUR SAFETY PROPERTIES. The order_key scope filter and
 * its runtime assertion (the 7 August incident), the widened mode filter, and annotateTestAccountRows —
 * without which isLiveRow's arm (b) has no `account_is_test` to read and EVERY sandbox card payment
 * silently stops counting. A caller that writes its own query gets none of that and looks correct.
 * ⚠️ recalcOrderPayment keeps its own body rather than delegating here. Two reads are duplicated; that
 * is deliberate, because the alternative is editing a function that writes payment_status on the hatch,
 * for no behavioural gain.
 *
 * ⚠️ IT THROWS, exactly as readOrder and readLedger do — on a missing order, on a read failure, and on a
 * scope violation. A caller deciding whether to MOVE MONEY must treat "I could not tell" as a refusal,
 * never as a zero.
 */
export async function readOrderBalance(supabase: SupabaseClient, orderKey: string): Promise<OrderBalance> {
  const [order, rows] = await Promise.all([readOrder(supabase, orderKey), readLedger(supabase, orderKey)])
  return getOrderBalance(order, rows)
}

export async function recalcOrderPayment(supabase: SupabaseClient, orderKey: string): Promise<OrderBalance> {
  const [order, rows] = await Promise.all([readOrder(supabase, orderKey), readLedger(supabase, orderKey)])
  const balance = getOrderBalance(order, rows)

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
    .eq('order_key', orderKey)
  // A CHECK violation here (23514) almost certainly means the DEPLOY-COUPLED constraint migration
  // 20260729_orders_payment_status_widen_check.sql has not been applied — say so rather than surfacing
  // a bare Postgres error, because that is the one failure mode this rollout can actually produce.
  if (error) {
    const hint = error.code === '23514'
      ? ' — payment_status CHECK rejected the value; has 20260729_orders_payment_status_widen_check.sql been applied?'
      : ''
    throw new Error(`[ledger] write-back failed for ${orderKey}: ${error.message}${hint}`)
  }
  return balance
}

/**
 * Insert one money event, then recalc. Insert first, recalc second (see the atomicity note above).
 * A unique violation on `idempotency_key` is treated as a SUCCESSFUL NO-OP — that is the whole point of
 * the key: an offline replay of the same action must not book a second charge. The recalc still runs, so
 * a replay that lands after a failed first recalc repairs the cache.
 */
export async function recordPaymentEvent(
  supabase: SupabaseClient,
  event: {
    orderKey: string
    truckId: string
    kind: PaymentKind
    channel: PaymentChannel
    amountMinor: number
    state?: PaymentEventState
    externalRef?: string | null
    note?: string | null
    idempotencyKey?: string | null
    createdBy?: string | null
    currency?: string
    method?: PaymentMethod | null
    /** ── 🔴 REQUIRED. NO DEFAULT. NOT OPTIONAL. THIS IS DELIBERATE. ───────────────────────────────
     *  The database column carries `default true`, which is what makes the migration safe to apply
     *  ahead of the deploy — but a default is also how a test payment gets silently recorded as real
     *  by a writer that simply forgot. Making the parameter mandatory here moves that failure from
     *  runtime (a wrong row, discovered by an accountant) to COMPILE TIME (a red squiggle). A future
     *  Stripe webhook writer cannot omit it, because the file will not build.
     *
     *  🔴 WHEN THAT WRITER EXISTS, THIS VALUE COMES FROM `event.livemode` ON THE STRIPE EVENT ITSELF —
     *  never from STRIPE_SECRET_KEY, never from an `sk_test_`/`sk_live_` prefix, never from NODE_ENV,
     *  and never from which endpoint received the callback. Stripe's own documentation is explicit that
     *  "your production webhook URLs receive BOTH live and test webhooks", so the endpoint proves
     *  nothing and the key proves nothing about a callback that arrived unbidden. The event is the only
     *  artefact that knows which mode produced it, and it says so in a field. Read that field.
     *  Deriving this from configuration would reintroduce the entire defect this column exists to
     *  prevent, while looking correct. */
    livemode: boolean
  },
): Promise<{ inserted: boolean; balance: OrderBalance }> {
  if (!Number.isInteger(event.amountMinor) || event.amountMinor <= 0) {
    throw new Error(`[ledger] amount_minor must be a positive integer (got ${event.amountMinor}) — kind carries the sign`)
  }

  const { error } = await supabase.from('order_payments').insert({
    order_key: event.orderKey,
    truck_id: event.truckId,
    kind: event.kind,
    channel: event.channel,
    amount_minor: event.amountMinor,
    currency: event.currency ?? 'GBP',
    state: event.state ?? 'succeeded',
    external_ref: event.externalRef ?? null,
    note: event.note ?? null,
    idempotency_key: event.idempotencyKey ?? null,
    created_by: event.createdBy ?? null,
    method: event.method ?? null,
    // Named EXPLICITLY on every insert rather than left to the column default. The default exists to
    // classify the rows that were already there; a row written from here always knows its own mode, so
    // relying on the default would be discarding information we hold. It also means the day the default
    // is dropped (phase two of the migration), nothing here changes.
    livemode: event.livemode,
  })

  let inserted = true
  if (error) {
    // 23505 = the idempotency key already exists. USUALLY a genuine replay, whose money is already
    // recorded — but NOT always, and this function cannot tell the difference on its own (it does not
    // know what the caller expected). Callers that intend a specific amount must check the resulting
    // balance; see recordCollectionPayment's expected-vs-actual detector.
    if (error.code === '23505') inserted = false
    else throw new Error(`[ledger] insert failed for ${event.orderKey}: ${error.message}`)
  }

  const balance = await recalcOrderPayment(supabase, event.orderKey)
  return { inserted, balance }
}

/**
 * "Mark paid & done" — charge the FULL OUTSTANDING BALANCE in person.
 *
 * IDEMPOTENCY KEY: `collect:{order_key}`, deterministic rather than client-supplied. The outbox DOES mint
 * a stable per-op uuid (lib/native/outbox.ts `op_id`), but it never reaches the server — drainOnce()
 * posts only `op.body`, and op_id lives outside it. Plumbing it through would mean changing the live
 * native offline gate for no gain here: this action charges the whole balance exactly once per order, so
 * the order key plus the action already identifies the event uniquely. An offline replay re-posts the
 * same body, derives the same key, and collides — which is exactly the desired no-op.
 * An undo DELETES this row (see reverseCollectionPayment), which FREES the key, so a legitimate
 * collect → undo → re-collect cycle inserts cleanly the second time.
 *
 * Charges only the outstanding balance, so it composes with any earlier part-payment: an order already
 * £10 paid against a £15 total books £5 here, not £15.
 */
export async function recordCollectionPayment(
  supabase: SupabaseClient,
  opts: { orderKey: string; truckId: string; createdBy?: string | null; method?: PaymentMethod | null },
): Promise<{ inserted: boolean; balance: OrderBalance; chargedMinor: number }> {
  const [order, rows] = await Promise.all([readOrder(supabase, opts.orderKey), readLedger(supabase, opts.orderKey)])
  const before = getOrderBalance(order, rows)

  // Nothing outstanding (already settled, or a replay whose row is present): recalc so the cache is
  // correct and return without inserting a zero/negative row the CHECK would reject anyway.
  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }

  const { inserted, balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey,
    truckId: opts.truckId,
    kind: 'charge',
    channel: 'in_person_other',
    amountMinor: before.balanceMinor,
    state: 'succeeded',
    idempotencyKey: collectIdempotencyKey(opts.orderKey, before.paidMinor, before.balanceMinor),
    note: 'Mark paid & done — taken at the hatch',
    createdBy: opts.createdBy ?? null,
    method: opts.method ?? null,
    // 🔴 HARDCODED TRUE, AND CORRECTLY SO — NOT A PLACEHOLDER. This function books an IN-PERSON
    // collection: an operator standing at a hatch, having physically taken cash or run a card through
    // their own PDQ. There is no test mode for cash. No configuration, no key and no environment can
    // make this money less real, so there is nothing here to read a flag from — the truth is in what
    // the function does.
    // ⚠️ A Stripe payment does NOT come through here (see the header: this hardcodes
    // channel:'in_person_other' and derives the amount from the balance rather than from a processor).
    // The Stripe writer will be a separate caller of recordPaymentEvent that passes event.livemode.
    livemode: true,
  })

  // ── EXPECTED-VS-ACTUAL DETECTOR ────────────────────────────────────────────────────────────────
  // A swallowed duplicate (23505) is CORRECT for a genuine replay and WRONG for anything else, and the
  // two are distinguishable — this is how:
  //   genuine replay  — the row this key names already exists, so its money is already counted. The
  //                     recalc therefore shows a SMALLER balance than we measured before the insert
  //                     (normally zero). Silent success is right; the payment is recorded.
  //   real collision  — the key belongs to some OTHER, older charge, so nothing was added and the
  //                     balance is UNCHANGED. A charge was expected and none landed. Money has been
  //                     taken at the hatch that the ledger does not know about. This MUST surface.
  // (In practice a genuine replay usually never reaches here at all — the balance-zero guard above
  // short-circuits first. This covers the concurrent-race case where two requests both read a positive
  // balance before either commits.)
  const swallowedButNothingSettled = !inserted && balance.balanceMinor === before.balanceMinor
  if (swallowedButNothingSettled) {
    throw new Error(
      `[ledger] charge of ${before.balanceMinor} for ${opts.orderKey} was SWALLOWED as a duplicate but the ` +
      `balance is unchanged (${balance.balanceMinor}) — an idempotency-key collision, not a replay. ` +
      `The payment has NOT been recorded.`,
    )
  }

  return { inserted, balance, chargedMinor: inserted ? before.balanceMinor : 0 }
}

/**
 * Undo of "Mark paid & done" — reverse the payment this order's collect booked.
 *
 * DELETE when no real money moved; REVERSE when it did. Concretely: delete the row only when
 * `external_ref is null` AND `state = 'succeeded'` AND `channel != 'online'`; otherwise insert a
 * compensating refund.
 *
 * WHY: "Mark paid & done" carries a 7-second undo toast (app/dashboard/[token]/page.tsx:~1258), so the
 * overwhelming majority of undos are mis-taps seconds after the fact. Writing a charge AND a refund for a
 * mis-tap records two money events that never happened — a ledger claiming a refund was issued when
 * nothing was ever taken is actively misleading to the operator reading it back, and it would corrupt the
 * 0.99%/allowance figures §37 depends on. Deleting a row that represents no real-world event loses
 * nothing. The moment `external_ref` is set, money genuinely moved through a processor, the row has an
 * external counterpart, and it must be reversed and never deleted — which is why the rule keys on
 * external_ref rather than on elapsed time or on channel alone.
 */
export async function reverseCollectionPayment(
  supabase: SupabaseClient,
  opts: {
    orderKey: string
    truckId: string
    createdBy?: string | null
    /**
     * Called with the FULL contents of the collect row immediately BEFORE it is deleted, and awaited.
     * 🔴 IF THIS THROWS, THE DELETE DOES NOT HAPPEN and the error propagates to the caller.
     * That is the point: the row is about to stop existing, so this is the last moment its contents can
     * be captured. The route passes the append-only audit write here, so a payment record can never be
     * erased without a log of the erasure. Not called on the 'refunded' or 'none' paths — nothing is
     * destroyed there.
     */
    beforeDelete?: (row: DeletedCollectRow) => Promise<void>
  },
): Promise<{ reversal: 'deleted' | 'refunded' | 'none'; balance: OrderBalance }> {
  // ── LOOK UP BY SHAPE, NEVER BY IDEMPOTENCY KEY ─────────────────────────────────────────────────
  // 🔴 LIVE-DATA COMPATIBILITY REQUIREMENT, not a tidy-up. This used to match
  // `.eq('idempotency_key', 'collect:{order_key}')`. The key format changed (see
  // collectIdempotencyKey), so a key-based lookup would silently fail to find any row written under
  // the OLD format — every payment taken before this deploy would become un-undoable, and undo would
  // report 'none' while leaving the money on the order.
  // Matching on the row's SHAPE instead is format-agnostic: it finds old-format rows, new-format rows
  // and (once refunds exist) rows with no key at all. `channel != 'online'` preserves the original
  // intent — only an in-person charge is a candidate for the delete-vs-compensate rule below.
  // Newest first: with successive part-payments, undo reverses the one just taken, matching what the
  // 7-second toast and the paid-chip affordance both mean by "undo".
  const { data: rows, error } = await supabase
    .from('order_payments')
    // `livemode` is in this list for TWO reasons, and the second is the load-bearing one: it feeds
    // `row.livemode` on the compensating-refund path below, AND this exact row shape is what gets
    // written to action_audit_log.before_state before a delete. That log has to be enough to
    // reconstruct the destroyed row completely — a reconstruction that could not say whether the
    // payment was real would be worthless for the six-year record it exists to protect.
    .select('id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key, created_at, created_by, livemode')
    .eq('order_key', opts.orderKey)
    .eq('kind', 'charge')
    .neq('channel', 'online')
    // 🔴 A TEST ROW MUST NEVER BE THE ROW AN UNDO PICKS. This query takes the NEWEST matching charge, so
    // without the filter a test row written after a real collection would be selected instead of it —
    // and the two failure modes are both bad in the same direction: the operator taps undo, a row that
    // represents no money is deleted, and the REAL payment is left standing on an order the operator now
    // believes is unpaid. Filtered in SQL because this is a `[0]` pick, not a sum: getOrderBalance never
    // sees these rows, so the chokepoint cannot save this one. It has to be right here.
    .eq('livemode', true)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`[ledger] could not read the collect row for ${opts.orderKey}: ${error.message}`)

  const row = (rows ?? [])[0] as DeletedCollectRow | undefined
  if (!row) {
    // Nothing to reverse (never collected, or already undone). Recalc anyway so the cache is correct.
    return { reversal: 'none', balance: await recalcOrderPayment(supabase, opts.orderKey) }
  }

  const noRealMoneyMoved = row.external_ref == null && row.state === 'succeeded' && row.channel !== 'online'

  if (noRealMoneyMoved) {
    // CAPTURE BEFORE DESTROY. Awaited, and deliberately NOT wrapped in try/catch — a throw here must
    // abort the delete, leaving the ledger row intact and the undo refused.
    if (opts.beforeDelete) await opts.beforeDelete(row)
    const { error: delErr } = await supabase.from('order_payments').delete().eq('id', row.id)
    if (delErr) throw new Error(`[ledger] could not delete the collect row for ${opts.orderKey}: ${delErr.message}`)
    return { reversal: 'deleted', balance: await recalcOrderPayment(supabase, opts.orderKey) }
  }

  // Real money moved — compensate, never delete. No idempotency key: a second undo of a genuinely
  // processed payment is a distinct money event and must not be silently swallowed by a key collision.
  const { balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey,
    truckId: opts.truckId,
    kind: 'refund',
    channel: row.channel,
    amountMinor: Math.round(row.amount_minor),
    state: 'succeeded',
    note: 'Reversal of "Mark paid & done" (undo) — original payment had an external reference',
    createdBy: opts.createdBy ?? null,
    // Inherited from the row being reversed, never assumed. A compensating refund must sit on the same
    // side of the live/test line as the charge it cancels — a live refund against a test charge would
    // subtract money that was never taken, and a test refund against a live charge would leave the real
    // money standing while appearing to have reversed it. The lookup above already restricts this path
    // to livemode=true rows, so this reads `true` today; sourcing it from `row` rather than writing the
    // literal is what keeps it correct if that filter is ever widened.
    livemode: row.livemode ?? true,
  })
  return { reversal: 'refunded', balance }
}
