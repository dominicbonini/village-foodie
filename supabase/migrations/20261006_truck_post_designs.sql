-- 20261006_truck_post_designs.sql
-- Weekly post, stage 1: the truck's own blank artwork, and where their three text boxes sit on it.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent (`if not exists` throughout), so re-running is safe. The last line reloads
--    PostgREST — do not skip it, or every read below returns PGRST205 and the tab reports no design.
--
-- ── 🔴 WHAT THIS STORES, AND WHAT IT DOES NOT ─────────────────────────────────────────────────────
-- The truck uploads the BLANK version of the weekly graphic they already make (usually a Canva export
-- with their own text boxes removed) and drags three outlines onto row 1. This table holds that blank,
-- an optional filled example to trace from, and the box positions. It holds NO EVENTS and NO RENDERED
-- IMAGES: the poster is rendered on demand from this design plus the live schedule, so a changed event
-- is reflected the next time they open the screen rather than in a stale cached PNG.
--
-- ── 🔴 THE BUCKET IS CREATED HERE, AND THIS REPOSITORY HAS NEVER DONE THAT BEFORE ─────────────────
-- `truck-media` and `outreach-attachments` were both made by hand in the Supabase dashboard; no
-- migration in this tree creates a bucket. The brief says to create it in the migration "if that is how
-- this repo does buckets; otherwise say how" — it is not how this repo does it, so this is said out
-- loud rather than assumed:
--   • The `insert into storage.buckets` below is the standard Supabase way and is idempotent.
--   • IF YOUR SQL-EDITOR ROLE CANNOT WRITE `storage.buckets`, that statement will error and the rest of
--     this migration still applies. Create the bucket by hand instead: Storage › New bucket, name
--     `post-designs`, **Public: OFF**. Nothing else about it is configured here.
--   • IT MUST BE PRIVATE. The browser never gets a public URL; the server mints short-lived signed URLs
--     with the service-role key. A public bucket would make every truck's artwork world-readable by
--     guessing a path.
--
-- ── 🔴 WHAT IS NOT TOUCHED ────────────────────────────────────────────────────────────────────────
-- `truck_events` and `venues` are read-only to this whole feature, and nothing here writes to either.
-- No ordering, KDS or payments table is named.

set lock_timeout = '3s';

begin;

-- ── the private bucket ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `on conflict do nothing` so re-running cannot flip an existing bucket's visibility.
insert into storage.buckets (id, name, public)
values ('post-designs', 'post-designs', false)
on conflict (id) do nothing;

-- ── truck_post_designs — one design per truck per kind ───────────────────────────────────────────
create table if not exists public.truck_post_designs (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 TEXT, NOT uuid. `trucks.id` is TEXT — live ids are slugs like 'pizzeria-gusto'. Declaring this
  -- uuid fails the migration outright. Same rule as truck_places and van_category_settings.
  truck_id text not null references public.trucks(id) on delete cascade,

  -- 🔴 'week' IS THE ONLY KIND THIS STAGE ACCEPTS, and the CHECK says so rather than leaving the column
  -- free text. The single-event post is explicitly out of scope; when it arrives it adds a value here
  -- and a second row per truck, which is why the unique key below is (truck_id, kind) and not truck_id.
  kind text not null check (kind in ('week')),

  -- Object paths inside the `post-designs` bucket. The blank is required; the example is the optional
  -- filled version shown faintly under the editor so the operator can line their boxes up with it.
  blank_path text not null,
  example_path text,

  -- The blank's native pixel size, stored at upload. 🔴 THE VALIDATOR TRUSTS THESE, NOT THE CLIENT'S
  -- claim: every box is bounds-checked against them, so a payload cannot declare a 10,000px canvas and
  -- have an off-image box pass.
  width int,
  height int,

  -- 🔴 THE DESIGN ITSELF. Shape documented in docs/weekly-post-stage1-report.md and VALIDATED SERVER-
  -- SIDE by validateLayout() in lib/weekly-post/layout.ts before any write — jsonb accepts anything,
  -- and an unchecked number reaches the renderer as `left: NaN`, which draws nothing and reports
  -- nothing. Nothing writes this column without passing that validator.
  layout jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint truck_post_designs_blank_not_blank check (length(btrim(blank_path)) > 0)
);

-- One design per truck per kind — the upsert target for "Save design".
create unique index if not exists truck_post_designs_truck_kind_uidx
  on public.truck_post_designs (truck_id, kind);

-- ── RLS + GRANTS — SERVICE ROLE ONLY ─────────────────────────────────────────────────────────────
-- 🔴 THE SAME THREE DEFENCES AS truck_places, and the third is the one that does the work: enabling
-- RLS alone leaves Supabase's default grants in place, so the capability is still reachable with the
-- anon key and merely default-denied. The REVOKE removes it. Every reader and writer is a server route
-- holding the service-role key, authenticated by the operator's dashboard token.
alter table public.truck_post_designs enable row level security;
drop policy if exists "service_role only" on public.truck_post_designs;
create policy "service_role only" on public.truck_post_designs
  for all to service_role using (true) with check (true);
revoke all on public.truck_post_designs from anon, authenticated, public;

comment on table public.truck_post_designs is
  'The truck''s own blank weekly-schedule artwork and the positions of the text boxes HatchGrab fills in. One row per truck per kind; kind is ''week'' only in stage 1. Images live in the PRIVATE post-designs bucket and are served to the browser as short-lived signed URLs. The layout jsonb is validated by validateLayout() in lib/weekly-post/layout.ts before every write.';

comment on column public.truck_post_designs.layout is
  'Box positions in the BLANK IMAGE''S OWN PIXELS (never editor-scaled coordinates), plus fonts, colours, row spacing and the per-box background sample used by the readability rule. Shape and bounds: lib/weekly-post/layout.ts. version must match LAYOUT_VERSION.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the new table reads as absent, the weekly-post
--    screen reports no design on correct code, and the operator is told to set one up again.
notify pgrst, 'reload schema';
