-- seed-thai-kitchen-orders.sql — 40 fresh orders on today's 14:50–18:00 event.
-- 🚫 NOT RUN. Dominic runs all SQL by hand. Paste the whole file into the Supabase SQL editor.
--
-- ── WHAT CHANGED THIS TIME ──────────────────────────────────────────────────────────────────────────
--   🔴 THE PACKING WAS THE BUG, AND HERE IS EXACTLY WHAT IT DID. The old version put each order in the
--   FIRST slot with room. Your slots are FIVE minutes apart, so it filled 14:00, 14:05, 14:10 … to the
--   ceiling and stopped around 14:45 — every one of the 40 orders inside the first three quarters of an
--   hour, and the rest of the service empty. That is both the over-capacity warning AND the "orders
--   running to 14:30" you are seeing. It now starts order i's search at slot (i mod slots) and wraps.
--   🔴 THE 15 MINUTES WAS MINE AND IT WAS WRONG. I wrote 15 into the comments as an example cadence;
--   the code always read `collection_interval_mins` from the truck, so the SQL was right and the prose
--   was not. Every derived number is now printed by the script at run time instead of guessed here.
--   🔴 THE WINDOW IS 14:50–18:00. At your 5-minute cadence that is 38 slots, 14:50 through 17:55 — one
--   or two orders each, and 49 mains spread about 1.3 to a slot against your ceiling of 5.
--   🔴 ORDERS CARRY MAINS. The previous version picked the SIX CHEAPEST menu items, which on most
--   trucks are drinks and sides — items whose category has prep_secs = 0 and therefore occupy NO kitchen
--   capacity. The board would have filled with orders and the capacity strip would have stayed empty.
--   Items are now split by their CATEGORY's prep time and every order is composed deliberately.
--   • 33 of 40 orders (82%) contain at least one main. 49 mains, 60 sides, 109 items.
--   • Sizes: 1→4, 2→15, 3→14, 4→3, 5→3, 6→1. Most are 2–4; nothing exceeds 6.
--   • Statuses stay confirmed / ready / collected. No 'pending' (needs approval), no 'cooking'.
--
-- ── THE SPREAD, AND WHERE IT COMES FROM ─────────────────────────────────────────────────────────────
-- ⚠️ STATED AS AN ASSUMPTION RATHER THAN DRESSED UP AS RESEARCH: I did not look anything up. This is
-- ordinary street-food shape — an average of ~1.2 mains per order, most orders one main plus a side or a
-- drink, a minority of two- and three-main family orders, and a small tail of drinks-only. If your real
-- trading data says otherwise, the two arrays below are the only thing to change.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────────────────────────────
--   1. Pins the truck and resolves TODAY's event, refusing if it is missing or ambiguous.
--   2. Sets that event's window to 14:50–18:00 and its status to 'open'.
--   3. DELETES every order on that truck for today, and its slot-usage rows.
--   4. PACKS the 40 orders across the collection slots BY MAINS, then inserts them.
--   5. Resets the event's order counter so the next real order is #41.
--
-- 🔴 ONE TRANSACTION. Any assertion aborts the whole thing and nothing changes.
-- 🔴 EVERY ORDER HAS notes = NULL, written explicitly.
--
-- ⚠️ WHAT I COULD NOT VERIFY: I have no database access, and the real capacity engine is a BACKWARD
-- PROJECTION over prep windows (lib/slot-availability) that this script does not and cannot reproduce.
-- The packing below is a conservative approximation — mains per collection slot against
-- kitchen_capacity. The authoritative check is the dashboard's own breach banner after you run it.

begin;

