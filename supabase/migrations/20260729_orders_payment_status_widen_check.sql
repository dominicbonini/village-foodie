-- 20260729_orders_payment_status_widen_check.sql
-- Widen the orders.payment_status CHECK to admit 'part_paid' and 'refund_due'. Payments phase 1a (V9.4).
--
-- 🔴 CLASSIFICATION: **DEPLOY-COUPLED — RUN THIS BEFORE DEPLOYING THE APP.**
-- lib/payments/ledger.ts writes 'part_paid' and 'refund_due' whenever an order is part-paid or
-- over-refunded. A CHECK violation is not a warning: Postgres REJECTS THE WRITE OUTRIGHT (SQLSTATE
-- 23514), so with the old constraint in place the rollup's write-back fails, recalcOrderPayment throws,
-- and — because the phase-1a handlers surface rather than swallow payment errors — "Mark paid & done"
-- returns 500 on a live trading path.
-- ⚠️ It FAILS SAFE, not silently: recalcOrderPayment inspects error.code === '23514' and says explicitly
-- that this migration has not been applied. That is by design; do not rely on it as a substitute for
-- running this first.
-- RUN ORDER: 20260729_order_payments_ledger.sql FIRST, then THIS, then deploy.
-- Applying it early is harmless — widening an enum-style CHECK cannot reject any existing row, and the
-- old code never writes the two new values.
--
-- ── WHY THE TWO NEW VALUES ──────────────────────────────────────────────────────────────────────────
-- The original four cannot express an order edited after payment (§37): paid £30, operator adds an item
-- → £35 total, £5 due — 'paid' is wrong and 'unpaid' is wrong. 'part_paid' is that state; 'refund_due'
-- is its mirror after a downward edit. Both are DERIVED, computed only by lib/payments/ledger.ts.
--
-- ⚠️ PAIRED CODE CHANGE — these must ship together: lib/supabase.ts declares the union
-- `'unpaid' | 'paid' | 'part_paid' | 'refunded' | 'refund_due' | 'failed'`. TypeScript rejects the
-- rollup's own writes without it, so a build that compiles is NOT evidence this migration has run.
--
-- ⚠️ Payment stays ORTHOGONAL to fulfilment. This touches `payment_status` ONLY. `orders.status` keeps
-- its eight operational values and gains no payment value — making "paid" a ninth status would serialise
-- two independent things and the kitchen board would immediately misreport where food is (§35).
--
-- IDEMPOTENT: the DO block drops every CHECK on `orders` whose definition mentions payment_status —
-- including the one this file adds — so re-running converges rather than erroring on a duplicate name.
-- It is written as a loop over pg_constraint rather than `drop constraint if exists <name>` because the
-- original constraint's name was assigned by Postgres and is not asserted anywhere in this repo.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- the constraint definition itself — must list all SIX values
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'orders'::regclass and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%payment_status%';
--   -- exactly one such constraint should remain
--   select count(*) from pg_constraint
--    where conrelid = 'orders'::regclass and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%payment_status%';          -- expect 1
--   -- positive proof the new values are actually accepted (rolled back, writes nothing):
--   begin;
--     update orders set payment_status = 'part_paid'
--      where order_key = (select order_key from orders limit 1);
--     -- if this errored, the migration has NOT taken effect
--   rollback;
--   -- and the data is untouched: still only pre-existing values in the column
--   select payment_status, count(*) from orders group by payment_status order by 2 desc;

do $$
declare
  c record;
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
  check (payment_status in ('unpaid', 'paid', 'part_paid', 'refunded', 'refund_due', 'failed'));

comment on column orders.payment_status is
  'DERIVED CACHE — recomputed from the order_payments ledger by lib/payments/ledger.ts, never hand-written (the three order-CREATION sites initialise it to the default ''unpaid'', which is not a violation). Canonical for payment state; paid_at remains only as a compatibility timestamp. Orthogonal to orders.status, which carries no payment value.';

notify pgrst, 'reload schema';
