-- 20261143_checker_cadence_1.sql — checker-cadence-1 Part 1a (Dominic, 26 November 2026; docs/foodtruck-audit-1-report.md).
-- The Competitor check's settings: prices (commercial) every 90 days, core features every 180 (6 months), secondary every 365;
-- check_interval_days 90; caps $3 a day and $50 a month (Dominic's budget: $50 of the $100 monthly API limit). Nothing else changes.
-- Database only, inert while the workflow is disabled. ONE row of public.competitor_check_settings.
-- Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight-checker (rolled back).
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_check_settings where id;
  if n <> 1 then raise exception 'checker-cadence-1: expected the one settings row, found %', n; end if;
end $$;

update public.competitor_check_settings
   set tier_intervals = jsonb_build_object('commercial', 90, 'core', 180, 'secondary', 365),
       check_interval_days = 90,
       daily_cap_usd = 3,
       monthly_cap_usd = 50
 where id;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_check_settings
   where id and tier_intervals = jsonb_build_object('commercial', 90, 'core', 180, 'secondary', 365)
     and check_interval_days = 90 and daily_cap_usd = 3 and monthly_cap_usd = 50;
  if n <> 1 then raise exception 'checker-cadence-1: the settings were not all written'; end if;
end $$;

commit;
