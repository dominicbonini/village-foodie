-- 20261018_place_picture_library.sql
-- Social posts, part 3: a place's pictures become a LIBRARY that both designs can use.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent (`if not exists` / `if exists` throughout), so re-running is safe. The last
--    line reloads PostgREST — do not skip it, or every read below returns PGRST205 and the Place
--    pictures box reports no pictures for a truck that has some.
--
-- ⛔ `public.place_pictures` IS NOT DROPPED, NOT RECREATED, AND NOT EMPTIED. It is ALTERED. Three
--    columns, one index, and the grants brought into line. Every existing row keeps its id and its
--    path, and no stored object is touched by anything in this file.
--
-- ── 🔴 WHY THE EXISTING TABLE AND NOT A NEW ONE ───────────────────────────────────────────────────
-- It was added on 20261015 for the Places tab, which was deleted the next day — so it has rows only if
-- somebody uploaded through that screen in its one day of life. Its shape is already the library's:
--
--   truck_id · place_id · path · file_name · bytes · width · height · created_at
--
-- which is "a truck's picture for a place, where the file is, how big it is, what shape it is and when
-- it arrived" — exactly §1's list. What is missing is only the three things §1 names: **is_main**, a
-- **label** and a **sort order**. Creating a second table would have meant two tables holding the same
-- fact, and the brief's own instruction is to reuse it if it fits. It fits.
--
-- ⚠️ ITS COMMENT IS REPLACED AT THE BOTTOM OF THIS FILE, because the old one says the opposite of what
--    is now true: *"THEY DO NOT AFFECT POSTS … nothing in lib/weekly-post or app/api/weekly-post reads
--    this table"*. They do now. `scripts/places-tab.cjs` asserted that promise and has been re-aimed.
--
-- ── ⚠️ WHAT IS NOT TOUCHED ────────────────────────────────────────────────────────────────────────
-- `truck_places.event_bg_path` / `event_bg_width` / `event_bg_height` / `event_layout` are UNCHANGED
-- and are still the source of truth for what a place's event post renders today. ⛔ NO DATA IS COPIED
-- OR MOVED by this migration — see the note on §2 in docs/place-pictures-report.md: the existing
-- picture is MAPPED ON READ into the library as its Main, and is only written as a real row the first
-- time the operator changes something about that place's pictures. That is why there is no `insert`
-- anywhere in this file.
--
-- `truck_events`, `venues` and every ordering, KDS and payments table are untouched and unnamed.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE THREE MISSING COLUMNS
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 🔴 ONE PICTURE PER PLACE IS "Main" — the one a post uses automatically. `default false` means every
-- existing row (if there are any) starts as not-main, which is correct: nothing has chosen one yet, and
-- the read layer picks the oldest as Main until somebody does.
alter table public.place_pictures
  add column if not exists is_main boolean not null default false;

-- ⚠️ NULLABLE, AND IT FALLS BACK TO `file_name`. The operator renames a picture for display; the file
-- name is what they uploaded and is still what a download is called. Two different facts, two columns —
-- overwriting `file_name` on a rename would lose the only record of what the file actually is.
alter table public.place_pictures
  add column if not exists label text;

-- ⚠️ EXPLICIT ORDER, DEFAULT 0, TIE-BROKEN BY `created_at` IN THE READ. A grid the operator can
-- rearrange needs a number; without one the order is "whatever the database felt like", which changes
-- between reads and makes "the second picture" a meaningless phrase.
alter table public.place_pictures
  add column if not exists sort_order integer not null default 0;

-- ⚠️ A LABEL THAT IS PRESENT MUST SAY SOMETHING. Null is "use the file name"; an empty string would be
-- a picture with no name at all in the grid.
alter table public.place_pictures
  drop constraint if exists place_pictures_label_not_blank;
alter table public.place_pictures
  add constraint place_pictures_label_not_blank
  check (label is null or length(btrim(label)) > 0);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · AT MOST ONE MAIN PER PLACE — ENFORCED BY THE DATABASE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 A PARTIAL UNIQUE INDEX, AND IT IS SAFE HERE **BECAUSE NOTHING UPSERTS ON IT**. A partial index
-- cannot be an `ON CONFLICT` target, so a table that upserts on a column needs a full one — that is the
-- rule this repository already follows for `place_pictures_path_uidx` (full, because the route handles
-- 23505 by re-reading) and for the pin's index (partial, because it is only ever an index).
--
-- ⚠️ "Make main" IS A TWO-STATEMENT TRANSACTION in the route — clear this place's main, then set the
-- new one — never an upsert, so this index is only ever a guard. It is the guard that matters: without
-- it, two concurrent "Make main" presses leave a place with two Mains and the poster picks whichever
-- the read returned first, differently on different renders.
create unique index if not exists place_pictures_one_main_per_place_uidx
  on public.place_pictures (place_id)
  where is_main;

-- ⚠️ THE GRID'S OWN ORDER, as one index: a place's pictures, mains first, then by sort order, then by
-- age. The existing `place_pictures_place_idx` (place_id, created_at desc) stays — it is the order the
-- old list used and nothing is served by churning it.
create index if not exists place_pictures_place_order_idx
  on public.place_pictures (place_id, is_main desc, sort_order, created_at);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · RLS + GRANTS — BROUGHT INTO LINE WITH THE OTHER TRUCK-OWNED TABLES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⛔ THE 20261015 MIGRATION ENABLED RLS AND REVOKED FROM `anon, authenticated` — but it created **no
-- policy** and did **not revoke from `public`**. Every other truck-owned table here (truck_places,
-- truck_post_designs, truck_fonts, font_library_cache) uses all three defences, and the third is the
-- one that does the work: enabling RLS alone leaves Supabase's default grants in place, so the
-- capability is still reachable with the anon key and merely default-denied.
--
-- ⚠️ IT MATTERED LESS WHEN NOTHING READ THIS TABLE. It matters now: these rows name storage paths for
-- pictures a truck uploaded, and this is the table a poster is drawn from.
alter table public.place_pictures enable row level security;
drop policy if exists "service_role only" on public.place_pictures;
create policy "service_role only" on public.place_pictures
  for all to service_role using (true) with check (true);
revoke all on public.place_pictures from anon, authenticated, public;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · THE COMMENT, REPLACED — THE OLD ONE IS NOW FALSE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
comment on table public.place_pictures is
  'A place''s PICTURE LIBRARY: a logo, a photo of the pitch, a venue''s poster. One row per picture; at most one is_main per place, enforced by place_pictures_one_main_per_place_uidx. 🔴 THEY DO AFFECT POSTS AS OF 20261018 — this reverses the 20261015 comment. A design''s "Place picture" item draws the Main one in a box (weekly: in each row; single event: in a box) or uses it as the whole background, and the make-post modal can choose a different one for a single event. Pictures are NOT tied to a post type. A PRIVATE event never gets one. Files live in the PRIVATE post-designs bucket and reach the browser only as short-lived signed URLs. label is null => use file_name. Service-role only.';

comment on column public.place_pictures.is_main is
  'The picture a post uses automatically. At most one per place (partial unique index). A place whose rows are all false falls back to the oldest, so a library always has a Main to draw.';

comment on column public.place_pictures.label is
  'What the operator renamed it to, for the grid. NULL means "use file_name" — the upload name is kept separately because it is what a download is called.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the three new columns read as absent, every
--    place picture row fails to parse, and the Place pictures box shows an empty library.
notify pgrst, 'reload schema';
