-- 20261005_van_category_settings.sql
-- Category capacity settings become PER VAN.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent (`if not exists` throughout), so re-running is safe. The last line reloads
--    PostgREST — do not skip it, or every read below returns PGRST205.
--
-- ── 🔴 THE BUG THIS FIXES ─────────────────────────────────────────────────────────────────────────
-- Prep, Items and "Counts to total capacity" are shown inside EACH VAN's Kitchen capacity card — in
-- Manage › Truck settings and on the Dashboard — but they are stored ONCE PER TRUCK on
-- `menu_categories`. There is no `van_id` on that table. So an operator editing Van 2's prep time is
-- editing Van 1's as well, silently, and these three fields decide when an order is accepted and when
-- it is ready. See docs/settings-and-preview-report.md §4.
--
-- ── 🔴 ADDITIVE, AND NO BACKFILL — DELIBERATELY ───────────────────────────────────────────────────
-- This migration creates an EMPTY table. Every truck in the database, Pizzeria Gusto included, has
-- zero rows in it the moment this is applied, and the resolver falls through to `menu_categories` —
-- which is today's behaviour, byte for byte. A backfill would write one row per van per category and
-- make every van's settings independent IMMEDIATELY, which is a behaviour change nobody asked for and
-- which could not be undone without knowing what was there before.
-- 🔴 A VAN GETS ROWS ONLY WHEN AN OPERATOR EDITS THAT VAN. Until then it reads the truck default.
--
-- ── 🔴 WHAT IS NOT TOUCHED ────────────────────────────────────────────────────────────────────────
-- `menu_categories` gains NO column and loses none. Its three fields keep their exact present meaning
-- and become the DEFAULT for any van with no row of its own. The Menu tab keeps writing them, with its
-- wording unchanged. `truck_events` and `venues`: no statement here touches either.
--
-- ── 🔴 THE TYPE PREFLIGHT, AND WHY IT IS HERE ─────────────────────────────────────────────────────
-- `menu_categories` predates this migrations directory, so its `create table` is not in the tree and
-- nothing in the repository records the type of `id`, `prep_secs`, `batch_size` or
-- `counts_toward_capacity`. Rather than GUESS and have the FK either fail obscurely or (with a cast
-- somewhere) silently never match, the first statement below CHECKS all four and raises with the real
-- type and the exact edit to make. It runs before any DDL, so a mismatch costs nothing.

set lock_timeout = '3s';

-- ══ PREFLIGHT — assert the types this file assumes, BEFORE anything is created ═══════════════════
do $$
declare
  want text[] := array['id,uuid', 'prep_secs,integer', 'batch_size,integer',
                       'counts_toward_capacity,boolean'];
  spec text;
  col  text;
  expect text;
  got  text;
  bad  text := '';
begin
  if to_regclass('public.menu_categories') is null then
    raise exception 'menu_categories does not exist — wrong database?';
  end if;
  foreach spec in array want loop
    col    := split_part(spec, ',', 1);
    expect := split_part(spec, ',', 2);
    select format_type(a.atttypid, a.atttypmod) into got
      from pg_attribute a
     where a.attrelid = 'public.menu_categories'::regclass
       and a.attname  = col
       and a.attnum   > 0
       and not a.attisdropped;
    if got is null then
      bad := bad || format('  menu_categories.%s is MISSING%s', col, chr(10));
    elsif got <> expect then
      bad := bad || format('  menu_categories.%s is %s, this file assumes %s%s', col, got, expect, chr(10));
    end if;
  end loop;
  if bad <> '' then
    raise exception E'van_category_settings: the column types below do not match what this migration assumes.\n%\nNothing was created. Edit the matching column type in 20261005_van_category_settings.sql to the type shown and re-run — the app code does not care which it is, only that the two sides agree.', bad;
  end if;
end $$;

begin;

