-- 20260813_order_drafts_authorization.sql
-- Phase 2b of authorize-then-capture: three columns `order_drafts` needs once real money is held
-- against a draft, and a corrected purge that cannot destroy the record of it.
--
-- ✅ ADDITIVE IN SHAPE — three nullable columns and one index on a table created three days ago that
-- nothing outside lib/payments/order-drafts.ts touches.
-- 🔴 BUT DEPLOY-COUPLED, AND IN THE DIRECTION THAT BITES. The phase-2b build issues NAMED selects
-- including `authorization_cancelled_at`, and PostgREST answers a named select on a missing column with
-- 42703 and fails the WHOLE statement. Deploy without this and every draft read returns null, which the
-- card path reads as "no draft" — so authorisations would be taken and never promoted.
--   ✅ RUN THIS BEFORE DEPLOYING PHASE 2b. Applying it early is completely harmless: three nullable
--      columns nothing yet writes.
--
-- ── 🔴 WHY THIS MIGRATION EXISTS AT ALL: A DEFECT PHASE 2a SHIPPED, FOUND WHILE WIRING 2b ─────────
-- `purge_order_drafts()` and the opportunistic purge inside createOrderDraft both delete on
--     promoted_at is null and expires_at < now()
-- which was correct when a draft was only ever a wish. It is NOT correct now. A draft can carry a LIVE
-- STRIPE AUTHORISATION — real money held on a real customer's card — and deleting that row destroys the
-- only record linking the PaymentIntent to anything we know about. The money would sit authorised until
-- Stripe expired it (seven days), with nothing in this system able to name it.
-- 🔴 A PURGE MUST NEVER OUTRUN A CANCELLATION. From here, a draft with a payment_intent_id is deletable
-- ONLY once `authorization_cancelled_at` is set. The cancellation sweep sets it; the purge waits for it.
-- The lib-side guard is in lib/payments/order-drafts.ts; this file fixes the SQL function.
--
-- VERIFY AFTER APPLYING:
--   select column_name from information_schema.columns where table_name = 'order_drafts'
--     and column_name in ('authorization_cancelled_at','promotion_failed_at','promotion_failure_reason');
--   -- expect 3 rows
--   select pg_get_functiondef(oid) like '%authorization_cancelled_at%' from pg_proc where proname='purge_order_drafts';
--   -- expect: t

alter table order_drafts
  -- Set when the PaymentIntent behind this draft has been CANCELLED at Stripe and the hold released.
  -- Null with a non-null payment_intent_id means money may still be held. That combination is what the
  -- cancellation sweep looks for, and what the purge refuses to delete.
  add column if not exists authorization_cancelled_at timestamptz,
  -- Promotion was attempted and refused — almost always the stock/capacity re-check finding that what
  -- the customer authorised for is no longer available. Recorded rather than inferred so the state is
  -- legible: a draft with promotion_failed_at set and promoted_at null is one somebody paid for and we
  -- could not serve, and it MUST end up with authorization_cancelled_at set too.
  add column if not exists promotion_failed_at timestamptz,
  -- The operator-legible reason. Short slug plus detail, e.g. 'stock: Margherita'. Never shown raw to a
  -- customer; the customer-facing wording lives in the return route.
  add column if not exists promotion_failure_reason text;

-- 🔴 THE SWEEP'S INDEX. "Has money against it, has not been promoted, has not been cancelled" is the
-- exact question the cancellation job asks, and it must not be a sequential scan on a table that gets
-- one row per card order.
create index if not exists order_drafts_uncancelled_authorization
  on order_drafts(expires_at)
  where payment_intent_id is not null and promoted_at is null and authorization_cancelled_at is null;

comment on column order_drafts.authorization_cancelled_at is
  'Set once the PaymentIntent hold has been released at Stripe. A draft with a payment_intent_id and '
  'NULL here may still be holding a customer''s money and must not be deleted.';
comment on column order_drafts.promotion_failed_at is
  'Promotion was attempted and refused (usually the stock re-check). The authorisation must then be '
  'cancelled: this row is money taken for an order that cannot exist.';

-- ── THE CORRECTED PURGE ──────────────────────────────────────────────────────────────────────────
-- Same job as before — erase abandoned drafts and the PII they carry — with ONE new condition, which is
-- the whole point of this migration.
--
-- 🔴 A DRAFT THAT HOLDS MONEY IS NOT ABANDONED, IT IS OUTSTANDING. It becomes deletable only when the
-- authorisation behind it has been cancelled. A draft that never reached Stripe (payment_intent_id
-- null) is deletable exactly as before.
-- ⚠️ THE CONSEQUENCE, STATED: if the cancellation sweep stops running, rows accumulate and their PII
-- outlives its expiry. That is the correct trade — customer details lingering is recoverable, money
-- held against a record we deleted is not — but it means the cancellation sweep is now load-bearing for
-- erasure too, not only for money. See app/api/cron/cancel-stale-authorizations.
create or replace function purge_order_drafts() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from order_drafts
   where promoted_at is null
     and expires_at < now()
     -- 🔴 THE NEW CONDITION. Never delete a row that may still be holding a customer's money.
     and (payment_intent_id is null or authorization_cancelled_at is not null);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function purge_order_drafts() is
  'GDPR erasure for abandoned order drafts: hard-deletes expired, never-promoted rows whose '
  'authorisation is either absent or already cancelled. Promoted rows already carry no PII.';

notify pgrst, 'reload schema';
