-- 20261020_poster_picture_tag_captions.sql
-- Social media, round 2: an EVENT POSTER and a LOCATION PICTURE, a social tag, and saved captions.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent (`if not exists` throughout), so re-running is safe. The last line reloads
--    PostgREST — do not skip it, or every read below returns PGRST204/205 and the screens report no
--    images, no tags and no captions for a truck that has all three.
--
-- ⛔ NOTHING IS DROPPED, NOTHING IS DELETED, NOTHING IS EMPTIED. Three nullable-or-defaulted columns.
--    No `insert`, no `delete`, and exactly ONE narrow `update` — see section 2 and its justification.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 WHAT CHANGED IN MEANING, WHICH MATTERS MORE THAN WHAT CHANGED IN SCHEMA
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 20261019 gave a location two image slots whose meanings were "what an EVENT post uses" and "what the
-- WEEKLY post uses" — and the first of those was ambiguous by construction: whether the event image was
-- a PHOTO cropped into a box or the WHOLE POSTER was decided by the DESIGN, not by the truck. A truck
-- who added a photo space to their single event design silently changed what every location's uploaded
-- image meant.
--
-- 🔴 SO THE TRUCK CHOOSES EXPLICITLY NOW, AND THE TWO SLOTS ARE TWO KINDS OF THING:
--
--   `event_picture_id`   ⇒ the **EVENT POSTER**. A full poster for events at this location. It replaces
--                          the standard single event design as the whole background; the renderer adds
--                          the date, the times and "Powered by HatchGrab". Held to the 1% shape rule,
--                          because the design's text boxes were placed on the design's canvas.
--   `weekly_picture_id`  ⇒ the **LOCATION PICTURE**. A logo or a photo, ANY shape.
--   `picture_use`        ⇒ where that picture is drawn: the weekly post, single event posts, or both.
--
-- ⚠️ THE COLUMN NAMES ARE NOT RENAMED, AND THAT IS DELIBERATE. A rename is a drop-and-add under a
--    different name as far as every cached PostgREST schema, every select string and every harness
--    assertion is concerned, and the rules forbid dropping a column. The NAMES are now slightly behind
--    the MEANINGS; the comments below are the record of that, and `lib/weekly-post/place-pictures.ts`
--    carries the same note at the point of reading.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 WHY `picture_use` IS A COLUMN ON `truck_places` AND NOT A THIRD REFERENCE
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
--   1. ⛔ IT IS A PROPERTY OF THE **CHOICE**, NOT OF AN IMAGE. The same uploaded file could be a weekly
--      logo for one location and an event photo for another; "where do I use this location's picture"
--      belongs to the location, which is where the picture reference already lives.
--   2. 🔴 THREE VALUES, EXACTLY, AND THE DATABASE SAYS SO. A `check` constraint is the only place a
--      fourth value can be refused without every reader defending against it.
--   3. ⚠️ `not null default 'weekly'` MEANS EVERY EXISTING ROW IS ALREADY ANSWERED, and answered the way
--      the old model behaved: `weekly_picture_id` fed the weekly post and nothing else. ⛔ SO THE
--      DEFAULT IS NOT A GUESS — it reproduces today exactly, which is what makes this migration safe to
--      run before the code that reads it ships.
--
-- ⚠️ THE ALTERNATIVE AND WHY IT LOSES: two booleans (`picture_on_weekly`, `picture_on_event`). It
--    allows the fourth state — both false — which is a picture uploaded and used nowhere, i.e. a way
--    for a truck to do work that produces nothing and get no error. The radio has no such state, and
--    the column should not be able to represent one the UI cannot produce.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THE CAPTION TEMPLATE IS A COLUMN ON `truck_post_designs`
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
--   1. ⛔ THE GRAIN IS ALREADY EXACTLY RIGHT. `truck_post_designs` is keyed `(truck_id, kind)` with kind
--      in ('week','event') — one row per truck per post type, which is precisely one caption per truck
--      per post type. A new table would be a second row with the same key and a join to reach it.
--   2. 🔴 THE CAPTION AND THE DESIGN ARE SAVED AND READ TOGETHER. Every screen that loads a caption has
--      already loaded the design row it belongs to, so this costs no extra read anywhere.
--   3. ⚠️ NULL MEANS "NOT SET YET", and the app seeds it on first load from today's auto-written
--      caption expressed as labels — so nothing changes until the truck edits it. ⛔ A `not null
--      default ''` WOULD HAVE DESTROYED THAT: an empty string is a caption the truck chose to empty,
--      and null is a caption nobody has touched. Those must not be the same value.
--
-- ⚠️ THE TEMPLATE IS **TEXT WITH LABEL TOKENS**, not rendered text. The tokens are `{week-dates}`,
--    `{day-list}`, `{order-link}`, `{place}`, `{day-date}`, `{times}` and `{location-tag}` — the set is
--    declared once in lib/weekly-post/caption-template.ts and the database stores whatever that module
--    emits. ⛔ NO CHECK CONSTRAINT ON THE CONTENTS: an unknown token renders as nothing rather than
--    failing a save, because a caption that will not save is worse than a caption with a dead label.
--
-- ── ⚠️ WHAT IS **NOT** TOUCHED ────────────────────────────────────────────────────────────────────
-- `place_pictures` is untouched — not a column, not a row, not a stored object. `is_main`, `label` and
-- `sort_order` stay exactly as 20261019 left them: present, populated, read by nothing a truck sees.
-- `truck_places.event_bg_path` / `event_bg_width` / `event_bg_height` / `event_layout` are UNCHANGED and
-- still fill the POSTER role exactly as today, mapped on read.
-- `truck_events`, `venues` and every ordering, KDS and payments table are untouched and unnamed.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · WHERE A LOCATION'S PICTURE IS USED
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.truck_places
  add column if not exists picture_use text not null default 'weekly';

