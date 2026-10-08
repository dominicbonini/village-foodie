-- 20261017_post_fonts.sql
-- Social posts, part 2: the font library's shared cache, and the fonts a truck uploads itself.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent (`if not exists` throughout), so re-running is safe. The last line reloads
--    PostgREST — do not skip it, or every read below returns PGRST205, the font picker shows only the
--    21 bundled families, and nothing says why.
--
-- ── 🔴 WHAT THIS STORES, AND THE TWO TABLES ANSWER DIFFERENT QUESTIONS ────────────────────────────
--
--   `font_library_cache`  — "has ANYBODY ever fetched this Google family?" **SHARED BY EVERY TRUCK.**
--                           It has NO truck_id and that is the point: the first truck to choose
--                           Lobster pays one fetch from Google, and every truck after them pays a
--                           SELECT. One row per FACE (regular / bold / italic), not per family.
--
--   `truck_fonts`         — "which fonts has THIS truck uploaded?" One row per FACE, grouped into a
--                           family by (truck_id, family). Up to three rows per family.
--
-- ── 🔴 NOTHING IS FETCHED WHILE A POST IS BEING RENDERED, AND THESE TABLES ARE WHY ────────────────
-- A library font is fetched from Google exactly once, ever, and then lives in our own private storage.
-- Rendering reads our storage. The reasons are in lib/weekly-post/font-store.ts's header and they are
-- not performance: determinism (Google's URLs carry a version that changes, and the preview an
-- operator approves has to be the file they download in a year), render time (the ceiling is 2s and a
-- warm render is 40ms) and availability (a truck posting at 4pm on a Saturday must not be stopped by a
-- DNS failure at fonts.gstatic.com).
--
-- ── 🔴 THE BUCKET IS PRIVATE, AND BOTH KINDS OF FONT LIVE IN IT UNDER DIFFERENT PREFIXES ──────────
--   `post-fonts/library/<slug>-<face>.ttf`            — shared, licensed open-source faces
--   `post-fonts/trucks/<truck id>/<slug>-<face>.ttf`  — one truck's own, possibly commercially licensed
--
-- ⛔ IT MUST BE PRIVATE, AND FOR AN UPLOADED FONT THAT IS A LICENSING MATTER RATHER THAN A PRIVACY
--    ONE. A truck uploads a font they bought. A public bucket would make that file downloadable by
--    anyone who guessed the path — which is redistribution of someone else's commercial font, from our
--    domain. The browser NEVER gets a URL for a font file at all: the server reads the bytes and the
--    renderer draws with them. ⚠️ There is no signed read URL for a font anywhere in this feature.
--
-- ── ⚠️ WHAT IS NOT TOUCHED ────────────────────────────────────────────────────────────────────────
-- No existing table is altered. `truck_post_designs.layout` gains optional font references inside the
-- jsonb it already holds — which needs no DDL, because jsonb is jsonb. `truck_events`, `venues`,
-- `truck_places` and every ordering, KDS and payments table are untouched and unnamed.

set lock_timeout = '3s';

begin;

