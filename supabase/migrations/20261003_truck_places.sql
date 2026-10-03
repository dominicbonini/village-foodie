-- 20261003_truck_places.sql
-- Schedule graphics, stage 1: the operator's own list of PLACES, and the Facebook groups they post in.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent (`if not exists` throughout), so re-running is safe. The last line reloads
--    PostgREST — do not skip it, or every read below returns PGRST205 and the tab reports no places.
--
-- ⚠️ UNTIL IT IS APPLIED the Schedule graphics tab fails CLOSED: the places read errors, the tab shows
--    "Couldn't load places" and nothing is seeded. No other tab is affected — nothing outside this
--    feature names these tables or the new column.
--
-- ── 🔴 WHAT THIS DOES NOT TOUCH ───────────────────────────────────────────────────────────────────
-- `truck_events` and `venues` are READ-ONLY to this entire feature, and that is a hard boundary, not a
-- preference. `venues` is SHARED ACROSS EVERY TRUCK — it is scraper-created reference data, so a
-- truck-specific name, address or posting note written there would appear under another truck's
-- schedule. `truck_events` is what a live truck trades on. There is no statement here against either,
-- and no code path in this stage writes to either.
--
-- ── 🔴 THE TWO UNIQUE RULES, AND WHY BOTH ARE NEEDED ──────────────────────────────────────────────
-- A place can be identified two ways and both have to stay single:
--   • `(truck_id, venue_id)` — when the scraper has anchored the event to a shared venue row, that
--     anchor is the strongest identity available and must map to exactly one place.
--   • `(truck_id, name_key)` — for events with NO `venue_id` (most of them), the normalised venue_name
--     is the only identity there is. This is also the constraint that makes the auto-seed idempotent:
--     two browser tabs opening the tab at once both insert, and the DATABASE decides there is one row.
-- ⚠️ THEY CAN DISAGREE, AND THE SEEDER HAS TO HANDLE IT. Two different `venue_id`s whose `venue_name`
--    strings normalise identically ("Village Hall" in two villages) want one `name_key` between them.
--    The second cannot be inserted, by design — a duplicate place is worse than a missing one, because
--    stages 2 and 3 would generate two graphics and two posting rows for one pitch. The seeder detects
--    this, keeps the first, and reports it rather than throwing. See lib/schedule-graphics/places.ts.

set lock_timeout = '3s';

begin;

-- ── truck_places — one row per place this truck trades at ─────────────────────────────────────────
create table if not exists public.truck_places (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 TEXT, NOT uuid. `trucks.id` is TEXT — live ids are slugs like 'pizzeria-gusto'. Declaring this
  -- uuid fails the migration outright, or (with a cast somewhere) silently never matches. Same rule as
  -- whatsapp_connections and whatsapp_alerts.
  truck_id text not null references public.trucks(id) on delete cascade,

  -- The shared venue row this place is anchored to, when the event carried one.
  -- 🔴 `on delete set null`, NEVER cascade. `venues` is shared reference data that the scraper rewrites;
  -- a venue row being merged away or deleted must not take an operator's place — with its name, its
  -- Facebook groups and its wording — with it. Losing the anchor degrades matching to the name; losing
  -- the row loses work a person did.
  venue_id uuid references public.venues(id) on delete set null,

  -- The normalised `truck_events.venue_name` this place answers to. Produced by ONE function —
  -- `normalisePlaceName` in lib/schedule-graphics/places.ts — which stages 2 and 3 import rather than
  -- re-implement. ⚠️ A second normaliser anywhere is a silent mismatch: events stop finding their place
  -- and the graphic comes out empty with no error.
  name_key text not null,

  -- "Name on posts" — what the operator wants the public to read. Seeded from `venue_name` on first
  -- sight and NEVER written again by the seeder.
  name text not null,
  short_name text,

  address text,
  postcode text,

  -- Per-place override for the group-post wording. NULL = fall through to the truck default
  -- (`trucks.default_group_post_wording`), then to the built-in. One function owns that chain:
  -- `effectiveGroupPostWording`.
  group_post_wording text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One place per anchored venue. A PARTIAL unique index rather than a table constraint, because
  -- `unique (truck_id, venue_id)` would treat every unanchored place as distinct-by-null in Postgres
  -- but still occupy the constraint — the partial index says what is meant: anchored places are unique
  -- by anchor, unanchored ones are governed by name_key below.
  constraint truck_places_name_not_blank check (length(btrim(name)) > 0),
  constraint truck_places_key_not_blank  check (length(btrim(name_key)) > 0)
);

-- 🔴 THE IDEMPOTENCY GUARANTEE. `on conflict (truck_id, name_key) do nothing` in the seeder resolves
-- against THIS index, so a refresh, a second tab, or two devices seeding at once produce one row.
create unique index if not exists truck_places_truck_name_key_uidx
  on public.truck_places (truck_id, name_key);

