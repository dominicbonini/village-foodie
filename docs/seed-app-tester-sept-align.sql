-- seed-app-tester-sept-align.sql — make the 14 new events EXACT duplicates of a previous event.
-- Truck: test-truck-3-2 ("App Tester"). Corrects the rows written by docs/seed-app-tester-sept.sql.
--
-- 🚫 NOT RUN. Dominic runs all SQL by hand.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT WENT WRONG, AND WHAT THIS FIXES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- The seed ran and wrote 896 rows correctly, but it wrote the WRONG CONTENT. It generated *varied*
-- items, slots and statuses per event. **The previous events are not varied — they are identical to
-- each other**, and "an exact duplicate of orders from previous events" is meant literally.
--
-- 🔴 READ FROM PRODUCTION, and this is the whole basis of this file. Comparing 2026-09-02 against
-- 2026-09-03 row by row, keyed on display id:
--     customer_name 0 differences · slot 0 · items 0 · total 0 · notes 0 · status 0
-- The same holds for 29, 30, 31 August and 2 September. **Five consecutive events, byte-identical.**
--
-- The seeded rows differ from that reference in three ways:
--   1. STATUS. Written as collected 854 / pending 14 / confirmed 14 / ready 14.
--      The reference is **confirmed 52, ready 6, pending 6 per event — and ZERO collected.**
--      🔴 This is what put "the majority" on the board as completed.
--   2. ITEMS, SLOTS and TOTALS — generated per event, rather than copied.
--   3. `collected_at` and `status_before_collected` set on 854 rows. **The reference has NEITHER on
--      any row.** They were added for realism against a status the reference never uses.
--
-- ⚠️ NOTHING IS "CANCELLED". The word appeared in the report of the problem, so it was checked:
-- **`cancellation_reason` is set on ZERO of the 896 rows and no row has status 'cancelled'.** The
-- only cancelled order on this truck is one row on 2026-08-21, which predates all of this. What is
-- being seen as cancelled is a rendering of some other state, not stored data.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE APPROACH: UPDATE FROM THE REFERENCE DAY, NOT DELETE-AND-REINSERT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Each seeded row is matched to the reference row with the SAME DISPLAY ID and overwritten from it.
--
-- 🔴 WHY UPDATE RATHER THAN DELETE AND RE-SEED. **`order_key` is the uuid `order_payments` joins
-- on.** Deleting and reinserting mints new ones. Nothing should be joined to these rows today — but
-- "should be" is exactly the assumption that cost the last two runs, and an UPDATE does not depend
-- on it being true. It also leaves `truck_events.order_counter` alone, already correct at 64.
--
-- REFERENCE DAY: **2026-09-03**, chosen because it is one of the five clean identical days —
-- 64 rows, all unpaid, no collected rows, no paid_at, no collected_at, placed_at NULL throughout.
-- ⚠️ **2026-09-01 IS NOT USABLE AS THE REFERENCE** — it carries 5 collected and 5 paid orders from
-- real hand-testing. 2026-08-21 through 2026-08-28 are the OLDER generation (they set `placed_at`).
--
-- ⛔ THE REFERENCE DAY IS NEVER WRITTEN TO. Every statement is restricted to 4–17 September, and
-- Guard 4 refuses if the reference date falls inside that window.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THE NEVER-MARK-THESE-PAID RULE IS UNCHANGED AND STILL APPLIES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- These rows stay `payment_status = 'unpaid'`, `paid_at` NULL, `amount_paid` NULL, and this file
-- writes NO `order_payments` rows. Marking one paid writes a `livemode = true` charge row that is
-- indistinguishable from real revenue. There are already 24 such rows on this truck, 19 of them
-- attached to previously seeded orders. **Do not add to it.**
--
-- IDENTIFY:  select * from orders where truck_id = 'test-truck-3-2' and table_ref = 'SEED';
-- DELETE:    see the header of docs/seed-app-tester-sept.sql — check for payment rows FIRST.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  v_truck_id text := 'test-truck-3-2';
  v_ref_date date := date '2026-09-03';
  v_from     date := date '2026-09-04';
  v_to       date := date '2026-09-17';
  v_n        int;
  v_bad      int;
  v_updated  int;
