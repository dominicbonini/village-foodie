-- 20260804_assign_buzzer_atomic.sql
-- The TWO-ROW buzzer write, atomic, plus replay conflict resolution by placed_at.
-- Replaces phase 1's two sequential UPDATEs from the API route (lib/buzzer.ts assignBuzzer).
--
-- 🔴 DEPLOY-COUPLED. `orders.buzzer_lost_at` is added here and is named in an explicit select in
-- app/api/dashboard/route.ts, and `assign_buzzer_atomic` is called by supabase.rpc(). If the app
-- deploys first: the RPC call returns PGRST202 (function not found) and EVERY buzzer write fails, and
-- the named select returns 42703 and blanks the board (the incident recorded at
-- app/api/dashboard/route.ts:139-157). Run this BEFORE deploying. The reverse order is safe — a
-- nullable column and an unused function change nothing for the running build.
--
-- VERIFY AFTER APPLYING:
--   select column_name from information_schema.columns
--    where table_name='orders' and column_name='buzzer_lost_at';                       -- expect 1 row
--   select proname from pg_proc where proname='assign_buzzer_atomic';                  -- expect 1 row

-- ── (a) orders.buzzer_lost_at ─────────────────────────────────────────────────────────────────────
-- ⚠️ NOT IN THE PHASE-2 BRIEF. It is the minimum persistent state the "Order #12 doesn't have a
-- buzzer" banner needs in order to follow CapacityBreachBanner's pattern, which is server-computed
-- (detectCapacityBreaches → /api/dashboard → client renders, client-side dismissal). Without a stored
-- fact there is nothing for the server to compute: the loser would only ever be visible on the one
-- device that happened to run the drain, would not survive a reload, and would never reach the other
-- devices looking at the same board. Surfacing it from drainOutbox instead would have meant inventing
-- a new cross-component channel — the exact thing the brief said not to do.
--
-- Set ONLY by automatic conflict resolution, on whichever order ends up WITHOUT the buzzer. Never set
-- by an operator's confirmed "take it from order #15" — they were told and they chose, so there is
-- nothing to flag. Cleared whenever that order is given a buzzer, or explicitly cleared.
alter table orders
  add column if not exists buzzer_lost_at timestamptz;

comment on column orders.buzzer_lost_at is
  'Set by assign_buzzer_atomic when AUTOMATIC conflict resolution left this order without the buzzer it claimed (offline replay, later placed_at wins). Drives the operator banner. NEVER set by an operator-confirmed take. Cleared when the order is given a buzzer.';

-- ── (b) assign_buzzer_atomic ──────────────────────────────────────────────────────────────────────
-- ONE TRANSACTION, so buzzer 7 is never on two orders and never on neither. Phase 1 did this as two
-- sequential statements from the route with the clear deliberately first, accepting a small window in
-- which the number could appear free while a customer held it. That window is closed here.
--
-- ── 🔴 CLOCK DEPENDENCE IS INTRODUCED HERE, DELIBERATELY, AND NOWHERE ELSE. ───────────────────────
-- ⚠️ IF YOU ARE HERE TO "FIX THE INCONSISTENCY" BY MAKING STATUS REPLAY CLOCK-BASED TOO: DO NOT.
-- Offline replay ordering everywhere else is `seq` — an explicitly clock-independent per-device
-- counter (lib/native/outbox.ts:27, "monotonic per-device counter (ordering, clock-independent)") —
-- and `client_ts` is stored but marked "display only — NEVER used for reconciliation"
-- (lib/native/outbox.ts:62). That is because device clocks lie: they drift, they get set by hand, and
-- two handsets in one van can disagree by minutes.
-- The asymmetry is a judgement about BLAST RADIUS, not an oversight:
--   • A wrong buzzer resolution is a VISIBLE OPERATIONAL ANNOYANCE. One customer is called by the
--     wrong pager, an operator sees the banner and fixes it in two taps. It is self-correcting because
--     a human is standing there holding the physical object.
--   • A wrong STATUS replay CORRUPTS THE ORDER PIPELINE — an order marked collected that was not, a
--     cancel silently overwritten. Nobody is standing over it and nothing self-corrects.
-- So: buzzers may use wall-clock, because the alternative (seq, which is not comparable across
-- devices) cannot answer "who took this pager most recently" at all. Status must not.
--
-- ── THE RULE: LATER placed_at KEEPS THE BUZZER ────────────────────────────────────────────────────
-- placed_at is when the order was TAKEN, not when it synced — which is the entire reason the column
-- exists. Two devices offline, both hand out buzzer 7; on reconnect the one taken LATER keeps it,
-- because that is the pager physically in a customer's hand most recently.
-- ⚠️ NULL placed_at (every pre-migration row — 352 of them at the time of writing) FALLS BACK TO
-- created_at. Deliberately NOT backfilled: inventing a sale time we do not know would be wrong, and
-- for an offline row it would be wrong in exactly the direction that matters. coalesce is the whole
-- accommodation.
--
-- p_replay distinguishes the two callers, and it is the ONLY thing that does:
--   false (online, an operator tapped "Take buzzer 7" and was shown whose it was) → the target wins
--         unconditionally. Their explicit, informed decision is not something to arbitrate.
--   true  (offline replay, nobody was asked) → arbitrate on placed_at, and flag the loser.
create or replace function assign_buzzer_atomic(
  p_truck_id  text,
  p_event_id  uuid,
  p_order_key uuid,
  p_buzzer    smallint,
  p_replay    boolean default false
) returns jsonb
language plpgsql
as $$
declare
  -- 🔴 MUST match BUZZER_IN_USE_STATUSES in lib/buzzer.ts, which includes 'ready' — a buzzer is in the
  -- customer's hand AT ready and frees at collected. This is NOT the four-value occupying-status list
  -- used for oven capacity; see the note in lib/buzzer.ts for why grafting onto that one hands out
  -- duplicates mid-service.
  v_in_use     text[] := array['pending','confirmed','modified','cooking','ready'];
  v_target_id   text;
  v_target_ts   timestamptz;
  v_holder_key  uuid;
  v_holder_id   text;
  v_holder_ts   timestamptz;
  v_cleared     jsonb := null;
  v_lost        jsonb := null;
  v_assigned    boolean := false;
