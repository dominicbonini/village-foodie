-- supabase/migrations/20261042_compare_de_1.sql — compare-de-1 (24 October 2026, docs/compare-de-1-report.md): the German
-- comparison page's data. ⛔ NOT RUN — Dominic runs it ("run now": the code reads every new column and table tolerantly,
-- so nothing breaks before it runs, and nothing public changes when it runs — every country starts 'off').
--
-- 1 · country_settings.comparison_status — 'off' | 'admin' | 'live' (the page's visibility; Admin › Countries sets it).
-- 2 · country_settings.ios_app_available / android_app_available — whether the iPad/iPhone and Android apps are in THAT
--     country's stores (ai-files-1's spec: boolean, not null, default false; GB true — the apps are in the UK stores).
--     The comparison page's app rows read them; GB is the only country where they are true today (OBSERVED: Apple's lookup
--     returns the app for gb only, docs/seo-geo-1-report.md §3).
-- 3 · competitors: four more yes/no/unknown features and two as-advertised texts (the comparison table's rows).
-- 4 · public.comparison_entries — which competitors appear on a country's comparison page, in what order, with the honest
--     "X passt, wenn …" line, and whether an admin has verified the entry.
--
-- 🔴 SECURITY MIRRORS THE OTHER PRICING TABLES (20261039): RLS on, NO policies, every grant revoked from anon,
-- authenticated and public. Only the service role reads or writes (the admin API and the server-rendered page).

begin;

alter table public.country_settings
  add column if not exists comparison_status text not null default 'off',
  add column if not exists ios_app_available boolean not null default false,
  add column if not exists android_app_available boolean not null default false;
alter table public.country_settings drop constraint if exists country_settings_comparison_status_chk;
alter table public.country_settings add constraint country_settings_comparison_status_chk check (comparison_status in ('off', 'admin', 'live'));
update public.country_settings set ios_app_available = true, android_app_available = true where country_code = 'GB';

alter table public.competitors
  add column if not exists capacity_slots          text not null default 'unknown',
  add column if not exists multi_location_schedule text not null default 'unknown',
  add column if not exists kds                     text not null default 'unknown',
  add column if not exists pay_at_truck            text not null default 'unknown',
  add column if not exists payment_methods         text,
  add column if not exists min_term                text;
alter table public.competitors drop constraint if exists competitors_compare_features_chk;
alter table public.competitors add constraint competitors_compare_features_chk check (
  capacity_slots in ('yes', 'no', 'unknown') and multi_location_schedule in ('yes', 'no', 'unknown')
  and kds in ('yes', 'no', 'unknown') and pay_at_truck in ('yes', 'no', 'unknown'));

create table if not exists public.comparison_entries (
  id              uuid primary key default gen_random_uuid(),
  country_code    text not null check (country_code ~ '^[A-Z]{2}$'),
  competitor_id   uuid not null references public.competitors (id) on delete cascade,
  -- The plan whose price line the page shows. A plan is never edited in place (an edit inserts a new row), so the page
  -- follows a superseded plan to its CURRENT version for the same competitor and country (lib/comparison.ts).
  primary_plan_id uuid references public.competitor_plans (id) on delete set null,
  choose_when     text,          -- the honest "X passt, wenn …" line, in the country's language
  sort_order      integer not null default 0,
  verified_at     timestamptz,
  verified_by     uuid,
  created_at      timestamptz not null default now(),
  unique (country_code, competitor_id)
);
create index if not exists comparison_entries_country_idx on public.comparison_entries (country_code, sort_order);

alter table public.comparison_entries enable row level security;
revoke all on table public.comparison_entries from anon, authenticated, public;
comment on table public.comparison_entries is 'compare-de-1: the competitors on a country''s comparison page. Admin only (service role).';
comment on column public.country_settings.comparison_status is 'compare-de-1: the country''s comparison page — off (404), admin (admins only, noindex), live (public).';

commit;

-- Check:
--   select country_code, comparison_status, ios_app_available, android_app_available from public.country_settings order by 1;
--   select count(*) from public.comparison_entries;
