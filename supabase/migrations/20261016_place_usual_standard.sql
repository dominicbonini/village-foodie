-- 20261016_place_usual_standard.sql
-- "Pinned to Standard" becomes a real state: one boolean on truck_places.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. §1 is idempotent and additive only. The last line reloads PostgREST.
--
-- ⛔ IT CHANGES NO EXISTING ROW. One column with a NOT NULL DEFAULT false, which is the state every
--    place is already in — "not pinned to Standard". No backfill, no update, no insert. §0 proves
--    that before anything is altered and §2 proves it afterwards.
--
-- ── 🔴 WHY A BOOLEAN AND NOT A SENTINEL IN THE EXISTING COLUMN ────────────────────────────────────
-- 20261015 added `truck_places.usual_event_type_id`, where NULL means "Automatic" — the existing rule
-- that the newest event at this place supplies the type. The Places tab's control offered a third
-- choice, "Standard", and it had nowhere to put it: Standard IS the absence of a type, so saving it
-- wrote NULL, which the next read showed back as **Automatic**. The operator pinned Standard, the
-- control snapped to Automatic, and nothing said why.
--
-- 🔴 THE TWO STATES ARE GENUINELY DIFFERENT AND BOTH ARE WANTED:
--   • AUTOMATIC — "work it out from what I did here last time". The answer CHANGES as the truck
--     trades; today it may resolve to Standard and next month to Private.
--   • STANDARD  — "always plain Standard here, whatever I did last time". A fixed answer.
-- One nullable uuid cannot hold both, because the uuid for Standard does not exist: `event_types`
-- has no Standard row — Standard is the truck's own settings, which is the whole design (§70.2).
--
-- ⛔ A MAGIC UUID WAS THE OTHER OPTION AND IT WAS REFUSED. A reserved id like
-- '00000000-0000-0000-0000-000000000000' would be a value the FK must not check, which means dropping
-- the FK, which means the column stops being a reference to anything.
--
-- 🔴 THE RESOLUTION ORDER, AND THE ROUTES ENFORCE IT (app/api/event-types/route.ts `usual_for_venue`
-- and app/api/manage/route.ts `sg_places`):
--     usual_type_is_standard ? Standard : (usual_event_type_id ?? the automatic rule)
-- ⚠️ THE BOOLEAN WINS OVER THE ID, and the write path is what keeps them from disagreeing: picking
-- Standard sets the boolean and clears the id; picking a type sets the id and clears the boolean;
-- picking Automatic clears both. The order above is the belt to that braces.
--
-- ── ⛔ NO UPSERT TARGETS A PARTIAL INDEX. ─────────────────────────────────────────────────────────
-- This migration creates one partial index and nothing upserts onto it; `scripts/event-pricing.cjs`
-- §7b still guards every `onConflict:` in app/ and lib/ against the 42P10 that 20261013 fixed.

set lock_timeout = '3s';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 0 · 🔴 READ-ONLY PREVIEW — RUN THIS ALONE, FIRST. It writes nothing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Expect:
--   • 'truck_places exists'                        — t.
--   • '20261015 is applied (usual_event_type_id)'   — t. ⛔ IF THIS IS f, STOP and run 20261015 first:
--        the resolution order below reads BOTH columns, and the route's probe would report the pin
--        as unavailable for every place.
--   • 'column usual_type_is_standard already exists' — f, or t if you are re-running.
--   • 'places total'                                — however many places exist; none of them change.
--   • 'places with a pinned type'                   — the pins already set. Untouched by this.
select 'truck_places exists' as what, exists (
  select 1 from information_schema.tables
   where table_schema = 'public' and table_name = 'truck_places') as ok
union all
select '20261015 is applied (truck_places.usual_event_type_id)', exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'truck_places'
     and column_name = 'usual_event_type_id')
union all
select 'column truck_places.usual_type_is_standard already exists', exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'truck_places'
     and column_name = 'usual_type_is_standard');