begin
  -- Lock the target first, then the contended holder. Consistent order, so two concurrent calls for
  -- the same pair queue rather than deadlock.
  select id, coalesce(placed_at, created_at)
    into v_target_id, v_target_ts
    from orders
   where order_key = p_order_key and truck_id = p_truck_id
   for update;
  if v_target_id is null then
    raise exception 'order % not found for truck %', p_order_key, p_truck_id;
  end if;

  -- CLEAR. Also clears buzzer_lost_at: an operator deliberately removing the buzzer has resolved the
  -- very thing the flag exists to ask about.
  if p_buzzer is null then
    update orders set buzzer_number = null, buzzer_lost_at = null
     where order_key = p_order_key and truck_id = p_truck_id;
    return jsonb_build_object('assigned', false, 'buzzer', null, 'cleared_from', null, 'lost', null);
  end if;

  -- Who holds this number right now, in this event, still in use, other than the target?
  if p_event_id is not null then
    select order_key, id, coalesce(placed_at, created_at)
      into v_holder_key, v_holder_id, v_holder_ts
      from orders
     where truck_id = p_truck_id
       and event_id = p_event_id
       and buzzer_number = p_buzzer
       and order_key <> p_order_key
       and status = any(v_in_use)
     order by coalesce(placed_at, created_at) desc
     limit 1
     for update;
  end if;

  if v_holder_key is null then
    -- Uncontended.
    v_assigned := true;
  elsif not p_replay then
    -- ONLINE, operator-confirmed take. No arbitration, and NO buzzer_lost_at on the holder: the
    -- operator was shown "Buzzer 7 is with order #15 (Sarah)" and chose. A banner here would nag
    -- about a decision they just made.
    update orders set buzzer_number = null
     where order_key = v_holder_key and truck_id = p_truck_id;
    v_cleared := jsonb_build_object('order_key', v_holder_key, 'id', v_holder_id);
    v_assigned := true;
  elsif v_target_ts > v_holder_ts then
    -- REPLAY, target taken LATER → target keeps it, holder loses it and is FLAGGED (only while still
    -- in use — a collected/cancelled/rejected order had already released its buzzer, so there is
    -- nothing for the operator to act on).
    update orders
       set buzzer_number = null,
           buzzer_lost_at = case when status = any(v_in_use) then now() else null end
     where order_key = v_holder_key and truck_id = p_truck_id;
    v_cleared := jsonb_build_object('order_key', v_holder_key, 'id', v_holder_id);
    v_lost    := jsonb_build_object('order_key', v_holder_key, 'id', v_holder_id);
    v_assigned := true;
  else
    -- REPLAY, holder taken LATER (or the two are indistinguishable) → holder keeps it. The TARGET is
    -- the loser: a pager was physically handed to that customer offline and the board cannot honour
    -- it, which is precisely what the operator needs telling about.
    -- ⚠️ TIES GO TO THE INCUMBENT. Equal timestamps mean we cannot tell who was later, and the row
    -- already in the database is the one the board has been showing; churning it on a coin-flip would
    -- move a buzzer for no reason.
    update orders
       set buzzer_lost_at = case when status = any(v_in_use) then now() else null end
     where order_key = p_order_key and truck_id = p_truck_id;
    v_lost := jsonb_build_object('order_key', p_order_key, 'id', v_target_id);
    v_assigned := false;
  end if;

  if v_assigned then
    -- Winning clears any previous loss flag on the target — it has a buzzer again.
    update orders set buzzer_number = p_buzzer, buzzer_lost_at = null
     where order_key = p_order_key and truck_id = p_truck_id;
  end if;

  return jsonb_build_object(
    'assigned',     v_assigned,
    'buzzer',       case when v_assigned then p_buzzer else null end,
    'cleared_from', v_cleared,
    'lost',         v_lost
  );
end;
$$;

notify pgrst, 'reload schema';