begin
  -- ══ GUARD 1: right truck, by id AND by name ════════════════════════════════════════════════════
  if not exists (select 1 from trucks where id = v_truck_id and name = 'App Tester') then
    raise exception 'REFUSING TO RUN: no truck with id=% and name="App Tester".', v_truck_id;
  end if;

  -- ══ GUARD 2: the reference day must be exactly 64 rows ═════════════════════════════════════════
  select count(*) into v_n
    from orders where truck_id = v_truck_id and event_date = v_ref_date;
  if v_n <> 64 then
    raise exception 'REFUSING TO RUN: reference day % has % rows, expected 64.', v_ref_date, v_n;
  end if;

  -- ══ GUARD 3: the reference day must be CLEAN ═══════════════════════════════════════════════════
  -- 🔴 If the reference has been worked through by hand it carries paid and collected rows, and
  -- copying it would propagate those onto 896 rows. This is the guard that makes the choice of
  -- reference day safe rather than merely stated.
  select count(*) into v_bad
    from orders
   where truck_id = v_truck_id and event_date = v_ref_date
     and (payment_status <> 'unpaid' or paid_at is not null or collected_at is not null
          or status = 'collected' or status = 'cancelled' or placed_at is not null);
  if v_bad > 0 then
    raise exception
      'REFUSING TO RUN: reference day % is not clean — % row(s) are paid, collected, cancelled or have placed_at. Pick another reference day.',
      v_ref_date, v_bad;
  end if;

  -- ══ GUARD 4: the reference day must be OUTSIDE the target window ═══════════════════════════════
  if v_ref_date between v_from and v_to then
    raise exception 'REFUSING TO RUN: reference day % is inside the target window % to %.',
      v_ref_date, v_from, v_to;
  end if;

  -- ══ GUARD 5: only ever touch SEED rows, and only in the window ═════════════════════════════════
  -- Refuses if any row in the window is NOT a seeded row — i.e. if a real order has been placed
  -- there since. This file must never overwrite a real order.
  select count(*) into v_bad
    from orders
   where truck_id = v_truck_id
     and event_date between v_from and v_to
     and (table_ref is distinct from 'SEED');
  if v_bad > 0 then
    raise exception
      'REFUSING TO RUN: % row(s) in % to % are not marked SEED. A real order may have been placed. Inspect before proceeding.',
      v_bad, v_from, v_to;
  end if;

  -- ══ GUARD 6: nothing in the window may already be paid ═════════════════════════════════════════
  -- 🔴 If a seeded row has acquired a payment since the seed ran, STOP. Overwriting it would hide
  -- a live-mode money row behind changed order content.
  select count(*) into v_bad
    from orders o
   where o.truck_id = v_truck_id
     and o.event_date between v_from and v_to
     and (o.payment_status <> 'unpaid' or o.paid_at is not null
          or exists (select 1 from order_payments p where p.order_key = o.order_key));
  if v_bad > 0 then
    raise exception
      'REFUSING TO RUN: % seeded row(s) in the window are paid or carry an order_payments row. STOP and inspect.',
      v_bad;
  end if;

  -- ══ ALIGN ══════════════════════════════════════════════════════════════════════════════════════
  -- Every content field is copied from the reference row with the same display id. The identity
  -- fields — id, truck_id, event_date, event_id, van_id, order_key, table_ref, created_at — are
  -- deliberately NOT touched.
  update orders o
     set customer_name           = r.customer_name,
         customer_email          = r.customer_email,
         customer_phone          = r.customer_phone,
         slot                    = r.slot,
         order_type              = r.order_type,
         items                   = r.items,
         extras                  = r.extras,
         bundle                  = r.bundle,
         deals                   = r.deals,
         discount_code           = r.discount_code,
         subtotal                = r.subtotal,
         discount_amt            = r.discount_amt,
         total                   = r.total,
         total_minor             = r.total_minor,
         deal_savings            = r.deal_savings,
         notes                   = r.notes,
         status                  = r.status,
         -- 🔴 The reference has NEITHER of these on any row. Explicitly cleared, not copied blindly,
         -- because 854 rows currently carry them and a copy of NULL must actually overwrite.
         collected_at            = null,
         status_before_collected = null,
         -- 🔴 Restated rather than assumed. These are the money fields; they stay empty.
         payment_status          = 'unpaid',
         paid_at                 = null,
         amount_paid             = null,
         placed_at               = null,
         cancellation_reason     = null,
         rejection_reason        = null,
         updated_at              = o.created_at
    from orders r
   where r.truck_id   = v_truck_id
     and r.event_date = v_ref_date
     and r.id         = o.id                       -- match on the display number
     and o.truck_id   = v_truck_id
     and o.event_date between v_from and v_to
     and o.table_ref  = 'SEED';                    -- belt and braces: Guard 5 already proved this

  get diagnostics v_updated = row_count;
  if v_updated <> 896 then
    raise exception 'REFUSING TO COMMIT: updated % rows, expected 896. Rolling back.', v_updated;
  end if;

  raise notice 'Aligned % rows across 14 events (% to %) to the reference day %.',
    v_updated, v_from, v_to, v_ref_date;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after committing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 1. 🔴 THE POINT OF THE WHOLE FILE: every one of the 14 days must now be IDENTICAL to the
