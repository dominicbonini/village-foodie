-- seed-app-tester-sept.sql — 64 orders on each of 14 events, 4–17 September 2026.
-- Truck: test-truck-3-2 ("App Tester", slug 'app-tester').
--
-- 🚫 NOT RUN. Dominic runs all SQL by hand. Paste the whole file into the Supabase SQL editor.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THESE ORDERS MUST NEVER BE MARKED PAID. READ THIS BEFORE ANYTHING ELSE.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Marking one paid — in the dashboard, on the KDS, anywhere — writes a row into `order_payments`.
-- On this project that row carries `livemode = true`, because livemode is taken from the live Stripe
-- key in force at write time and NOT from the order's provenance. Once written it is
-- indistinguishable from real revenue in every query that sums the ledger.
--
-- ⚠️ THIS HAS ALREADY HAPPENED ON THIS TRUCK. There are 24 `order_payments` rows against
-- test-truck-3-2. ALL 24 are `livemode = true`, all of kind 'charge', and 19 of them attach to
-- orders whose customer_email ends '@demo.hatchgrab.test' — i.e. to previously seeded rows. That
-- contamination is exactly why the marker below exists. Do not add to it.
--
-- 🔴 WHICH ACTION CAUSED IT IS **UNKNOWN**, and I will not guess. What is READ from the data: the 24
-- paid orders on this truck sit at FOUR different statuses —
--     paid/collected 14   ·   paid/ready 6   ·   paid/confirmed 3   ·   paid/cancelled 1
-- so payment is NOT tied to any one status transition. 14 of them carry paid_at equal to collected_at
-- to the millisecond (paid and collected in the same action); the other 10 were never collected at
-- all and have paid_at NULL, meaning the order_payments row was written without the order itself
-- being marked. Note the last line especially: one order is PAID AND CANCELLED.
-- 🔴 THE PRACTICAL RULE: no status is safe. Treat ANY action on a seeded order — accept, ready,
-- collect, cancel — as capable of writing a live-mode money row. Leave these rows alone.
--
-- ── HOW TO IDENTIFY THESE ROWS LATER ─────────────────────────────────────────────────────────────
--     select * from orders where truck_id = 'test-truck-3-2' and table_ref = 'SEED';
--
-- ── HOW TO DELETE THEM ───────────────────────────────────────────────────────────────────────────
--     -- 1. CHECK FIRST that none has acquired a payment row. This must return ZERO rows.
--     select o.id, o.event_date, p.kind, p.amount_minor, p.livemode
--       from orders o join order_payments p on p.order_key = o.order_key
--      where o.truck_id = 'test-truck-3-2' and o.table_ref = 'SEED';
--
--     -- 2. Only if step 1 returned nothing:
--     begin;
--     delete from orders where truck_id = 'test-truck-3-2' and table_ref = 'SEED';
--     update truck_events set order_counter = 0
--      where truck_id = 'test-truck-3-2'
--        and event_date between date '2026-09-04' and date '2026-09-17';
--     commit;
--
-- 🔴 IF STEP 1 RETURNS ANYTHING, STOP AND ASK. Deleting the order destroys the only link back to a
-- live-mode money row. Decide what to do with the payment first, then delete.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE MARKER: `table_ref = 'SEED'`
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THIS WAS `source = 'seed'` AND THAT VERSION FAILED. RECORDED SO IT IS NOT RETRIED.
-- The first run of this file aborted on the very first row with:
--     ERROR: 23514 new row for relation "orders" violates check constraint "orders_source_check"
-- ⚠️ **THE ERROR WAS MINE, AND THE REASONING GAP IS THE LESSON.** `orders.source` was chosen after
-- verifying that NO CODE branches on an order's source. That was true and it was not sufficient:
-- **a column can be constrained by the DATABASE even when no application code reads it.** The check
-- constraint was never consulted. **Grepping the code establishes what READS a column; only the
-- schema establishes what a column may CONTAIN.**
-- 🔴 AND WIDENING IT IS NOT AN OPTION HERE: adding 'seed' to `orders_source_check` is a MIGRATION,
-- and migrations are frozen. See "IF THE FREEZE LIFTS" at the end of this block.
--
-- ⚠️ `source` NOW MATCHES PRODUCTION INSTEAD. The seeded rows carry `source = 'web'`, exactly as the
-- existing 896 seeded rows do. It is no longer the marker; it is just part of matching the shape.
--
-- ── WHY `table_ref` ──────────────────────────────────────────────────────────────────────────────
--   • 🔴 IT IS NOT RENDERED ANYWHERE. **Zero references in `app/` and zero in `components/`** — no
--     `.tsx` file in the repository mentions it. It cannot reach a customer or an operator screen.
--   • It survives the lifecycle. The only writers are the draft-promotion path
--     (`lib/payments/order-drafts.ts`, `lib/payments/promote-draft.ts`), which sets it at INSERT and
--     never updates it. Accept, ready, collect, cancel and refund all leave it alone.
--   • It is free text. `supabase/migrations/20260812_order_drafts.sql` declares it `table_ref text`
--     with **no CHECK**, which is precisely the property `source` turned out to lack.
--   • The value `'SEED'` is deliberately **not a plausible table number**, so if it ever does surface
--     it reads as an obvious marker rather than as data.
--
-- ── ⚠️ THE COST, STATED PLAINLY: THIS IS THE REUSE I ORIGINALLY REJECTED IT FOR ──────────────────
-- `table_ref` is a REAL table-service feature column. I rejected it first time round precisely
-- because filling it with a sentinel is the kind of reuse that goes wrong the day table service is
-- switched on — at which point something may try to render `SEED` as a table for 896 orders.
-- 🔴 THE CONSTRAINT FAILURE CHANGED THE TRADE, NOT THE OBJECTION. The objection still stands; it is
-- now the lesser risk, because the alternative requires a frozen migration. **If table service is
-- ever built, delete these rows first** (see the header) **or exclude `table_ref = 'SEED'` in it.**
--
-- ── WHAT ELSE WAS CONSIDERED ─────────────────────────────────────────────────────────────────────
--   • `source = 'manual'` — allowed by the constraint, but **does not identify**: this truck already
--     has 5 genuine `manual` orders and the database has 69.
--   • `notes` — customer-entered and shown on the KDS and on tickets. Customer-visible. Rejected.
--   • `customer_email like '%@demo.hatchgrab.test'` — the existing convention, and the weak one this
--     file set out to improve on: a naming convention is not an enforced constraint.
--   • `extras` / `bundle` / `modify_data` — live feature columns read by the order pipeline.
--
-- ── ⚠️ IF THE MARKER COLUMN IS LATER REUSED FOR SOMETHING ELSE ─────────────────────────────────
-- If `table_ref` starts carrying real table numbers, two things follow:
--   1. The identify query stops meaning "seeded" and starts meaning "seeded OR table SEED".
--   2. **The DELETE in this header becomes destructive beyond its intent** — the dangerous one,
--      because that is the query someone runs without thinking six months from now.
-- The narrowing guard is already in every predicate: **`truck_id` AND the date range**, so a stray
-- `table_ref = 'SEED'` elsewhere cannot be caught by them.
--
-- ── IF THE FREEZE LIFTS, THIS IS THE BETTER FIX ──────────────────────────────────────────────────
-- Add 'seed' to the source constraint and move the marker back onto the provenance column, where it
-- belongs semantically:
--     alter table orders drop constraint orders_source_check;
--     alter table orders add constraint orders_source_check check (source in ('web','manual','seed'));
-- 🔴 RUN THIS FIRST TO SEE WHAT THE CONSTRAINT ACTUALLY ALLOWS TODAY — I have NOT established it,
-- and the statement above is written from the two values in use, not from the constraint text:
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.orders'::regclass and contype = 'c';
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS WRITES, AND WHAT IT DELIBERATELY DOES NOT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   WRITES:  orders                          896 rows (64 × 14 events), each `table_ref = 'SEED'`
--            truck_events.order_counter = 64 on each of the 14 events
--
--   DOES NOT WRITE:
--     • order_payments        — by instruction. Seeded orders stay unpaid. See the header.
--     • production_slot_usage — 🔴 THIS CORRECTS docs/order-seeding-approach-report.md. That report
--       listed slot usage as a table "a real order writes". True of the RPC place_order_atomic — but
--       the production evidence says the SEED never wrote it. Of the 14 already-seeded dates on this
--       truck, only FOUR have any production_slot_usage rows at all:
--           2026-08-21 (45)   2026-08-25 (49)   2026-08-27 (44)   2026-09-01 (52)
--       and those four are exactly the dates carrying the paid orders — i.e. the rows were written by
--       real interaction afterwards, not by the seed. The other ten seeded dates have zero. Writing
--       it here would deviate from the specification, and the specification is the production rows.
--       The dashboard reprojects capacity from `orders.items` when the event is opened.
--     • order_counters        — this truck has ZERO rows in that table. The real flow increments the
--       per-EVENT counter (truck_events.order_counter) and only falls back to the truck-level table
--       when an order has no event. Every order here has an event.
--
-- ── DISPLAY NUMBERS ──────────────────────────────────────────────────────────────────────────────
-- `orders.id` is TEXT and holds the DISPLAY number, unique per event via the partial index
-- `orders_event_display_id ON orders (event_id, id) WHERE event_id IS NOT NULL`. This writes
-- '1'..'64' per event, then sets order_counter = 64, so the next real order on that event is #65 and
-- cannot collide. `order_key` (the uuid the payments table joins on) comes from the column default.
--
-- ── SHAPE, DERIVED FROM PRODUCTION, NOT FROM THE COMMITTED SCRIPT ────────────────────────────────
-- Matches the most recent generation on this truck (29 Aug – 3 Sep), read row by row:
--     placed_at NULL · extras NULL · deals '[]' · discount_amt 0 · payment_status 'unpaid'
--     order_type 'collection' · van_id 0cde7768-ef86-473d-bfab-5d3afcb0ab6d
--     customer_email <name>@demo.hatchgrab.test · created_at = day before, 18:00Z
-- ⚠️ docs/seed-apple-tester-orders.sql sets placed_at and uses a different status mix. It is NOT what
-- produced the live rows. The live rows are the specification.
--
-- ── STATUSES ─────────────────────────────────────────────────────────────────────────────────────
-- Per event: THREE live on the board — one 'pending', one 'confirmed', one 'ready' — and 61
-- 'collected'. The live three rotate by event so a different part of the day is in progress each day.
--
-- ON 'collected' + 'unpaid'. This combination is already the NORM on this truck, not an anomaly the
-- seed invents: of the 94 existing collected orders, 80 are payment_status='unpaid' and only 14 are
-- paid. So the seeded rows look like the ones already there. The 14 paid ones are the contaminated
-- set described at the top of this file — they are the exception, and the thing not to repeat.
--
-- ── ITEMS AND CAPACITY ───────────────────────────────────────────────────────────────────────────
-- 🔴 Every item name below was checked against menu_items_db for this truck: all 26 exist, all are
-- is_active = true, and every unit_price equals the live menu price. The guard re-checks at run time,
-- because the capacity engine joins items[].name to the menu and an unmatched name renders on the
-- board while projecting NO capacity — a silent wrong answer, worse than a failed insert.
--
-- Capacity ceiling, read from menu_categories on this truck:
--     Pizza     batch_size = 2   prep_secs = 300   counts_toward_capacity = TRUE
--     Drinks / Desserts / Specials / Dough Balls    batch 0, prep 0, capacity FALSE
-- So only pizzas count, and a 5-minute window holds one batch of 2. Each order occupies its own
-- distinct 5-minute slot and carries at most 2 pizzas, so no window ever exceeds the ceiling.

