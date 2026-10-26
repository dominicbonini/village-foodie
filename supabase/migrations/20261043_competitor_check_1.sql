-- supabase/migrations/20261043_competitor_check_1.sql — competitor-check-1 (25 October 2026, docs/competitor-check-1-report.md):
-- the automatic competitor checker's data. ⛔ NOT RUN — Dominic runs it ("run now": the Pricing check tab reads every new
-- column tolerantly, and nothing calls the checker until the GitHub workflow is merged and ANTHROPIC_API_KEY is added).
--
-- 1 · competitors: lifecycle (active / candidate / closed / not_relevant), the pages the checker reads (check_urls), its
--     interval and schedule (check_interval_days, next_check_at, last_checked_at, deep_checked_at, check_requested_at), and
--     added_as_candidate — a candidate stays out of every count until its classification is accepted AND it is verified.
-- 2 · competitor_check_runs — one row per run: mode, trigger, counts, tokens, searches, fetches, cost, why it stopped.
-- 3 · competitor_check_findings — what the checker PROPOSES, one row per field: stored → found, the verbatim quote and its
--     English translation, the source, whether the quote was found in a page actually fetched, the second check, and the
--     review (pending / accepted / rejected). 🔴 The checker writes ONLY here, to the runs, and to the scheduling columns —
--     never to a plan, a price, a feature or a verification. Accepting is an admin's action in Pricing check.
-- 4 · competitor_check_settings — ONE row: paused, the daily and monthly caps, deep per day, the interval, the two models,
--     and the prices (per model per million tokens, and per web search) — prices are data, not code.
--
-- 🔴 SECURITY MIRRORS THE OTHER PRICING TABLES (20261039): RLS on, NO policies, every grant revoked from anon,
-- authenticated and public. Only the service role reads or writes (the admin API and the checker in GitHub Actions).

begin;

-- ── 1 · competitors ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.competitors
  add column if not exists lifecycle            text not null default 'active',
  add column if not exists added_as_candidate   boolean not null default false,
  add column if not exists check_urls           text[] not null default '{}',
  add column if not exists check_interval_days  integer not null default 90,
  add column if not exists next_check_at        date,
  add column if not exists last_checked_at      timestamptz,
  add column if not exists deep_checked_at      timestamptz,
  add column if not exists check_requested_at   timestamptz;
alter table public.competitors drop constraint if exists competitors_lifecycle_chk;
alter table public.competitors add constraint competitors_lifecycle_chk check (lifecycle in ('active', 'candidate', 'closed', 'not_relevant'));
alter table public.competitors drop constraint if exists competitors_check_interval_chk;
alter table public.competitors add constraint competitors_check_interval_chk check (check_interval_days between 7 and 365);
-- Every competitor starts with its website as the one page to read; the deep check proposes the pricing, features,
-- food-truck and terms pages as "new URL" findings.
update public.competitors set check_urls = array[btrim(website)]
  where cardinality(check_urls) = 0 and website ~* '^https?://[^ ]+\.[a-z]{2,}';
create index if not exists competitors_next_check_idx on public.competitors (next_check_at) where lifecycle = 'active';

-- ── 2 · runs ────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.competitor_check_runs (
  id                  uuid primary key default gen_random_uuid(),
  -- A scheduled day writes a 'deep' run (while a full deep check is requested) and then a 'routine' run.
  mode                text not null check (mode in ('deep', 'routine', 'single')),
  trigger             text not null check (trigger in ('schedule', 'manual')),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  competitors_checked integer not null default 0,
  input_tokens        bigint not null default 0,
  output_tokens       bigint not null default 0,
  web_searches        integer not null default 0,
  web_fetches         integer not null default 0,
  cost_usd            numeric(10, 4) not null default 0,
  stopped_reason      text check (stopped_reason in ('done', 'daily_cap', 'monthly_cap', 'paused', 'error')),
  notes               text
);
create index if not exists competitor_check_runs_started_idx on public.competitor_check_runs (started_at desc);

