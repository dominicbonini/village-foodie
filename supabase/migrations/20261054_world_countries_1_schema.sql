-- supabase/migrations/20261054_world_countries_1_schema.sql — world-countries-1 BLOCK A (31 October 2026,
-- docs/world-countries-1-report.md §1–§2). ⛔ NOT RUN — Dominic runs it. Run it BEFORE block B (20261055).
-- The code reads every part tolerantly, so it may deploy before this runs: without the new columns every country reads as
-- "platform fee allowed", every price row as "offered" and none as a trial end — exactly today's behaviour.
--
-- 1 · country_settings_currency_chk — the registry's 22 codes (lib/currencies.ts): + BRL MXN JPY SGD HKD MYR AED THB.
-- 2 · country_settings_address_format_chk — + br mx jp sg hk my th ae (lib/address-formats.ts WORLD_ROWS).
-- 3 · country_settings_allergen_set_chk — + jp (Japan's CAA list), br (ANVISA RDC 26/2015 + lactose), codex (the Codex list).
-- 4 · country_settings.platform_fee_allowed — may HatchGrab take a platform (application) fee in this country at all? Default
--     true (every existing row). False for BR MX MY SG TH (block B): Stripe does not let a platform outside those countries
--     collect an application fee on their connected accounts. The CHECK refuses platform_fee_enabled without it, so the fee can
--     never be switched on there by mistake.
-- 5 · plan_prices.offered — a price row may exist and be SWITCHED OFF: its prices are kept, but no page offers the plan. Default
--     true (every existing row). The switch-on triggers are unchanged (they ask for a ROW per public plan, offered or not).
-- 6 · plan_prices.is_trial_end — the plan a truck in that country drops to when its trial (or any plan) ends; at most one per
--     country, and only an offered row. No flagged row = the plans table's expiry fallback (Pay as you go), as today.
-- 7 · plan_prices_world_guard (a trigger on country_settings and plan_prices) refuses:
--     a) an OFFERED row that charges a fee (fee_bps > 0) in a country where platform_fee_allowed is false;
--     b) a SWITCHED-ON country whose trial-end plan (its flagged row's, else the expiry fallback) is not offered there.

begin;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.country_settings drop constraint if exists country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON',
                      'BRL', 'MXN', 'JPY', 'SGD', 'HKD', 'MYR', 'AED', 'THB'));

-- 2 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.country_settings drop constraint if exists country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr', 'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'de', 'gi',
                            'gr', 'hu', 'it', 'lv', 'li', 'lt', 'lu', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'ch',
                            'br', 'mx', 'jp', 'sg', 'hk', 'my', 'th', 'ae'));

-- 3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.country_settings drop constraint if exists country_settings_allergen_set_chk;
alter table public.country_settings add constraint country_settings_allergen_set_chk
  check (allergen_set in ('uk14', 'us9', 'anz', 'ca', 'jp', 'br', 'codex'));

-- 4 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.country_settings add column if not exists platform_fee_allowed boolean not null default true;
comment on column public.country_settings.platform_fee_allowed is
  'world-countries-1: may HatchGrab take a platform (application) fee here? false where Stripe forbids it (BR MX MY SG TH). Overrides platform_fee_enabled (lib/country-settings-types.ts platformFeeOn).';
alter table public.country_settings drop constraint if exists country_settings_platform_fee_allowed_chk;
alter table public.country_settings add constraint country_settings_platform_fee_allowed_chk
  check (platform_fee_allowed or not platform_fee_enabled);

-- 5, 6 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.plan_prices add column if not exists offered boolean not null default true;
alter table public.plan_prices add column if not exists is_trial_end boolean not null default false;
comment on column public.plan_prices.offered is
  'world-countries-1: false = the row is kept but the plan is not offered in this country (no page, prompt or choice shows it).';
comment on column public.plan_prices.is_trial_end is
  'world-countries-1: the plan a truck in this country drops to when its plan ends (at most one per country). None = plans.is_expiry_fallback.';
alter table public.plan_prices drop constraint if exists plan_prices_trial_end_offered_chk;
alter table public.plan_prices add constraint plan_prices_trial_end_offered_chk check (offered or not is_trial_end);
create unique index if not exists plan_prices_one_trial_end_per_country on public.plan_prices (country_code) where is_trial_end;

-- 7 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.plan_prices_world_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare bad text;
begin
  -- a) an offered row that charges a fee where HatchGrab may not take one
  select string_agg(pp.country_code || ' (' || pp.plan_key || ')', ', ' order by pp.country_code, pp.plan_key) into bad
    from public.plan_prices pp join public.country_settings cs on cs.country_code = pp.country_code
   where pp.offered and pp.fee_bps > 0 and not cs.platform_fee_allowed;
  if bad is not null then
    raise exception 'plan_prices: these offered plans charge a platform fee where HatchGrab may not take one: %', bad
      using errcode = 'check_violation';
  end if;
  -- b) a switched-on country whose trial-end plan is not offered there
  select string_agg(cs.country_code, ', ' order by cs.country_code) into bad
    from public.country_settings cs
   where cs.enabled
     and not exists (
       select 1 from public.plan_prices pp
        where pp.country_code = cs.country_code and pp.offered
          and pp.plan_key = coalesce(
                (select t.plan_key from public.plan_prices t where t.country_code = cs.country_code and t.is_trial_end),
                (select p.key from public.plans p where p.is_expiry_fallback)));
  if bad is not null then
    raise exception 'country_settings: the plan a finished trial drops to is not offered in: %', bad
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- A trigger function, never called directly: revoked from every client role (the project's rule for every function create).
revoke all on function public.plan_prices_world_guard() from public, anon, authenticated;

drop trigger if exists country_settings_world_guard on public.country_settings;
create trigger country_settings_world_guard after insert or update on public.country_settings
  for each statement execute function public.plan_prices_world_guard();
drop trigger if exists plan_prices_world_guard on public.plan_prices;
create trigger plan_prices_world_guard after insert or update or delete on public.plan_prices
  for each statement execute function public.plan_prices_world_guard();

commit;

-- Check (read-only):
--   select pg_get_constraintdef(oid) from pg_constraint where conname in ('country_settings_currency_chk',
--     'country_settings_address_format_chk', 'country_settings_allergen_set_chk', 'country_settings_platform_fee_allowed_chk',
--     'plan_prices_trial_end_offered_chk');
--   select count(*) filter (where platform_fee_allowed) as allowed, count(*) as rows from public.country_settings;   -- 36 / 36
--   select count(*) filter (where offered) as offered, count(*) filter (where is_trial_end) as trial_end from public.plan_prices;
--   select tgname from pg_trigger where tgname in ('country_settings_world_guard', 'plan_prices_world_guard');
