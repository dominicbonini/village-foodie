-- seed-apple-tester-orders.sql — 64 orders on each of 8 events, 21–28 August 2026.
-- 🚫 NOT RUN. Dominic runs all SQL by hand. Paste the whole file into the Supabase SQL editor.
--
-- Extracted VERBATIM from docs/apple-tester-seed-build.md, which carries the reasoning: the quoted
-- amber/red threshold code, the simulated tone spread, and why the binding constraint is the Pizza
-- batch and not the van ceiling. Read that before running this.
--
-- ── 🔴 THE ONE THING TO KNOW BEFORE YOU RUN IT ──────────────────────────────────────────────────────
-- `kitchen_capacity` is 6 and `capacity_window_mins` is 5, but NEITHER is what binds. `Pizza.batch_size`
-- is 2, and lib/slot-availability.ts tones a window RED at `used >= batch` — so a window goes red at
-- TWO pizzas, and lib/capacity-breach.ts fires the over-capacity banner at THREE (strictly over).
-- The plan below never exceeds two, and asserts that before writing a single row.
--
-- ── WHAT IT PRODUCES, PER EVENT ─────────────────────────────────────────────────────────────────────
--   64 orders · 101 pizzas · 22 drinks · 13 desserts · 136 items (pizza = 74%)
--   Every order contains at least one pizza. Baskets: 1 pizza ×28, 2 ×35, 3 ×1.
--   Statuses: 45 confirmed · 10 collected · 7 ready · 2 pending (the two carrying notes). NO 'cooking'.
--   Capacity strip across the 96 windows 09:00–16:55: 31 green · 29 amber · 36 red.
--   Peak load in any window: 2 pizzas. Zero breaches, so no over-capacity banner anywhere.
--
--   🔴 THE SERVICE HAS A SHAPE — the morning is no longer empty, and the peak is still the peak:
--     09:00-11:45  22 orders   11 green · 10 amber · 13 red   (38% red)
--     11:50-13:35  19 orders    2 green ·  7 amber · 12 red   (57% red)  <- the rush
--     13:35-15:05  11 orders    7 green ·  6 amber ·  5 red   (27% red)
--     15:05-17:00  12 orders   11 green ·  6 amber ·  6 red   (26% red)
--   ⚠️ LONGEST ALL-GREEN RUN ANYWHERE: 2 windows (10 minutes). No dead stretch on the strip.
--
-- 🔴 ONE TRANSACTION. Any assertion aborts the whole thing and nothing changes.
-- 🔴 EVERY STATEMENT IS SCOPED TO truck_id = 'test-truck-3-2', and the script REFUSES to run against
-- 'test-truck-3' (a different truck), against a truck not named "Apple Tester", or against Gusto.
--
-- ⚠️ WHAT I COULD NOT VERIFY: `trucks.collection_interval_mins` for this truck. Slots are written on
-- the 5-minute capacity grid. If the truck's customer-facing interval is coarser, these orders still
-- display and project correctly, but they sit at times a customer could not have chosen.
-- ⚠️ AND: the real capacity engine is a backward projection this SQL reproduces rather than calls. The
-- authoritative check is the dashboard's own breach banner after you run it.

begin;