-- ── 3 · findings ────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.competitor_check_findings (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.competitor_check_runs (id) on delete cascade,
  competitor_id  uuid not null references public.competitors (id) on delete cascade,
  plan_id        uuid references public.competitor_plans (id) on delete set null,   -- null for competitor-level fields
  country_code   text check (country_code ~ '^[A-Z]{2}$'),
  field          text not null,
  stored_value   text,
  found_value    text,
  -- The typed value the checker found (amount, currency, period, vat, percent, tri, classification…), so an Accept can
  -- write it without parsing found_value's words.
  found          jsonb,
  quote          text,
  quote_en       text,
  source_url     text,
  outcome        text not null check (outcome in ('changed', 'unchanged', 'new_plan', 'plan_gone', 'new_url', 'classification', 'blocked', 'page_gone', 'not_stated')),
  quote_in_page  boolean not null default false,
  second_check   text not null default 'not_run' check (second_check in ('confirmed', 'disagreed', 'not_run')),
  second_value   text,
  second_quote   text,
  review_status  text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected')),
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists competitor_check_findings_review_idx on public.competitor_check_findings (review_status, created_at desc);
create index if not exists competitor_check_findings_competitor_idx on public.competitor_check_findings (competitor_id);

-- ── 4 · settings (one row) ──────────────────────────────────────────────────────────────────────────────────────────
-- Prices OBSERVED 25 October 2026 on https://platform.claude.com/docs/en/about-claude/pricing (USD per million tokens;
-- web search $10 per 1,000 = $0.01 each; web fetch has no charge beyond tokens).
create table if not exists public.competitor_check_settings (
  id                  boolean primary key default true check (id),
  paused              boolean not null default false,
  daily_cap_usd       numeric(8, 2) not null default 8 check (daily_cap_usd >= 0),
  monthly_cap_usd     numeric(8, 2) not null default 90 check (monthly_cap_usd >= 0),
  deep_per_day        integer not null default 15 check (deep_per_day between 0 and 200),
  check_interval_days integer not null default 90 check (check_interval_days between 7 and 365),
  deep_requested_at   timestamptz,
  extractor_model     text not null default 'claude-sonnet-5-5',
  verifier_model      text not null default 'claude-sonnet-5-5',
  prices              jsonb not null default '{
    "source": "https://platform.claude.com/docs/en/about-claude/pricing",
    "checked_on": "2026-10-25",
    "web_search_per_search": 0.01,
    "models": {
      "claude-sonnet-5-5": { "input_per_mtok": 2, "output_per_mtok": 10, "cache_write_per_mtok": 2.5, "cache_read_per_mtok": 0.1 },
      "claude-haiku-5-5":  { "input_per_mtok": 0.1, "output_per_mtok": 0.5, "cache_write_per_mtok": 0.125, "cache_read_per_mtok": 0.01 }
    }
  }'::jsonb,
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
insert into public.competitor_check_settings (id) values (true) on conflict (id) do nothing;

-- ── security ────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.competitor_check_runs     enable row level security;
alter table public.competitor_check_findings enable row level security;
alter table public.competitor_check_settings enable row level security;
revoke all on table public.competitor_check_runs     from anon, authenticated, public;
revoke all on table public.competitor_check_findings from anon, authenticated, public;
revoke all on table public.competitor_check_settings from anon, authenticated, public;
comment on table public.competitor_check_runs is 'competitor-check-1: one row per automatic check run. Service role only.';
comment on table public.competitor_check_findings is 'competitor-check-1: proposed changes, reviewed in Admin › Pricing check › Automatic checks. Service role only.';
comment on table public.competitor_check_settings is 'competitor-check-1: the checker''s one settings row (caps, models, prices as data). Service role only.';

commit;

-- Check:
--   select lifecycle, count(*), count(*) filter (where cardinality(check_urls) > 0) as with_urls from public.competitors group by 1;
--   select * from public.competitor_check_settings;
