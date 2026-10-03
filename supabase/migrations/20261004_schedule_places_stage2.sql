-- 20261004_schedule_places_stage2.sql
-- Schedule › Places, stage 2: favourites, hiding, merging, an Area, and the event→place link.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. ⚠️ RUN 20261003_truck_places.sql FIRST — this migration alters the tables that one
--    creates, so on a database without it the first `alter table` fails and nothing below runs.
--    Re-running THIS file is safe: every statement is idempotent, including the rename (guarded) and
--    the check constraint (dropped before being added).
--
-- ⚠️ THE FILENAME IS DATED 4 OCTOBER AND THE WORK IS FROM THE 3rd. Deliberate: migrations are applied
--    in filename order, and `20261003_schedule_…` would sort BEFORE `20261003_truck_places.sql` — it
--    would try to alter tables that did not exist yet. The date here is the ORDER, not the authorship.
--
-- ── 🔴 THE ONE RULE THIS FILE IS WRITTEN AROUND ───────────────────────────────────────────────────
-- `truck_events` IS THE TABLE LIVE ORDERING READS. The only change to it here is ONE NULLABLE COLUMN
-- WITH NO DEFAULT AND NO BACKFILL, plus an index. No existing row is read, rewritten or touched by
-- this migration or by any code in this build:
--   • nullable + no default ⇒ adding it rewrites no rows and changes no existing behaviour;
--   • `on delete set null` ⇒ deleting a place can never delete an event. An event is a trading
--     record; a place is a label for one. Cascade here would mean a mis-tap on "Hide"… and then a
--     later cleanup losing a day's trading history.
--   • the index is on the new column only, so it cannot affect any existing query plan.

set lock_timeout = '3s';

begin;

-- ── 1 · FACEBOOK GROUPS GO, COMPLETELY ────────────────────────────────────────────────────────────
-- 🔴 DROPPED, NOT DEPRECATED. The groups card and the per-place wording card are removed from the
-- product in this build, so the table and the column that fed them have no reader left. Leaving them
-- would leave two empty shapes that the next person has to work out the status of.
-- ⚠️ `drop table` TAKES ITS ROWS WITH IT. On a database where Places was opened and groups were
-- entered, those rows go. That is the instruction and it is the right one — the feature they belong
-- to no longer exists — but it is not reversible, so it is said plainly here rather than implied.
drop table if exists public.truck_place_groups;

alter table public.truck_places
  drop column if exists group_post_wording;

-- ── 2 · WHAT A PLACE CAN NOW BE ───────────────────────────────────────────────────────────────────
alter table public.truck_places
  -- The village, town or city. Seeded from `truck_events.town`, which is the column the Add event
  -- form's "Area" field already writes — so this is the same fact under the same name.
  add column if not exists area text,
  -- Starred in the list, and offered first in the Add event picker. 🔴 NOT NULL DEFAULT false: a
  -- three-state favourite ("not starred" vs "never considered") is a distinction with no meaning here.
  add column if not exists is_favourite boolean not null default false,
  -- Hidden from the list unless "Show hidden places" is on. ⚠️ A HIDDEN PLACE IS NOT DELETED and
  -- nothing stops it matching events — hiding is a display decision, and a place that still has
  -- trading history must keep answering for it.
  add column if not exists is_hidden boolean not null default false,
  -- 🔴 "THIS PLACE IS REALLY THAT PLACE." Set when the operator merges A into B; A's events then
  -- resolve to B through `placeForEvent`. `on delete set null` so deleting B un-merges A rather than
  -- stranding it pointing at nothing.
  -- ⚠️ A CHAIN IS POSSIBLE (A→B, then B→C) and is resolved by following the pointer, with a depth cap.
  -- The database cannot forbid a cycle across rows, so the cap lives in one function — see
  -- `resolvePlaceMerge` in lib/schedule-graphics/places.ts.
  add column if not exists merged_into_id uuid references public.truck_places(id) on delete set null;

