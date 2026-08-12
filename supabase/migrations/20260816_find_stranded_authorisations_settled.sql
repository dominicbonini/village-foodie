-- 20260816_find_stranded_authorisations_settled.sql
-- 🔴 STOP THE SWEEP SELECTING ORDERS THAT HAVE ALREADY BEEN PAID.
--
-- ── WHAT THIS COST, IN REAL ROWS ────────────────────────────────────────────────────────────────────
-- Orders 18 and 19, 12 August 2026. An operator pressed Mark paid at 21:14:05 and 21:14:07, booking an
-- in-person charge for each. SEVENTY SECONDS LATER this function returned both rows and the sweep
-- captured their held cards. Two customers were charged twice:
--     #18  £6.00 order  ->  £12.00 taken   payment_status refund_due
--     #19  £6.50 order  ->  £13.00 taken   payment_status refund_due
-- These are Connect DIRECT charges, so the platform cannot refund them. Only the truck can.
--
-- ── 🔴 WHY THE OLD PREDICATE COULD NOT HAVE CAUGHT IT ──────────────────────────────────────────────
-- Its only ledger test is `not exists (... where p.idempotency_key = 'stripe_pi:' || d.payment_intent_id)`.
-- An in-person payment's key is `collect:<order_key>:<paid_before>:<balance>`. Those two strings can
-- never be equal, so that clause is not a filter that missed a case — it can only ever match one row,
-- and every other payment in the ledger is outside its field of view. It is KEPT below, unchanged: it
-- still answers "did we already capture THIS intent", which is a different and still-useful question.
--
-- ── WHAT IS ADDED, AND WHY IT IS payment_status RATHER THAN A SUM ──────────────────────────────────
--     and coalesce(o.payment_status, 'unpaid') not in ('paid', 'refund_due')
-- 🔴 `orders.payment_status` IS NOT A SECOND OPINION. It is written by exactly one function —
-- recalcOrderPayment, "the ONLY writer of payment_status/amount_paid" — from getOrderBalance, which is
-- the codebase's documented chokepoint for paid-ness. So this clause cannot drift from the balance: the
-- balance is what writes it.
-- ⚠️ THE ALTERNATIVE WAS RE-IMPLEMENTING getOrderBalance IN SQL, and it was rejected. Summing
-- order_payments here would mean reproducing isLiveRow — livemode, channel, and the account_is_test
-- annotation that only lib/payments/ledger.ts knows how to compute — in a second language, where it
-- would drift the first time either changed. A cached answer from the one true source beats a fresh
-- answer from a copy.
-- ⚠️ ITS COST, STATED: the cache can be stale if a recalc failed. That is acceptable HERE because this
-- is the SECOND of two layers. captureOnConfirmation now reads the live balance through
-- readOrderBalance before every capture and refuses `not_owed`, so a stale cache costs a wasted row in
-- this result set, never a double charge.
--
-- ── 🔴 'part_paid' IS DELIBERATELY STILL SELECTED, AND THAT IS NOT AN OVERSIGHT ────────────────────
-- A part-paid order genuinely still owes money, so it is not "settled" and this function should not
-- pretend otherwise. What must not happen is CAPTURING the whole hold against it, and that decision now
-- lives in captureOnConfirmation, which refuses with reason 'part_paid' and records it. Excluding it
-- here would hide the state instead of surfacing it.
--
-- ⚠️ WHAT IS NOT CHANGED: the allow-list on o.status, including 'collected'. The 12 August incident did
-- NOT come through it — both orders were 'confirmed', and mark_paid never writes status. Narrowing the
-- allow-list would have prevented nothing and would blind the sweep to an order handed over unpaid.
--
-- ✅ ADDITIVE AND REVERSIBLE. `create or replace` on one read-only function. It creates and alters no
-- table, writes nothing, and re-applying 20260815 restores the previous definition exactly.
-- ⚠️ DEPLOY ORDER DOES NOT MATTER. The TypeScript guard is independent and complete on its own; this
-- narrows what the sweep even looks at.
--
-- VERIFY AFTER APPLYING:
--   select * from find_stranded_authorisations(0, 100);
--     -- expect NO row whose order reads payment_status 'paid' or 'refund_due'
--   select o.id, o.payment_status from orders o
--    where o.order_key in (select order_key from find_stranded_authorisations(0, 500));
--     -- expect only 'unpaid' and 'part_paid'

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
    -- 🔴 AND IT STILL OWES MONEY. Added 16 August 2026 after orders 18 and 19 were each charged twice.
    -- 'paid' means somebody already settled it; 'refund_due' means somebody settled it TWICE and this
    -- function must not make a third attempt. See the header for why this column and not a sum.
    and coalesce(o.payment_status, 'unpaid') not in ('paid', 'refund_due')
    -- Old enough that an in-flight capture cannot be mistaken for a missing one.
    and d.promoted_at < now() - make_interval(mins => greatest(coalesce(p_grace_minutes, 10), 0))
    -- AND NOT CAPTURED BY US. The ledger is the authority, keyed exactly as lib/payments/online.ts's
    -- onlinePaymentIdempotencyKey() writes it. ⚠️ THIS CLAUSE ONLY EVER SEES ONE ROW — it answers "did
    -- we capture this intent", NOT "has this order been paid". The clause above answers that one.
    and not exists (
      select 1
      from order_payments p
      where p.idempotency_key = 'stripe_pi:' || d.payment_intent_id
    )
  order by d.promoted_at asc
  limit greatest(coalesce(p_limit, 100), 1);
$$;

comment on function find_stranded_authorisations(integer, integer) is
  'READ-ONLY. Accepted orders that STILL OWE MONEY and whose card authorisation was never captured or '
  'cancelled. Excludes orders whose payment_status is already ''paid'' or ''refund_due'': on 12 August '
  '2026 two orders were marked paid in person and then captured 70 seconds later by this sweep, '
  'charging both customers twice, because the only ledger test was an equality on the '
  '''stripe_pi:'' idempotency key, which cannot match an in-person ''collect:'' row. Excludes pending '
  'orders by an ALLOW-list on status, because a pending order''s hold is correct. Called by '
  'app/api/cron/capture-stranded-authorizations, which CAPTURES what this returns and never cancels it '
  '- and which now also refuses, per order, if captureOnConfirmation finds the balance settled.';

notify pgrst, 'reload schema';