-- ── the private bucket ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `on conflict do nothing` so re-running cannot flip an existing bucket's visibility.
-- ⚠️ IF YOUR SQL-EDITOR ROLE CANNOT WRITE `storage.buckets` this statement errors and the rest still
--    applies: create it by hand instead — Storage › New bucket, name `post-fonts`, **Public: OFF**.
--    That is what happened for `truck-media` and `outreach-attachments`, both made in the dashboard.
insert into storage.buckets (id, name, public)
values ('post-fonts', 'post-fonts', false)
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · font_library_cache — fetched once, shared by every truck
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.font_library_cache (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 THE FAMILY NAME AS GOOGLE SPELLS IT — "Playfair Display", not a slug. The slug is derived from
  -- it (lowercase alphanumeric) for the storage path; keeping the real name here is what lets the
  -- catalogue, the picker and this table be matched up by eye when something looks wrong.
  family text not null,

  -- 🔴 400 OR 700 ONLY, AND THE CHECK SAYS SO. This product draws two weights: `TextStyle` has a
  -- `bold` boolean, not a weight. A 500 row would be a file nothing can ever ask for.
  weight int not null check (weight in (400, 700)),
  style text not null check (style in ('normal', 'italic')),

  -- The object path inside the PRIVATE `post-fonts` bucket.
  storage_path text not null,

  -- 🔴 RECORDED PER FACE, FROM THE CATALOGUE, AND ONLY EVER ONE OF THREE VALUES. The catalogue admits
  -- only families whose licence comes from the `apache/`, `ofl/` or `ufl/` directory of the
  -- google/fonts repository — so this column is the licence we believe we are using the file under,
  -- written down at the moment it was fetched. ⚠️ The CHECK is what stops a fourth licence arriving
  -- silently if the catalogue builder's filter is ever loosened.
  licence text not null check (licence in ('OFL-1.1', 'Apache-2.0', 'UFL-1.0')),

  -- ⚠️ THE EXACT URL IT CAME FROM, version and all. Google's static files are versioned (`/v57/`) and
  -- the version changes; if a cached face is ever suspected of being wrong, this is the only record of
  -- which cut we took.
  source_url text,

  fetched_at timestamptz not null default now(),

  constraint font_library_cache_family_not_blank check (length(btrim(family)) > 0),
  constraint font_library_cache_path_not_blank check (length(btrim(storage_path)) > 0)
);

-- 🔴 ONE ROW PER (family, weight, style) — the whole cache mechanism. ⚠️ It is also what makes
-- `saveLibraryFaces` safe to call twice: two trucks choosing Lobster in the same second both insert,
-- and the second one's `on conflict do nothing` is a no-op rather than a duplicate.
create unique index if not exists font_library_cache_face_uidx
  on public.font_library_cache (family, weight, style);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · truck_fonts — what one truck uploaded
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.truck_fonts (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 TEXT, NOT uuid. `trucks.id` is TEXT — live ids are slugs like 'pizzeria-gusto'. Declaring this
  -- uuid fails the migration outright. Same rule as truck_places, truck_post_designs and
  -- van_category_settings.
  truck_id text not null references public.trucks(id) on delete cascade,

  -- 🔴 THE FONT'S OWN FAMILY NAME, FROM ITS `name` TABLE — not from the filename, which is whatever
  -- the file was called on the operator's machine and is supplied by the browser. Read server-side by
  -- readFontNames()/faceOfFont() in lib/weekly-post/ttf-metrics.ts. ⚠️ THIS IS THE STABLE KEY: the
  -- font id a design stores is `u:<slug of this>`, so renaming the display name below never orphans a
  -- design.
  family text not null,

  -- ⚠️ WHAT THE OPERATOR SEES, AND THEY MAY CHANGE IT. A font's name table often says something like
  -- "MyShopFont-Regular_v2_FINAL"; the brief's "The truck can rename it for display" is this column.
  display_name text not null,

  weight int not null check (weight in (400, 700)),
  style text not null check (style in ('normal', 'italic')),

  -- 🔴 EXACTLY THREE FACES ARE POSSIBLE, AND THE CHECK ENFORCES IT rather than leaving it to the
  -- route. §3's "Regular, Bold and Italic" is (400,normal), (700,normal) and (400,italic). There is no
  -- bold italic, because no control can select one: `bold + italic` draws the italic face.
  constraint truck_fonts_face_is_one_of_three
    check ((weight, style) in ((400, 'normal'), (700, 'normal'), (400, 'italic'))),

  -- The object path inside the PRIVATE `post-fonts` bucket, under `trucks/<truck id>/`.
  storage_path text not null,
  file_bytes int not null check (file_bytes > 0 and file_bytes <= 5242880),

  -- 🔴 WHEN THE TICK WAS TICKED. §3: *"A required tick … records when it was ticked."* NOT NULL, so a
  -- row cannot exist without one — the confirmation is a precondition of storing the file, not a flag
  -- that can be added later. ⚠️ It is the only record that anybody asserted a right to this file, and
  -- it is per FACE because each file is uploaded separately and confirmed separately.
  licence_confirmed_at timestamptz not null,

  created_at timestamptz not null default now(),

  constraint truck_fonts_family_not_blank check (length(btrim(family)) > 0),
  constraint truck_fonts_display_not_blank check (length(btrim(display_name)) > 0),
  constraint truck_fonts_path_not_blank check (length(btrim(storage_path)) > 0)
);