-- 🔴 A PLACE CANNOT BE MERGED INTO ITSELF. The one cycle Postgres CAN forbid, so it does: a self-merge
-- would make `placeForEvent` loop on its first step, and it is also exactly what a double-tap on the
-- merge control looks like. Dropped first so re-running the file is safe (`add constraint` has no
-- `if not exists`).
alter table public.truck_places drop constraint if exists truck_places_no_self_merge;
alter table public.truck_places add constraint truck_places_no_self_merge
  check (merged_into_id is null or merged_into_id <> id);

create index if not exists truck_places_truck_visible_idx
  on public.truck_places (truck_id, is_favourite desc, name)
  where is_hidden = false and merged_into_id is null;

comment on column public.truck_places.merged_into_id is
  'Set when this place has been merged into another: its events resolve to the target instead. Hiding is set alongside it, so a merged place leaves the list. Chains are followed by resolvePlaceMerge() in lib/schedule-graphics/places.ts with a depth cap of 10; self-merge is refused by truck_places_no_self_merge. NULL = not merged.';

comment on column public.truck_places.is_hidden is
  'Hidden from the Places list unless "Show hidden places" is on. A display decision only — a hidden place still matches its events and still counts towards Next/Last. Set to true automatically when a place is merged.';

-- ── 3 · THE TRUCK-LEVEL WORDING IS RENAMED ────────────────────────────────────────────────────────
-- It was `default_group_post_wording` — the default for a FACEBOOK GROUP post, which no longer
-- exists. It becomes the template for the per-event post text in a later stage.
-- 🔴 NOTHING READS IT IN THIS BUILD, DELIBERATELY. There is no UI for it in this prompt, and the
-- helper that used to resolve it is removed rather than left unused — see the report.
-- ⚠️ A RENAME IS NOT IDEMPOTENT, so it is guarded both ways: it runs only when the old name is
-- present and the new one is not. The `add column if not exists` after it covers the database where
-- stage 1's column was never applied, so this file leaves the same end state either way.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trucks'
       and column_name = 'default_group_post_wording'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trucks'
       and column_name = 'event_post_wording'
  ) then
    alter table public.trucks rename column default_group_post_wording to event_post_wording;
  end if;
end $$;

alter table public.trucks
  add column if not exists event_post_wording text;

comment on column public.trucks.event_post_wording is
  'Template for the per-event post text, with the tokens {place} {day} {date} {times} {order link}. Renamed from default_group_post_wording on 3 October 2026 when Facebook groups were removed. NULL = not set. NOTHING READS IT YET — the per-event post UI is a later stage.';

-- ── 4 · THE EVENT → PLACE LINK ────────────────────────────────────────────────────────────────────
-- 🔴 ONE NULLABLE COLUMN ON THE TABLE LIVE ORDERING USES. See the note at the top of this file.
-- It is written ONLY on INSERT, by the Add event modal. The scraper, the upload-schedule flow, every
-- edit path and every status change leave it exactly as it is — asserted from source by
-- scripts/schedule-graphics-places.cjs, which lists each path it checked.
-- ⚠️ NULL IS THE NORMAL STATE for every event that exists today and for every scraped event. Matching
-- falls through to the venue anchor and then to the normalised name, which is how stage 1 worked and
-- still works. This column makes a link EXACT when the operator chose the place themselves; it is not
-- a requirement for matching.
alter table public.truck_events
  add column if not exists truck_place_id uuid references public.truck_places(id) on delete set null;

create index if not exists truck_events_truck_place_idx
  on public.truck_events (truck_place_id);

comment on column public.truck_events.truck_place_id is
  'The truck_places row the operator picked in Add event. Written ONLY on insert by that modal; never written by the scraper, the upload-schedule flow, or any edit/status path. NULL on every scraped event and every event created before 3 October 2026, which is normal — matching then falls back to venue_id and then to the normalised venue_name. on delete set null: deleting a place must never delete a trading record.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the new columns read as absent, the places read
--    fails, and the Add event insert drops `truck_place_id` silently.
notify pgrst, 'reload schema';
