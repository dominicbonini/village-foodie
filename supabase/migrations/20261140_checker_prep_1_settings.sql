-- 20261140_checker_prep_1_settings.sql — checker-prep-1 Part 2a (Dominic said yes, 25 November 2026; docs/checker-prep-1-report.md,
-- docs/compare-research-6-report.md §6.4). The Competitor check's settings for "prices every 90 days; features every 365; presence never
-- re-asked (Admin only); deep queue off". Database only, inert while the workflow is disabled. ONE row of public.competitor_check_settings;
-- no other setting changes. Guarded; pre-flighted with scripts/compare-db-proofs.cjs --preflight-checker (rolled back).
--   · check_interval_days 90; tier_intervals commercial 90, core 365, secondary 365;
--   · the deep queue off: deep_requested_at null, deep_country null, deep_per_day 0 (presence comes from the country deep checks);
--   · the quick pass off: pass_requested_at null;
--   · semi-deep closed: status 'done' (lib/competitor-check/semi-deep.ts acts only on status 'waiting'; nothing else reads it);
--   · caps: daily $3, monthly $90.
begin;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_check_settings where id;
  if n <> 1 then raise exception 'checker-prep-1: expected the one settings row, found %', n; end if;
end $$;

update public.competitor_check_settings
   set check_interval_days = 90,
       tier_intervals = jsonb_build_object('commercial', 90, 'core', 365, 'secondary', 365),
       deep_requested_at = null,
       deep_country = null,
       deep_per_day = 0,
       pass_requested_at = null,
       semi_deep = coalesce(semi_deep, '{}'::jsonb) || jsonb_build_object('status', 'done', 'closed_at', '2026-11-25', 'closed_by', 'checker-prep-1 (Dominic, 25 Nov)'),
       daily_cap_usd = 3,
       monthly_cap_usd = 90
 where id;

do $$
declare n int;
begin
  select count(*) into n from public.competitor_check_settings
   where id and check_interval_days = 90 and tier_intervals = jsonb_build_object('commercial', 90, 'core', 365, 'secondary', 365)
     and deep_requested_at is null and deep_country is null and deep_per_day = 0 and pass_requested_at is null
     and semi_deep->>'status' = 'done' and daily_cap_usd = 3 and monthly_cap_usd = 90;
  if n <> 1 then raise exception 'checker-prep-1: the settings were not all written'; end if;
end $$;

commit;
