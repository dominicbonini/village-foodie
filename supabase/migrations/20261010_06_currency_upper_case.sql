-- 20261010_06_currency_upper_case.sql
-- Country settings, Part A, file 6 of 9: currency codes are upper case everywhere.
--   (a) the one lower-case ledger row is upper-cased;
--   (b) CHECK (currency = upper(currency)) on order_drafts and trucks.
-- The same CHECK on order_payments is deliberately NOT here — it is 20261010_09, which must wait for
-- Part B's fix to the code that wrote the lower-case row. See (c) below.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Guarded, so re-running is safe (a second run finds no lower-case row and no missing check).
--
-- ✅ CLASSIFICATION: SAFE TO RUN NOW. No code writes a lower-case value to order_drafts or trucks:
--    order_drafts.currency is written only by lib/payments/order-drafts.ts as `draft.currency ?? 'GBP'`
--    and the one caller (app/api/orders/submit/route.ts createOrderDraft) never passes a currency;
--    trucks.currency has no writer in the app at all.
--
-- ── (a) THE ONE ROW, AND WHERE IT CAME FROM ─────────────────────────────────────────────────────────
-- Live (Dominic, 10 October 2026): 644 order_payments rows 'GBP', ONE row 'gbp', livemode false.
-- 🔎 It was NOT the Stripe webhook — that upper-cases both PaymentIntent and Refund currencies
-- (app/api/webhooks/stripe/route.ts:540 and :778). The writer is the SYNCHRONOUS REFUND PATH:
--   lib/payments/refund.ts:253   currency: refund.currency ?? undefined    ← Stripe returns 'gbp'
--   → recordOnlineCardRefund (lib/payments/online.ts:168) → recordPaymentEvent (lib/payments/ledger.ts:579)
-- It writes the refund row first under the `stripe_re:` idempotency key, so the webhook's upper-cased
-- copy of the same refund then collides and is dropped. Its livemode comes from the key's mode, which
-- is why the row is livemode = false. Part B upper-cases at that line.
--
-- ── 🔴 THE LEDGER IS NOT APPEND-ONLY, AND THIS FILE CHECKS RATHER THAN ASSUMES ──────────────────────
-- In this repository order_payments has no trigger, no rule and no policy (20260729_order_payments_ledger:
-- RLS on, zero policies, by design), and the ledger is mutable by design — an undo DELETES a collect row.
-- But trucks.country existed live with no migration here, so the repository is not proof of the live
-- table. The guard below reads the live catalogue and REFUSES — the whole file rolls back, nothing is
-- updated — if it finds any user trigger, any rewrite rule, any policy, or forced RLS on order_payments.
-- If that fires: STOP and report it. Do not work around it.
--
-- It also refuses if there is more than ONE lower-case row, or if the one row is livemode = true: the
-- only data change this part is allowed is that one test-mode row.
--
-- ── (c) WHY THE order_payments CHECK WAITS ─────────────────────────────────────────────────────────
-- With the CHECK in place and refund.ts unfixed, the next synchronous refund's ledger insert fails the
-- CHECK. refund.ts catches that (its "REFUNDED BUT NOT RECORDED" branch) and returns balance: null, and
-- the webhook later writes the row — so no money is lost, but what the operator sees after a refund
-- changes. That is a change a UK truck would see, so the CHECK goes in only after Part B ships.
--
-- VERIFY AFTER APPLYING:
--   select currency, livemode, count(*) from public.order_payments group by 1, 2 order by 1, 2;
--     -- expect no lower-case currency
--   select conrelid::regclass, conname, convalidated from pg_constraint
--    where conname in ('order_drafts_currency_upper_chk', 'trucks_currency_upper_chk');  -- expect both t

set lock_timeout = '3s';

begin;

do $$
declare
  v_triggers int;
  v_rules    int;
  v_policies int;
  v_forced   boolean;
  v_lower    int;
  v_lower_live int;
begin
  select count(*) into v_triggers
    from pg_trigger
   where tgrelid = 'public.order_payments'::regclass and not tgisinternal;

  select count(*) into v_rules
    from pg_rules
   where schemaname = 'public' and tablename = 'order_payments';

  select count(*) into v_policies
    from pg_policies
   where schemaname = 'public' and tablename = 'order_payments';

  select relforcerowsecurity into v_forced
    from pg_class where oid = 'public.order_payments'::regclass;

  if v_triggers > 0 or v_rules > 0 or v_policies > 0 or v_forced then
    raise exception
      'STOP: order_payments has % trigger(s), % rule(s), % policy row(s), forced RLS = %. It may be protected against updates. Nothing has been changed. Report this rather than working around it.',
      v_triggers, v_rules, v_policies, v_forced;
  end if;

  select count(*), count(*) filter (where livemode)
    into v_lower, v_lower_live
    from public.order_payments
   where currency <> upper(currency);

  if v_lower > 1 or v_lower_live > 0 then
    raise exception
      'STOP: expected at most ONE lower-case currency row, test mode only. Found % row(s), % of them livemode = true. Nothing has been changed.',
      v_lower, v_lower_live;
  end if;

  update public.order_payments
     set currency = upper(currency)
   where currency <> upper(currency);

  raise notice 'order_payments: upper-cased % row(s)', v_lower;
end $$;

-- (b) order_drafts
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.order_drafts'::regclass and conname = 'order_drafts_currency_upper_chk'
  ) then
    alter table public.order_drafts
      add constraint order_drafts_currency_upper_chk check (currency = upper(currency)) not valid;
  end if;
end $$;
alter table public.order_drafts validate constraint order_drafts_currency_upper_chk;

-- (b) trucks
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.trucks'::regclass and conname = 'trucks_currency_upper_chk'
  ) then
    alter table public.trucks
      add constraint trucks_currency_upper_chk check (currency = upper(currency)) not valid;
  end if;
end $$;
alter table public.trucks validate constraint trucks_currency_upper_chk;

commit;
