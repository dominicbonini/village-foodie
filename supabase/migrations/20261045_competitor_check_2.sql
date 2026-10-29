-- supabase/migrations/20261045_competitor_check_2.sql — competitor-check-2 (29 October 2026, docs/competitor-check-2-report.md).
-- ⛔ NOT RUN — Dominic runs it. Safe to run at once: the importer stops with a plain message until data_imports exists,
-- and the Automatic checks tab and the checker read the two new settings columns tolerantly.
--
-- 1 · public.data_imports — one row per attempt to import a registered data file (lib/data-import/importer.ts): its path,
--     the sha256 of its bytes, when, the counts, and ok / error with the reason. A file is imported again only when no 'ok'
--     row has its path and sha256 — so the nightly run imports each version of a file once.
-- 2 · competitor_check_settings.deep_country — the country the deep check is working through (null: none running) — and
--     deep_queue — the order of the countries after it (empty: the default order, computed in lib/competitor-check/core.ts:
--     the countries with a comparison page, then AT, CZ, PL, then the other switched-on countries by number of competitors).
--
-- 🔴 SECURITY MIRRORS THE OTHER PRICING TABLES (20261039, 20261043): RLS on, NO policies, every grant revoked from anon,
-- authenticated and public. Only the service role reads or writes (the importer in GitHub Actions and the admin API).

begin;

-- ── 1 · data_imports ────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.data_imports (
  id           uuid primary key default gen_random_uuid(),
  file_path    text not null check (length(btrim(file_path)) > 0),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  imported_at  timestamptz not null default now(),
  result       text not null check (result in ('ok', 'error')),
  counts       jsonb not null default '{}'::jsonb,
  message      text
);
create index if not exists data_imports_path_at_idx on public.data_imports (file_path, imported_at desc);
-- One successful import per version of a file.
create unique index if not exists data_imports_ok_once on public.data_imports (file_path, sha256) where result = 'ok';

alter table public.data_imports enable row level security;
revoke all on table public.data_imports from anon, authenticated, public;
comment on table public.data_imports is 'competitor-check-2: each import of a registered data file, by sha256 (lib/data-import). Service role only.';

-- ── 2 · the country-by-country deep check ───────────────────────────────────────────────────────────────────────────
alter table public.competitor_check_settings
  add column if not exists deep_country text,
  add column if not exists deep_queue   text[] not null default '{}';
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_deep_country_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_deep_country_chk check (deep_country is null or deep_country ~ '^[A-Z]{2}$');

commit;

-- Check:
--   select file_path, left(sha256, 12), imported_at, result, counts, message from public.data_imports order by imported_at desc;
--   select deep_requested_at, deep_country, deep_queue from public.competitor_check_settings;