do $$
declare
  v_truck_id   text := 'test-truck-3-2';   -- 🔴 THE ONE PLACE THE TARGET IS NAMED.
  v_truck_name text;
  v_van_id     uuid := '0cde7768-ef86-473d-bfab-5d3afcb0ab6d';
  v_cap        integer;
  v_win        integer;
  v_prep       integer;
  v_batch      integer;
  v_pizza_cat  uuid;
  v_pizzas     jsonb; v_n_pizzas integer;
  v_drinks     jsonb; v_n_drinks integer;
  v_dess       jsonb; v_n_dess   integer;
  v_event_ids  uuid[] := array[
    '088936cd-b9f8-4aa6-b681-ccc0c81057a8'::uuid, 'e1352fde-4c82-4efa-9790-8668de7a267b'::uuid,
    'db36c7b5-0078-47be-8bf7-949fe760ca6a'::uuid, '164c02e4-860d-42c0-be30-9dd90909fbac'::uuid,
    '2b025f4c-a38e-486e-839c-6b697fe32f0d'::uuid, '33e8a40f-8600-4937-815a-b7493274e204'::uuid,
    '4035ee89-72df-4b22-be2d-13813e042765'::uuid, 'a1603851-ac9e-4be2-bf29-169804e9382c'::uuid];
  v_event_dates date[] := array[
    date '2026-08-21', date '2026-08-22', date '2026-08-23', date '2026-08-24',
    date '2026-08-25', date '2026-08-26', date '2026-08-27', date '2026-08-28'];

  -- ── THE SERVICE, WRITTEN OUT SO IT CAN BE CHECKED RATHER THAN TRUSTED ──────────────────────────
  -- Collection slot per order, and how many pizzas that order carries. Index-matched, 64 entries.
  v_slots text[] := array[
    '09:05','09:15','09:25','09:40','09:50','09:55','10:05','10:10','10:20','10:30',
    '10:35','10:45','10:50','10:55','11:05','11:10','11:15','11:25','11:30','11:35',
    '11:40','11:45','11:55','12:00','12:05','12:10','12:15','12:20','12:25','12:30',
    '12:35','12:40','12:45','12:50','12:55','13:00','13:05','13:10','13:20','13:25',
    '13:30','13:40','13:50','13:55','14:05','14:10','14:20','14:30','14:35','14:45',
    '14:55','15:00','15:10','15:15','15:25','15:35','15:45','15:55','16:05','16:15',
    '16:25','16:35','16:45','16:55'];
  v_pizza_n integer[] := array[
    1,1,2,1,2,1,2,1,2,1,
    2,2,1,2,2,1,2,2,1,2,
    1,2,3,2,1,2,1,2,2,1,
    2,2,1,2,2,1,2,2,1,2,
    2,1,2,1,2,1,2,1,2,1,
    2,1,2,1,2,1,2,1,2,1,
    2,1,1,2];
  -- Drinks on every 3rd order, desserts on every 5th. Neither costs capacity (prep 0, not ticked).
  v_drink_n integer[] := array[
    1,0,0,1,0,0,1,0,0,1,
    0,0,1,0,0,1,0,0,1,0,
    0,1,0,0,1,0,0,1,0,0,
    1,0,0,1,0,0,1,0,0,1,
    0,0,1,0,0,1,0,0,1,0,
    0,1,0,0,1,0,0,1,0,0,
    1,0,0,1];
  v_dess_n integer[] := array[
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0,0,1,0,0,0,0,
    1,0,0,0];
  v_names text[] := array[
    'Amelia','Ben','Chloe','Dan','Ella','Finn','Grace','Harry','Isla','Jack',
    'Kira','Liam','Maya','Noah','Olive','Pete','Rosa','Sam','Tess','Umar',
    'Vik','Will','Yasmin','Zac','Aisha','Callum','Dev','Erin','Frank','Gia',
    'Hugo','Iris','Joel','Kai','Lena','Milo','Nina','Omar','Priya','Reuben',
    'Sofia','Theo','Ava','Blake','Cara','Dylan','Eve','Felix','Gwen','Hana',
    'Idris','Jonah','Kayla','Leo','Mira','Nate','Orla','Paolo','Quinn','Rhys',
    'Saskia','Tom','Uma','Vince'];

  v_n_orders  integer := 64;
  v_load      integer[];          -- pizzas per 5-minute window, indexed from 09:00
  v_n_wins    integer := 96;      -- 09:00..16:55
  i integer; k integer; e integer;
  v_slot_mins integer; v_num_win integer; v_items integer; v_w integer;
  v_lines jsonb; v_total numeric; v_item jsonb; v_status text; v_notes text;
  v_peak integer := 0; v_green integer := 0; v_amber integer := 0; v_red integer := 0;
