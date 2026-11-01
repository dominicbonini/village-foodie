-- supabase/migrations/20261055_world_countries_1_rows.sql — world-countries-1 BLOCK B (31 October 2026,
-- docs/world-countries-1-report.md §1–§2). ⛔ NOT RUN — Dominic runs it, AFTER block A (20261054) and after the code is deployed
-- (the deployed code is what reads the new currencies, address formats and allergen sets; a row it cannot read is left out of
-- every list and named on Admin › Countries, never a broken page).
-- Eight countries, every one SWITCHED OFF (enabled = false): each /<code> keeps redirecting to /uk, and the country is in no
-- router pick, hreflang set, sitemap, menu, /llms.txt or signup list until Dominic switches it on in Admin › Countries.
-- Rows before prices (plan_prices references country_settings).
--
-- Common to every row (each sourced in the report §2): km; phone check 'length' (each example is libphonenumber's own mobile
-- example, which the app's check accepts); NO card surcharge, NO service fee, tipping off (not customary at a food truck in any
-- of the eight); the allergen card on its own allowed; the platform fee switched off. Card fees: Stripe's standard domestic card
-- rate for each country (the pricing research, docs/pricing-research-1-report.md); the in-person figures copy the online ones
-- and Tap to Pay is 0 until Stripe Terminal / Tap to Pay availability is confirmed per country (report §2, flagged).
-- short_name is each country's own name, as it sits inside that language's sentences.
-- 🔴 platform_fee_allowed = false for BR, MX, MY, SG and TH: Stripe does not let a platform outside those countries collect an
-- application fee on their connected accounts. There, Pay as you go and Pro are kept as rows but NOT OFFERED (offered = false),
-- and Unlimited is the trial-end plan (is_trial_end = true): a finished trial drops to Unlimited, never to a plan that charges a fee.
-- 🔴 JPY IS ZERO-DECIMAL: its minor unit is ONE YEN, so ¥1,980 is 1980 (not 198000).
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
  platform_fee_enabled, fees_taxed, allergen_card_only_allowed, platform_fee_allowed
) values
  -- Brazil: BRL, pt-BR, prices include taxes (the truck sets its own rate, none by default), ANVISA list, cards 3.99% + R$0,39, NO platform fee (Stripe)
  ('BR', 'Brazil', false, 'BRL', 'pt-BR', '24h', 'dmy', 'sunday', '55', 'br', array['America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Maceio', 'America/Belem', 'America/Araguaina', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha'], 'America/Sao_Paulo', true, 'Tributos', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'br', null, null, null, null, null, null, 3.99, 39, 3.99, 39, 0, 'Brazilian cards', null, null, null, null, 'world-countries-1 draft', 'Brasil', '(11) 96123-4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- Mexico: MXN, es-MX, IVA 16 % included (data on the mx format), Codex list, cards 3.6% + MX$3, NO platform fee (Stripe)
  ('MX', 'Mexico', false, 'MXN', 'es-MX', '12h', 'dmy', 'sunday', '52', 'mx', array['America/Mexico_City', 'America/Cancun', 'America/Merida', 'America/Monterrey', 'America/Matamoros', 'America/Chihuahua', 'America/Ciudad_Juarez', 'America/Ojinaga', 'America/Mazatlan', 'America/Bahia_Banderas', 'America/Hermosillo', 'America/Tijuana'], 'America/Mexico_City', true, 'IVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.60, 300, 3.60, 300, 0, 'Mexican cards', null, null, null, null, 'world-countries-1 draft', 'México', '222 123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- Japan: JPY (zero-decimal: minor units are whole yen), ja-JP, 消費税 8 % included on takeaway (data on the jp format), the CAA list, cards 3.6%
  ('JP', 'Japan', false, 'JPY', 'ja-JP', '24h', 'dmy', 'sunday', '81', 'jp', array['Asia/Tokyo'], 'Asia/Tokyo', true, '消費税', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'jp', null, null, null, null, null, null, 3.60, 0, 3.60, 0, 0, 'Japanese cards', null, null, null, null, 'world-countries-1 draft', '日本', '090-1234-5678', 'length', 'km', 'truck', null, null, null, null, false, false, true, true),
  -- Singapore: SGD, en-SG, prices include GST (a registered truck sets 9 %; none by default), Codex list, cards 3.4% + S$0.50, NO platform fee (Stripe)
  ('SG', 'Singapore', false, 'SGD', 'en-SG', '12h', 'dmy', 'sunday', '65', 'sg', array['Asia/Singapore'], 'Asia/Singapore', true, 'GST', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.40, 50, 3.40, 50, 0, 'Singapore cards', null, null, null, null, 'world-countries-1 draft', 'Singapore', '8123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- Hong Kong: HKD, zh-HK, no sales tax, Codex list, cards 3.4% + HK$2.35
  ('HK', 'Hong Kong', false, 'HKD', 'zh-HK', '12h', 'dmy', 'sunday', '852', 'hk', array['Asia/Hong_Kong'], 'Asia/Hong_Kong', true, 'Tax', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.40, 235, 3.40, 235, 0, 'Hong Kong cards', null, null, null, null, 'world-countries-1 draft', '香港', '5123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, true),
  -- Malaysia: MYR, ms-MY, SST ADDED on top where a truck is registered (rate 0 until it sets one), Codex list, cards 3% + RM1, NO platform fee (Stripe)
  ('MY', 'Malaysia', false, 'MYR', 'ms-MY', '12h', 'dmy', 'monday', '60', 'my', array['Asia/Kuala_Lumpur', 'Asia/Kuching'], 'Asia/Kuala_Lumpur', false, 'SST', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.00, 100, 3.00, 100, 0, 'Malaysian cards', null, null, null, null, 'world-countries-1 draft', 'Malaysia', '012-345 6789', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- Thailand: THB, th-TH, prices include VAT (a registered truck sets 7 %; none by default), Codex list, cards 3.65% + ฿10, NO platform fee (Stripe)
  ('TH', 'Thailand', false, 'THB', 'th-TH', '24h', 'dmy', 'sunday', '66', 'th', array['Asia/Bangkok'], 'Asia/Bangkok', true, 'VAT', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.65, 1000, 3.65, 1000, 0, 'Thai cards', null, null, null, null, 'world-countries-1 draft', 'ประเทศไทย', '081 234 5678', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- United Arab Emirates: AED, ar-AE (right to left), prices include VAT (a registered truck sets 5 %; none by default), Codex list, cards 2.9% + AED 1 — stays off until Dominic decides
  ('AE', 'United Arab Emirates', false, 'AED', 'ar-AE', '12h', 'dmy', 'monday', '971', 'ae', array['Asia/Dubai'], 'Asia/Dubai', true, 'VAT', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 2.90, 100, 2.90, 100, 0, 'UAE cards', null, null, null, null, 'world-countries-1 draft', 'الإمارات', '050 123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, true);

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor, offered, is_trial_end) values
  ('payg', 'BR', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'BR', 5900, 800000, 99, 5900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'BR', 14900, null, 0, 14900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'MX', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'MX', 34900, 5000000, 99, 34900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'MX', 84900, null, 0, 84900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'JP', 0, 0, 99, 0, true, false),
  ('pro', 'JP', 1980, 250000, 99, 1980, true, false),
  ('unlimited', 'JP', 2980, null, 0, 2980, true, false),
  ('payg', 'SG', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'SG', 2900, 400000, 99, 2900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'SG', 5900, null, 0, 5900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'HK', 0, 0, 99, 0, true, false),
  ('pro', 'HK', 11900, 1500000, 99, 11900, true, false),
  ('unlimited', 'HK', 26900, null, 0, 26900, true, false),
  ('payg', 'MY', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'MY', 2900, 400000, 99, 2900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'MY', 6900, null, 0, 6900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'TH', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'TH', 19900, 2500000, 99, 19900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'TH', 44900, null, 0, 44900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'AE', 0, 0, 99, 0, true, false),
  ('pro', 'AE', 5900, 800000, 99, 5900, true, false),
  ('unlimited', 'AE', 14900, null, 0, 14900, true, false);

commit;

-- Check (read-only):
--   select country_code, enabled, currency, locale, short_name, allergen_set, platform_fee_allowed from public.country_settings
--    where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE') order by country_code;   -- 8 rows, all enabled = false
--   select country_code, plan_key, monthly_minor, included_online_minor, fee_bps, offered, is_trial_end from public.plan_prices
--    where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE') order by country_code, plan_key;   -- 24 rows