-- ── van_category_settings — one row per (van, category) that has its OWN values ───────────────────
-- 🔴 A WHOLE-ROW OVERRIDE, NOT THREE PER-FIELD OVERRIDES. A row means "this van has its own settings
-- for this category" and carries all three values. Per-field nullable overrides would make
-- "prep inherited, batch not" representable, and every reader would then need a three-way coalesce per
-- field — three times the places to get wrong on the path that decides whether an order is accepted.
-- The first edit for a van seeds its rows from the values that van is ALREADY resolving, so nothing
-- jumps at the moment of the first write.
create table if not exists public.van_category_settings (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 TEXT, NOT uuid. `trucks.id` is TEXT — live ids are slugs like 'pizzeria-gusto'. Declaring this
  -- uuid fails the migration outright. Same rule as truck_places, whatsapp_connections.
  truck_id text not null references public.trucks(id) on delete cascade,

  -- 🔴 CASCADE FROM THE VAN. A deleted van's per-van settings have no subject; leaving them would let a
  -- recreated van with a recycled id inherit a dead van's capacity rules.
  van_id uuid not null references public.truck_vans(id) on delete cascade,

  -- 🔴 CASCADE FROM THE CATEGORY, for the same reason: a deleted category's override is unreachable,
  -- and the capacity engine keys catConfigs by category NAME (lower-cased), so a stale row whose
  -- category was deleted and whose name was later reused would apply to the wrong category.
  category_id uuid not null references public.menu_categories(id) on delete cascade,

  -- The same three fields, with the same types as menu_categories (asserted in the preflight above).
  prep_secs integer,
  batch_size integer,
  counts_toward_capacity boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 🔴 THE UPSERT TARGET. Every write is `on conflict (van_id, category_id) do update`, so two tabs or
-- two devices editing the same van's category produce ONE row and the last write wins — rather than
-- two rows, where which one the reader picked would be arbitrary.
create unique index if not exists van_category_settings_van_cat_uidx
  on public.van_category_settings (van_id, category_id);

-- The resolver's only read: every row for one van.
create index if not exists van_category_settings_van_idx on public.van_category_settings (van_id);
-- Truck-scoped reads (the "copy Van 1 to every following van" write, and the census).
create index if not exists van_category_settings_truck_idx on public.van_category_settings (truck_id);

-- ── RLS + GRANTS — SERVICE ROLE ONLY ─────────────────────────────────────────────────────────────
-- 🔴 THE SAME THREE DEFENCES AS truck_places, and the third is the one that does the work: enabling
-- RLS alone leaves Supabase's default grants in place, so the capability is still reachable with the
-- anon key and merely default-denied. The REVOKE removes it. Every reader and writer is a server route
-- holding the service-role key; no browser session reads this table.
alter table public.van_category_settings enable row level security;
drop policy if exists "service_role only" on public.van_category_settings;
create policy "service_role only" on public.van_category_settings
  for all to service_role using (true) with check (true);
revoke all on public.van_category_settings from anon, authenticated, public;

-- ── truck_vans.same_as_first_van ─────────────────────────────────────────────────────────────────
-- 🔴 A UI STATE AND A WRITE FAN-OUT, NOT A READ-TIME INDIRECTION. When this is true, a change to the
-- FIRST van is ALSO WRITTEN to this van in the same request, and this van's own rows stay complete and
-- authoritative. NO READER ANYWHERE RESOLVES THROUGH THIS COLUMN — asserted by the harness.
--   WHY: a read-time "if same_as_first_van then use van 1's values" would put a second van lookup on
--   the order-acceptance path, give two different answers depending on which van the reader happened
--   to resolve, and make turning the switch OFF a silent behaviour change rather than a no-op.
--   Because it is a copy, switching off keeps the values that were copied in — which is what an
--   operator means by "stop following Van 1", not "revert to something".
-- ⚠️ SAFE TO ADD BEFORE OR AFTER THE DEPLOY. `update_van_settings` writes a built allowlist and
-- `get_vans` reads a named select, so this column is read only once the code naming it has shipped;
-- absent and false behave identically.
alter table public.truck_vans
  add column if not exists same_as_first_van boolean not null default false;

comment on table public.van_category_settings is
  'Per-van overrides for the three category capacity fields (prep_secs, batch_size, counts_toward_capacity). A row means "this van has its own settings for this category" and carries all three. No row = the van reads menu_categories, which is the behaviour of every truck before this table existed. Resolved by effectiveCategorySettings() in lib/van-category-settings.ts and NOWHERE ELSE — a second resolution is a silent disagreement about whether an order can be accepted.';

comment on column public.truck_vans.same_as_first_van is
  'UI state + write fan-out only. True = the operator asked this van to follow the first active van, so writes to the first van are copied here in the same request. NO READER RESOLVES THROUGH THIS COLUMN: this van''s own truck_vans fields and van_category_settings rows are always complete and authoritative, so switching it off is a no-op for ordering and keeps the copied values.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the new table and column read as absent, every
--    per-van read returns PGRST205/42703, and the resolver falls back to menu_categories for every
--    van — correct, but the operator's per-van edits would appear to do nothing.
notify pgrst, 'reload schema';