begin
  -- ── 0. THE TRUCK, AND THE REFUSALS ────────────────────────────────────────────────────────────
  select t.name into v_truck_name from trucks t where t.id = v_truck_id;
  if v_truck_name is null then
    raise exception 'SEED ABORTED: no truck with id %.', v_truck_id;
  end if;
  if v_truck_name <> 'Apple Tester' then
    raise exception 'SEED ABORTED: truck % is named "%", not "Apple Tester". Refusing to guess.', v_truck_id, v_truck_name;
  end if;
  -- 🔴 THE NEIGHBOUR IS A DIFFERENT TRUCK AND MUST NEVER BE TOUCHED.
  if v_truck_id = 'test-truck-3' then
    raise exception 'SEED ABORTED: test-truck-3 is a DIFFERENT truck.';
  end if;
  if v_truck_name ilike '%gusto%' then
    raise exception 'SEED ABORTED: refusing to touch %, the live trading truck.', v_truck_name;
  end if;

  -- ── 1. THE CONFIG THIS DESIGN RESTS ON — ASSERTED, NOT ASSUMED ────────────────────────────────
  select v.kitchen_capacity, v.capacity_window_mins into v_cap, v_win
    from truck_vans v where v.id = v_van_id and v.truck_id = v_truck_id;
  if v_cap is null then
    raise exception 'SEED ABORTED: van % has no kitchen_capacity. Set it to 6 first.', v_van_id;
  end if;
  if v_win <> 5 then
    raise exception 'SEED ABORTED: capacity_window_mins is %, not 5. The whole slot plan assumes 5.', v_win;
  end if;
  select c.id, c.prep_secs, coalesce(c.batch_size, 1)
    into v_pizza_cat, v_prep, v_batch
    from menu_categories c
   where c.truck_id = v_truck_id and c.name ilike '%pizza%' and coalesce(c.is_active, true)
   limit 1;
  if v_pizza_cat is null then
    raise exception 'SEED ABORTED: no active Pizza category on %.', v_truck_name;
  end if;
  if v_prep <> 300 or v_batch <> 2 then
    raise exception 'SEED ABORTED: Pizza is prep_secs=% batch_size=%, not 300/2. The tone plan assumes 300/2 — recompute before running.', v_prep, v_batch;
  end if;
  raise notice 'Config OK: ceiling %, window % min, Pizza prep % s, batch %.', v_cap, v_win, v_prep, v_batch;

  -- ── 2. THE MENU, READ LIVE — real names, real prices ──────────────────────────────────────────
  select jsonb_agg(x order by x->>'name'), count(*) into v_pizzas, v_n_pizzas
    from (select jsonb_build_object('name', m.name, 'price', m.price) as x
            from menu_items_db m
           where m.truck_id = v_truck_id and m.category_id = v_pizza_cat
             and coalesce(m.is_available, true) and coalesce(m.is_active, true)
           order by m.name) s;
  select jsonb_agg(x order by x->>'name'), count(*) into v_drinks, v_n_drinks
    from (select jsonb_build_object('name', m.name, 'price', m.price) as x
            from menu_items_db m join menu_categories c on c.id = m.category_id
           where m.truck_id = v_truck_id and c.name ilike '%drink%'
             and coalesce(m.is_available, true) and coalesce(m.is_active, true)
           order by m.name) s;
  select jsonb_agg(x order by x->>'name'), count(*) into v_dess, v_n_dess
    from (select jsonb_build_object('name', m.name, 'price', m.price) as x
            from menu_items_db m join menu_categories c on c.id = m.category_id
           where m.truck_id = v_truck_id and c.name ilike '%dessert%'
             and coalesce(m.is_available, true) and coalesce(m.is_active, true)
           order by m.name) s;
  if coalesce(v_n_pizzas, 0) = 0 then
    raise exception 'SEED ABORTED: no available pizza items — every order must contain one.';
  end if;
  raise notice 'Menu: % pizzas, % drinks, % desserts.', v_n_pizzas, coalesce(v_n_drinks,0), coalesce(v_n_dess,0);

  -- ── 3. 🔴 PROJECT THE LOAD AND ASSERT IT BEFORE WRITING ANYTHING ──────────────────────────────
  -- Reproduces lib/slot-availability.ts exactly: N pizzas at slot d seat ceil(N/batch) windows ending
  -- at d, the earliest holding `batch` and the collection-adjacent one the remainder.
  v_load := array_fill(0, array[v_n_wins]);
  for i in 1..v_n_orders loop
    v_slot_mins := (split_part(v_slots[i], ':', 1))::int * 60 + (split_part(v_slots[i], ':', 2))::int;
    v_num_win := ceil(v_pizza_n[i]::numeric / v_batch);
    for k in 0..(v_num_win - 1) loop
      v_items := case when k = v_num_win - 1 then v_pizza_n[i] - v_batch * (v_num_win - 1) else v_batch end;
      v_w := ((v_slot_mins - (v_num_win - k) * (v_prep / 60)) - 540) / 5 + 1;   -- 540 = 09:00
      if v_w < 1 then
        raise exception 'SEED ABORTED: order % at % seats before 09:00 — the engine would flag cantFit.', i, v_slots[i];
      end if;
      v_load[v_w] := v_load[v_w] + v_items;
    end loop;
  end loop;
  for k in 1..v_n_wins loop
    v_peak := greatest(v_peak, v_load[k]);
    if v_load[k] = 0 then v_green := v_green + 1;
    elsif v_load[k] >= v_batch then v_red := v_red + 1;
    else v_amber := v_amber + 1; end if;
  end loop;
  -- 🔴 THE GUARANTEE. Strictly-over the per-category batch is what fires the banner (lib/capacity-breach).
  if v_peak > v_batch then
    raise exception 'SEED ABORTED: peak % pizzas in one window exceeds the Pizza batch of % — that IS the over-capacity banner. Nothing was written.', v_peak, v_batch;
  end if;
  if v_peak > v_cap then
    raise exception 'SEED ABORTED: peak % exceeds kitchen_capacity %.', v_peak, v_cap;
  end if;
  raise notice 'Projection OK: peak % pizzas/window (batch %, ceiling %). Strip: % green, % amber, % red of % windows.',
    v_peak, v_batch, v_cap, v_green, v_amber, v_red, v_n_wins;

  -- ── 4. CLEAR AND INSERT, EVENT BY EVENT ───────────────────────────────────────────────────────
  for e in 1..8 loop
    delete from orders
     where truck_id = v_truck_id and event_id = v_event_ids[e];
    delete from production_slot_usage
     where truck_id = v_truck_id and event_date = v_event_dates[e];

    for i in 1..v_n_orders loop
      v_lines := '[]'::jsonb;
      v_total := 0;
      -- PIZZAS FIRST — every order has at least one (requirement b).
      for k in 0..(v_pizza_n[i] - 1) loop
        v_item := v_pizzas -> ((i + k + e) % v_n_pizzas);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'name', v_item->>'name', 'quantity', 1, 'unit_price', coalesce((v_item->>'price')::numeric, 0)));
        v_total := v_total + coalesce((v_item->>'price')::numeric, 0);
      end loop;
      if v_drink_n[i] > 0 and coalesce(v_n_drinks,0) > 0 then
        v_item := v_drinks -> (i % v_n_drinks);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'name', v_item->>'name', 'quantity', 1, 'unit_price', coalesce((v_item->>'price')::numeric, 0)));
        v_total := v_total + coalesce((v_item->>'price')::numeric, 0);
      end if;
      if v_dess_n[i] > 0 and coalesce(v_n_dess,0) > 0 then
        v_item := v_dess -> (i % v_n_dess);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'name', v_item->>'name', 'quantity', 1, 'unit_price', coalesce((v_item->>'price')::numeric, 0)));
        v_total := v_total + coalesce((v_item->>'price')::numeric, 0);
      end if;

      -- ── STATUS. 🔴 NEVER 'cooking'. The two NOTE-bearing orders are 'pending', which is what a
      -- note does on the real path — it is the mechanism, not a hand-set status.
      v_notes := null;
      if i = 28 then
        v_notes := 'Nut allergy - please keep separate from anything with nuts. Thank you!';
        v_status := 'pending';
      elsif i = 50 then
        v_notes := 'Could we have this cut into 8 slices please?';
        v_status := 'pending';
      elsif i <= 10 then v_status := 'collected';
      elsif i <= 17 then v_status := 'ready';
      else v_status := 'confirmed';
      end if;

      insert into orders (
        id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
        event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
        total, total_minor, notes, status, payment_status, placed_at, source
      ) values (
        i::text, v_truck_id, v_names[i],
        lower(v_names[i]) || '@demo.hatchgrab.test',            -- 🔴 reserved TLD: can never receive mail
        null, v_slots[i], 'collection',
        v_event_dates[e], v_event_ids[e], v_van_id, v_lines, '[]'::jsonb, null, v_total, 0,
        v_total, round(v_total * 100)::integer,
        v_notes, v_status, 'unpaid',
        -- Placed 25 minutes before its own collection — an order-ahead customer, never after the slot.
        ((v_event_dates[e] + v_slots[i]::time) - interval '25 minutes'),
        'web'
      );
    end loop;

    -- 🔴 THE COUNTER = THE HIGHEST DISPLAY ID WRITTEN, so a real order placed during review is #43
    -- and cannot collide with the partial unique index on (event_id, id). Requirement (i).
    update truck_events set order_counter = v_n_orders
     where id = v_event_ids[e] and truck_id = v_truck_id;
  end loop;

  raise notice 'Seeded % orders on each of 8 events for %. Next order on each is #%.',
    v_n_orders, v_truck_name, v_n_orders + 1;
