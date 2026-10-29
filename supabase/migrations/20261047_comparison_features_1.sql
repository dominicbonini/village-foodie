-- supabase/migrations/20261047_comparison_features_1.sql — comparison-features-1 (29 October 2026,
-- docs/comparison-features-1-report.md). ⛔ NOT RUN — Dominic runs it FIRST, then 20261048 (the data move), then deploys.
--
-- 1 · public.comparison_features — THE MASTER LIST of compared features: its key, group, order, whether the automatic
--     checker checks it (checked), where websites show it (show_scope 'all' | 'some' + show_countries | 'hidden'), and how
--     HatchGrab's own answer is found (hatchgrab_source — lib/comparison-features.ts reads it: a plan switch, built in, a
--     country flag, plan prices, a fixed answer in messages, coming soon, or to confirm). Seeded by the automatic importer
--     from data/comparison-features/features.json. A SEEDED feature's words live in messages (comparison.features.<key>),
--     so they go through the translation pipeline; a feature ADDED IN ADMIN keeps its words here, per locale, in labels and
--     explanations ({"en-GB": "…", "de-DE": "…"}), and pages fall back from the visitor's locale to en-GB.
-- 2 · public.competitor_feature_values — each competitor's answer per feature: value (yes / no / partial / unknown), the
--     note as advertised, the verbatim quote, its URL, the checked date, the verification stamp. country_code null = every
--     country; a row for one country (read on its country site) wins there. 🔴 THE HISTORY RULE, as for plans: a value is
--     never edited in place — an edit inserts a new row and stamps superseded_at on the old one. At most one current row per
--     competitor, feature and country.
--
-- 🔴 SECURITY MIRRORS THE OTHER PRICING TABLES (20261039, 20261043): RLS on, NO policies, every grant revoked from anon,
-- authenticated and public. Only the service role reads or writes (the admin API, the importer and the checker).
-- feature_key has no foreign key on purpose: 20261048 moves the old columns' values before the importer has seeded the
-- list, and lib/comparison-features.ts ignores a value whose feature is not in the list.

begin;

-- ── 1 · the master list ──────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.comparison_features (
  key              text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  group_key        text not null check (group_key in ('ordering', 'payments', 'kitchen', 'marketing', 'apps_hardware', 'price_contract')),
  sort_order       integer not null default 0,
  checked          boolean not null default true,
  show_scope       text not null default 'all' check (show_scope in ('all', 'some', 'hidden')),
  show_countries   text[] not null default '{}' check (array_to_string(show_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  hatchgrab_source text not null default 'confirm' check (length(btrim(hatchgrab_source)) between 1 and 200),
  labels           jsonb not null default '{}'::jsonb check (jsonb_typeof(labels) = 'object'),
  explanations     jsonb not null default '{}'::jsonb check (jsonb_typeof(explanations) = 'object'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index if not exists comparison_features_group_idx on public.comparison_features (group_key, sort_order);

-- ── 2 · the competitors' answers ─────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.competitor_feature_values (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  feature_key   text not null check (feature_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  country_code  text check (country_code ~ '^[A-Z]{2}$'),
  value         text not null default 'unknown' check (value in ('yes', 'no', 'partial', 'unknown')),
  note          text check (note is null or length(note) <= 300),
  quote         text check (quote is null or length(quote) <= 2000),
  source_url    text check (source_url is null or source_url ~* '^https?://'),
  checked_on    date,
  verified_at   timestamptz,
  verified_by   uuid,
  superseded_at timestamptz,
  created_at    timestamptz not null default now()
);
-- One current row per competitor, feature and country (null = every country).
create unique index if not exists competitor_feature_values_current
  on public.competitor_feature_values (competitor_id, feature_key, coalesce(country_code, '')) where superseded_at is null;
create index if not exists competitor_feature_values_competitor_idx on public.competitor_feature_values (competitor_id) where superseded_at is null;

-- ── security ─────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.comparison_features       enable row level security;
alter table public.competitor_feature_values enable row level security;
revoke all on table public.comparison_features       from anon, authenticated, public;
revoke all on table public.competitor_feature_values from anon, authenticated, public;
comment on table public.comparison_features is 'comparison-features-1: the master list of compared features (checked by the checker, shown on websites by choice). Service role only.';
comment on table public.competitor_feature_values is 'comparison-features-1: each competitor''s answer per feature, with note, quote, source and verification; history kept by superseded_at. Service role only.';

commit;

-- Check:
--   select count(*) from public.comparison_features;              -- 0 until the importer seeds it
--   select feature_key, count(*) from public.competitor_feature_values where superseded_at is null group by 1 order by 1;