-- 🔴 THE CHECK IS ADDED SEPARATELY AND GUARDED, so re-running cannot fail on "constraint already
-- exists" — `add constraint` has no `if not exists` form in Postgres.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'truck_places_picture_use_check'
      and conrelid = 'public.truck_places'::regclass
  ) then
    alter table public.truck_places
      add constraint truck_places_picture_use_check
      check (picture_use in ('weekly', 'event', 'both'));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · THE ONE UPDATE, AND WHY IT IS SAFE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⛔ THIS IS THE ONLY `update` IN THE FILE AND IT TOUCHES ONE COLUMN ON ONE SET OF ROWS. It exists
-- because of a single mapping case the default cannot answer:
--
--   A location whose `weekly_picture_id` and `event_picture_id` pointed at the **same** picture row was
--   a truck saying "use this image for both jobs" under the old model — there was a "Use the event
--   photo here too" link that did exactly that, and it was the only way to produce this state.
--   ⚠️ UNDER THE NEW MODEL THAT SAME ROW NOW MEANS "this image is both my poster AND my location
--   picture", and the picture half should keep being used in both places. `'both'` is the honest
--   translation; leaving it at `'weekly'` would silently stop drawing it on event posts.
--
-- 🔴 EVERY OTHER ROW KEEPS THE DEFAULT, which reproduces today exactly:
--   • a weekly picture and no poster  ⇒ 'weekly'  (it only ever fed the weekly post)
--   • a poster and no weekly picture  ⇒ 'weekly'  (there is no picture, so the value is unread)
--   • neither                          ⇒ 'weekly'  (unread)
--
-- ⚠️ `is distinct from null` IS REQUIRED. `a = b` is NULL when both are NULL, so a plain equality would
-- match no rows — but it would also be wrong in spirit: two empty slots are not "the same image".
update public.truck_places
   set picture_use = 'both'
 where weekly_picture_id is not null
   and event_picture_id is not null
   and weekly_picture_id = event_picture_id
   and picture_use = 'weekly';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · THE SOCIAL MEDIA TAG
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NULLABLE AND UNCONSTRAINED IN THE DATABASE. The shape rules — trimmed, a leading `@` added when
-- missing, no whitespace, 60 characters — are enforced in ONE place, `normaliseSocialTag()` in
-- lib/weekly-post/social-tag.ts, which the route calls before every write.
-- 🔴 A CHECK CONSTRAINT HERE WOULD BE A SECOND RULE THAT COULD DISAGREE WITH THE FIRST, and the one
-- that produced the better error message would not be the one that fired. The column's job is to hold
-- the normalised value; the normaliser's job is to decide what that is.
-- ⛔ AND THE LENGTH IS NOT `varchar(60)` FOR THE SAME REASON: a truck pasting a 70-character handle
-- should see "that is too long, 60 characters maximum", not a 22001 from the driver.
alter table public.truck_places
  add column if not exists social_tag text;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · THE SAVED CAPTION TEMPLATE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NULL = "nobody has set one". The app seeds it on first load from the caption it writes today,