end $$;

commit;

-- ── VERIFY AFTER RUNNING ────────────────────────────────────────────────────────────────────────────
-- Uncomment a block and run it on its own.

-- 1. 🔴 NO WINDOW BREACHES. No row may read BREACH; rows reading 'red (full)' are the intended peaks.
--   with cfg as (
--     select coalesce(c.batch_size, 1) as batch, c.prep_secs / 60 as prep_mins
--       from menu_categories c
--      where c.truck_id = 'test-truck-3-2' and c.name ilike '%pizza%' and coalesce(c.is_active, true)
--      limit 1
--   ),
--   pz as (
--     select o.event_date,
--            (split_part(o.slot,':',1))::int * 60 + (split_part(o.slot,':',2))::int as slot_mins,
--            sum((l->>'quantity')::int) as n
--       from orders o
--       cross join lateral jsonb_array_elements(o.items) l
--       join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
--       join menu_categories c on c.id = m.category_id
--      where o.truck_id = 'test-truck-3-2'
--        and c.name ilike '%pizza%'
--      group by 1,2
--   ),
--   seated as (  -- reproduce the engine's backward seating, one row per occupied window
--     select p.event_date,
--            p.slot_mins - (ceil(p.n::numeric/cfg.batch)::int - g) * cfg.prep_mins as window_mins,
--            case when g = ceil(p.n::numeric/cfg.batch)::int
--                 then p.n - cfg.batch * (ceil(p.n::numeric/cfg.batch)::int - 1)
--                 else cfg.batch end as items
--       from pz p cross join cfg
--       cross join lateral generate_series(1, ceil(p.n::numeric/cfg.batch)::int) g
--   )
--   select event_date,
--          to_char((window_mins/60)::int, 'FM00') || ':' || to_char((window_mins%60)::int, 'FM00') as window,
--          sum(items) as pizzas,
--          (select batch from cfg) as batch,
--          case when sum(items) > (select batch from cfg) then 'BREACH'
--               when sum(items) = (select batch from cfg) then 'red (full)'
--               else 'amber' end as tone
--     from seated
--    group by event_date, window_mins
--   having sum(items) >= (select batch from cfg)
--    order by event_date, window_mins;

