-- france-1 (22 October 2026, docs/france-1-report.md §9) — BLOCK B, "RUN AFTER DEPLOY", after block A
-- (20261033_france_address_format.sql). ⚠️ NOT RUN when written.
-- France's country_settings row and its plan_prices, SWITCHED OFF (enabled = false): /fr keeps redirecting to /uk and France is
-- in no router pick, hreflang set, sitemap, menu, /llms.txt or signup list until it is switched on in Admin › Countries.
-- After the deploy because the deployed code is what reads locale fr-FR (the French language file), address format 'fr' and
-- its included TVA, the French allergen-guard words and the decimal-comma price boxes. Rows before prices (plan_prices
-- references country_settings).
--
-- Values (each sourced in the report):
--   currency EUR · locale fr-FR · 24-hour · dmy · week starts Monday · km · +33, example 06 12 34 56 78 · address format 'fr'
--   (code postal before the town; its default TVA, 10 %, is data on it) · prices INCLUDE tax, label TVA · allergen set uk14 (the
--   EU 14, named in French in messages/fr-FR.json) · allergen card on its own allowed (Code de la consommation R. 412-14; DGCCRF
--   accepts one table covering every dish) · card fees: stripe.com/fr/pricing — online 1.5 % + 0,25 € (standard EEA cards), in
--   person 1.4 % + 0,10 €, Tap to Pay + 0,10 € ("EEA cards", worded « cartes de l’EEE » in French).
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
  null, null, null, null, 'france-1 draft',
  'France', '06 12 34 56 78', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false, true   -- allergen card on its own allowed (R. 412-14: written, visible or freely accessible before ordering)
);

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'FR',    0,      0, 99,    0),
  ('pro',       'FR', 2900, 400000, 99, 2900),
  ('unlimited', 'FR', 6900,   null,  0, 6900);

commit;

-- Check: select country_code, enabled, currency, locale, address_format, allergen_set, allergen_card_only_allowed, service_fee_allowed,
--   tipping_enabled_default from public.country_settings where country_code = 'FR';
--        select plan_key, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from public.plan_prices where country_code = 'FR';