do $$
declare
  v_truck_id   text := 'test-truck';        -- 🔴 THE ONE PLACE THE TARGET IS NAMED.
  v_truck_name text;
  v_event_id   uuid;
  v_today      date := (now() at time zone 'Europe/London')::date;
  v_van_id     uuid;
  v_interval   integer;
  v_capacity   integer;
  v_slots      text[];
  v_n_slots    integer;
  v_mains      jsonb;   v_n_mains  integer;
  v_sides      jsonb;   v_n_sides  integer;
  v_left       integer[];
  v_assigned   integer[];
  i integer; k integer;
  v_placed boolean; v_m integer; v_s integer; v_try integer;
  v_lines jsonb; v_total numeric; v_item jsonb;
  v_slot text; v_status text; v_peak integer := 0;
  -- ── THE COMPOSITION, WRITTEN OUT SO IT CAN BE CHECKED RATHER THAN TRUSTED ───────────────────────
  -- MAINS per order — 7 orders have none (drinks/sides only), 20 have one, 10 have two, 3 have three.
  v_mains_n integer[] := array[
    1, 2, 1, 1, 0, 2, 1, 3, 1, 1,
    2, 1, 0, 1, 2, 1, 1, 0, 2, 1,
    1, 2, 1, 0, 3, 1, 1, 2, 0, 1,
    2, 2, 1, 0, 1, 2, 1, 3, 0, 1];
  -- SIDES per order — index-matched to the array above. mains + sides = the order's item count.
  v_sides_n integer[] := array[
    1, 1, 2, 0, 2, 1, 2, 1, 1, 4,
    0, 2, 3, 1, 2, 1, 0, 2, 1, 2,
    1, 0, 2, 3, 3, 2, 0, 1, 2, 1,
    1, 3, 1, 2, 0, 2, 1, 2, 2, 2];
  v_names text[] := array[
    'Sarah','James','Priya','Tom','Aisha','Ben','Chloe','Daniel','Ella','Femi',
    'Grace','Harry','Isla','Jack','Kate','Liam','Maya','Noah','Olivia','Paul',
    'Quinn','Rosie','Sam','Tara','Umar','Vicky','Will','Xena','Yusuf','Zara',
    'Adam','Bella','Callum','Dee','Eve','Finn','Gina','Hugo','Ivy','Jonah'];