-- 2. ✅ EVERY ORDER CONTAINS A PIZZA. Expect 0 / 512 / 808.
--   select count(*) filter (where pizzas = 0) as orders_without_pizza,
--          count(*)                           as total_orders,
--          sum(pizzas)                        as total_pizzas
--     from (
--       select o.order_key,
--              (select coalesce(sum((l->>'quantity')::int), 0)
--                 from jsonb_array_elements(o.items) l
--                 join menu_items_db m on m.name = l->>'name' and m.truck_id = o.truck_id
--                 join menu_categories c on c.id = m.category_id
--                where c.name ilike '%pizza%') as pizzas
--         from orders o
--        where o.truck_id = 'test-truck-3-2'
--     ) s;

-- 3. 🔴 NOTHING IS IN `cooking`. Expect confirmed 360, collected 80, ready 56, pending 16 — nothing else.
--   select status, count(*)
--     from orders
--    where truck_id = 'test-truck-3-2'
--    group by status
--    order by 2 desc;

-- 4. First names only, and every email on the reserved test domain. Expect 0, 0, 0.
--   -- first names only, and every email on the reserved test domain
--   select count(*) filter (where customer_name like '% %')                          as has_surname,
--          count(*) filter (where customer_email is null)                            as missing_email,
--          count(*) filter (where customer_email not like '%@demo.hatchgrab.test')   as wrong_domain
--     from orders where truck_id = 'test-truck-3-2';
--   -- expect 0, 0, 0

-- 5. The counters. Expect 8 rows, each order_counter = 64, orders = 64, max_id = 64.
--   -- the counters, and that no order can collide with a real one placed during review
--   select e.event_date, e.order_counter, count(o.order_key) as orders, max(o.id::int) as max_id
--     from truck_events e
--     left join orders o on o.event_id = e.id and o.truck_id = 'test-truck-3-2'
--    where e.truck_id = 'test-truck-3-2'
--      and e.event_date between date '2026-08-21' and date '2026-08-28'
--    group by e.event_date, e.order_counter
--    order by e.event_date;
--   -- expect 8 rows, each: order_counter = 64, orders = 64, max_id = 64

-- 6. Nothing collects before the engine can seat it. Expect 09:05 and 16:55.
--   -- 🔴 nothing collects before 09:05, which is the earliest the engine can seat a pizza
--   select min(slot), max(slot) from orders where truck_id = 'test-truck-3-2';
--   -- expect 09:05 and 16:55
