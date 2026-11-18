-- 20261118_jp_price_1.sql — jp-price-1 (Dominic, 18 November 2026, docs/jp-price-1-report.md): Japan's Unlimited plan goes from
-- ¥2,980 to ¥3,980 a month, and its extra-van price with it (¥2,980 → ¥3,980). JPY is zero-decimal: minor units are whole yen.
-- Pro (¥1,980, ¥250,000 included) and Pay as you go are unchanged. No other country or plan changes.
-- Before running (read-only, 18 Nov 2026): no truck has country = 'JP', so no truck is on Japan's Unlimited and none has a
-- promotional price override.
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261118_jp_price_1.sql --approved-by-dominic
--
-- UNDO (only if Dominic asks):
--   update public.plan_prices set monthly_minor = 2980, extra_van_monthly_minor = 2980, updated_at = now()
--    where plan_key = 'unlimited' and country_code = 'JP';
set lock_timeout = '3s';
begin;

do $$
declare n integer;
begin
  update public.plan_prices
     set monthly_minor = 3980,
         extra_van_monthly_minor = 3980,
         updated_at = now()
   where plan_key = 'unlimited' and country_code = 'JP'
     and monthly_minor = 2980 and extra_van_monthly_minor = 2980;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'jp-price-1: expected to change exactly 1 row (JP unlimited at 2980), changed %', n;
  end if;
end $$;

commit;

-- VERIFY (read-only):
-- select plan_key, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor, offered, is_trial_end
--   from public.plan_prices where country_code = 'JP' order by plan_key;
--   → payg 0 / 0 / 99 / 0 · pro 1980 / 250000 / 99 / 1980 · unlimited 3980 / null / 0 / 3980
