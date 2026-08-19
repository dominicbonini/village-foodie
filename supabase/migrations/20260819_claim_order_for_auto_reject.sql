-- 20260819_claim_order_for_auto_reject.sql
-- 🔴 CLAIM ONE ORDER FOR AUTOMATIC REJECTION, UNDER A ROW LOCK. IT WRITES NOTHING.
--
-- 🚫 NOT RUN. Dominic runs all SQL by hand.
--
-- ── WHAT IT IS FOR ──────────────────────────────────────────────────────────────────────────────────
-- When a van is offline in `no_auto_accept` mode, customers can still order and every order lands
-- `pending` with its slot held. Nobody can accept them — the device is unreachable, which is the whole
-- premise. This function hands the sweep ONE such order at a time, and refuses to hand over any order
-- whose preconditions stopped being true.
--
-- ── 🔴 WHY A STATUS CHECK ALONE IS THE WRONG GUARD, AND THIS EXISTS ────────────────────────────────
-- The rows the sweep wants are chosen by `truck_events.offline_no_autoaccept_until`, and /api/heartbeat
-- NULLS that marker the instant the van pings. An order whose truck just came back is STILL `pending` —
-- so a guard on `orders.status` passes and the sweep rejects an order that is now the operator's to
-- accept. The marker, the event status and the age are therefore re-read AFTER the lock, in this
-- transaction, and any one of them failing returns nothing.
--
-- ── THE SHAPE, AND WHY IT IS TWO STEPS RATHER THAN ONE JOINED `for update` ─────────────────────────
-- A single `select … from orders o join truck_events e … for update of o` would lock the order and
-- re-evaluate the qualifier on the LOCKED row — but only for `orders`' own columns. Postgres does not
-- re-check the joined tables, which is exactly where the marker lives. So: pick a candidate, lock it,
-- and only then read the event and the van. The second read is the guard; the join in step 1 is only a
-- cheap way to find a likely row.
--
-- ── 🔴 THE WINDOW THIS DOES NOT CLOSE, STATED RATHER THAN IMPLIED ──────────────────────────────────
-- The lock is released when this function returns, because the caller then rejects the order in a
-- SEPARATE statement. Between the two, an operator can still confirm. This narrows the race from "the
-- whole sweep run" to one round trip; it does not remove it. Closing it fully would mean this function
-- performing the rejection itself, which would put a second implementation of the hold release in the
-- database — the one thing lib/orders/reject-order.ts exists to prevent.
--
-- ── SECURITY SETTINGS: THIS REPO HAS TWO CONVENTIONS AND THIS FOLLOWS THE WRITER'S ─────────────────
-- `security definer` + `set search_path = public` is what the READ-ONLY reporting functions carry:
-- find_stranded_authorisations, purge_order_drafts, the order_drafts helpers. Every function that takes
-- a lock or writes — assign_buzzer_atomic, place_order_atomic, increment_event_order_counter — is plain
-- `language plpgsql` with invoker rights. This takes a lock, is called only by a cron route holding the
-- service-role key, and follows the writers.
--
-- ── ⚠️ TIMEZONES: THERE ARE NONE HERE, AND THAT IS NOT AN OVERSIGHT ────────────────────────────────
-- The trading-window test is `e.status = 'open'` — the same live test heartbeat-monitor uses, chosen so
-- the timezone rule is not duplicated in SQL. The only clock comparison is on `orders.created_at`, a
-- TIMESTAMPTZ: an absolute instant, so `now() - interval` needs no timezone to be correct. A wall-clock
-- column would have needed one; this does not.
--
-- ✅ ADDITIVE. It creates one function and nothing else — no table, no column, no constraint, no write.
-- 🔴 DEPLOY ORDER: MIGRATION FIRST, DEPLOY SECOND. The route calls supabase.rpc('claim_order_for_auto_
-- reject'); against a database without it every invocation returns PGRST202 and the sweep does nothing —
-- the same failure mode assign_buzzer_atomic's header records. The reverse order is safe: an unused
-- function changes nothing for the running build.
--
-- VERIFY AFTER APPLYING:
--   select proname from pg_proc where proname = 'claim_order_for_auto_reject';   -- expect 1 row
--   select * from claim_order_for_auto_reject();
--     -- expect NO rows today: every van's offline_auto_reject_mins is null, so nothing is eligible
--   select id, offline_protection_mode, offline_auto_reject_mins from truck_vans;

create or replace function claim_order_for_auto_reject(
  -- Order keys this run has already been handed. Without it a caller that loops would be handed the
  -- same oldest row for ever if the rejection failed to write — a live-lock, not a no-op.
  p_exclude uuid[] default '{}'::uuid[]
)
returns table (
  order_key   uuid,
  truck_id    text,
  event_id    uuid,
  order_id    text,
  delay_mins  integer,
  age_secs    integer
)
language plpgsql
as $$
declare
  v_key        uuid;
  v_order      record;
  v_ev_status  text;
  v_marker     timestamptz;
  v_delay      integer;
begin
  -- ── 1. FIND A LIKELY CANDIDATE. Oldest first, and this is NOT the guard. ───────────────────────
  select o.order_key
    into v_key
    from orders o
    join truck_events e on e.id = o.event_id
    join truck_vans   v on v.id = e.van_id
   where o.status = 'pending'
     and e.status = 'open'
     and e.offline_no_autoaccept_until is not null
     and e.offline_no_autoaccept_until > now()
     -- NULL MEANS OFF. No coalesce to a default: a van with no value set must never be swept.
     and coalesce(e.offline_auto_reject_mins_override, v.offline_auto_reject_mins) is not null
     and o.created_at < now() - make_interval(
           mins => coalesce(e.offline_auto_reject_mins_override, v.offline_auto_reject_mins))
     and not (o.order_key = any(p_exclude))
   order by o.created_at asc
   limit 1;

  if v_key is null then
    return;                                   -- nothing eligible. The normal case.
  end if;

  -- ── 2. LOCK THE ORDER ROW. `skip locked` so two overlapping runs never queue on each other. ────
  select o.order_key, o.id, o.truck_id, o.event_id, o.status, o.created_at
    into v_order
    from orders o
   where o.order_key = v_key
   for update skip locked;

  if not found then
    return;                                   -- another run holds it. Not an error.
  end if;

  -- ── 3. RE-CHECK EVERYTHING, AGAINST THE STATE AS IT IS NOW. ────────────────────────────────────
  -- 🔴 THIS IS THE GUARD. Step 1 was a search; these four tests are what decide.
  if v_order.status is distinct from 'pending' then
    return;                                   -- somebody accepted, cooked, cancelled or rejected it.
  end if;

  select e.status,
         e.offline_no_autoaccept_until,
         coalesce(e.offline_auto_reject_mins_override, v.offline_auto_reject_mins)
    into v_ev_status, v_marker, v_delay
    from truck_events e
    join truck_vans   v on v.id = e.van_id
   where e.id = v_order.event_id;

  if not found                                 then return; end if;  -- no event, or no van on it
  if v_ev_status is distinct from 'open'        then return; end if;  -- not trading. The window test.
  if v_marker is null or v_marker <= now()      then return; end if;  -- 🔴 THE VAN CAME BACK.
  if v_delay is null                            then return; end if;  -- the feature is off for this van
  if v_order.created_at > now() - make_interval(mins => v_delay) then
    return;                                    -- too young. Age is judged per ORDER, never per outage.
  end if;

  -- ── 4. HAND IT OVER. Nothing has been written; the caller does the rejecting. ──────────────────
  return query
    select v_order.order_key,
           v_order.truck_id,
           v_order.event_id,
           v_order.id,
           v_delay,
           (extract(epoch from (now() - v_order.created_at)))::integer;
end;
$$;

comment on function claim_order_for_auto_reject(uuid[]) is
  'READ-ONLY, UNDER A ROW LOCK. Returns at most one `pending` order that is eligible for automatic '
  'rejection: its event is ''open'', its offline_no_autoaccept_until marker is still live, its van (or '
  'event override) has an offline_auto_reject_mins value, and the order is older than that delay. Locks '
  'the order FOR UPDATE SKIP LOCKED and re-reads the event AFTER the lock, because /api/heartbeat can '
  'null the marker at any moment and a guard on orders.status alone would not see that. WRITES NOTHING — '
  'the caller rejects through lib/orders/reject-order.ts, which is the single implementation of the card '
  'hold release. NULL offline_auto_reject_mins means OFF and is never defaulted.';

notify pgrst, 'reload schema';
