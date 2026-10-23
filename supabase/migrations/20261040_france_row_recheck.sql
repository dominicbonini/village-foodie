-- admin-countries-1 (23 October 2026, docs/admin-countries-1-report.md §4) — FRANCE'S ROW, RE-CHECKED. ⚠️ NOT RUN when written.
-- RUN AFTER DEPLOY. It supersedes 20261034_france_row.sql (france-1 block B), which never ran; run THIS one, not both.
--
-- Re-checked read-only against the LIVE schema on 23 Oct 2026 (information_schema.columns and pg_constraint for
-- public.country_settings and public.plan_prices; public.plans):
--   · every column below exists, and no NOT NULL column without a default is missing (the columns added since france-1 —
--     short_name, phone_example, phone_check, distance_unit, the service-fee columns, platform_fee_enabled, fees_taxed,
--     allergen_card_only_allowed — were already in block B);
--   · every value passes the live CHECKs: address_format 'fr' is in country_settings_address_format_chk, EUR in the currency
--     CHECK, uk14, 24h, dmy, monday, phone '33', phone_check 'length', distance 'km', default zone in its zone list;
--   · plan_prices: one row for each ACTIVE PUBLIC plan (payg, pro, unlimited — the trigger
--     country_settings_require_plan_prices needs all three before France can be switched on), at IRELAND'S live euro prices
--     (payg 0 · 0 · 99 bps; pro 29,00 € · 4 000 € included · 99 bps; unlimited 69,00 € · 0 bps; extra van = the monthly price).
-- The only change from block B: both inserts are now safe to run twice (`on conflict do nothing`). No value changed.
-- France stays SWITCHED OFF (enabled = false): /fr keeps redirecting to /uk until it is switched on in Admin › Countries.
-- Rows before prices (plan_prices references country_settings).
begin;

insert into public.country_settings (
  country_code, name, enabled, currency, locale, time_format, date_order, week_start,
  phone_country_code, address_format, timezones, default_timezone,
  prices_include_tax, tax_label,
  card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only, card_surcharge_excluded_regions,
  service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set,
  starter_monthly_minor, pro_monthly_minor, max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct,
  card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor,
  tap_to_pay_fixed_minor, card_fee_region_label,
  competitor_name, competitor_pct, competitor_fixed_minor, support_hours, updated_by,
  short_name, phone_example, phone_check, distance_unit,
  service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
  service_fee_truck_max_bps, service_fee_truck_max_fixed_minor,
  platform_fee_enabled, fees_taxed, allergen_card_only_allowed
) values (
  'FR', 'France', false, 'EUR', 'fr-FR', '24h', 'dmy', 'monday',
  '33', 'fr', array['Europe/Paris'], 'Europe/Paris',
  true, 'TVA',
  -- ⛔ NO CARD SURCHARGE: Code monétaire et financier L. 112-12 forbids a fee for using any payment method (PSD2 art. 62(4)).
  false, null, false, '{}'::text[],
  -- ⛔ NO SERVICE FEE: the price shown must be the total the customer pays, every compulsory charge included (Code de la
  -- consommation L. 112-1; arrêté du 3 décembre 1987). Tipping OFF by default, with no preset choices.
  false, false, '{}'::numeric[], 'uk14',
  null, null, null, null, null, null,
  1.50, 25, 1.40, 10,
  10, 'EEA cards',
  null, null, null, null, 'admin-countries-1 (france-1 block B, re-checked)',
  'France', '06 12 34 56 78', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false, true   -- allergen card on its own allowed (R. 412-14)
)
on conflict (country_code) do nothing;

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'FR',    0,      0, 99,    0),
  ('pro',       'FR', 2900, 400000, 99, 2900),
  ('unlimited', 'FR', 6900,   null,  0, 6900)
on conflict do nothing;

commit;

-- Check: select country_code, enabled, short_name, currency, locale, address_format, allergen_set, allergen_card_only_allowed
--   from public.country_settings where country_code = 'FR';
--        select plan_key, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from public.plan_prices
--   where country_code = 'FR' order by plan_key;
