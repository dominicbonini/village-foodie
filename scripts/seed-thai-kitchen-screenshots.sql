-- scripts/seed-thai-kitchen-screenshots.sql
-- App Store capture seed — Thai Kitchen (truck_id 'test-truck', slug 'test-kitchen')
-- Event: 2026-08-21, The White Horse — Edwardstone, 16:30-20:00.
--
-- 🔴 THIS IS lib/seed-demo-orders.ts's OWN PLANNER, REPRODUCED FOR THIS EVENT.
-- Same constants, same arithmetic, no randomness:
--   FIRST_COLLECTION_OFFSET_MINS 10 → first collection 16:40
--   SLOT_INTERVAL_MINS 5            → 41 slots, 16:40..20:00
--   target = min(37, round(41 × 37/35)) = 37 orders
--   ORDER_SHAPES cycled (12-shape cycle) → 43 mains + 51 accompaniments = 94 item lines
--   FILL_PATTERN [1, 0, .5, 0, 1, 0, .25, 0, .75, 0] × ceiling 5 → budgets [5,3,5,1,4,5,3,5,1,4,5,2]
--   stride = 41/12 = 3.4167 → 12 loaded slots, tapered, with gaps
--   orders PACKED into those budgets; renumbered in collection order (so #1 collects first)
-- ceiling = 5 = menu_categories.batch_size for the cooking category — the same
-- "MAINS BATCH" the demo caller passes as args.capacity. peakPerSlot = 5, never above.
--
-- 🔴 THIS SCRIPT DELETES BEFORE IT WRITES. PART 1 step 1b removes every order on THIS ONE
-- EVENT (matched by the single resolved event_id — not by truck, not by date range), drops
-- that event's cached occupancy, and resets its order_counter to 0 so the first seeded order
-- is #1. It is inside the same transaction as the insert: any later failure rolls the deletes
-- back too. No other event, truck or date is touched. PART 3 undoes the whole thing.
--
-- RUN BY HAND IN SUPABASE. Nothing in this repo executes it.
-- PART 0 is READ-ONLY. PART 1 is the seed: ONE transaction, aborts whole on any failed
-- precondition. PART 2 verifies. PART 3 undoes.
--
-- CONFIG ASSERTED IN PART 1 (the script REFUSES to run if reality differs):
--   truck_vans.kitchen_capacity      = 8
--   truck_vans.capacity_window_mins  = 10
--   exactly ONE cooking category (prep_secs > 0), prep_secs = 300, batch_size = 5
--   trucks.collection_interval_mins  in (5, 10)   — 5 is the grid this plan was built on
--   trucks.slot_duration_mins        in (5, 10)
--   truck_events.order_counter       — RESET to 0 by the script (see below)
--
-- DISHES ARE NOT NAMED HERE. The pools are read from the live menu exactly as the demo
-- seeder reads them — every active item in the cooking category is a "main", every active
-- item in an instant category is an "extra" — and each line picks pool[pick % length] with
-- the seeder's own running `pick` counter. So this script cannot fail on a dish name.


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 0 — PREFLIGHT (read-only). Run this first.
-- ══════════════════════════════════════════════════════════════════════════════

-- 0a. The event, its van, and the ceiling the capacity engine will use.
select e.id as event_id, e.event_date, e.start_time, e.end_time, e.status, e.venue_name,
       e.order_counter, v.id as van_id, v.kitchen_capacity, v.capacity_window_mins,
       t.collection_interval_mins, t.slot_duration_mins, t.name as truck_name
from truck_events e
join trucks t          on t.id = e.truck_id
left join truck_vans v on v.id = e.van_id
where e.truck_id = 'test-truck'
  and e.event_date = date '2026-08-21'
  and coalesce(e.status, '') <> 'cancelled';

-- 0b. Category config. EXPECT exactly one row with prep_secs > 0 (300 / 5).
select name, prep_secs, batch_size, counts_toward_capacity, is_active, sort_order
from menu_categories where truck_id = 'test-truck'
order by sort_order nulls last, name;

-- 0c. The two POOLS this seed draws from, in the exact order it will index them.
--     EXPECT both non-empty. Whatever is here is what appears on the cards.
select 'main' as pool, mi.name, mi.price, c.name as category
from menu_items_db mi join menu_categories c on c.id = mi.category_id
where mi.truck_id = 'test-truck' and coalesce(mi.is_active,true)
  and coalesce(c.is_active,true) and coalesce(c.prep_secs,0) > 0
union all
select 'extra', mi.name, mi.price, c.name
from menu_items_db mi join menu_categories c on c.id = mi.category_id
where mi.truck_id = 'test-truck' and coalesce(mi.is_active,true)
  and coalesce(c.is_active,true) and coalesce(c.prep_secs,0) = 0
order by 1 desc, 4, 2;

-- 0d. What is on this event now — these rows WILL BE DELETED by PART 1 step 1b.
select count(*) as orders_that_will_be_deleted
from orders o join truck_events e on e.id = o.event_id
where o.truck_id = 'test-truck' and e.event_date = date '2026-08-21';

-- 0e. The truck's display name.
select id, slug, name from trucks where id = 'test-truck';
-- update trucks set name = 'Thai Kitchen' where id = 'test-truck' and name <> 'Thai Kitchen';


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 1 — THE SEED. One transaction. Any failed assertion aborts the lot.
-- ══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  v_truck     text := 'test-truck';
  v_date      date := date '2026-08-21';
  v_event_id  uuid;
  v_van_id    uuid;
  v_cap       int;
  v_capwin    int;
  v_cook_cats int;
  v_prep      int;
  v_batch     int;
  v_interval  int;
  v_slotdur   int;
  v_counter   int;
  v_existing  int;
  v_mains     uuid[];
  v_other     uuid[];
  r           record;
  v_id        int;
  v_items     jsonb;
  v_total     numeric;
  v_n         int := 0;
begin
  -- ── 1. Resolve the event ────────────────────────────────────────────────────
  select e.id, e.van_id, e.order_counter into v_event_id, v_van_id, v_counter
  from truck_events e
  where e.truck_id = v_truck and e.event_date = v_date
    and e.venue_name ilike '%White Horse%'
    and coalesce(e.status, '') <> 'cancelled';

  if v_event_id is null then
    raise exception 'SEED ABORTED: no non-cancelled White Horse event on % for %', v_date, v_truck;
  end if;
  -- ── 1b. 🔴 CLEAR THIS EVENT FIRST — DESTRUCTIVE, AND SCOPED TO ONE event_id ────
  -- `where event_id = v_event_id` and nothing else: not the truck, not the date, not
  -- "future events". v_event_id was resolved above from (truck, date, venue, not-cancelled),
  -- so no other event, no other truck and no past event can be reached by these three
  -- statements. They are inside the SAME transaction as the insert, so if any later
  -- assertion or the insert itself fails, the deletes roll back with it and you are left
  -- exactly where you started.
  -- ⚠️ order_payments has `references orders(order_key) on delete cascade`
  -- (20260729_order_payments_ledger.sql:57) — the only FK to orders — so its rows go with
  -- them automatically. Nothing else in the schema references orders.
  select count(*) into v_existing from orders where event_id = v_event_id;
  delete from orders where event_id = v_event_id;
  delete from production_slot_usage where truck_id = v_truck and event_id = v_event_id;
  update truck_events set order_counter = 0 where id = v_event_id;
  raise notice 'Cleared % existing order(s) from this event (counter was %); counter reset to 0.',
    v_existing, v_counter;

  -- ── 2. The ceiling the capacity engine reads ────────────────────────────────
  if v_van_id is null then
    raise exception 'SEED ABORTED: event has no van — kitchen_capacity would be null (ceiling OFF).';
  end if;
  select kitchen_capacity, capacity_window_mins into v_cap, v_capwin
  from truck_vans where id = v_van_id;
  if coalesce(v_cap,-1) <> 8 or coalesce(v_capwin,-1) <> 10 then
    raise exception 'SEED ABORTED: van has kitchen_capacity=%, capacity_window_mins=%; designed against 8 / 10.', v_cap, v_capwin;
  end if;

  -- ── 3. Exactly ONE cooking category, prep 300s, batch 5 ─────────────────────
  select count(*) into v_cook_cats from menu_categories
  where truck_id = v_truck and coalesce(prep_secs,0) > 0 and coalesce(is_active,true);
  if v_cook_cats <> 1 then
    raise exception 'SEED ABORTED: expected exactly 1 cooking category (prep_secs>0), found %.', v_cook_cats;
  end if;
  select coalesce(prep_secs,0), coalesce(batch_size,0) into v_prep, v_batch from menu_categories
  where truck_id = v_truck and coalesce(prep_secs,0) > 0 and coalesce(is_active,true);
  if v_prep <> 300 or v_batch <> 5 then
    raise exception 'SEED ABORTED: cooking category is prep_secs=%, batch_size=%; the plan was built against 300 / 5 (the budgets are fractions of the batch).', v_prep, v_batch;
  end if;

  -- ── 4. The slot grid. The plan is on the seeder's 5-minute grid. 10 also verified
  --       safe (no window merges, nothing over) but some times fall off the picker grid.
  select coalesce(collection_interval_mins,0), coalesce(slot_duration_mins, coalesce(collection_interval_mins,0))
    into v_interval, v_slotdur from trucks where id = v_truck;
  if v_interval not in (5,10) or v_slotdur not in (5,10) then
    raise exception 'SEED ABORTED: collection_interval_mins=%, slot_duration_mins=%; this plan needs 5 (or 10).', v_interval, v_slotdur;
  end if;
  if v_interval <> 5 then
    raise notice 'NOTE: interval is % — some seeded collection times are not on the picker grid. Tones are unaffected (verified).', v_interval;
  end if;

  -- ── 5. THE POOLS, read from the live menu exactly as the demo seeder reads them.
  --       Deterministically ordered so pool[pick % len] is reproducible (the seeder's
  --       own select is unordered — this is the one deliberate improvement on it).
  select array_agg(mi.id order by mi.name) into v_mains
  from menu_items_db mi join menu_categories c on c.id = mi.category_id
  where mi.truck_id = v_truck and coalesce(mi.is_active,true)
    and coalesce(c.is_active,true) and coalesce(c.prep_secs,0) > 0;

  select array_agg(mi.id order by c.name, mi.name) into v_other
  from menu_items_db mi join menu_categories c on c.id = mi.category_id
  where mi.truck_id = v_truck and coalesce(mi.is_active,true)
    and coalesce(c.is_active,true) and coalesce(c.prep_secs,0) = 0;

  if v_mains is null or array_length(v_mains,1) is null then
    raise exception 'SEED ABORTED: no active items in the cooking category — nothing to cook.';
  end if;
  if v_other is null or array_length(v_other,1) is null then
    raise exception 'SEED ABORTED: no active instant items — the shapes need accompaniments.';
  end if;

  -- ── 6. Insert in collection order. The display number comes from the event's own
  --       counter, exactly as every real write path takes it. Counter 0 → first is #1.
  for r in
    select * from (values
      ( 1, '16:40', 'collected', 'web'   , 'Sarah'  , null                              , 'paid', '{0}'::int[]  , '{}'::int[]),
      ( 2, '16:40', 'collected', 'web'   , 'Dave'   , null                              , 'paid', '{1}'::int[]  , '{2}'::int[]),
      ( 3, '16:40', 'collected', 'web'   , 'Priya'  , null                              , 'paid', '{3}'::int[]  , '{4,5}'::int[]),
      ( 4, '16:40', 'collected', 'manual', 'Walk-up', 'No coriander please'             , 'paid', '{6,7}'::int[], '{8}'::int[]),
      ( 5, '16:40', 'collected', 'web'   , 'Tom'    , null                              , 'paid', '{}'::int[]   , '{11,12}'::int[]),
      ( 6, '16:40', 'collected', 'web'   , 'Aisha'  , null                              , 'paid', '{}'::int[]   , '{42,43}'::int[]),
      ( 7, '16:40', 'collected', 'web'   , 'Mark'   , null                              , 'paid', '{}'::int[]   , '{73,74}'::int[]),
      ( 8, '16:55', 'collected', 'manual', 'Walk-up', null                              , 'paid', '{9}'::int[]  , '{10}'::int[]),
      ( 9, '16:55', 'collected', 'web'   , 'Chloe'  , 'Mild for the kids'               , 'paid', '{13}'::int[] , '{14,15}'::int[]),
      (10, '16:55', 'collected', 'web'   , 'Raj'    , null                              , 'paid', '{20}'::int[] , '{21}'::int[]),
      (11, '17:15', 'collected', 'web'   , 'Ellie'  , null                              , 'paid', '{16,17}'::int[], '{18,19}'::int[]),
      (12, '17:15', 'collected', 'manual', 'Walk-up', null                              , 'paid', '{22}'::int[] , '{23,24}'::int[]),
      (13, '17:15', 'collected', 'web'   , 'Ben'    , null                              , 'paid', '{25}'::int[] , '{}'::int[]),
      (14, '17:15', 'collected', 'web'   , 'Nadia'  , null                              , 'paid', '{31}'::int[] , '{}'::int[]),
      (15, '17:30', 'collected', 'web'   , 'Jack'   , null                              , 'paid', '{32}'::int[] , '{33}'::int[]),
      (16, '17:50', 'ready'    , 'manual', 'Walk-up', 'One without peanuts - allergy'   , 'paid', '{26,27}'::int[], '{28,29,30}'::int[]),
      (17, '17:50', 'ready'    , 'web'   , 'Sophie' , null                              , 'paid', '{34}'::int[] , '{35,36}'::int[]),
      (18, '17:50', 'ready'    , 'web'   , 'Omar'   , null                              , 'paid', '{40}'::int[] , '{41}'::int[]),
      (19, '18:05', 'pending'  , 'web'   , 'Grace'  , null                              , 'unpaid', '{37,38}'::int[], '{39}'::int[]),
      (20, '18:05', 'confirmed', 'manual', 'Walk-up', null                              , 'unpaid', '{44}'::int[] , '{45,46}'::int[]),
      (21, '18:05', 'pending'  , 'web'   , 'Liam'   , null                              , 'unpaid', '{47,48}'::int[], '{49,50}'::int[]),
      (22, '18:25', 'confirmed', 'web'   , 'Yasmin' , null                              , 'unpaid', '{51}'::int[] , '{52}'::int[]),
      (23, '18:25', 'confirmed', 'web'   , 'Callum' , null                              , 'unpaid', '{53}'::int[] , '{54,55}'::int[]),
      (24, '18:25', 'confirmed', 'manual', 'Walk-up', 'Extra spicy on the curry'        , 'unpaid', '{56}'::int[] , '{}'::int[]),
      (25, '18:40', 'confirmed', 'web'   , 'Freya'  , null                              , 'unpaid', '{57,58}'::int[], '{59,60,61}'::int[]),
      (26, '18:40', 'pending'  , 'web'   , 'Idris'  , null                              , 'unpaid', '{62}'::int[] , '{}'::int[]),
      (27, '18:40', 'confirmed', 'web'   , 'Sarah'  , null                              , 'unpaid', '{63}'::int[] , '{64}'::int[]),
      (28, '18:40', 'pending'  , 'manual', 'Walk-up', null                              , 'unpaid', '{65}'::int[] , '{66,67}'::int[]),
      (29, '18:55', 'confirmed', 'web'   , 'Dave'   , null                              , 'unpaid', '{71}'::int[] , '{72}'::int[]),
      (30, '19:15', 'confirmed', 'web'   , 'Priya'  , null                              , 'unpaid', '{68,69}'::int[], '{70}'::int[]),
      (31, '19:15', 'confirmed', 'web'   , 'Tom'    , 'Collecting for a table of four'  , 'unpaid', '{75}'::int[] , '{76,77}'::int[]),
      (32, '19:15', 'confirmed', 'manual', 'Walk-up', null                              , 'unpaid', '{82}'::int[] , '{83}'::int[]),
      (33, '19:30', 'confirmed', 'web'   , 'Aisha'  , null                              , 'unpaid', '{78,79}'::int[], '{80,81}'::int[]),
      (34, '19:30', 'confirmed', 'web'   , 'Mark'   , null                              , 'unpaid', '{84}'::int[] , '{85,86}'::int[]),
      (35, '19:30', 'pending'  , 'web'   , 'Chloe'  , null                              , 'unpaid', '{87}'::int[] , '{}'::int[]),
      (36, '19:30', 'confirmed', 'manual', 'Walk-up', null                              , 'unpaid', '{93}'::int[] , '{}'::int[]),
      (37, '19:50', 'confirmed', 'web'   , 'Raj'    , null                              , 'unpaid', '{88,89}'::int[], '{90,91,92}'::int[])
    ) as t(seq, slot, status, source, customer, notes, payment, mains_picks, extra_picks)
    order by slot, seq
  loop
    -- Lines: mains first (in pick order), then extras — the seeder's own order.
    -- unit_price INCLUDES modifiers, and every REQUIRED group is filled using the
    -- seeder's own deterministic chooser: pickIdx = (pick*31 + groupIdx*17 + 7) % len.
    select jsonb_agg(x.line order by x.idx), sum(x.unit_price * x.qty)
      into v_items, v_total
    from (
      select y.idx,
             1 as qty,
             (mi.price + coalesce(m.msum,0))::numeric as unit_price,
             jsonb_strip_nulls(jsonb_build_object(
               'name',       mi.name,
               'quantity',   1,
               'unit_price', (mi.price + coalesce(m.msum,0))::numeric,
               'modifiers',  m.mods
             )) as line
      from (
        select p.ord as idx, p.pk,
               v_mains[1 + mod(p.pk, array_length(v_mains,1))] as item_id
        from unnest(r.mains_picks) with ordinality as p(pk, ord)
        union all
        select coalesce(array_length(r.mains_picks,1),0) + p.ord, p.pk,
               v_other[1 + mod(p.pk, array_length(v_other,1))]
        from unnest(r.extra_picks) with ordinality as p(pk, ord)
      ) y
      join menu_items_db mi on mi.id = y.item_id
      left join lateral (
        select jsonb_agg(jsonb_build_object('name', g.opts[g.sel], 'price', g.prices[g.sel]) order by g.gid) as mods,
               sum(g.prices[g.sel]) as msum
        from (
          select z.gid, z.opts, z.prices,
                 1 + mod((y.pk * 31 + (z.gi * 17) + 7), array_length(z.opts,1)) as sel
          from (
            select mg.id as gid,
                   array_agg(mo.name order by mo.name) as opts,
                   array_agg(coalesce(mo.price_adjustment,0)::numeric order by mo.name) as prices,
                   (row_number() over (order by mg.id))::int - 1 as gi
            from item_modifier_groups img
            join modifier_groups mg
              on mg.id = img.group_id
             and (coalesce(mg.is_required,false) or coalesce(mg.min_choices,0) >= 1)
            join modifier_options mo
              on mo.group_id = mg.id
             and coalesce(mo.available,true)
             and not (mo.id::text = any(coalesce(img.excluded_option_ids::text[], array[]::text[])))
            where img.menu_item_id = y.item_id
            group by mg.id
          ) z
        ) g
      ) m on true
    ) x;

    if v_items is null then
      raise exception 'SEED ABORTED: order seq % produced no item lines.', r.seq;
    end if;

    v_id := increment_event_order_counter(v_event_id);
    v_n  := v_n + 1;

    insert into orders (
      id, truck_id, customer_name, customer_phone, customer_email,
      slot, order_type, event_date, event_id,
      items, deals, discount_code,
      subtotal, discount_amt, total, total_minor,
      notes, status, payment_status, source
    ) values (
      v_id::text, v_truck, r.customer, null, null,   -- customer_email STAYS NULL: no seeded row can email
      r.slot, 'collection', v_date, v_event_id,
      v_items, '[]'::jsonb, null,
      v_total, 0, v_total, round(v_total * 100)::int,
      r.notes, r.status, r.payment, r.source
    );
  end loop;

  -- ── 7. Drop this event's cached occupancy so the engine rebuilds it from the orders
  --       just written (lib/slot-bookings.ts readProductionSlotUnits). Event-scoped.
  delete from production_slot_usage where truck_id = v_truck and event_id = v_event_id;

  raise notice 'Seeded % orders, #1..#%, on event %.', v_n, v_n, v_event_id;
end $$;

commit;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 1b — OPTIONAL: put THIS event live. Run only if you want the "open" board.
-- ══════════════════════════════════════════════════════════════════════════════
-- update truck_events set status = 'open'
-- where truck_id = 'test-truck' and event_date = date '2026-08-21'
--   and venue_name ilike '%White Horse%' and status <> 'open';


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 2 — VERIFY
-- ══════════════════════════════════════════════════════════════════════════════

-- 2a. The board. EXPECT 37 rows, id 1..37 ascending with slot.
select o.id, o.slot, o.status, o.source, o.customer_name, o.total, o.notes,
       jsonb_array_length(o.items) as lines
from orders o join truck_events e on e.id = o.event_id
where o.truck_id = 'test-truck' and e.event_date = date '2026-08-21'
order by (o.id)::int;

-- 2b. Counters. EXPECT New=5, Confirmed=17 (14 confirmed + 3 ready), Done=15, board=22.
select count(*) filter (where o.status = 'pending')                                    as new_count,
       count(*) filter (where o.status in ('confirmed','modified','cooking','ready'))  as confirmed_count,
       count(*) filter (where o.status in ('collected','cancelled','rejected'))        as done_count,
       count(*) filter (where o.status not in ('collected','cancelled','rejected'))    as kds_board_count
from orders o join truck_events e on e.id = o.event_id
where o.truck_id = 'test-truck' and e.event_date = date '2026-08-21';

-- 2c. 🔴 THE CAPACITY CHECK. Mains per slot for the BEARING statuses only
--     (buildUnitsFromOrders counts pending/confirmed/modified/cooking; 'ready' and
--     'collected' release the oven).
--     EXPECT: 18:05=5, 18:25=3, 18:40=5, 18:55=1, 19:15=4, 19:30=5, 19:50=2
--     and NOTHING above 5, which is the batch. 5 = red, 1-4 = amber, absent = green.
select o.slot, sum((li->>'quantity')::int) as mains
from orders o
join truck_events e on e.id = o.event_id
cross join lateral jsonb_array_elements(o.items) li
join menu_items_db mi  on mi.truck_id = o.truck_id and mi.name = li->>'name'
join menu_categories c on c.id = mi.category_id and coalesce(c.prep_secs,0) > 0
where o.truck_id = 'test-truck' and e.event_date = date '2026-08-21'
  and o.status in ('pending','confirmed','modified','cooking')
group by o.slot order by o.slot;

-- 2d. Counter landed past the highest display number. EXPECT 37.
select order_counter from truck_events
where truck_id = 'test-truck' and event_date = date '2026-08-21'
  and venue_name ilike '%White Horse%';

-- 2e. No seeded row can email anyone, and every source satisfies the CHECK. Both 0.
select count(*) filter (where o.customer_email is not null)                as with_email_MUST_BE_0,
       count(*) filter (where o.source not in ('web','manual','whatsapp')) as bad_source_MUST_BE_0
from orders o join truck_events e on e.id = o.event_id
where o.truck_id = 'test-truck' and e.event_date = date '2026-08-21';


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 3 — UNDO (this event only)
-- ══════════════════════════════════════════════════════════════════════════════
-- begin;
-- delete from orders o using truck_events e
--  where e.id = o.event_id and o.truck_id = 'test-truck'
--    and e.event_date = date '2026-08-21' and e.venue_name ilike '%White Horse%';
-- delete from production_slot_usage p using truck_events e
--  where e.id = p.event_id and p.truck_id = 'test-truck'
--    and e.event_date = date '2026-08-21' and e.venue_name ilike '%White Horse%';
-- update truck_events set order_counter = 0
--  where truck_id = 'test-truck' and event_date = date '2026-08-21'
--    and venue_name ilike '%White Horse%';
-- commit;
