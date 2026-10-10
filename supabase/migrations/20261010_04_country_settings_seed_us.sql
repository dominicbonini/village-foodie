-- 20261010_04_country_settings_seed_us.sql
-- Country settings, Part A, file 4 of 9: the US row, DISABLED, with its plan prices NOT DECIDED.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. ON CONFLICT DO NOTHING, so re-running is safe and never overwrites an edited row.
--
-- ✅ CLASSIFICATION: ADDITIVE. SAFE TO RUN NOW (after 20261010_02). enabled = false, so no truck can be
--    created in the US from this row; and the six plan price columns are NULL, which
--    country_settings_enabled_needs_prices_chk turns into a hard refusal to set enabled = true until they
--    are filled in.
--
-- Every value here is fixed by the Part A brief. The card fees are the figures supplied there, not read
-- from stripe.com — the same "currently" hedge the GB figures carry applies to these.
--
-- VERIFY AFTER APPLYING:
--   select * from public.country_settings where country_code = 'US';
--   -- and that it cannot be enabled yet (expect ERROR 23514, country_settings_enabled_needs_prices_chk):
--   --   begin; update public.country_settings set enabled = true where country_code = 'US'; rollback;

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
  'US', 'United States', false,
  'USD', 'en-US', '12h', 'mdy', 'sunday',
  '1', 'zip_state',
  array['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
        'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'],
  'America/New_York',
  false, 'Sales tax',
  true, 3.00, true, array['CT', 'MA', 'PR'],
  true, true, array[10, 15, 20]::numeric(5,2)[], 'us9',
  null, null, null,
  null, null, null,
  2.90, 30,
  2.70, 5,
  10, 'US cards',
  null, null, null,
  null, 'migration 20261010_04'
)
on conflict (country_code) do nothing;

commit;