create unique index if not exists truck_places_truck_venue_uidx
  on public.truck_places (truck_id, venue_id)
  where venue_id is not null;

create index if not exists truck_places_truck_idx on public.truck_places (truck_id);

-- ── truck_place_groups — the Facebook groups this truck posts a place's dates into ────────────────
create table if not exists public.truck_place_groups (
  id uuid primary key default gen_random_uuid(),

  place_id uuid not null references public.truck_places(id) on delete cascade,

  -- 🔴 DENORMALISED ON PURPOSE, AND IT IS NOT A CONVENIENCE. Every read and write of this table is
  -- scoped by the authenticated truck; carrying `truck_id` here means that scope is a column
  -- comparison rather than a join through truck_places, so a missing `.eq('truck_id', …)` cannot
  -- silently widen a query to another truck's groups. `on delete cascade` on both parents.
  truck_id text not null references public.trucks(id) on delete cascade,

  name text not null,
  url text not null,

  -- "Business posts Fridays only" — the group's own posting rule, as the operator knows it. Free text:
  -- these are other people's rules, written in other people's words, and a vocabulary would be wrong
  -- the first time a group said something this list had not anticipated.
  rules text,

  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint truck_place_groups_name_not_blank check (length(btrim(name)) > 0),
  constraint truck_place_groups_url_not_blank  check (length(btrim(url))  > 0)
);

create index if not exists truck_place_groups_place_idx on public.truck_place_groups (place_id, sort_order);
create index if not exists truck_place_groups_truck_idx on public.truck_place_groups (truck_id);

-- ── RLS + GRANTS — SERVICE ROLE ONLY ──────────────────────────────────────────────────────────────
-- 🔴 THE SAME THREE DEFENCES AS whatsapp_alerts / whatsapp_connections, and the third is the one that
-- does the work: enabling RLS alone leaves Supabase's default grants in place, so the capability is
-- still reachable with the anon key and merely default-denied. The REVOKE removes it.
-- Every reader and writer is a server route holding the service-role key, authenticated by the
-- operator's dashboard token through `resolveTruckAccess`. No browser session reads these tables.
alter table public.truck_places enable row level security;
drop policy if exists "service_role only" on public.truck_places;
create policy "service_role only" on public.truck_places
  for all to service_role using (true) with check (true);
revoke all on public.truck_places from anon, authenticated, public;

alter table public.truck_place_groups enable row level security;
drop policy if exists "service_role only" on public.truck_place_groups;
create policy "service_role only" on public.truck_place_groups
  for all to service_role using (true) with check (true);
revoke all on public.truck_place_groups from anon, authenticated, public;

-- ── THE TRUCK-LEVEL DEFAULT WORDING ───────────────────────────────────────────────────────────────
-- 🔴 A COLUMN ON `trucks`, because that is where this codebase keeps per-truck settings: `sound_config`,
-- `print_trigger_mode`, `completion_presses`, `hide_pricing`, `default_walkup_payment` and
-- `allergen_display_mode` are all columns on this table, written through the `update_settings`
-- allowlist in app/api/manage/route.ts. There is no settings jsonb blob to join.
-- ⚠️ SAFE TO ADD BEFORE OR AFTER THE DEPLOY, unlike buzzer_count. `getTruck` in app/api/manage/route.ts
-- reads `select('*')`, so no named select can 42703 on it, and the resolution chain treats absent and
-- null identically — the built-in wording is used either way.
alter table public.trucks
  add column if not exists default_group_post_wording text;

comment on column public.trucks.default_group_post_wording is
  'Default wording for Facebook group posts about this truck''s dates, with the tokens {place} {day} {date} {times} {order link}. NULL = use the built-in default (DEFAULT_GROUP_POST_WORDING in lib/schedule-graphics/places.ts). Overridden per place by truck_places.group_post_wording; the chain is resolved by effectiveGroupPostWording() and nowhere else.';

comment on column public.truck_places.name_key is
  'Normalised truck_events.venue_name, produced ONLY by normalisePlaceName() in lib/schedule-graphics/places.ts: lower-cased, accents folded, & -> and, apostrophes removed, other punctuation -> space, whitespace collapsed, trimmed. Matching an event to a place is venue_id when both sides have one, else this. A second implementation of the normaliser is a silent matching failure, not a style question.';

comment on column public.truck_places.name is
  'Name on posts. Seeded from the event venue_name the first time a place is seen and NEVER rewritten by the seeder — that is what makes an operator edit survive a re-seed, structurally rather than by comparison.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: both tables and the new column read as absent,
--    the places read returns PGRST205, and the tab shows its load error on correct code.
notify pgrst, 'reload schema';
