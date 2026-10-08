-- 20261021_weekly_only_picture.sql
-- One location picture used everywhere, and an OPTIONAL override for weekly posts only.
--
-- ⛔ NOT APPLIED BY ANYTHING IN THIS REPOSITORY. Dominic runs it by hand. Idempotent (`if not exists`
--    and a guarded constraint), so re-running is safe. The last line reloads PostgREST — do not skip
--    it, or the new column reads as absent and every `truck_places` row fails to parse.
--
-- ⛔ NOTHING IS DROPPED, NOTHING IS DELETED, NOTHING IS EMPTIED. One nullable column and one index.
--    No `insert`, no `update`, no `delete` anywhere in this file.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THE MODEL GOT SIMPLER, WHICH IS WHY THIS COLUMN EXISTS
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 20261020 gave a location ONE picture plus a `picture_use` choice — weekly / single event / both —
-- and the truck had to answer it before the picture did anything. ⛔ THAT IS A QUESTION MOST TRUCKS
-- HAVE NO OPINION ABOUT: a pub's logo is the pub's logo, and it belongs wherever a design has room for
-- one. The choice was a required step between uploading a picture and seeing it used.
--
-- 🔴 SO THE DEFAULT IS NOW "EVERYWHERE", AND THE EXCEPTION IS OPT-IN:
--
--   `weekly_picture_id`       ⇒ the LOCATION PICTURE. Used wherever a design has a picture space —
--                               the weekly post's per-row space AND the single event design's photo
--                               space — whenever that design's Location picture switch is on.
--   `weekly_only_picture_id`  ⇒ an OPTIONAL override. When set, WEEKLY posts use this one instead.
--                               Single event posts never look at it.
--   `picture_use`             ⇒ ⛔ NO LONGER READ OR WRITTEN BY ANY CODE. Left in place, populated,
--                               because dropping a column is irreversible and the rules forbid it.
--
-- ⚠️ THE NAME `weekly_picture_id` IS NOW TWO MODELS BEHIND ITS MEANING, and that is the third time
--    this has been said in three migrations. It was "the weekly picture", then "the location picture",
--    and it is still "the location picture" — what changed around it is that it is no longer confined
--    to the weekly post. ⛔ RENAMING IT WOULD BE A DROP-AND-ADD as far as every cached PostgREST
--    schema, every select string and every harness assertion is concerned. The column comments below
--    are the record, and lib/weekly-post/place-pictures.ts carries the same note where it is read.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 WHY A SECOND REFERENCE AND NOT A FLAG, OR A `scope` COLUMN ON THE PICTURE
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
--   1. ⛔ THE OVERRIDE IS A **DIFFERENT PICTURE**, NOT A DIFFERENT SETTING. "Use a different picture on
--      weekly posts" means there are two files; no flag on one row can hold two.
--   2. 🔴 IT IS DEFINED EXACTLY LIKE `weekly_picture_id` — same type, same foreign key, same
--      `ON DELETE SET NULL` — which is the brief's instruction and the right one: a reader that
--      handles one must handle the other without a second rule.
--   3. ⚠️ `ON DELETE SET NULL` MEANS A DELETED PICTURE FALLS BACK rather than dangling. A location
--      whose weekly-only picture goes away quietly returns to its location picture, which is the
--      behaviour an operator would expect and the one that needs no screen to explain it.
--   4. ⛔ ONE IMAGE MAY FILL BOTH COLUMNS, as it may fill the poster and the picture:
--      `place_pictures_path_uidx` is a FULL unique index on `path`, so the same object cannot be
--      stored twice. References point at one row twice and the question never arises.
--
-- ⚠️ AND THE RESOLUTION IS **COALESCE**, NOT A MODE. `weekly_only_picture_id` when set, else
--    `weekly_picture_id` — so "remove the weekly one" is a `null` and the location goes back to one
--    picture with nothing else to undo. A mode column would have left a third state meaning "I chose
--    to have a weekly override and then emptied it", which no screen can produce.
--
-- ── ⚠️ WHAT IS **NOT** TOUCHED ────────────────────────────────────────────────────────────────────
-- `place_pictures` is untouched — not a column, not a row, not a stored object.
-- `truck_places.event_picture_id` (the EVENT POSTER), `social_tag`, `short_name`, `event_bg_*` and
-- `event_layout` are all unchanged. `truck_post_designs` is not named at all.
-- `truck_events`, `venues` and every ordering, KDS and payments table are untouched and unnamed.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE WEEKLY-ONLY OVERRIDE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 DEFINED EXACTLY LIKE `weekly_picture_id`: uuid, nullable, referencing `place_pictures(id)` with
-- `ON DELETE SET NULL`. ⛔ NOT `CASCADE` — deleting a picture must never delete a LOCATION.
alter table public.truck_places
  add column if not exists weekly_only_picture_id uuid;

