-- seed-thai-kitchen-orders.sql — 40 fresh orders collecting from 11:10, on today's 11:00–14:00 event
-- (20 August 2026).
-- 🚫 NOT RUN. Dominic runs all SQL by hand. Paste the whole file into the Supabase SQL editor.
--
-- ── WHAT IS DIFFERENT FROM THE 19 AUGUST RUN ────────────────────────────────────────────────────────
--   • 🔴 THE EVENT OPENS AT 11:00; THE FIRST COLLECTION IS 11:10. Those are two different things and the
--     difference is deliberate — you asked for the orders to start at 11:10. The event window written
--     below stays 11:00–14:00 (yours), and the collection slots run 11:10 through 13:55: 34 of them at
--     your 5-minute cadence. The script prints what it actually got rather than trusting this line.
--   • 🔴 THE CEILING IS NOW 4 MAINS PER 5 MINUTES, and the packer was rebuilt around it. See below.
--   • 🔴 THE EVENT IS YOURS, NOT THIS SCRIPT'S. You created it. The script FINDS today's event and
--     refuses if there is none or more than one; it does not create anything.
--   • Everything else is unchanged and was already proven on the last run: the mains/sides split by
--     category prep time, the composition arrays, the status mix, notes = NULL.
--
-- ── 🔴 NOTHING BREACHES THE CEILING, AND IT IS ASSERTED RATHER THAN HOPED ────────────────────────────
-- Two changes, because a ceiling of 4 leaves far less slack than 5 did:
--   1. **The packer charges each order's mains to its own window AND the one before it** (`v_spread`),
--      a two-window approximation of the backward projection the real engine performs. Counting mains
--      only at the collection slot understates concurrent load, which is exactly how a run passes this
--      script and then trips the board's breach banner.
--   2. **Both peaks are ASSERTED, not printed.** If the projected peak or the per-collection-slot peak
--      exceeds the van's `kitchen_capacity`, the transaction aborts and NOT ONE ORDER IS WRITTEN.
--
-- ✅ SIMULATED BEFORE THIS FILE WAS WRITTEN, over the real composition arrays, 34 slots and a ceiling
-- of 4: **every one of the 34 slots carries an order, and the per-collection-slot peak is 3 — one main
-- of headroom against your 4.** At spread 1 it peaks at exactly 4 with no headroom; at spread 3 the
-- 49 mains cannot be placed at all. Spread 2 was chosen by that simulation, not by feel.
-- ⚠️ IT IS STILL AN APPROXIMATION OF A BACKWARD-PROJECTION ENGINE, NOT A REPRODUCTION OF ONE. The
-- authoritative check remains the dashboard's own breach banner after you run it.
--
-- ── ⚠️ TIMING, AND IT MATTERS FOR PHOTOGRAPHS ───────────────────────────────────────────────────────
-- 🔴 THE SERVICE HAS ALREADY STARTED. Starting the collections at 11:10 buys a little room, but once the
-- clock passes 11:10 the earliest slots are in the PAST and the orders in them render with a red "late"
-- badge — as #38 Hugo did at 14:52 on the last run, which is what a real mid-service board looks like.
-- ⚠️ THAT GROWS AS THE CLOCK MOVES. Run this and take the photographs in the same sitting. Leave it an
-- hour and a third of the board is late; leave it until 14:00 and every order is.
-- ✅ THE SCRIPT COUNTS IT FOR YOU: a notice prints how many slots are already behind you at run time, so
-- you know what the board will look like before you open it. It does NOT move the window to hide them —
-- a board with no past at all has an empty Done-today strip and reads as a service that has not begun.
--
-- ── THE SPREAD, AND WHERE IT COMES FROM ─────────────────────────────────────────────────────────────
-- ⚠️ STATED AS AN ASSUMPTION RATHER THAN DRESSED UP AS RESEARCH: I did not look anything up. This is
-- ordinary street-food shape — an average of ~1.2 mains per order, most orders one main plus a side or a
-- drink, a minority of two- and three-main family orders, and a small tail of drinks-only.
--   • 33 of 40 orders (82%) contain at least one main. 49 mains, 60 sides, 109 items.
--   • Sizes: 1→4, 2→15, 3→14, 4→3, 5→3, 6→1. Most are 2–4; nothing exceeds 6.
--   • Statuses stay confirmed / ready / collected. No 'pending' (needs approval), no 'cooking'.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────────────────────────────
--   1. Pins the truck and resolves TODAY's event, refusing if it is missing or ambiguous.
--   2. Sets that event's window to 11:00–14:00 and its status to 'open' (a no-op if already correct).
--      ⚠️ THE EVENT WINDOW, NOT THE COLLECTION SLOTS. Those start at 11:10 — see step 4.
--   3. DELETES every order on that truck for today, and its slot-usage rows.
--   4. PACKS the 40 orders across the 11:10–13:55 collection slots BY MAINS — spread-aware, and
--      asserted against the ceiling — then inserts them.
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
  v_now        time := (now() at time zone 'Europe/London')::time;
  v_van_id     uuid;
  v_interval   integer;
  v_capacity   integer;
  v_slots      text[];
  v_n_slots    integer;
  v_past       integer;
  v_mains      jsonb;   v_n_mains  integer;
  v_sides      jsonb;   v_n_sides  integer;
  v_left       integer[];
  v_assigned   integer[];
  i integer; k integer;
  v_placed boolean; v_m integer; v_s integer; v_try integer;
  v_lines jsonb; v_total numeric; v_item jsonb;
  v_slot text; v_status text; v_peak integer := 0; v_coll_peak integer := 0;
  -- ── 🔴 THE PREP SPREAD. THIS IS WHAT STOPS THE CEILING BEING BREACHED. ─────────────────────────
  -- A main collected at 11:40 is not cooked instantly at 11:40 — the real engine projects it BACKWARD
  -- across the prep windows before its collection. Counting mains only at the collection slot (what the
  -- previous version did) therefore UNDERSTATES concurrent load, and with a ceiling of 4 there is no
  -- longer any slack to absorb that.
  -- ⚠️ SO EACH ORDER'S MAINS ARE CHARGED TO ITS OWN WINDOW *AND* THE ONE BEFORE IT. That is a crude
  -- two-window approximation of the backward projection, not a reproduction of it — but it is
  -- conservative in the right direction, and it was chosen by simulation rather than by feel: at
  -- spread 2 the packer uses all 34 slots and the per-collection-slot peak comes out at 3 against your
  -- ceiling of 4. At spread 1 it peaks at exactly 4 with zero headroom; at spread 3 it cannot place
  -- 49 mains at all.
  -- 🔴 IF YOU LOWER kitchen_capacity BELOW 4 THIS SCRIPT WILL ABORT rather than produce a breach.
  -- Set v_spread := 1 to pack against collection slots only, and accept the lost headroom.
  v_spread integer := 2;
  v_w integer; v_lo integer; v_fits boolean;
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

  -- ── 1. TODAY'S EVENT — FOUND, NEVER CREATED ──────────────────────────────────────────────────────
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

  -- Idempotent: you already set this window when you created the event. Writing it again costs nothing
  -- and guarantees the event bar on screen says what this script assumed.
  -- ⚠️ THE EVENT OPENS AT 11:00 AND THE FIRST COLLECTION IS 11:10 — deliberate, not a mismatch.
  update truck_events
     set start_time = '11:00', end_time = '14:00', status = 'open',
         opened_at = coalesce(opened_at, now())
   where id = v_event_id;

  -- ── 2. SLOTS ──────────────────────────────────────────────────────────────────────────────────────
  -- 🔴 CADENCE FROM THE TRUCK, NEVER ASSUMED — and never written into a comment as an example either.
  -- 11:10 up to but NOT including 14:00: the last collection is one interval before the end. At a
  -- 5-minute cadence that is 34 slots, 11:10 through 13:55; the notice below prints what it actually got.
  select coalesce(nullif(t.collection_interval_mins, 0), 15) into v_interval from trucks t where t.id = v_truck_id;
  select array_agg(to_char(ts, 'HH24:MI') order by ts) into v_slots
    from generate_series((v_today + time '11:10')::timestamp,
                         (v_today + time '14:00')::timestamp - make_interval(mins => v_interval),
                         make_interval(mins => v_interval)) ts;
  v_n_slots := coalesce(array_length(v_slots, 1), 0);
  if v_n_slots < 8 then
    raise exception 'SEED ABORTED: only % slots between 11:10 and 14:00 at a %-minute interval.', v_n_slots, v_interval;
  end if;
  -- 🔴 THE BOUNDS ARE ASSERTED, NOT ASSUMED. Nothing may land before 11:10 or at/after 14:00.
  if v_slots[1] < '11:10' then
    raise exception 'SEED ABORTED: first slot is %, which is before 11:10.', v_slots[1];
  end if;
  if v_slots[v_n_slots] >= '14:00' then
    raise exception 'SEED ABORTED: last slot is %, which is not before 14:00.', v_slots[v_n_slots];
  end if;
  raise notice 'Cadence % min -> % slots, % to %.', v_interval, v_n_slots, v_slots[1], v_slots[v_n_slots];

  -- ── 2b. 🔴 HOW MUCH OF THE SERVICE IS ALREADY BEHIND YOU ─────────────────────────────────────────
  -- Not a guard and not a refusal — a fact printed before you open the board, so a screen full of red
  -- "late" badges is something you decided to accept rather than something you discover.
  select count(*) into v_past from generate_series(1, v_n_slots) g where v_slots[g]::time < v_now;
  if v_past = 0 then
    raise notice 'Nothing is in the past yet — the whole run is ahead of you.';
  else
    raise notice '⚠️ % of % slots (% to %) are ALREADY PAST at %. Orders in them will show as late. Photograph promptly.',
      v_past, v_n_slots, v_slots[1], v_slots[v_past], to_char(v_now, 'HH24:MI');
  end if;

  -- ── 3. 🔴 THE MENU, SPLIT BY WHAT THE KITCHEN ACTUALLY COOKS ─────────────────────────────────────
  -- A MAIN is an item whose CATEGORY has prep_secs > 0 — that is what the capacity engine counts and
  -- what makes a slot fill up. A SIDE is prep_secs 0 or null: a drink, a dip, a bag of crisps.
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
  -- which is what produced the over-capacity warning two runs ago. The cap is still absolute: an order
  -- only goes where all of its mains fit.
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
      -- The windows this order occupies: its own, and the (v_spread - 1) before it, clamped at the
      -- start of service. EVERY one of them must have room — the cap is absolute, not an average.
      v_lo := greatest(1, v_try - (v_spread - 1));
      v_fits := true;
      for v_w in v_lo..v_try loop
        if v_left[v_w] < v_m then v_fits := false; end if;
      end loop;
      if v_fits then
        for v_w in v_lo..v_try loop
          v_left[v_w] := v_left[v_w] - v_m;
        end loop;
        v_assigned[i] := v_try;
        v_placed := true;
        exit;
      end if;
    end loop;
    if not v_placed then
      raise exception 'SEED ABORTED: order % needs % mains and no window has room at ceiling % with a prep spread of %. % slots x % = % mains of nominal room; 49 mains are needed. Raise kitchen_capacity, lengthen the window, or set v_spread := 1.',
        i, v_m, v_capacity, v_spread, v_n_slots, v_capacity, v_n_slots * v_capacity;
    end if;
  end loop;
  for k in 1..v_n_slots loop
    v_peak := greatest(v_peak, v_capacity - v_left[k]);
  end loop;
  -- The per-COLLECTION-SLOT peak, counted separately from the projected one above: this is the number
  -- the dashboard's capacity strip shows against each time.
  for k in 1..v_n_slots loop
    v_coll_peak := greatest(v_coll_peak,
      (select coalesce(sum(v_mains_n[g]), 0)::integer from generate_series(1, 40) g where v_assigned[g] = k));
  end loop;

  -- ── 🔴 ASSERTED, NOT MERELY PRINTED. THIS IS THE "NOTHING BREACHES" GUARANTEE. ─────────────────
  -- The previous version only announced the peak in a notice, which nobody has to read. Both peaks are
  -- now conditions: if either exceeds the van's ceiling the whole transaction aborts and no order is
  -- written. A breach is not something to discover on the board.
  if v_peak > v_capacity then
    raise exception 'SEED ABORTED: projected peak % mains exceeds the ceiling of %. Nothing was written.', v_peak, v_capacity;
  end if;
  if v_coll_peak > v_capacity then
    raise exception 'SEED ABORTED: collection-slot peak % mains exceeds the ceiling of %. Nothing was written.', v_coll_peak, v_capacity;
  end if;

  -- 🔴 THE LINE TO READ IN THE OUTPUT. Both peaks must be <= the ceiling (they are asserted above), and
  -- "slots used" should be ALL of them — at spread 2 the simulation puts an order in every slot.
  raise notice 'Packed 40 orders (49 mains, 109 items) across % slots at ceiling % (spread %). Projected peak: %. Collection-slot peak: %. Slots used: %.',
    v_n_slots, v_capacity, v_spread, v_peak, v_coll_peak,
    (select count(distinct v_assigned[g]) from generate_series(1, 40) g);

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
      -- 11:10 would put late orders' "moment of sale" after their collection time; leading each order's
      -- own slot by 20 minutes is what an order-ahead customer actually does.
      ((v_today + v_slot::time) - interval '20 minutes'),
      'web'
    );
  end loop;

  -- ── 7. THE COUNTER ───────────────────────────────────────────────────────────────────────────────
  -- 🔴 SET TO 40 SO THE NEXT REAL ORDER IS #41 — leaving it at 0 collides with the partial unique index
  -- on (event_id, id).
  update truck_events set order_counter = 40 where id = v_event_id;

  raise notice 'Seeded 40 orders on % for 11:10-14:00. Next order will be #41.', v_truck_name;
