-- 20261010_09_order_payments_currency_upper_check.sql
-- Country settings, Part A, file 9 of 9: CHECK (currency = upper(currency)) on order_payments.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Guarded, so re-running is safe.
--
-- 🔴 CLASSIFICATION: DEPLOY-COUPLED. RUN ONLY AFTER PART B'S FIX IS DEPLOYED — the change that makes
--    lib/payments/refund.ts:253 pass `refund.currency?.toUpperCase()` (or uppercases in
--    recordPaymentEvent, lib/payments/ledger.ts:579). Until then the synchronous refund path writes
--    Stripe's lower-case 'gbp', and with this CHECK in place that insert would fail: refund.ts would take
--    its "REFUNDED BUT NOT RECORDED" branch and return balance: null to the operator, and the webhook would
--    write the row a few seconds later. No money would be lost, but what a UK operator sees after a refund
--    would change, which Part A must not do.
--    Also run 20261010_06 first: VALIDATE fails while the one lower-case row is still lower-case.
--
-- VERIFY AFTER APPLYING:
--   select conname, convalidated from pg_constraint where conname = 'order_payments_currency_upper_chk';

set lock_timeout = '3s';

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.order_payments'::regclass and conname = 'order_payments_currency_upper_chk'
  ) then
    alter table public.order_payments
      add constraint order_payments_currency_upper_chk check (currency = upper(currency)) not valid;
  end if;
end $$;
alter table public.order_payments validate constraint order_payments_currency_upper_chk;

commit;
