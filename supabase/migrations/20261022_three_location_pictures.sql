-- 20261022_three_location_pictures.sql
-- A location has THREE pictures with three jobs: one for weekly posts, one for event posts, one poster.
--
-- ⛔ NOT APPLIED BY ANYTHING IN THIS REPOSITORY. Dominic runs it by hand. ONE transaction, idempotent
--    (`if not exists`, a guarded constraint, and a first-run guard on the two backfills — see §3), so
--    re-running it is safe. The last line reloads PostgREST — do not skip it, or the new column reads
--    as absent and every `truck_places` row fails to parse.
--
-- ⛔ NOTHING IS DROPPED, NOTHING IS DELETED, NOTHING IS EMPTIED EXCEPT `weekly_only_picture_id`, whose
--    value is MOVED into `weekly_picture_id` first (§3c). No `place_pictures` row and no stored object
--    is touched, so every file is still there and still reachable.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THE THIRD MODEL IN FOUR DAYS, AND WHY THIS ONE IS THE SIMPLE ONE
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
--   20261019  two slots:      "the event image" and "the weekly image".
--   20261020  one picture:    a POSTER plus a LOCATION PICTURE, and a `picture_use` choice —
--                             weekly / single event / both — that the truck had to answer first.
--   20261021  the choice out: one LOCATION PICTURE used wherever a design has a space, plus an opt-in
--                             `weekly_only_picture_id` override for weekly posts.
--   20261022  **three slots, one per job, and no rule to learn.**
--
-- ⚠️ EACH STEP REMOVED A RULE AND THIS ONE REMOVES THE LAST OF THEM. 20261021's shape was already
-- simple to describe — "one picture, used everywhere" — but it had two consequences nobody could see
-- on the screen: a logo chosen because it suits a 180px line on a weekly poster was also the photo
-- cropped into a 1080px space on an event post, and the only way out was an override box with a link
-- that had to be found. ⛔ THERE IS NO INHERITANCE AND NO FALLBACK NOW. Three boxes, three pictures,
-- and a link in each empty one offering to point at the other — which is the same convenience the
-- override was for, said in a way that does not need a model to understand.
--
--   `weekly_picture_id`        ⇒ the WEEKLY POST picture. Weekly posts read ONLY this. No fallback.
--   `event_photo_picture_id`   ⇒ the EVENT POST picture — the single event design's picture space.
--   `event_picture_id`         ⇒ the LOCATION POSTER, unchanged. It replaces the standard design.
--   `weekly_only_picture_id`   ⇒ ⛔ NO LONGER READ OR WRITTEN. Emptied by §3c, column left in place.
--   `picture_use`             ⇒ ⛔ NO LONGER READ OR WRITTEN since 20261021. Column left in place.
--
-- ⚠️ `weekly_picture_id` IS THE ONE NAME THAT IS FINALLY HONEST AGAIN. It meant "the weekly picture"
-- (20261019), then "the location picture" (20261020–21), and it means the weekly picture again. ⛔ AND
-- `event_picture_id` IS STILL THE MISLEADING ONE — it is the POSTER, not the event photo, which is why
-- the new column could not simply be called that. Renaming either would be a drop-and-add as far as
-- every cached PostgREST schema, every select string and every harness assertion is concerned, and the
-- rules forbid dropping a column. The comments in §4 are the record.
--
-- ── ⚠️ WHAT IS **NOT** TOUCHED ────────────────────────────────────────────────────────────────────
-- `place_pictures` is untouched — not a column, not a row, not a stored object.
-- `truck_places.event_picture_id`, `social_tag`, `short_name`, `name`, `area`, `event_bg_*` and
-- `event_layout` are all unchanged. `truck_post_designs` is not named at all.
-- `truck_events`, `venues` and every ordering, KDS and payments table are untouched and unnamed.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE EVENT POST PICTURE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 DEFINED EXACTLY LIKE `weekly_picture_id`: uuid, nullable, referencing `place_pictures(id)` with
-- `ON DELETE SET NULL`. ⛔ NOT `CASCADE` — deleting a picture must never delete a LOCATION.
-- ⚠️ ONE IMAGE MAY FILL ALL THREE COLUMNS, which is exactly what the "Use the … picture" links do:
-- `place_pictures_path_uidx` is a FULL unique index on `path`, so the same object cannot be stored
-- twice. Three references point at one row and no file is copied.
alter table public.truck_places
  add column if not exists event_photo_picture_id uuid;