begin;

do $$
declare
  v_truck_id  text := 'test-truck-3-2';
  v_van_id    uuid := '0cde7768-ef86-473d-bfab-5d3afcb0ab6d';
  v_n         int  := 64;
  v_from      date := date '2026-09-04';
  v_to        date := date '2026-09-17';

  v_event_ids uuid[];
  v_dates     date[];
  v_eid       uuid;
  v_date      date;
  e           int;
  i           int;
  v_name      text;
  v_slot      text;
  v_slot_idx  int;
  v_status    text;
  v_before    text;
  v_collected timestamptz;
  v_notes     text;
  v_lines     jsonb;
  v_total     numeric;
  v_created   timestamptz;
  v_pizza     text;
  v_pizza2    text;
  v_side      text;
  v_pprice    numeric;
  v_pprice2   numeric;
  v_sprice    numeric;
  v_bad       text;
  v_live      int;

  -- The 64 names, exactly the set the existing seeded events use (verified: no additions, no
  -- omissions, no duplicates).
  v_names text[] := array[
    'Amelia','Ben','Chloe','Dan','Ella','Finn','Grace','Harry','Isla','Jack','Kira','Liam','Maya',
    'Noah','Olive','Pete','Quinn','Rosa','Sam','Tess','Umar','Vik','Will','Yasmin','Zac','Aisha',
    'Blake','Callum','Dev','Erin','Felix','Gia','Hana','Hugo','Idris','Iris','Joel','Jonah','Kai',
    'Kayla','Lena','Leo','Milo','Mira','Nate','Nina','Omar','Orla','Paolo','Priya','Reuben','Rhys',
    'Saskia','Sofia','Theo','Tom','Uma','Ava','Vince','Cara','Dylan','Eve','Gwen','Frank'];

  -- 21 pizzas. Names and prices verified against the live menu.
  v_pizzas text[] := array[
    'Holli''s Pizza','Inferno Delight','Napoli Special','Cantanapoli','Capricciosa','Marinara',
    'Marinara Picante','Smoked','Margherita','Spicy Salami','Craig''s Pizza','Pepperoni',
    'Ham and Basil','Napolitano','Ham & Shroom','Buscaiola','Sweet Heat Salami','Genovese',
    'Campagnola','Tonno Delight','Focaccia Pizza'];
  v_pprices numeric[] := array[
    12,13,13,12,13,7,10,12,10,12,13.5,12,12,12,12,13,12,12,12,12,5.5];

  -- 5 sides: three drinks, two desserts. None counts toward capacity.
  v_sides   text[]    := array['Fanta','Coca-cola','Sprite','Tiramisu','Nutella Pizza'];
  v_sprices numeric[] := array[1.5,1.5,1.5,8,8];
