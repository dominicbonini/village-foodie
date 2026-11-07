-- supabase/migrations/20261078_compare_autopublish_1.sql — compare-autopublish-1 (7 November 2026, docs/compare-autopublish-1-report.md).
-- COMPARISON PAGES PUBLISH THEMSELVES FROM EVIDENCE-BACKED DATA (Dominic's Q1 = C, Q2 = A, Q3 = A and addendum A–F). No protected table
-- is written: country_settings is untouched.
--   • comparison_publish (NEW, one row per switched-on country): auto_publish (true; the UAE false and held false by a check), auto_live
--     (the evaluation's verdict: ≥ 2 competitors publishable after the four-cap), admin_off (an explicit "off" set in Admin — recorded
--     from now on; it always wins), the last shown set and when it was evaluated. A country's page is live when country_settings says
--     'live' OR (auto_publish AND auto_live AND NOT admin_off) — lib/comparison-flags.ts.
--   • comparison_publish_events (NEW): every automatic decision — a finding accepted or rejected, a competitor published, changed, held
--     back or taken down, a country going live or not — with its reason, for the weekly summary.
--   • auto_verified_at on competitor_plans, competitor_feature_values and comparison_entries: an AUTOMATIC verification, distinct from a
--     manual one (verified_at / verified_by stay Admin's; a manual one always wins).
--   • competitor_check_findings.auto_reviewed / auto_reason: a finding accepted or rejected by the rules, not by Admin.
--   • competitors.check_failures (consecutive failed checks — two take a competitor down until a good check), competitors.check_urls_by
--     ('auto' | 'admin' — the checker never overwrites a list Admin set by hand).
-- DATA: android and ipad leave absence_means_no (apps are often listed only in app stores — addendum C); a comparison_publish row for
-- every switched-on country; unverified comparison entries for every switched-on country except the UAE that has none, from every
-- active competitor with a current plan there (as GB and US got them — Q2 = A + C).

begin;

create table if not exists public.comparison_publish (
  country_code  text primary key check (country_code ~ '^[A-Z]{2}$'),
  auto_publish  boolean not null default true,
  auto_live     boolean not null default false,
  admin_off     boolean not null default false,
  admin_off_at  timestamptz,
  shown         jsonb not null default '[]'::jsonb check (jsonb_typeof(shown) = 'array'),
  evaluated_at  timestamptz,
  live_since    timestamptz,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint comparison_publish_never_ae check (country_code <> 'AE' or (auto_publish = false and auto_live = false))
);
alter table public.comparison_publish enable row level security;
revoke all on public.comparison_publish from anon, authenticated;

create table if not exists public.comparison_publish_events (
  id             uuid primary key default gen_random_uuid(),
  at             timestamptz not null default now(),
  country_code   text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  competitor_id  uuid references public.competitors(id) on delete set null,
  kind           text not null check (kind in ('finding_accepted', 'finding_rejected', 'published', 'changed', 'held', 'taken_down', 'country_live', 'country_not_live', 'check_urls_saved')),
  detail         text not null check (length(detail) between 1 and 2000)
);
create index if not exists comparison_publish_events_at on public.comparison_publish_events (at);
alter table public.comparison_publish_events enable row level security;
revoke all on public.comparison_publish_events from anon, authenticated;

alter table public.competitor_plans add column if not exists auto_verified_at timestamptz;
alter table public.competitor_feature_values add column if not exists auto_verified_at timestamptz;
alter table public.comparison_entries add column if not exists auto_verified_at timestamptz;
alter table public.competitor_check_findings add column if not exists auto_reviewed boolean not null default false;
alter table public.competitor_check_findings add column if not exists auto_reason text;
alter table public.competitors add column if not exists check_failures integer not null default 0;
alter table public.competitors add column if not exists check_urls_by text;
alter table public.competitors drop constraint if exists competitors_check_urls_by_check;
alter table public.competitors add constraint competitors_check_urls_by_check check (check_urls_by is null or check_urls_by in ('auto', 'admin'));

-- ── addendum C: apps leave absence-means-no ──
update public.comparison_features set absence_means_no = false where key in ('android', 'ipad');

-- ── one publish row per switched-on country (the UAE: auto-publish off, for good) ──
insert into public.comparison_publish (country_code, auto_publish)
select cs.country_code, cs.country_code <> 'AE' from public.country_settings cs where cs.enabled
on conflict (country_code) do nothing;

-- ── entries for every switched-on country except the UAE that has none (unverified; the four-cap chooses who shows) ──
-- A GUARD: exactly 108 entries in 34 countries (read 7 November 2026), or the whole file rolls back.
do $$
declare n integer;
begin
  insert into public.comparison_entries (country_code, competitor_id, primary_plan_id, sort_order)
  select x.country_code, x.competitor_id, x.plan_id, 100 + row_number() over (partition by x.country_code order by x.name)
    from (
      select distinct on (p.country_code, p.competitor_id) p.country_code, p.competitor_id, p.id as plan_id, c.name
        from public.competitor_plans p
        join public.competitors c on c.id = p.competitor_id and c.lifecycle = 'active'
        join public.country_settings cs on cs.country_code = p.country_code and cs.enabled
       where p.superseded_at is null and p.country_code <> 'AE'
         and not exists (select 1 from public.comparison_entries e2 where e2.country_code = p.country_code)
       order by p.country_code, p.competitor_id,
                (p.status = 'counted' and p.monthly_minor is not null and not p.price_hidden) desc, p.monthly_minor asc nulls last, p.plan_name asc
    ) x
  on conflict (country_code, competitor_id) do nothing;
  get diagnostics n = row_count;
  if n <> 108 then raise exception 'compare-autopublish-1: expected 108 new entries, the insert would add %', n; end if;
end $$;

commit;