-- ⚠️ THE FOREIGN KEY IS ADDED SEPARATELY AND GUARDED, because `add constraint` has no `if not exists`
-- form in Postgres and a re-run would otherwise fail on "constraint already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'truck_places_event_photo_picture_id_fkey'
      and conrelid = 'public.truck_places'::regclass
  ) then
    alter table public.truck_places
      add constraint truck_places_event_photo_picture_id_fkey
      foreign key (event_photo_picture_id)
      references public.place_pictures(id) on delete set null;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · THE INDEX — FOR THE REVERSE LOOKUP, NOT FOR UNIQUENESS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NOT UNIQUE, AND IT MUST NOT BE. Two locations may legitimately point at the same picture row, and
-- one location may point at one row from all three of its columns.
-- 🔴 IT EXISTS FOR `ON DELETE SET NULL`: Postgres has to find every referencing row when a picture is
-- deleted, and without an index on the referencing column that is a sequential scan per delete. Same
-- reasoning and same partial form as the three indexes 20261019 and 20261021 added.
create index if not exists truck_places_event_photo_picture_idx
  on public.truck_places (event_photo_picture_id) where event_photo_picture_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · THE BACKFILL — ONCE, AND ONLY ONCE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⛔ **THE GUARD IS THE IMPORTANT PART OF THIS SECTION, NOT THE TWO UPDATES.**
--
-- `where event_photo_picture_id is null` is enough to make a SECOND RUN TODAY change nothing, and that
-- is all "idempotent" usually has to mean. 🔴 IT IS NOT ENOUGH HERE, AND THE DIFFERENCE MATTERS: the
-- moment an operator presses **Remove** on an event post picture, that column is null again — so a
-- re-run a week later would silently put the weekly picture back into a slot the truck had deliberately
-- emptied, and the next event post would draw a picture they had removed.
--
-- 🔴 SO THE GUARD IS "HAS THIS MIGRATION RUN BEFORE?", ASKED OF THE SCHEMA ITSELF. §4 sets a comment on
-- the new column, inside this same transaction; the presence of that comment is therefore an exact
-- record of a completed run. ⚠️ NO MIGRATIONS TABLE IS ASSUMED — this repository does not run SQL and
-- cannot rely on one existing.
-- ⚠️ AND THE TWO UPDATES ARE ORDERED. (b) must read `weekly_picture_id` BEFORE (c) overwrites it, or
-- the weekly override would be copied into the event photo as well — which is the one thing neither
-- surface draws today.
do $$
declare
  ran_before boolean;
  n_event int := 0;
  n_weekly int := 0;