select 'places total' as what, count(*)::text as n from public.truck_places
union all
select 'places with a pinned type (unchanged by this)', count(*)::text
  from public.truck_places where usual_event_type_id is not null
union all
select 'places on Automatic today (pin NULL)', count(*)::text
  from public.truck_places where usual_event_type_id is null
union all
select 'places that are hidden (unchanged by this)', count(*)::text
  from public.truck_places where is_hidden
union all
select 'places that are merged away (unchanged by this)', count(*)::text
  from public.truck_places where merged_into_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE CHANGE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── 1.1 · truck_places.usual_type_is_standard ────────────────────────────────────────────────────
--
-- 🔴 NOT NULL DEFAULT false, AND THAT IS WHY NOTHING MOVES. `false` is exactly the state every
-- existing row is in: not pinned to Standard. A nullable column would have introduced a third,
-- meaningless value ("unknown whether this place is pinned to Standard") that every reader would
-- then have to decide what to do with.
--
-- ⚠️ IT IS NOT A CHECK CONSTRAINT AGAINST `usual_event_type_id`, deliberately. The pair
-- (true, <some uuid>) is nonsense, and a check could forbid it — but a check that fires mid-update
-- would turn "switch this place from Private to Standard" into a failed save unless both columns were
-- always written in one statement. They ARE always written in one statement by the route, and the
-- read order (`is_standard` first) makes the nonsense pair harmless if one ever is not. A refusal the
-- operator meets is worse than a value the reader already handles.
alter table public.truck_places
  add column if not exists usual_type_is_standard boolean not null default false;

-- 🔴 PARTIAL, ON THE TRUE ROWS ONLY. The column is `false` for almost every row, so an index over the
-- whole table would be a scan with extra steps. ⚠️ IT IS AN INDEX, NEVER AN `ON CONFLICT` TARGET —
-- partial is safe here for the same reason 20261015's pin index is (see 20261013 for the 42P10 that
-- rule exists to prevent).
create index if not exists truck_places_usual_standard_idx
  on public.truck_places (truck_id)
  where usual_type_is_standard;

comment on column public.truck_places.usual_type_is_standard is
  'TRUE means this place is pinned to STANDARD — "always plain Standard here", a FIXED answer. It is distinct from Automatic (usual_event_type_id IS NULL), which means "work it out from the newest event here" and whose answer CHANGES as the truck trades. A boolean rather than a sentinel because Standard has no event_types row at all — Standard is the truck''s own settings (§70.2). Resolution order, enforced by app/api/event-types/route.ts and app/api/manage/route.ts: usual_type_is_standard ? Standard : (usual_event_type_id ?? the automatic rule). The write path keeps the two columns in step: Standard sets this and clears the id, a type sets the id and clears this, Automatic clears both. Added 20261016.';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · READ-ONLY VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Expect: boolean, NOT NULL, default false.
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'truck_places'
   and column_name in ('usual_event_type_id', 'usual_type_is_standard')
 order by ordinal_position;

-- The index. Expect truck_places_usual_standard_idx with `WHERE usual_type_is_standard`.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('truck_places_usual_standard_idx', 'truck_places_usual_event_type_idx')
 order by indexname;

-- ⛔ AND THE PROOF THAT NOTHING MOVED.
select 'places pinned to Standard (expect 0 — nothing is backfilled)' as what, count(*)::text as n
  from public.truck_places where usual_type_is_standard
union all
select 'places with a pinned type (expect the SAME number as in §0)', count(*)::text
  from public.truck_places where usual_event_type_id is not null
union all
select 'the nonsense pair (expect 0 — both set at once)', count(*)::text
  from public.truck_places where usual_type_is_standard and usual_event_type_id is not null
union all
select 'places total (unchanged)', count(*)::text from public.truck_places;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA and every select naming the new column answers
-- PGRST204 — which the Places tab reads as "the migration is not applied" and shows the control
-- without its Standard option.
notify pgrst, 'reload schema';