--    reference, field by field, keyed on display id. Must return ZERO rows.
select o.event_date, o.id,
       o.customer_name is distinct from r.customer_name as name_differs,
       o.slot          is distinct from r.slot           as slot_differs,
       o.items         is distinct from r.items          as items_differ,
       o.total         is distinct from r.total          as total_differs,
       o.notes         is distinct from r.notes          as notes_differ,
       o.status        is distinct from r.status         as status_differs
  from orders o
  join orders r
    on r.truck_id = o.truck_id and r.event_date = date '2026-09-03' and r.id = o.id
 where o.truck_id = 'test-truck-3-2'
   and o.event_date between date '2026-09-04' and date '2026-09-17'
   and (o.customer_name is distinct from r.customer_name
     or o.slot          is distinct from r.slot
     or o.items         is distinct from r.items
     or o.total         is distinct from r.total
     or o.notes         is distinct from r.notes
     or o.status        is distinct from r.status);

-- 2. STATUS MIX PER DAY. Expect 14 rows, each: confirmed 52, ready 6, pending 6, collected 0.
select event_date,
       count(*)                                       as orders,
       count(*) filter (where status = 'confirmed')   as confirmed,
       count(*) filter (where status = 'ready')       as ready,
       count(*) filter (where status = 'pending')     as pending,
       count(*) filter (where status = 'collected')   as collected,
       count(*) filter (where status = 'cancelled')   as cancelled,
       round(sum(total), 2)                           as day_total
  from orders
 where truck_id = 'test-truck-3-2' and table_ref = 'SEED'
   and event_date between date '2026-09-04' and date '2026-09-17'
 group by event_date
 order by event_date;

-- 3. 🔴 NOTHING IS PAID AND NOTHING CARRIES A LIFECYCLE TIMESTAMP. Must return ZERO rows.
select event_date, id, payment_status, paid_at, amount_paid, collected_at, status_before_collected
  from orders
 where truck_id = 'test-truck-3-2' and table_ref = 'SEED'
   and (payment_status <> 'unpaid' or paid_at is not null or coalesce(amount_paid, 0) <> 0
        or collected_at is not null or status_before_collected is not null
        or placed_at is not null);

-- 4. 🔴 NO SEED ORDER HAS A PAYMENT ROW. Must return ZERO rows.
select o.event_date, o.id, p.kind, p.amount_minor, p.livemode
  from orders o
  join order_payments p on p.order_key = o.order_key
 where o.truck_id = 'test-truck-3-2' and o.table_ref = 'SEED';

-- 5. THE REFERENCE DAY IS UNTOUCHED. Expect exactly 64 rows, confirmed 52 / ready 6 / pending 6,
--    zero paid, zero collected — the same as before this file ran.
select count(*)                                     as rows,
       count(*) filter (where status = 'confirmed') as confirmed,
       count(*) filter (where status = 'ready')     as ready,
       count(*) filter (where status = 'pending')   as pending,
       count(*) filter (where payment_status <> 'unpaid') as not_unpaid,
       count(*) filter (where collected_at is not null)   as with_collected_at
  from orders
 where truck_id = 'test-truck-3-2' and event_date = date '2026-09-03';

-- 6. COUNTERS UNCHANGED AT 64 on all fourteen. Expect 14 rows, all 64.
select event_date, order_counter
  from truck_events
 where truck_id = 'test-truck-3-2'
   and event_date between date '2026-09-04' and date '2026-09-17'
 order by event_date;

-- 7. NO OTHER TRUCK AND NO OTHER DATE WAS TOUCHED. Must return ZERO rows.
select truck_id, event_date, count(*)
  from orders
 where table_ref = 'SEED'
   and (truck_id <> 'test-truck-3-2'
     or event_date < date '2026-09-04' or event_date > date '2026-09-17')
 group by truck_id, event_date;
