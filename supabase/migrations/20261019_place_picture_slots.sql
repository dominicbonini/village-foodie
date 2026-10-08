-- 20261019_place_picture_slots.sql
-- Social media: a location has at most TWO images, each with one clear job.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent (`if not exists` / `if exists` throughout), so re-running is safe. The last
--    line reloads PostgREST — do not skip it, or every read below returns PGRST205 and the Locations
--    screen reports no images for a truck that has some.
--
-- ⛔ NOTHING IS DROPPED, NOTHING IS DELETED, NOTHING IS EMPTIED. Two nullable columns and two indexes.
--    `public.place_pictures` keeps every row; no stored object is touched by anything in this file.
--
-- ── 🔴 WHY TWO COLUMNS ON `truck_places`, AND NOT A JUNCTION TABLE OR A `slot` COLUMN ──────────────
-- The brief suggested two nullable references and asked for the cleanest with a reason. It is the two
-- references, for four reasons, in order of weight:
--
--   1. ⛔ ONE IMAGE MUST BE ABLE TO FILL BOTH SLOTS, AND `place_pictures_path_uidx` IS A **FULL**
--      UNIQUE INDEX ON `path`. A `slot` column on `place_pictures` would need the SAME object stored
--      twice to appear in both slots — which that index forbids outright. Two references point at one
--      row twice and the question never arises.
--   2. 🔴 "WHICH IMAGE IS IN WHICH SLOT" BECOMES A PROPERTY OF THE PLACE, WHICH IS WHAT IT IS. Every
--      screen reads "this location and its two images"; with a junction table that is a join, and with
--      a `slot` column it is a filtered scan plus a tie-break for the day two rows claim one slot.
--      Two columns cannot have that ambiguity: a slot holds exactly one id or null.
--   3. ⚠️ `ON DELETE SET NULL` GIVES "REMOVE" FOR FREE AND CANNOT ORPHAN A SCREEN. A picture row that
--      ever does go away clears the slot rather than leaving a dangling id the reader must defend
--      against.
--   4. ⚠️ IT LEAVES THE LIBRARY MODEL INTACT UNDERNEATH. `place_pictures` is still "every image this
--      truck uploaded for this place"; the slots are a view onto two of them. Nothing has to be
--      migrated, and an image that stops being shown stays stored, which rule 6 of the brief requires.
--
-- ⚠️ THE OBVIOUS ALTERNATIVE AND WHY IT LOSES: `place_pictures.slot text check (slot in ('event',
--    'weekly'))` plus a partial unique index per (place_id, slot). It reads well and it is one table —
--    but it fails (1) outright, and it makes "use this image in both slots" a copy rather than a
--    reference, which is exactly the duplication the path index exists to prevent.
--
-- ── ⚠️ WHAT IS **NOT** TOUCHED ────────────────────────────────────────────────────────────────────
-- `is_main`, `label` and `sort_order` on `place_pictures` are LEFT IN PLACE and left populated. The
-- screens stop reading them — there is no Main, no rename and no grid any more — but dropping a column
-- is irreversible and they cost nothing. ⚠️ `place_pictures_one_main_per_place_uidx` also stays: it
-- guards a column nothing writes now, which is harmless, and removing it would be a second change with
-- no benefit.
--
-- `truck_places.event_bg_path` / `event_bg_width` / `event_bg_height` / `event_layout` are UNCHANGED
-- and still work exactly as today: a location with a legacy background and an EMPTY event slot uses it
-- as its event poster, mapped on read. ⛔ NO DATA IS COPIED OR MOVED by this migration — there is no
-- `insert` and no `update` anywhere in it.
--
-- `truck_events`, `venues` and every ordering, KDS and payments table are untouched and unnamed.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE TWO SLOTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 🔴 THE LOCATION'S **EVENT** IMAGE. What a single event post at this location uses — either in the
-- design's photo box, or as the whole poster. Which of the two is decided by the DESIGN, not here:
-- see `placePicture.enabled` in lib/weekly-post/layout.ts. The slot does not know, and must not.
alter table public.truck_places
  add column if not exists event_picture_id uuid
  references public.place_pictures(id) on delete set null;

-- 🔴 THE LOCATION'S **WEEKLY** IMAGE. What sits beside this location's row on the weekly post.
-- ⚠️ IT MAY BE THE SAME ROW AS `event_picture_id`. That is the whole reason this is a reference and
-- not a copy — see reason 1 in the header.
alter table public.truck_places
  add column if not exists weekly_picture_id uuid
  references public.place_pictures(id) on delete set null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · INDEXES — FOR THE JOIN, NOT FOR UNIQUENESS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NEITHER IS UNIQUE, AND NEITHER SHOULD BE. Two different locations may legitimately point at the
-- same picture row, and one location points at one row from both columns. A unique index here would
-- forbid both.
-- 🔴 THEY EXIST FOR THE **REVERSE** LOOKUP. `on delete set null` makes Postgres find every referencing
-- row when a picture is deleted; without an index on the referencing column that is a sequential scan
-- of `truck_places` per delete. Small today, and free to get right now.
create index if not exists truck_places_event_picture_idx
  on public.truck_places (event_picture_id) where event_picture_id is not null;

create index if not exists truck_places_weekly_picture_idx
  on public.truck_places (weekly_picture_id) where weekly_picture_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · COMMENTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
comment on column public.truck_places.event_picture_id is
  'The image a SINGLE EVENT post at this location uses. Null => this location has no event image, and the post falls back to the legacy event_bg_path if set, then to the standard design. 🔴 WHETHER IT IS DRAWN IN A BOX OR AS THE WHOLE POSTER IS THE DESIGN''S DECISION (placePicture.enabled on the single event layout), never this column''s. References place_pictures(id); ON DELETE SET NULL. May be the same row as weekly_picture_id.';

comment on column public.truck_places.weekly_picture_id is
  'The image shown beside this location''s row on the WEEKLY post. Null => that row shows whatever the weekly design''s "if a location has no image" setting says. References place_pictures(id); ON DELETE SET NULL. May be the same row as event_picture_id.';

comment on table public.place_pictures is
  'Every image a truck has uploaded for a place. 🔴 AS OF 20261019 IT IS NO LONGER BROWSED AS A LIBRARY: the screens read the two SLOTS on truck_places (event_picture_id, weekly_picture_id) and this table is the store behind them. An image that is replaced or removed from a slot STAYS HERE, unreferenced and undeleted, with its file. ⚠️ is_main, label and sort_order are legacy and are no longer read by anything a truck sees; they are left populated rather than dropped. Files live in the PRIVATE post-designs bucket and reach the browser only as short-lived signed URLs. A PRIVATE event never gets a location image. Service-role only.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the two new columns read as absent, every
--    truck_places row fails to parse, and the Locations screen shows no images for a truck that has
--    some.
notify pgrst, 'reload schema';