begin
  -- ── 0. THE TRUCK ──────────────────────────────────────────────────────────────────────────────────
  select t.name into v_truck_name from trucks t where t.id = v_truck_id;
  if v_truck_name is null then
    raise exception 'SEED ABORTED: no truck with id %.', v_truck_id;
  end if;
  if v_truck_name <> 'Thai Kitchen' then
    raise exception 'SEED ABORTED: truck % is named "%", not "Thai Kitchen". Refusing to guess.', v_truck_id, v_truck_name;
  end if;
  -- 🔴 A HARD REFUSAL. Pizzeria Gusto is the only real trading customer and nothing here may touch it.
  if v_truck_id ilike '%gusto%' or v_truck_name ilike '%gusto%' then
    raise exception 'SEED ABORTED: refusing to touch %, the live trading truck.', v_truck_name;
  end if;

  -- ── 1. TODAY'S EVENT ──────────────────────────────────────────────────────────────────────────────
  select e.id, e.van_id into v_event_id, v_van_id
    from truck_events e
   where e.truck_id = v_truck_id and e.event_date = v_today
     and coalesce(e.status, '') <> 'cancelled'
   order by e.start_time nulls last limit 1;
  if v_event_id is null then
    raise exception 'SEED ABORTED: % has no non-cancelled event dated % — create the event first.', v_truck_name, v_today;
  end if;
  if (select count(*) from truck_events e
       where e.truck_id = v_truck_id and e.event_date = v_today
         and coalesce(e.status,'') <> 'cancelled') <> 1 then
    raise exception 'SEED ABORTED: % has more than one event today. Remove the spare first.', v_truck_name;
  end if;

  update truck_events
     set start_time = '14:50', end_time = '18:00', status = 'open',
         opened_at = coalesce(opened_at, now())
   where id = v_event_id;

  -- ── 2. SLOTS ──────────────────────────────────────────────────────────────────────────────────────
  -- 🔴 CADENCE FROM THE TRUCK, NEVER ASSUMED — and never written into a comment as an example either.
  -- 14:50 up to but NOT including 18:00: the last collection is one interval before the end. At a
  -- 5-minute cadence that is 38 slots, 14:50 through 17:55; the notice below prints what it actually got.
  select coalesce(nullif(t.collection_interval_mins, 0), 15) into v_interval from trucks t where t.id = v_truck_id;
  select array_agg(to_char(ts, 'HH24:MI') order by ts) into v_slots
    from generate_series((v_today + time '14:50')::timestamp,
                         (v_today + time '18:00')::timestamp - make_interval(mins => v_interval),
                         make_interval(mins => v_interval)) ts;
  v_n_slots := coalesce(array_length(v_slots, 1), 0);
  if v_n_slots < 8 then
    raise exception 'SEED ABORTED: only % slots between 14:50 and 18:00 at a %-minute interval.', v_n_slots, v_interval;
  end if;
  -- 🔴 THE BOUNDS ARE ASSERTED, NOT ASSUMED. Nothing may land before 14:50 or at/after 18:00 — the
  -- complaint that produced this version was orders sitting in the past, so the file proves it instead
  -- of me claiming it.
  if v_slots[1] < '14:50' then
    raise exception 'SEED ABORTED: first slot is %, which is before 14:50.', v_slots[1];
  end if;
  if v_slots[v_n_slots] >= '18:00' then
    raise exception 'SEED ABORTED: last slot is %, which is not before 18:00.', v_slots[v_n_slots];
  end if;
  raise notice 'Cadence % min -> % slots, % to %.', v_interval, v_n_slots, v_slots[1], v_slots[v_n_slots];

  -- ── 3. 🔴 THE MENU, SPLIT BY WHAT THE KITCHEN ACTUALLY COOKS ─────────────────────────────────────
  -- A MAIN is an item whose CATEGORY has prep_secs > 0 — that is what the capacity engine counts and
  -- what makes a slot fill up. A SIDE is prep_secs 0 or null: a drink, a dip, a bag of crisps. Ordering
  -- by price alone (the previous version) selected the cheapest items on the menu, which are exactly the
  -- ones that occupy no capacity.
  -- ⚠️ `counts_toward_capacity` CAN MAKE AN INSTANT CATEGORY OCCUPY TOO. It is deliberately NOT used
  -- here: this split wants the items the kitchen COOKS, and treating a ticked drink as a main would
  -- overstate the load rather than understate it. The board's own engine still counts them correctly.
  select jsonb_agg(x order by x->>'name'), count(*) into v_mains, v_n_mains
    from (select jsonb_build_object('name', m.name, 'price', m.price) as x
            from menu_items_db m
            join menu_categories c on c.id = m.category_id
           where m.truck_id = v_truck_id and coalesce(m.is_available, true)
             and coalesce(c.prep_secs, 0) > 0
           order by m.name limit 8) s;
  select jsonb_agg(x order by x->>'name'), count(*) into v_sides, v_n_sides
    from (select jsonb_build_object('name', m.name, 'price', m.price) as x
            from menu_items_db m
            join menu_categories c on c.id = m.category_id
           where m.truck_id = v_truck_id and coalesce(m.is_available, true)
             and coalesce(c.prep_secs, 0) = 0
           order by m.name limit 8) s;

  if coalesce(v_n_mains, 0) = 0 then
    raise exception 'SEED ABORTED: % has no available items in a cooking category (prep_secs > 0). Without mains the capacity strip cannot populate, which is the whole point of this run.', v_truck_name;
  end if;
  -- 🔴 NO SIDES IS NOT FATAL — the composition falls back to mains only, and the notice says so rather
  -- than the board quietly differing from the plan.
  if coalesce(v_n_sides, 0) = 0 then
    raise notice 'No zero-prep items on this menu — every line will be a main. Item counts per order are unchanged.';
  end if;
  raise notice 'Menu: % mains, % sides.', v_n_mains, coalesce(v_n_sides, 0);

  -- ── 4. PACK BY MAINS, SPREAD ACROSS THE SERVICE, BEFORE WRITING ANYTHING ─────────────────────────
  -- 🔴 MAINS ARE WHAT THE CEILING COUNTS, so the packing counts mains and not items.
  -- 🔴 AND IT SPREADS RATHER THAN FILLING. Order i starts looking at slot (i mod slots) and wraps, so
  -- the run lands evenly across the whole service instead of stacking against the ceiling at the front —
  -- which is what produced the over-capacity warning last time. The cap is still absolute: an order only
  -- goes where all of its mains fit.
  -- ⚠️ THIS IS AN APPROXIMATION OF A BACKWARD-PROJECTION ENGINE, NOT A REPRODUCTION OF ONE. The real
  -- check is the dashboard's breach banner after the run.
  select v.kitchen_capacity into v_capacity from truck_vans v where v.id = v_van_id;
  if v_capacity is null then
    raise notice 'No kitchen_capacity on this van — packing without a ceiling.';
    v_capacity := 999;
  end if;
  v_left := array_fill(v_capacity, array[v_n_slots]);
  v_assigned := array_fill(0, array[40]);

  for i in 1..40 loop
    v_m := v_mains_n[i];
    v_placed := false;
    -- 🔴 THE ROTATION IS THE WHOLE FIX: start at a different slot for every order, then wrap.
    for k in 0..(v_n_slots - 1) loop
      v_try := 1 + ((i + k) % v_n_slots);
      if v_left[v_try] >= v_m then
        v_left[v_try] := v_left[v_try] - v_m;
        v_assigned[i] := v_try;
        v_placed := true;
        exit;
      end if;
    end loop;
    if not v_placed then
      raise exception 'SEED ABORTED: order % needs % mains and no slot has room. % slots x capacity % = % mains of room; 49 mains are needed. Raise kitchen_capacity or shorten the run.',
        i, v_m, v_n_slots, v_capacity, v_n_slots * v_capacity;
    end if;
  end loop;
  for k in 1..v_n_slots loop
    v_peak := greatest(v_peak, v_capacity - v_left[k]);
  end loop;
  -- 🔴 THE LINE TO READ IN THE OUTPUT. Peak must be <= the ceiling, and "slots used" should be ALL of
  -- them — if it is not, the run is bunched again and the board will say so.
  raise notice 'Packed 40 orders (49 mains, 109 items) across % slots. Peak mains in one slot: % (ceiling %). Slots used: %.',
    v_n_slots, v_peak, v_capacity,
    (select count(*) from generate_series(1, v_n_slots) g where v_left[g] < v_capacity);

  -- ── 5. CLEAR — SCOPED TO THIS TRUCK AND THIS DATE ────────────────────────────────────────────────
  delete from orders where truck_id = v_truck_id and event_date = v_today;
  delete from production_slot_usage where truck_id = v_truck_id and event_date = v_today;

  -- ── 6. INSERT ────────────────────────────────────────────────────────────────────────────────────
  -- Statuses: confirmed / ready / collected ONLY — a board mid-service, nothing waiting on a tap and
  -- nothing in a state the orders screen cannot action.
  for i in 1..40 loop
    v_m := v_mains_n[i];
    v_s := v_sides_n[i];
    v_slot := v_slots[v_assigned[i]];
    v_lines := '[]'::jsonb;
    v_total := 0;
    -- Mains first, so the printed ticket and the card read the way an operator expects.
    for k in 0..(v_m - 1) loop
      v_item := v_mains -> ((i + k) % v_n_mains);      -- offset by order index so orders differ
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'name', v_item->>'name', 'quantity', 1, 'unit_price', coalesce((v_item->>'price')::numeric, 0)));
      v_total := v_total + coalesce((v_item->>'price')::numeric, 0);
    end loop;
    for k in 0..(v_s - 1) loop
      -- Falls back to the mains list when the menu has no zero-prep items (see the notice above).
      if coalesce(v_n_sides, 0) > 0 then
        v_item := v_sides -> ((i + k) % v_n_sides);
      else
        v_item := v_mains -> ((i + k + 1) % v_n_mains);
      end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'name', v_item->>'name', 'quantity', 1, 'unit_price', coalesce((v_item->>'price')::numeric, 0)));
      v_total := v_total + coalesce((v_item->>'price')::numeric, 0);
    end loop;

    v_status := case when i % 6 = 0 then 'collected'
                     when i % 6 = 3 then 'ready'
                     else 'confirmed' end;

    insert into orders (
      id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
      event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
      total, total_minor, notes, status, payment_status, placed_at, source
    ) values (
      i::text, v_truck_id, v_names[i], null, null, v_slot, 'collection',
      v_today, v_event_id, v_van_id, v_lines, '[]'::jsonb, null, v_total, 0,
      v_total, round(v_total * 100)::integer,
      null,                                  -- 🔴 notes: NONE, on every row
      v_status, 'unpaid',
      -- 🔴 PLACED BEFORE ITS OWN COLLECTION, NOT ON A RAMP FROM THE SERVICE START. A fixed offset from
      -- 14:50 put late orders' "moment of sale" after their collection time; leading each order's own
      -- slot by 20 minutes is what an order-ahead customer actually does.
      ((v_today + v_slot::time) - interval '20 minutes'),
      'web'
    );
  end loop;

  -- ── 7. THE COUNTER ───────────────────────────────────────────────────────────────────────────────
  -- 🔴 SET TO 40 SO THE NEXT REAL ORDER IS #41 — leaving it at 0 collides with the partial unique index
  -- on (event_id, id).
  update truck_events set order_counter = 40 where id = v_event_id;

  raise notice 'Seeded 40 orders on %. Next order will be #41.', v_truck_name;