-- ⚠️ THE FOREIGN KEY IS ADDED SEPARATELY AND GUARDED, because `add constraint` has no `if not exists`
-- form in Postgres and a re-run would otherwise fail on "constraint already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'truck_places_weekly_only_picture_id_fkey'
      and conrelid = 'public.truck_places'::regclass
  ) then
    alter table public.truck_places
      add constraint truck_places_weekly_only_picture_id_fkey
      foreign key (weekly_only_picture_id)
      references public.place_pictures(id) on delete set null;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · THE INDEX — FOR THE REVERSE LOOKUP, NOT FOR UNIQUENESS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NOT UNIQUE, AND IT MUST NOT BE. Two locations may legitimately point at the same picture row, and
-- one location may point at one row from this column and from `weekly_picture_id` both.
-- 🔴 IT EXISTS FOR `ON DELETE SET NULL`: Postgres has to find every referencing row when a picture is
-- deleted, and without an index on the referencing column that is a sequential scan per delete. The
-- same reasoning as the two indexes 20261019 added, and the same partial form.
create index if not exists truck_places_weekly_only_picture_idx
  on public.truck_places (weekly_only_picture_id) where weekly_only_picture_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · COMMENTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
comment on column public.truck_places.weekly_only_picture_id is
  'An OPTIONAL override: the picture WEEKLY posts use instead of this location''s ordinary picture (weekly_picture_id). Null => weekly posts use weekly_picture_id, which is the usual case. 🔴 SINGLE EVENT POSTS NEVER LOOK AT THIS COLUMN. ⚠️ Resolution is a COALESCE, not a mode — weekly_only_picture_id when set, else weekly_picture_id — so "remove the weekly one" is a null and the location goes back to one picture with nothing else to undo. References place_pictures(id); ON DELETE SET NULL, so a deleted picture falls back rather than dangling. May be the same row as weekly_picture_id or event_picture_id.';

comment on column public.truck_places.weekly_picture_id is
  'The location''s LOCATION PICTURE — a logo or a photo, ANY shape. 🔴 AS OF 20261021 IT IS USED **EVERYWHERE**: the weekly post''s per-row picture space and the single event design''s photo space, whenever that design''s Location picture switch is on. ⚠️ weekly_only_picture_id overrides it on WEEKLY posts only. ⛔ THE NAME IS TWO MODELS BEHIND THE MEANING — it was "the weekly picture" (20261019), then "the location picture with a picture_use choice" (20261020), and the choice is gone. Renaming the column would be a drop-and-add, which the rules forbid. References place_pictures(id); ON DELETE SET NULL.';

comment on column public.truck_places.picture_use is
  '⛔ NO LONGER READ OR WRITTEN BY ANY CODE as of 20261021. It held weekly/event/both for a choice the screen no longer asks: a location picture is now used wherever a design has a picture space, and the only exception is the opt-in weekly_only_picture_id. The column and its CHECK are LEFT IN PLACE and left populated — dropping a column is irreversible — but nothing reads them, and a value here changes nothing.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the new column reads as absent, every
--    truck_places row fails to parse, and every social media screen reports an error for a truck whose
--    data is perfectly fine.
notify pgrst, 'reload schema';
