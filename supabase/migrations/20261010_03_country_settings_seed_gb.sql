-- 20261010_03_country_settings_seed_gb.sql
-- Country settings, Part A, file 3 of 9: the GB row, ENABLED, every value taken from today's code.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. ON CONFLICT DO NOTHING, so re-running is safe — and so is running it after an admin has
--    edited the row: an existing GB row is never overwritten by this file.
--
-- ✅ CLASSIFICATION: ADDITIVE. SAFE TO RUN NOW (after 20261010_02). Nothing reads the row until Part B.
--
-- ── WHERE EVERY NUMBER CAME FROM (HEAD f4bd277) ─────────────────────────────────────────────────────
--   starter_monthly_minor        0       lib/features.ts           PLAN_MONTHLY_PENCE.starter
--   pro_monthly_minor         2900       lib/features.ts           PLAN_MONTHLY_PENCE.pro
--   max_monthly_minor         4900       lib/features.ts           PLAN_MONTHLY_PENCE.max
--   pro_allowance_minor     150000       lib/plan-features.ts      PLAN_ONLINE_ALLOWANCE.pro.pence
--   max_allowance_minor     200000       lib/plan-features.ts      PLAN_ONLINE_ALLOWANCE.max.pence
--   platform_fee_pct          0.99       lib/plan-features.ts      PLATFORM_FEE_OVER_ALLOWANCE.pct
--   card_fee_online_pct       1.50       lib/plan-features.ts      CARD_FEES.online.pct
--   card_fee_online_fixed_minor 20       lib/plan-features.ts      CARD_FEES.online.pence
--   card_fee_in_person_pct    1.40       lib/plan-features.ts      CARD_FEES.inPerson.pct
--   card_fee_in_person_fixed_minor 10    lib/plan-features.ts      CARD_FEES.inPerson.pence
--   tap_to_pay_fixed_minor      10       lib/plan-features.ts      CARD_FEES.tapToPaySurchargePence
--   card_fee_region_label  'UK cards'    DECISION, 10 Oct 2026 — the code says "standard UK cards"
--                                        (online) and "UK and EEA cards" (in person); Dominic chose one
--                                        label, 'UK cards', for both
--   competitor_name     'Hatches Up'     app/compare/CostComparison.tsx (the prefill comment; manual §21)
--   competitor_pct            4.50       app/compare/CostComparison.tsx  useState('4.5')  (feePctRaw)
--   competitor_fixed_minor      20       app/compare/CostComparison.tsx  useState('20')   (feePenceRaw)
-- Every other value is fixed by the Part A brief.
--
-- VERIFY AFTER APPLYING:
--   select * from public.country_settings where country_code = 'GB';

set lock_timeout = '3s';

begin;

insert into public.country_settings (
  country_code, name, enabled,
  currency, locale, time_format, date_order, week_start,
  phone_country_code, address_format, timezones, default_timezone,
  prices_include_tax, tax_label,
  card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only, card_surcharge_excluded_regions,
  service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set,
  starter_monthly_minor, pro_monthly_minor, max_monthly_minor,
  pro_allowance_minor, max_allowance_minor, platform_fee_pct,
  card_fee_online_pct, card_fee_online_fixed_minor,
  card_fee_in_person_pct, card_fee_in_person_fixed_minor,
  tap_to_pay_fixed_minor, card_fee_region_label,
  competitor_name, competitor_pct, competitor_fixed_minor,
  support_hours, updated_by
) values (
  'GB', 'United Kingdom', true,
  'GBP', 'en-GB', '24h', 'dmy', 'monday',
  '44', 'postcode', array['Europe/London'], 'Europe/London',
  true, 'VAT',
  false, null, false, '{}'::text[],
  false, false, '{}'::numeric(5,2)[], 'uk14',
  0, 2900, 4900,
  150000, 200000, 0.99,
  1.50, 20,
  1.40, 10,
  10, 'UK cards',
  'Hatches Up', 4.50, 20,
  null, 'migration 20261010_03'
)
on conflict (country_code) do nothing;

commit;