end $$;

commit;

-- ── VERIFY AFTER RUNNING ────────────────────────────────────────────────────────────────────────────
--   select status, count(*) from orders
--    where truck_id = 'test-truck' and event_date = (now() at time zone 'Europe/London')::date
--    group by status order by 2 desc;
--     -- expect ONLY confirmed / ready / collected. 🔴 zero pending, zero cooking.
--
--   -- 🔴 THE ONE THAT MATTERS: how many orders contain a cooked item.
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
--   -- 🔴 THE SPREAD — this is the query that would have caught the bunching two runs ago.
--   select o.slot, count(*) as orders,
--          sum((select count(*) from jsonb_array_elements(o.items) l
--                join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
--                join menu_categories c on c.id = m.category_id
--               where coalesce(c.prep_secs,0) > 0)) as mains
--     from orders o
--    where o.truck_id = 'test-truck'
--      and o.event_date = (now() at time zone 'Europe/London')::date
--    group by o.slot order by o.slot;
--     -- expect the run to START AT 11:10 and reach 13:55, EVERY slot carrying an order, and mains
--     -- never above 3 against your ceiling of 4. 🔴 NOTHING BEFORE 11:10, and no cluster at the front.
--
--   select * from production_slot_usage
--    where truck_id = 'test-truck' and event_date = (now() at time zone 'Europe/London')::date;
--     -- ⚠️ EXPECT ZERO ROWS UNTIL THE DASHBOARD REBUILDS THEM. rebuildProductionSlotUsage runs from the
--     -- dashboard action path and /api/admin/backfill-usage. Open the dashboard once, then re-run this.