-- One row per face per family per truck — the upsert target when a face is replaced.
create unique index if not exists truck_fonts_truck_family_face_uidx
  on public.truck_fonts (truck_id, family, weight, style);

-- ⚠️ The picker lists a truck's families; this is the index that read uses.
create index if not exists truck_fonts_truck_idx on public.truck_fonts (truck_id);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · RLS + GRANTS — SERVICE ROLE ONLY, ON BOTH
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 THE SAME THREE DEFENCES AS truck_places AND truck_post_designs, and the third is the one that
-- does the work: enabling RLS alone leaves Supabase's default grants in place, so the capability is
-- still reachable with the anon key and merely default-denied. The REVOKE removes it.
--
-- ⛔ "A truck's fonts are readable and writable only by that truck's server routes" (§4) IS WHAT THIS
-- IMPLEMENTS, and it is worth being precise about HOW, because there is no `auth.uid()` in this
-- product: an operator is authenticated by `trucks.dashboard_token`, not by a Supabase session. So
-- there is no JWT claim a policy could compare `truck_id` against. The enforcement is:
--   1. no client role can read or write these tables AT ALL (the policy + the revoke below);
--   2. every reader and writer is /api/weekly-post, holding the service-role key;
--   3. that route resolves the truck from the dashboard token FIRST and filters every query by
--      `.eq('truck_id', truck.id)` — the same pattern as every other truck-owned table here.
-- ⚠️ A `using (truck_id = ...)` policy would be theatre: the only role that can reach the table is
-- the one RLS does not apply to.

alter table public.font_library_cache enable row level security;
drop policy if exists "service_role only" on public.font_library_cache;
create policy "service_role only" on public.font_library_cache
  for all to service_role using (true) with check (true);
revoke all on public.font_library_cache from anon, authenticated, public;

alter table public.truck_fonts enable row level security;
drop policy if exists "service_role only" on public.truck_fonts;
create policy "service_role only" on public.truck_fonts
  for all to service_role using (true) with check (true);
revoke all on public.truck_fonts from anon, authenticated, public;

comment on table public.font_library_cache is
  'Google Fonts families fetched ONCE and stored in our own private post-fonts bucket, shared by every truck. One row per face (400/700 normal, 400 italic). NOTHING IS FETCHED WHILE A POST IS RENDERED: the renderer reads our storage, never Google. Only OFL-1.1, Apache-2.0 and UFL-1.0 families are admitted, from lib/weekly-post/font-catalogue.json.';

comment on table public.truck_fonts is
  'Fonts a truck uploaded, one row per face, grouped into a family by (truck_id, family). family comes from the font''s own name table and is the stable key behind the font id u:<slug>; display_name is what the operator sees and may rename. licence_confirmed_at is when they ticked "I own this font or have a licence to use it" and is NOT NULL by design. Files live in the PRIVATE post-fonts bucket under trucks/<truck id>/ and are never given a URL — the server reads the bytes and the renderer draws with them.';

comment on column public.truck_fonts.licence_confirmed_at is
  'When the operator ticked "I own this font or have a licence to use it". The only record that a right to the file was asserted. Per face, because each file is uploaded and confirmed separately.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: both new tables read as absent, the font picker
--    silently falls back to the 21 bundled families, and nothing says why.
notify pgrst, 'reload schema';