end $$;

commit;

-- ── VERIFY AFTER RUNNING ────────────────────────────────────────────────────────────────────────────
--   select status, count(*) from orders
--    where truck_id = 'test-truck' and event_date = (now() at time zone 'Europe/London')::date
--    group by status order by 2 desc;
--     -- expect ONLY confirmed / ready / collected. 🔴 zero pending, zero cooking.
--
--   -- 🔴 THE ONE THAT MATTERS THIS TIME: how many orders contain a cooked item.
--   select count(*) filter (where mains > 0) as with_mains, count(*) as total, sum(mains) as all_mains
--     from (select o.order_key,
--                  (select count(*) from jsonb_array_elements(o.items) l
--                    join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
--                    join menu_categories c on c.id = m.category_id
--                   where coalesce(c.prep_secs,0) > 0) as mains
--             from orders o
--            where o.truck_id = 'test-truck'
--              and o.event_date = (now() at time zone 'Europe/London')::date) s;
--     -- expect with_mains = 33, total = 40, all_mains = 49
--
--   select jsonb_array_length(items) as size, count(*) from orders
--    where truck_id = 'test-truck' and event_date = (now() at time zone 'Europe/London')::date
--    group by 1 order by 1;              -- expect 1→4, 2→15, 3→14, 4→3, 5→3, 6→1
--
--   select count(*) from orders
--    where truck_id = 'test-truck' and event_date = (now() at time zone 'Europe/London')::date
--      and notes is not null;            -- 🔴 expect 0
--
--   -- 🔴 THE SPREAD — this is the query that would have caught last time's bunching.
--   select o.slot, count(*) as orders,
--          sum((select count(*) from jsonb_array_elements(o.items) l
--                join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
--                join menu_categories c on c.id = m.category_id
--               where coalesce(c.prep_secs,0) > 0)) as mains
--     from orders o
--    where o.truck_id = 'test-truck'
--      and o.event_date = (now() at time zone 'Europe/London')::date
--    group by o.slot order by o.slot;
--     -- expect the run to START AT 14:50 and reach 17:55, with 1-2 orders per slot at a 5-minute
--     -- cadence and mains never above 5. 🔴 NOTHING BEFORE 14:50, and no cluster at the front.
--
--   select * from production_slot_usage
--    where truck_id = 'test-truck' and event_date = (now() at time zone 'Europe/London')::date;
--     -- ⚠️ EXPECT ZERO ROWS UNTIL THE DASHBOARD REBUILDS THEM. rebuildProductionSlotUsage runs from the
--     -- dashboard action path and /api/admin/backfill-usage. Open the dashboard once, then re-run this.
