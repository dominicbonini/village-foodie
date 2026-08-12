-- 20260817_orders_payment_status_part_refunded.sql
-- 🔴 ADMIT 'part_refunded'. DEPLOY-COUPLED: APPLY THIS BEFORE THE BUILD THAT WRITES IT.
--
-- ── THE DEFECT IT EXISTS FOR ────────────────────────────────────────────────────────────────────────
-- A £6.50 order charged in full and then refunded £2.00 computes paidMinor 450, balanceMinor 200 —
-- ARITHMETICALLY IDENTICAL to an order that has only ever paid £4.50 of £6.50. Both fell to
-- 'part_paid', so the order card printed the amber "£4.50 / £2.00 due" chip and the printed ticket
-- said "TO PAY £2.00". That is an instruction to collect £2.00 from a customer who was just refunded
-- £2.00 — wrong in the direction that takes money from the wrong person.
-- getOrderBalance now distinguishes them the same way it already distinguishes 'refunded' from
-- 'unpaid': on refund-row PRESENCE, never on the sum. The arithmetic is untouched.
--
-- ── 🔴 WHY THIS IS A HARD DEPLOY COUPLING, NOT A NICE-TO-HAVE ──────────────────────────────────────
-- recalcOrderPayment is "the ONLY writer of payment_status/amount_paid" and writes whatever
-- getOrderBalance returns. The moment a partial refund reaches the ledger, that write-back attempts
-- 'part_refunded' and, without this migration, fails the CHECK with 23514. recalcOrderPayment already
-- names that error class explicitly:
--     "A CHECK violation here (23514) almost certainly means the DEPLOY-COUPLED constraint migration
--      ... has not been applied"
-- ⚠️ AND IT THROWS. recordPaymentEvent inserts the ledger row and THEN recalcs, so an unapplied
-- migration leaves the refund row COMMITTED and the cached status stale, with the caller seeing an
-- error. Recoverable (re-run recalcOrderPayment) but noisy. Apply this first.
--
-- ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────────────────────────────
-- ⚠️ NO BACKFILL, AND NONE IS POSSIBLE TO GET WRONG. The value is derived, never hand-written, and the
-- live database holds no partially-refunded order today (distinct values: unpaid 317, paid 170,
-- refund_due 3). Existing rows are untouched and remain valid under the widened CHECK.
-- ⚠️ IT DOES NOT TOUCH order_payments. That table's own CHECKs already admit everything a refund needs:
--     kind    in ('charge', 'refund')
--     state   in ('pending', 'succeeded', 'failed')
--     channel in ('online', 'in_person_stripe', 'in_person_other')
-- A refund row is `kind: 'refund'`, `channel: 'online'`, `state: 'succeeded'`, amount POSITIVE — the
-- kind carries the sign, exactly as the ledger's own CHECK requires.
--
-- ✅ WIDENING ONLY. Every value the old constraint admitted, this one admits. No row can become
-- invalid, so it is safe to apply ahead of the deploy and safe to leave applied if the deploy is rolled
-- back. The reverse — deploying the code first — is the one order that breaks.
--
-- IDEMPOTENT: the DO block drops every CHECK on `orders` whose definition mentions payment_status, the
-- same shape 20260729_orders_payment_status_widen_check.sql used, so re-running is harmless.
--
-- VERIFY AFTER APPLYING:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'orders'::regclass and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%payment_status%';       -- expect 1, listing part_refunded
--   update orders set payment_status = 'part_refunded' where false;  -- expect: no error, 0 rows
--   select payment_status, count(*) from orders group by 1 order by 2 desc;

do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'orders'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%payment_status%'
  loop
    execute format('alter table orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'part_paid', 'refunded', 'part_refunded', 'refund_due', 'failed'));

comment on column orders.payment_status is
  'DERIVED CACHE — recomputed from the order_payments ledger by lib/payments/ledger.ts, never hand-written (the three order-CREATION sites initialise it to the default ''unpaid'', which is not a violation). Canonical for payment state; paid_at remains only as a compatibility timestamp. Orthogonal to orders.status, which carries no payment value. ''part_refunded'' means CHARGED IN FULL AND PARTIALLY REFUNDED — arithmetically identical to ''part_paid'' and distinguished only by the presence of a refund row, because printing "TO PAY" at a hatch for money that was just given back is the failure this value exists to prevent.';

notify pgrst, 'reload schema';
