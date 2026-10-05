-- 20261013_event_item_prices_unique.sql
-- FIXES: "there is no unique or exclusion constraint matching the ON CONFLICT specification" (42P10)
-- when a typed per-item price is saved on the Event types grid.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. §1 is idempotent. The last line reloads PostgREST.
--
-- ── 🔴 THE CAUSE, REPRODUCED ──────────────────────────────────────────────────────────────────────
-- 20261011 created the uniqueness as two PARTIAL indexes:
--     event_item_prices_type_item_uidx  UNIQUE (event_type_id, item_id) WHERE event_type_id IS NOT NULL
--     event_item_prices_event_item_uidx UNIQUE (event_id, item_id)      WHERE event_id      IS NOT NULL
-- PostgREST's `on_conflict=` becomes Postgres' `ON CONFLICT (cols)`, and **conflict inference cannot
-- target a partial index** — it needs a non-partial unique index or constraint on exactly those
-- columns. So `app/api/event-types/route.ts` `set_type_item_price` failed at PLANNING time, 42P10,
-- before anything was written.
--
-- Measured, with both ids set to an all-zero uuid so no row could be created either way:
--     upsert, onConflict 'event_type_id,item_id'  →  42P10  (no matching constraint)
--     the same row, plain insert, no onConflict   →  23503  (FK violation)
-- The plain insert reached CONSTRAINT CHECKING, which is what proves 42P10 is a planning failure
-- specific to the conflict target rather than anything about the row.
--
-- ── 🔴 WHY PLAIN UNIQUE CONSTRAINTS ARE CORRECT HERE, AND WHY 20261011'S REASONING WAS WRONG ──────
-- 20261011 (and §70 of the manual) argued that plain uniqueness would not hold "because in Postgres
-- NULLs are DISTINCT, so (null, item) could be inserted twice". That is true of NULLs in general and
-- **false for this table**, which is Dominic's correction and it is right:
--
--   • A TYPE row always has `event_type_id` set, so `UNIQUE (event_type_id, item_id)` is fully
--     enforced for every type row. There is no NULL in the first column to be distinct from anything.
--   • An EVENT row always has `event_id` set, so `UNIQUE (event_id, item_id)` is fully enforced for
--     every event row, by the same argument.
--   • `event_item_prices_one_owner` CHECK ((event_type_id is not null) <> (event_id is not null))
--     guarantees exactly one of them is set, so **every row falls under one of the two constraints**.
--
-- The NULLs-are-distinct concern would matter only for a row with BOTH owners null — which the CHECK
-- makes impossible. So the partial predicates were buying nothing, and they cost the upsert.
--
-- ⚠️ A CONSTRAINT, NOT AN INDEX, AND THAT IS DELIBERATE. `ADD CONSTRAINT … UNIQUE` creates the index
-- AND a pg_constraint row, so the conflict target can be inferred by columns (what the code does) or
-- named with `ON CONFLICT ON CONSTRAINT` later if anything ever needs to. A bare `CREATE UNIQUE INDEX`
-- would also satisfy inference, but it leaves no constraint to name.

set lock_timeout = '3s';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 0 · 🔴 READ-ONLY PREVIEW — RUN THIS ALONE, FIRST. It writes nothing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- The new constraints are unique over the SAME columns the partial indexes covered, so they can only
-- fail to be created if a duplicate already exists. Expect BOTH counts to be 0 — and expect the whole
-- thing to be trivially 0 today, because `event_item_prices` is empty (nothing could ever be written
-- into it: the one upsert that writes type rows has been failing with 42P10 since 20261011).
--
-- ⚠️ IF EITHER COUNT IS NOT 0, STOP. §1 would fail on the duplicate, and the right move is to look at
-- the rows rather than to delete anything from here.
select 'duplicate (event_type_id, item_id) pairs' as what, count(*)::text as n
  from (select event_type_id, item_id
          from public.event_item_prices
         where event_type_id is not null
         group by event_type_id, item_id
        having count(*) > 1) d
union all
select 'duplicate (event_id, item_id) pairs', count(*)::text
  from (select event_id, item_id
          from public.event_item_prices
         where event_id is not null
         group by event_id, item_id
        having count(*) > 1) d2
union all
select 'rows in event_item_prices (expect 0 — the upsert has never succeeded)',
       count(*)::text from public.event_item_prices
union all
-- The CHECK is what makes plain uniqueness total. Expect 0 rows breaking it; if this is not 0 the
-- reasoning above does not hold and §1 must not be run.
select 'rows with NEITHER or BOTH owners set (expect 0 — the CHECK forbids it)',
       count(*)::text from public.event_item_prices
 where (event_type_id is null) = (event_id is null);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE CHANGE — PARTIAL INDEXES OUT, PLAIN UNIQUE CONSTRAINTS IN
-- ════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ⚠️ THE CONSTRAINTS ARE ADDED **BEFORE** THE INDEXES ARE DROPPED, so the table is never without
-- uniqueness for an instant. Both statements are inside one transaction, so this is belt-and-braces
-- rather than load-bearing — but the order costs nothing and the reverse would be careless.
alter table public.event_item_prices
  drop constraint if exists event_item_prices_type_item_key;
alter table public.event_item_prices
  add constraint event_item_prices_type_item_key unique (event_type_id, item_id);

alter table public.event_item_prices
  drop constraint if exists event_item_prices_event_item_key;
alter table public.event_item_prices
  add constraint event_item_prices_event_item_key unique (event_id, item_id);

-- 🔴 NOW the partial indexes go. They enforced the same thing for the same rows, so nothing is lost;
-- what they could not do is serve as an ON CONFLICT target.
drop index if exists public.event_item_prices_type_item_uidx;
drop index if exists public.event_item_prices_event_item_uidx;

comment on constraint event_item_prices_type_item_key on public.event_item_prices is
  'One typed price per (event type, item). PLAIN, not partial: PostgREST''s on_conflict= cannot target a partial index (42P10), and a partial predicate buys nothing here because a TYPE row always has event_type_id set and the event_item_prices_one_owner CHECK guarantees exactly one owner — so every row falls under this constraint or the event one. Replaced event_item_prices_type_item_uidx in 20261013. app/api/event-types/route.ts set_type_item_price infers this by columns: onConflict ''event_type_id,item_id''.';
comment on constraint event_item_prices_event_item_key on public.event_item_prices is
  'One typed price per (event, item). PLAIN, not partial, for the reason given on event_item_prices_type_item_key. Replaced event_item_prices_event_item_uidx in 20261013. ⚠️ No code upserts onto this one today — the dashboard sheet replaces an event''s whole set with DELETE + INSERT, which needs no conflict target — but it is made plain so the two halves of the table have the same shape and a future upsert cannot hit the same 42P10.';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · READ-ONLY VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Expect exactly TWO rows, both with `UNIQUE (…)` and NO `WHERE` clause, named *_key; and NO row for
-- either *_uidx name. `indexdef` showing a WHERE means a partial index survived and the upsert will
-- still fail.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'event_item_prices'
 order by indexname;

-- And the constraints themselves, so the ON CONFLICT target is provably nameable. Expect the two
-- UNIQUE constraints plus the one_owner CHECK and the FKs.
select conname, contype, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.event_item_prices'::regclass
 order by contype, conname;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA and may go on planning against the old indexes.
notify pgrst, 'reload schema';