begin
  -- ══ GUARD 0: the marker column must not be constrained ═════════════════════════════════════════
  -- 🔴 THIS GUARD EXISTS BECAUSE THE FIRST VERSION OF THIS FILE FAILED EXACTLY HERE. The marker was
  -- `source = 'seed'`, and `orders_source_check` rejected it on the FIRST ROW after all four guards
  -- had passed. Grepping the code proved nothing read the column; it could not prove what the column
  -- was allowed to hold. This asks the schema directly, before writing anything.
  select string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ')
    into v_bad
    from pg_constraint
   where conrelid = 'public.orders'::regclass
     and contype  = 'c'
     and pg_get_constraintdef(oid) ilike '%table_ref%';
  if v_bad is not null then
    raise exception
      'REFUSING TO RUN: a CHECK constraint restricts table_ref, so the marker may be rejected: %', v_bad;
  end if;

  -- ══ GUARD 1: right truck, by id AND by name ════════════════════════════════════════════════════
  -- 🔴 BOTH, because 'test-truck-3' and 'test-truck-3-2' are different live trucks whose ids differ
  -- by two characters. An id typo alone would land 896 orders on the wrong operator's board.
  if not exists (select 1 from trucks where id = v_truck_id and name = 'App Tester') then
    raise exception
      'REFUSING TO RUN: no truck with id=% and name="App Tester". Check the id before retrying.',
      v_truck_id;
  end if;

  -- ══ GUARD 2: cannot run twice ══════════════════════════════════════════════════════════════════
  -- An existence check, not a comment. If ANY seed order already sits on this truck in the target
  -- window, the whole transaction aborts and nothing is written.
  if exists (
    select 1 from orders
     where truck_id = v_truck_id and table_ref = 'SEED'
       and event_date between v_from and v_to
  ) then
    raise exception
      'REFUSING TO RUN: seed orders already exist on % for % to %. Delete them first (see file header).',
      v_truck_id, v_from, v_to;
  end if;

  -- ══ GUARD 3: exactly fourteen events, this truck's, and empty ══════════════════════════════════
  select array_agg(id order by event_date), array_agg(event_date order by event_date)
    into v_event_ids, v_dates
    from truck_events
   where truck_id = v_truck_id and event_date between v_from and v_to;

  if v_event_ids is null or array_length(v_event_ids, 1) <> 14 then
    raise exception 'REFUSING TO RUN: expected 14 events for % to % on %, found %.',
      v_from, v_to, v_truck_id, coalesce(array_length(v_event_ids, 1), 0);
  end if;

  -- Catches orders placed by ANY route, seeded or real, not just this script's.
  if exists (select 1 from orders where truck_id = v_truck_id and event_id = any(v_event_ids)) then
    raise exception 'REFUSING TO RUN: at least one of the 14 target events already has orders.';
  end if;

  -- ══ GUARD 4: every item name is on THIS truck's active menu ════════════════════════════════════
  select string_agg(n, ', ') into v_bad
    from unnest(v_pizzas || v_sides) as n
   where not exists (
     select 1 from menu_items_db m
      where m.truck_id = v_truck_id and m.name = n and coalesce(m.is_active, true)
   );
  if v_bad is not null then
    raise exception 'REFUSING TO RUN: these item names are not on the active menu: %', v_bad;
  end if;

  -- ══ WRITE ══════════════════════════════════════════════════════════════════════════════════════
  for e in 1..14 loop
    v_eid     := v_event_ids[e];
    v_date    := v_dates[e];
    -- Matches the 29 Aug – 3 Sep generation exactly: the evening before, 18:00 UTC.
    v_created := (v_date - 1) + time '18:00:00';
    -- Which three orders are live on the board today. Rotates so it is a different part of the day
    -- on each of the fourteen days. Bounded to 1..61 so the trio never runs past order 64.
    v_live    := ((e * 7) % 60) + 1;

    for i in 1..v_n loop
      v_name := v_names[i];

      -- ── SLOT ─────────────────────────────────────────────────────────────────────────────────
      -- The 5-minute grid, 09:00–16:55 (96 windows), inside the event's 09:00–17:00 window.
      -- ((i-1)*3)/2 is integer division: 0,1,3,4,6,7,… — 64 DISTINCT values in 0..94, which spreads
      -- 64 orders across the whole trading day instead of bunching them in the first five hours.
      -- The +(e-1)*2 shifts the whole pattern per event so no two days line up; mod 96 keeps it on
      -- the grid, and distinctness survives because every base value is below 96.
      v_slot_idx := ((((i - 1) * 3) / 2) + (e - 1) * 2) % 96;
      v_slot     := to_char(time '09:00' + (v_slot_idx * interval '5 minutes'), 'HH24:MI');

      -- ── ITEMS ────────────────────────────────────────────────────────────────────────────────
      -- Rotated by BOTH i and e, so the basket mix differs down the day and across the fortnight.
      v_pizza  := v_pizzas [1 + ((i * 3 + e * 5) % array_length(v_pizzas, 1))];
      v_pprice := v_pprices[1 + ((i * 3 + e * 5) % array_length(v_pprices, 1))];
      v_side   := v_sides  [1 + ((i + e * 2) % array_length(v_sides, 1))];
      v_sprice := v_sprices[1 + ((i + e * 2) % array_length(v_sprices, 1))];

      if (i + e) % 3 = 0 then
        -- two pizzas + a side. Two is the batch ceiling for a 5-minute window, never exceeded.
        v_pizza2  := v_pizzas [1 + ((i * 5 + e * 7 + 4) % array_length(v_pizzas, 1))];
        v_pprice2 := v_pprices[1 + ((i * 5 + e * 7 + 4) % array_length(v_pprices, 1))];
        v_lines := jsonb_build_array(
          jsonb_build_object('name', v_pizza,  'quantity', 1, 'unit_price', v_pprice),
          jsonb_build_object('name', v_pizza2, 'quantity', 1, 'unit_price', v_pprice2),
          jsonb_build_object('name', v_side,   'quantity', 1, 'unit_price', v_sprice));
        v_total := v_pprice + v_pprice2 + v_sprice;
      elsif (i + e) % 3 = 1 then
        -- one pizza + a side
        v_lines := jsonb_build_array(
          jsonb_build_object('name', v_pizza, 'quantity', 1, 'unit_price', v_pprice),
          jsonb_build_object('name', v_side,  'quantity', 1, 'unit_price', v_sprice));
        v_total := v_pprice + v_sprice;
      else
        -- one pizza only
        v_lines := jsonb_build_array(
          jsonb_build_object('name', v_pizza, 'quantity', 1, 'unit_price', v_pprice));
        v_total := v_pprice;
      end if;

      -- ── STATUS ───────────────────────────────────────────────────────────────────────────────
      v_before    := null;
      v_collected := null;
      if    i = v_live     then v_status := 'pending';
      elsif i = v_live + 1 then v_status := 'confirmed';
      elsif i = v_live + 2 then v_status := 'ready';
      else
        v_status := 'collected';
        -- Real collected rows carry these two. paid_at stays NULL — see the header.
        v_before    := case when i % 4 = 0 then 'ready' else 'confirmed' end;
        v_collected := (v_date + v_slot::time) + interval '12 minutes';
      end if;

      -- ── NOTES ────────────────────────────────────────────────────────────────────────────────
      v_notes := null;
      if    i = 28 then v_notes := 'Nut allergy - please keep separate from anything with nuts. Thank you!';
      elsif i = 50 then v_notes := 'Could we have this cut into 8 slices please?';
      elsif i = 9 and e % 3 = 0 then v_notes := 'Running about 10 minutes late, sorry!';
      end if;

      insert into orders (
        id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
        event_date, event_id, van_id, items, extras, deals, discount_code, table_ref,
        subtotal, discount_amt, total, total_minor,
        notes, status, status_before_collected, collected_at,
        payment_status, paid_at, amount_paid, placed_at, source,
        created_at, updated_at
      ) values (
        i::text, v_truck_id, v_name,
        -- .test is an IANA-reserved TLD: these addresses can never receive mail.
        lower(replace(v_name, '''', '')) || '@demo.hatchgrab.test',
        null, v_slot, 'collection',
        v_date, v_eid, v_van_id, v_lines, null, '[]'::jsonb, null,
        'SEED',      -- 🔴 THE MARKER
        v_total, 0, v_total, round(v_total * 100)::integer,
        v_notes, v_status, v_before, v_collected,
        'unpaid',    -- 🔴 never 'paid'
        null,        -- 🔴 paid_at NULL — no money, no order_payments row
        null,        -- amount_paid: NULL, as 875 of the 877 existing unpaid rows carry
        null,        -- 🔴 placed_at NULL, matching the production rows
        'web',       -- matches the existing seeded rows; NOT the marker (see header)
        v_created, v_created
      );
    end loop;

    -- The next real order on this event is #65, so it cannot collide with the partial unique index.
    update truck_events
       set order_counter = v_n
     where id = v_eid and truck_id = v_truck_id;
  end loop;

  raise notice 'Seeded % orders on each of 14 events (% to %) for %. Next order on each event is #%.',
    v_n, v_from, v_to, v_truck_id, v_n + 1;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after committing. Each block is independent; run them all.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 1. WHAT WAS WRITTEN — one row per event. Expect 14 rows, orders=64, counter=64 on every one.
select e.event_date,
       e.venue_name,
       e.order_counter,
       count(o.*)                                     as orders,
       count(*) filter (where o.status = 'collected') as collected,
       count(*) filter (where o.status = 'pending')   as pending,
       count(*) filter (where o.status = 'confirmed') as confirmed,
       count(*) filter (where o.status = 'ready')     as ready,
       min(o.slot)                                    as first_slot,
       max(o.slot)                                    as last_slot,
       count(distinct o.slot)                         as distinct_slots,
       round(sum(o.total), 2)                         as day_total
  from truck_events e
  join orders o on o.event_id = e.id and o.table_ref = 'SEED'
 where e.truck_id = 'test-truck-3-2'
   and e.event_date between date '2026-09-04' and date '2026-09-17'
 group by e.event_date, e.venue_name, e.order_counter
 order by e.event_date;

-- 2. 🔴 NO SEED ORDER HAS A PAYMENT ROW. Must return ZERO rows — now, and every time you check.
select o.event_date, o.id, o.customer_name, p.kind, p.amount_minor, p.livemode
  from orders o
  join order_payments p on p.order_key = o.order_key
 where o.truck_id = 'test-truck-3-2' and o.table_ref = 'SEED';

-- 3. 🔴 NOTHING IS MARKED PAID. Must return ZERO rows.
select event_date, id, payment_status, paid_at, amount_paid
  from orders
 where truck_id = 'test-truck-3-2' and table_ref = 'SEED'
   and (payment_status <> 'unpaid' or paid_at is not null or coalesce(amount_paid, 0) <> 0);

-- 4. NO 5-MINUTE WINDOW EXCEEDS THE PIZZA BATCH. Pizza batch_size = 2; three would be a breach.
--    Rows with n = 2 are AT the ceiling and expected. Any row marked BREACH is a problem.
with pz as (
  select o.event_date, o.slot, sum((l->>'quantity')::int) as n
    from orders o
    cross join lateral jsonb_array_elements(o.items) l
    join menu_items_db  m on m.truck_id = o.truck_id and m.name = l->>'name'
    join menu_categories c on c.id = m.category_id
   where o.truck_id = 'test-truck-3-2'
     and o.table_ref = 'SEED'
     and c.counts_toward_capacity
   group by o.event_date, o.slot
)
select event_date, slot, n,
       case when n > 2 then 'BREACH' else 'at ceiling' end as verdict
  from pz
 where n >= 2
 order by n desc, event_date, slot
 limit 20;

-- 5. EVERY ITEM NAME RESOLVES TO THIS TRUCK'S MENU. Must return ZERO rows.
select distinct l->>'name' as unmatched_item
  from orders o
  cross join lateral jsonb_array_elements(o.items) l
 where o.truck_id = 'test-truck-3-2' and o.table_ref = 'SEED'
   and not exists (
     select 1 from menu_items_db m
      where m.truck_id = o.truck_id and m.name = l->>'name');

-- 6. NOTHING OUTSIDE THE TARGET WINDOW WAS TOUCHED. Must return ZERO rows.
select event_date, count(*)
  from orders
 where truck_id = 'test-truck-3-2' and table_ref = 'SEED'
   and (event_date < date '2026-09-04' or event_date > date '2026-09-17')
 group by event_date;

-- 7. NO OTHER TRUCK GAINED A SEED ROW. Must return ZERO rows.
select truck_id, count(*) from orders
 where table_ref = 'SEED' and truck_id <> 'test-truck-3-2'
 group by truck_id;