begin
  select col_description('public.truck_places'::regclass, a.attnum) is not null
    into ran_before
    from pg_attribute a
   where a.attrelid = 'public.truck_places'::regclass
     and a.attname = 'event_photo_picture_id'
     and a.attnum > 0;

  if coalesce(ran_before, false) then
    raise notice 'truck_places backfill SKIPPED — this migration has already run (the column carries its comment).';
  else
    -- (b) 🔴 EVENT POSTS KEEP THE PICTURE THEY DRAW TODAY. Under 20261021 the location picture was used
    --     wherever a design had a space, so `weekly_picture_id` is what every event post is drawing at
    --     this moment. Copying it is what makes this migration invisible on the poster.
    update public.truck_places
       set event_photo_picture_id = weekly_picture_id
     where event_photo_picture_id is null
       and weekly_picture_id is not null;
    get diagnostics n_event = row_count;

    -- (c) 🔴 THE OVERRIDE BECOMES THE WEEKLY PICTURE. A location with a weekly-only override is drawing
    --     THAT on its weekly post today, and `weekly_picture_id` is the only column weekly posts read
    --     from now on — so the override has to move into it, not be forgotten.
    -- ⛔ AND IT IS NULLED AFTERWARDS, in the same statement pair, so the column is empty everywhere and
    --    nothing can read a stale value from it. The picture ROW is untouched: it is now referenced by
    --    `weekly_picture_id` instead.
    update public.truck_places
       set weekly_picture_id = weekly_only_picture_id,
           weekly_only_picture_id = null
     where weekly_only_picture_id is not null;
    get diagnostics n_weekly = row_count;

    raise notice 'truck_places backfill: % event-photo row(s) filled, % weekly override(s) moved.', n_event, n_weekly;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · COMMENTS — AND THE ONE ON `event_photo_picture_id` IS ALSO §3's GUARD
-- ════════════════════════════════════════════════════════════════════════════════════════════════
comment on column public.truck_places.event_photo_picture_id is
  'The EVENT POST picture: the image drawn in the single event design''s picture space, when that design''s Location picture switch is on. 🔴 SINGLE EVENT POSTS READ ONLY THIS COLUMN for that space — there is no fallback to the weekly picture. ⚠️ A LOCATION POSTER (event_picture_id) still BEATS it, because a poster replaces the whole design and there is no space left to draw into. References place_pictures(id); ON DELETE SET NULL. May be the same row as weekly_picture_id or event_picture_id — the screen''s "Use the weekly post picture" link points both columns at one row rather than copying a file. ⛔ THE PRESENCE OF THIS COMMENT IS 20261022''s first-run guard: the backfill in that migration is skipped when it is set.';

comment on column public.truck_places.weekly_picture_id is
  'The WEEKLY POST picture: the image drawn beside this location''s line on the weekly poster, when that design''s Location picture switch is on. 🔴 WEEKLY POSTS READ ONLY THIS COLUMN. No fallback, no override. ⚠️ AS OF 20261022 THE NAME IS HONEST AGAIN — it meant "the weekly picture" (20261019), then "the location picture used everywhere" (20261020 and 20261021), and it means the weekly picture again. References place_pictures(id); ON DELETE SET NULL.';

comment on column public.truck_places.weekly_only_picture_id is
  '⛔ NO LONGER READ OR WRITTEN BY ANY CODE as of 20261022, and EMPTIED by that migration — its value was moved into weekly_picture_id, which is the only column weekly posts read now. It held an opt-in override for weekly posts while one picture served both surfaces (20261021); with a picture per surface there is nothing left to override. The column is LEFT IN PLACE because dropping a column is irreversible. ⚠️ No place_pictures row was deleted when it was emptied — the pictures it pointed at are referenced by weekly_picture_id instead.';

comment on column public.truck_places.picture_use is
  '⛔ NO LONGER READ OR WRITTEN BY ANY CODE as of 20261021. It held weekly/event/both for a choice the screen stopped asking. The column and its CHECK are LEFT IN PLACE and left populated — dropping a column is irreversible — but nothing reads them, and a value here changes nothing.';

comment on column public.truck_places.event_picture_id is
  'The LOCATION POSTER: a finished poster for events at this location, which REPLACES the standard single event design as the whole background. Held to the 1% shape rule against that design. ⛔ THE NAME IS MISLEADING AND IS KEPT ANYWAY — it reads like "the event picture", and the event PHOTO is event_photo_picture_id. Renaming it would be a drop-and-add as far as every cached PostgREST schema, select string and harness assertion is concerned, which the rules forbid. References place_pictures(id); ON DELETE SET NULL.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the new column reads as absent, every
--    truck_places row fails to parse, and every social media screen reports an error for a truck whose
--    data is perfectly fine.
notify pgrst, 'reload schema';