-- expressed as labels, so an existing truck sees no change until they edit it. See the header.
alter table public.truck_post_designs
  add column if not exists caption_template text;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 5 · COMMENTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
comment on column public.truck_places.event_picture_id is
  'The location''s EVENT POSTER — a full poster for events here, which REPLACES the standard single event design as the whole background (the renderer then adds the date, times and "Powered by HatchGrab"). Held to the 1% shape rule against the standard design, because that design''s text boxes were placed on its canvas. 🔴 THE NAME IS SLIGHTLY BEHIND THE MEANING: until 20261020 this was "the event image", and whether it was a photo or a poster was decided by the DESIGN. It is now always the poster, and the truck chooses. Renaming the column would be a drop-and-add, which the rules forbid. Null => this location has no poster and the post falls back to the legacy event_bg_path if set, then to the standard design. References place_pictures(id); ON DELETE SET NULL.';

comment on column public.truck_places.weekly_picture_id is
  'The location''s LOCATION PICTURE — a logo or a photo, ANY shape. 🔴 WHERE IT IS DRAWN IS `picture_use`, not this column: the weekly post''s per-row picture space, the standard single event design''s photo space, or both. 🔴 THE NAME IS SLIGHTLY BEHIND THE MEANING: until 20261020 this was "the weekly picture" and was only ever drawn on the weekly post. Renaming the column would be a drop-and-add, which the rules forbid. References place_pictures(id); ON DELETE SET NULL. May be the same row as event_picture_id.';

comment on column public.truck_places.picture_use is
  'Where this location''s LOCATION PICTURE (weekly_picture_id) is drawn: weekly => beside its row on the weekly post; event => in the photo space of the standard single event design; both => both. ⛔ IT DOES NOT AFFECT THE EVENT POSTER (event_picture_id), which always replaces the whole background for events here. ⚠️ When a location has BOTH a poster and a picture with use in (event, both), the POSTER wins on single event posts and the picture is not drawn there — the screen says so in one grey line. Default ''weekly'', which reproduces the behaviour every row had before 20261020.';

comment on column public.truck_places.social_tag is
  'This location''s social media handle, used by the {location-tag} label in a single event caption. Stored NORMALISED: trimmed, a leading @ added when missing, no whitespace, at most 60 characters — by normaliseSocialTag() in lib/weekly-post/social-tag.ts, which is the one writer. Null => the location has no tag and the label renders as nothing (no stray @ and no double space). ⛔ NEVER shown on a private event: the server does not send a private booking''s place at all.';

comment on column public.truck_post_designs.caption_template is
  'The truck''s saved caption for this KIND of post, as text with label tokens — {week-dates}, {day-list}, {order-link} on a week design; {place}, {day-date}, {times}, {order-link}, {location-tag} on an event design. Rendered by fillCaptionTemplate() in lib/weekly-post/caption-template.ts. 🔴 NULL MEANS NOBODY HAS SET ONE, and the app seeds it on first load from the caption it writes today expressed as labels — so an existing truck sees no change until they edit it. An EMPTY STRING is a caption the truck deliberately emptied and is NOT the same value. ⛔ No check constraint on the contents: an unknown token renders as nothing rather than failing a save.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the three new columns read as absent, every
--    truck_places and truck_post_designs row fails to parse, and the screens report no images, no tags
--    and no captions for a truck that has all three.
notify pgrst, 'reload schema';
