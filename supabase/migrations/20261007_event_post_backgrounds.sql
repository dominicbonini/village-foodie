-- 20261007_event_post_backgrounds.sql
-- Single-event post, stage 2: a design for ONE event, a picture per place, and a picture per event.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe. The last line reloads PostgREST — do not skip it, or
--    every read below returns PGRST205 and the feature reports no design.
--
-- ── 🔴 ADDITIVE ONLY. `truck_events` IS NOT TOUCHED ───────────────────────────────────────────────
-- A per-event picture is stored in its OWN table keyed by the event, not as a column on `truck_events`.
-- That table is what a live truck trades on; this feature is read-only to it, exactly as places are
-- (docs/schedule-places-report.md §3). The link is `event_post_backgrounds.event_id`, and it cascades,
-- so deleting an event takes its picture row with it and no cleanup is owed anywhere.
--
-- ── 🔴 WHY `kind` BECOMES AN ENUM OF TWO AND NOT A SECOND TABLE ───────────────────────────────────
-- `truck_post_designs` already holds "a background, its size, and where the boxes sit on it", which is
-- exactly what an event design is. Its unique key is `(truck_id, kind)` — written that way in stage 1
-- precisely so this could be added — so the event design is one more row per truck, not a parallel
-- table with the same five columns and a second validator.

set lock_timeout = '3s';

begin;

-- ── truck_post_designs.kind gains 'event' ────────────────────────────────────────────────────────
-- ⚠️ THE CONSTRAINT IS DROPPED AND RECREATED, which is the only way to widen a CHECK. The name is the
-- one Postgres generated in stage 1 (`<table>_<column>_check`); `if exists` makes this a no-op on a
-- database where it was already widened, so re-running cannot fail.
alter table public.truck_post_designs
  drop constraint if exists truck_post_designs_kind_check;

alter table public.truck_post_designs
  add constraint truck_post_designs_kind_check check (kind in ('week', 'event'));

comment on column public.truck_post_designs.kind is
  'Which poster this design is for: ''week'' (the seven-day schedule post) or ''event'' (one event). One row per truck per kind — the unique index (truck_id, kind) is what allows both to exist side by side. The two have DIFFERENT layout shapes, validated separately by validateLayout() and validateEventLayout() in lib/weekly-post/layout.ts.';

-- ── a picture per place ──────────────────────────────────────────────────────────────────────────
-- 🔴 ON `truck_places`, NOT IN A NEW TABLE. A place already is the truck's record of one venue, and a
-- picture of that venue is a property of it. A separate table would need its own RLS, its own cascade
-- and its own join for what is three nullable columns.
-- ⚠️ WIDTH AND HEIGHT ARE STORED, and they are not decoration: they are what proves the picture is the
-- same SHAPE as the default. Without them the only safe behaviour is to ignore the picture, because
-- boxes placed on one shape land somewhere else on another.
alter table public.truck_places
  add column if not exists event_bg_path text,
  add column if not exists event_bg_width int,
  add column if not exists event_bg_height int;

comment on column public.truck_places.event_bg_path is
  'Optional background for single-event posts at this place — an object path in the PRIVATE post-designs bucket. Used only when its aspect ratio matches the truck''s default event background within 1% (checkAspect in lib/weekly-post/backgrounds.ts); kept but unused when it does not, so replacing a default never destroys per-place artwork.';

-- ── a picture for one event ──────────────────────────────────────────────────────────────────────
create table if not exists public.event_post_backgrounds (
  -- 🔴 THE EVENT IS THE PRIMARY KEY. One picture per event, enforced by the shape of the table rather
  -- than by a unique index that a second insert path could forget.
  event_id uuid primary key references public.truck_events(id) on delete cascade,

  -- 🔴 TEXT, NOT uuid. `trucks.id` is a slug like 'pizzeria-gusto'; uuid fails the migration outright.
  -- Carried here as well as on the event so every read and write is scoped by a column comparison
  -- rather than a join — the same reason truck_place_groups carried it in stage 1.
  truck_id text not null references public.trucks(id) on delete cascade,

  path text not null,
  width int,
  height int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_post_backgrounds_path_not_blank check (length(btrim(path)) > 0)
);

create index if not exists event_post_backgrounds_truck_idx
  on public.event_post_backgrounds (truck_id);

-- ── RLS + GRANTS — SERVICE ROLE ONLY ─────────────────────────────────────────────────────────────
-- 🔴 THE SAME THREE DEFENCES AS truck_post_designs, and the third is the one that does the work:
-- enabling RLS alone leaves Supabase's default grants in place, so the capability is still reachable
-- with the anon key and merely default-denied. The REVOKE removes it.
alter table public.event_post_backgrounds enable row level security;
drop policy if exists "service_role only" on public.event_post_backgrounds;
create policy "service_role only" on public.event_post_backgrounds
  for all to service_role using (true) with check (true);
revoke all on public.event_post_backgrounds from anon, authenticated, public;

comment on table public.event_post_backgrounds is
  'A background picture uploaded for ONE event''s post. Beats the place picture and the truck default (resolveBackground in lib/weekly-post/backgrounds.ts). Images live in the PRIVATE post-designs bucket and reach the browser only as short-lived signed URLs. Additive: truck_events is not modified by this feature and is read-only to it.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the new table and columns read as absent, the
--    widened CHECK is not seen, and saving an event design fails with a constraint violation on
--    correct code.
notify pgrst, 'reload schema';
