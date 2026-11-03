-- supabase/migrations/20261062_competitor_features_2.sql — competitor-features-2 (3 November 2026, docs/competitor-features-2-report.md):
-- a leaner, fairer competitor checker. The checker reads every part tolerantly, so it works before this runs (one interval, no
-- tiers, no "not mentioned").
--
-- 1 · comparison_features.tier — core / commercial / secondary / off; null = not tiered yet. Set by the automatic importer from
--     data/comparison-features/features.json (lib/data-import/features.ts), never typed here.
-- 2 · competitor_check_settings.tier_intervals — how often each tier is checked, in days: commercial 30, core 90, secondary 180
--     (off: never). Data, so Dominic can change it; nothing in code.
-- 3 · competitor_feature_values.value may be 'not_mentioned' — the competitor's own site does not mention it (a "no" needs a
--     verbatim quote in which the competitor says it does not offer it; "unknown" stays for pages that could not be read).
-- 4 · competitor_feature_checks — when the checker last ASKED about a feature for a competitor (per country; '' = every country):
--     a scheduling table, written only by the checker (35.an-3). A feature is due when its row is missing (a new feature: due at
--     once) or checked_on + its tier's interval has passed. `rejudge` marks an answer recorded before the "not mentioned" rule.
--     Seeded from the current answers that carry a checked date; every current "no" is marked rejudge, so it is judged again
--     under the new rule at its tier's next check. No existing row of any table is changed or deleted.

begin;

-- 1 · tiers
alter table public.comparison_features add column if not exists tier text;
alter table public.comparison_features drop constraint if exists comparison_features_tier_check;
alter table public.comparison_features add constraint comparison_features_tier_check
  check (tier is null or tier in ('core', 'commercial', 'secondary', 'off'));

-- 2 · intervals per tier
alter table public.competitor_check_settings
  add column if not exists tier_intervals jsonb not null default '{"commercial": 30, "core": 90, "secondary": 180}'::jsonb;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_tier_intervals_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_tier_intervals_chk
  check (jsonb_typeof(tier_intervals) = 'object');

-- 3 · "not mentioned"
alter table public.competitor_feature_values drop constraint if exists competitor_feature_values_value_check;
alter table public.competitor_feature_values add constraint competitor_feature_values_value_check
  check (value in ('yes', 'no', 'partial', 'unknown', 'not_mentioned'));

-- 4 · when each feature was last asked about
create table if not exists public.competitor_feature_checks (
  competitor_id uuid    not null references public.competitors(id) on delete cascade,
  feature_key   text    not null check (feature_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  country_code  text    not null default '' check (country_code = '' or country_code ~ '^[A-Z]{2}$'),
  checked_on    date    not null,
  rejudge       boolean not null default false,
  primary key (competitor_id, feature_key, country_code)
);
alter table public.competitor_feature_checks enable row level security;
revoke all on public.competitor_feature_checks from anon, authenticated, public;
grant all on public.competitor_feature_checks to service_role;

insert into public.competitor_feature_checks (competitor_id, feature_key, country_code, checked_on, rejudge)
select competitor_id, feature_key, coalesce(country_code, ''), checked_on, value = 'no'
from public.competitor_feature_values
where superseded_at is null and checked_on is not null
on conflict (competitor_id, feature_key, country_code) do nothing;

commit;
