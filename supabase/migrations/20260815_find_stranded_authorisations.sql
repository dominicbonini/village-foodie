-- 20260815_find_stranded_authorisations.sql
-- 🔴 THE QUESTION NOTHING COULD ASK: "WHICH CONFIRMED ORDERS ARE STILL HOLDING MONEY THEY SHOULD HAVE
--    TAKEN?" One read-only function. It creates no table, alters no table, and writes nothing, ever.
--
-- ── THE BLIND SPOT THIS CLOSES ──────────────────────────────────────────────────────────────────────
-- Order 19 (12 August 2026) was confirmed at 20:40:36 with £6.50 authorised against it. Capture never
-- ran, and NOTHING IN THE SYSTEM COULD SEE THAT:
--   • the cancellation sweep filters on `promoted_at is null`, so a promoted draft is invisible to it;
--   • purge_order_drafts() skips promoted rows too, by explicit design (20260814) — they are load-bearing
--     for the CARD HELD display;
--   • action_audit_log had nothing, because capture was never ATTEMPTED, so nothing failed to record.
-- The hold was found by a human reading Stripe. Three safety nets and none of them covered the gap.
--
-- ── 🔴 WHY THIS IS SQL AND NOT A LOOP IN TYPESCRIPT ────────────────────────────────────────────────
-- The predicate spans three tables, and the discriminating half — "no `stripe_pi:` row in the ledger" —
-- is an ANTI-JOIN. PostgREST cannot express one, so a TypeScript version has to page through every
-- promoted draft that ever had an intent (which is every card order ever taken) and filter in memory.
-- That works today, on tens of rows, and silently stops finding old strandings the moment the limit is
-- smaller than the history. A silent cap on a money query is exactly the failure being closed here, so
-- the join is done where joins belong.
--
-- ── 🔴 WHAT IT WILL NOT DO, AND THIS IS THE SAFETY PROPERTY ────────────────────────────────────────
-- It cannot touch a hold that is legitimately waiting for an operator. Two independent reasons:
--   1. `o.status` must be one of the ACCEPTED statuses. A 'pending' order has not been confirmed, so its
--      hold is CORRECT and it is not returned. The list is an ALLOW-list, never a deny-list, so a status
--      added to orders_status_check in future is excluded until someone decides otherwise.
--   2. The function only ever SELECTs. Nothing downstream of it cancels: the caller
--      (app/api/cron/capture-stranded-authorizations) captures, and capture is the only verb it has.
-- 🔴 A grace window is required, not optional. Capture runs inline milliseconds after promotion writes
-- 'confirmed'; without a delay this would name every card order in flight as stranded.
--
-- ── ⚠️ DEPLOY COUPLING ─────────────────────────────────────────────────────────────────────────────
-- app/api/cron/capture-stranded-authorizations calls this by name and reports a missing function as a
-- LOUD ERROR rather than as "nothing stranded" — a backstop that answers zero when it is not installed
-- is worse than no backstop. Apply this before that route ships, or accept that it 500s until you do.
-- ⚠️ ADDITIVE AND REVERSIBLE. `drop function find_stranded_authorisations(integer, integer);` restores
-- the database exactly. No existing object is touched by this file.
--
-- VERIFY AFTER APPLYING:
--   select proname, provolatile from pg_proc where proname = 'find_stranded_authorisations';
--     -- expect one row, provolatile = 's' (stable)
--   select * from find_stranded_authorisations(0, 100);
--     -- with grace 0: every confirmed-and-uncaptured hold, including ones authorised seconds ago
--   select count(*) from find_stranded_authorisations(10, 500);
--     -- what the cron will act on

create or replace function find_stranded_authorisations(
  p_grace_minutes integer default 10,
  p_limit         integer default 100
)
returns table (
  order_key            uuid,
  truck_id             text,
  order_id             text,
  order_status         text,
  payment_intent_id    text,
  total_minor          integer,
  promoted_at          timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.order_key,
    d.truck_id,
    o.id::text          as order_id,
    o.status::text      as order_status,
    d.payment_intent_id,
    d.total_minor,
    d.promoted_at
  from order_drafts d
  join orders o on o.order_key = d.order_key
  where
    -- An authorisation exists at all.
    d.payment_intent_id is not null
    -- The draft became this order. (A draft that never promoted belongs to the CANCELLATION sweep,
    -- which owns `promoted_at is null`. These two jobs partition the space and never overlap.)
    and d.promoted_at is not null
    -- The hold has not been released. A cancelled authorisation is finished, not stranded.
    and d.authorization_cancelled_at is null
    -- 🔴 THE ORDER HAS BEEN ACCEPTED BY THE TRUCK. This is the whole safety property: 'pending' is
    -- absent, so an order still awaiting a human is never named. 'collected' IS present — an order
    -- handed over without its money taken is the worst case, not an excluded one.
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
    -- Old enough that an in-flight capture cannot be mistaken for a missing one.
    and d.promoted_at < now() - make_interval(mins => greatest(coalesce(p_grace_minutes, 10), 0))
    -- 🔴 AND NOT CAPTURED. The ledger is the authority, keyed exactly as lib/payments/online.ts's
    -- onlinePaymentIdempotencyKey() writes it and as lib/payments/held-authorisation.ts reads it.
    -- If that prefix ever changes, THIS STRING CHANGES WITH IT or the backstop reports nothing.
    and not exists (
      select 1
      from order_payments p
      where p.idempotency_key = 'stripe_pi:' || d.payment_intent_id
    )
  order by d.promoted_at asc
  limit greatest(coalesce(p_limit, 100), 1);
$$;

comment on function find_stranded_authorisations(integer, integer) is
  'READ-ONLY. Confirmed orders whose card authorisation was never captured and never cancelled — money '
  'held against food the truck has already accepted. Answers the question no other job could: the '
  'cancellation sweep only sees drafts with promoted_at IS NULL, and purge_order_drafts() deliberately '
  'skips promoted rows. Excludes pending orders by an ALLOW-list on status, because a pending order''s '
  'hold is correct and must be left alone. Called by app/api/cron/capture-stranded-authorizations, which '
  'CAPTURES what this returns and never cancels it.';

notify pgrst, 'reload schema';
