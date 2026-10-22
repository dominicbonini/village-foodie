-- europe-settings (22 October 2026, docs/europe-settings-report.md §9) — BLOCK B, "RUN AFTER DEPLOY", after block A
-- (20261035_europe_address_formats.sql). ⚠️ NOT RUN when written.
-- Every remaining Stripe-supported European country (stripe.com/global), SWITCHED OFF (enabled = false): each /<code> keeps
-- redirecting to /uk and the country is in no router pick, hreflang set, sitemap, menu, /llms.txt or signup list until it is
-- switched on in Admin › Countries — and a country whose language is not built yet should stay off until it is.
-- After the deploy because the deployed code is what reads each address format (and its included VAT), en-MT and en-GI.
-- Rows before prices (plan_prices references country_settings).
--
-- Common to every row (each sourced in the report): 24-hour, day-month-year, weeks start Monday, km, phone check 'length'
-- (each example is libphonenumber's own mobile example, which the app's check accepts) · prices INCLUDE VAT — the takeaway
-- food rate is data on the country's address format (lib/address-formats.ts includedTax), the truck may set its own ·
-- allergen set uk14 (the EU 14; Switzerland's are the same 14) · NO CARD SURCHARGE (EU PSD2 art. 62(4); CH/NO: the price shown
-- must be the price paid) · NO SERVICE FEE: the advertised price must include every compulsory charge (Directive 98/6/EC art.
-- 2(a); Swiss PBV art. 3-4; Norway's prisopplysningsforskriften § 3) · tipping off, no presets (not customary for counter food).
-- Card fees: each country's stripe.com/<cc>/pricing page (online, in person, Tap to Pay per authorisation), in the currency's
-- minor units.
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
) values
  -- Austria: EUR, de-AT, USt. 10 % on takeaway food (data on the format), allergen card on its own allowed
  ('AT', 'Austria', false, 'EUR', 'de-AT', '24h', 'dmy', 'monday', '43', 'at', array['Europe/Vienna'], 'Europe/Vienna', true, 'USt.', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Austria', '0664 123456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Belgium: EUR, nl-BE, btw 6 % on takeaway food (data on the format), allergen card on its own allowed
  ('BE', 'Belgium', false, 'EUR', 'nl-BE', '24h', 'dmy', 'monday', '32', 'be', array['Europe/Brussels'], 'Europe/Brussels', true, 'btw', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Belgium', '0450 00 12 34', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Bulgaria: EUR, bg-BG, ДДС 20 % on takeaway food (data on the format), allergen card on its own allowed
  ('BG', 'Bulgaria', false, 'EUR', 'bg-BG', '24h', 'dmy', 'monday', '359', 'bg', array['Europe/Sofia'], 'Europe/Sofia', true, 'ДДС', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Bulgaria', '043 012 345', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Croatia: EUR, hr-HR, PDV 13 % on takeaway food (data on the format), allergen card on its own allowed
  ('HR', 'Croatia', false, 'EUR', 'hr-HR', '24h', 'dmy', 'monday', '385', 'hr', array['Europe/Zagreb'], 'Europe/Zagreb', true, 'PDV', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Croatia', '092 123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Cyprus: EUR, el-CY, ΦΠΑ 5 % on takeaway food (data on the format), allergen card on its own allowed
  ('CY', 'Cyprus', false, 'EUR', 'el-CY', '24h', 'dmy', 'monday', '357', 'cy', array['Asia/Nicosia'], 'Asia/Nicosia', true, 'ΦΠΑ', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Cyprus', '96 123456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Czech Republic: CZK, cs-CZ, DPH 12 % on takeaway food (data on the format), allergen card on its own allowed
  ('CZ', 'Czech Republic', false, 'CZK', 'cs-CZ', '24h', 'dmy', 'monday', '420', 'cz', array['Europe/Prague'], 'Europe/Prague', true, 'DPH', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 650, 1.40, 225, 220, 'EEA cards', null, null, null, null, 'europe-settings draft', 'the Czech Republic', '601 123 456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Denmark: DKK, da-DK, moms 25 % on takeaway food (data on the format), allergen card on its own allowed
  ('DK', 'Denmark', false, 'DKK', 'da-DK', '24h', 'dmy', 'monday', '45', 'dk', array['Europe/Copenhagen'], 'Europe/Copenhagen', true, 'moms', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 180, 1.40, 75, 70, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Denmark', '34 41 23 45', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Estonia: EUR, et-EE, km 24 % on takeaway food (data on the format), allergen card on its own allowed
  ('EE', 'Estonia', false, 'EUR', 'et-EE', '24h', 'dmy', 'monday', '372', 'ee', array['Europe/Tallinn'], 'Europe/Tallinn', true, 'km', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Estonia', '5123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Finland: EUR, fi-FI, ALV 13.5 % on takeaway food (data on the format), allergen card on its own allowed
  ('FI', 'Finland', false, 'EUR', 'fi-FI', '24h', 'dmy', 'monday', '358', 'fi', array['Europe/Helsinki'], 'Europe/Helsinki', true, 'ALV', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Finland', '041 2345678', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Germany: EUR, de-DE, MwSt. 7 % on takeaway food (data on the format), allergen card on its own allowed
  ('DE', 'Germany', false, 'EUR', 'de-DE', '24h', 'dmy', 'monday', '49', 'de', array['Europe/Berlin'], 'Europe/Berlin', true, 'MwSt.', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Germany', '01512 3456789', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Gibraltar: GBP, en-GI, no VAT, allergen card on its own allowed
  ('GI', 'Gibraltar', false, 'GBP', 'en-GI', '24h', 'dmy', 'monday', '350', 'gi', array['Europe/Gibraltar'], 'Europe/Gibraltar', true, 'Tax', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 20, 1.40, 10, 10, 'Gibraltar cards', null, null, null, null, 'europe-settings draft', 'Gibraltar', '57123456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Greece: EUR, el-GR, ΦΠΑ 13 % on takeaway food (data on the format), allergen card on its own allowed
  ('GR', 'Greece', false, 'EUR', 'el-GR', '24h', 'dmy', 'monday', '30', 'gr', array['Europe/Athens'], 'Europe/Athens', true, 'ΦΠΑ', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Greece', '691 234 5678', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Hungary: HUF, hu-HU, ÁFA 27 % on takeaway food (data on the format), allergen card on its own allowed
  ('HU', 'Hungary', false, 'HUF', 'hu-HU', '24h', 'dmy', 'monday', '36', 'hu', array['Europe/Budapest'], 'Europe/Budapest', true, 'ÁFA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 8500, 1.40, 2000, 4000, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Hungary', '06 20 123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Italy: EUR, it-IT, IVA 10 % on takeaway food (data on the format), allergen card on its own allowed
  ('IT', 'Italy', false, 'EUR', 'it-IT', '24h', 'dmy', 'monday', '39', 'it', array['Europe/Rome'], 'Europe/Rome', true, 'IVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Italy', '312 345 6789', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Latvia: EUR, lv-LV, PVN 21 % on takeaway food (data on the format), allergen card on its own NOT allowed (per-dish written information required)
  ('LV', 'Latvia', false, 'EUR', 'lv-LV', '24h', 'dmy', 'monday', '371', 'lv', array['Europe/Riga'], 'Europe/Riga', true, 'PVN', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Latvia', '21 234 567', 'length', 'km', 'truck', null, null, null, null, false, false, false),
  -- Liechtenstein: CHF, de-LI, MWST 2.6 % on takeaway food (data on the format), allergen card on its own allowed
  ('LI', 'Liechtenstein', false, 'CHF', 'de-LI', '24h', 'dmy', 'monday', '423', 'li', array['Europe/Vaduz'], 'Europe/Vaduz', true, 'MWST', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 30, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Liechtenstein', '660 234 567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Lithuania: EUR, lt-LT, PVM 21 % on takeaway food (data on the format), allergen card on its own allowed
  ('LT', 'Lithuania', false, 'EUR', 'lt-LT', '24h', 'dmy', 'monday', '370', 'lt', array['Europe/Vilnius'], 'Europe/Vilnius', true, 'PVM', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Lithuania', '0612 34567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Luxembourg: EUR, fr-LU, TVA 3 % on takeaway food (data on the format), allergen card on its own allowed
  ('LU', 'Luxembourg', false, 'EUR', 'fr-LU', '24h', 'dmy', 'monday', '352', 'lu', array['Europe/Luxembourg'], 'Europe/Luxembourg', true, 'TVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Luxembourg', '628 123 456', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Malta: EUR, en-MT, VAT 18 % on takeaway food (data on the format), allergen card on its own allowed
  ('MT', 'Malta', false, 'EUR', 'en-MT', '24h', 'dmy', 'monday', '356', 'mt', array['Europe/Malta'], 'Europe/Malta', true, 'VAT', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Malta', '9696 1234', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Netherlands: EUR, nl-NL, btw 9 % on takeaway food (data on the format), allergen card on its own allowed
  ('NL', 'Netherlands', false, 'EUR', 'nl-NL', '24h', 'dmy', 'monday', '31', 'nl', array['Europe/Amsterdam'], 'Europe/Amsterdam', true, 'btw', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'the Netherlands', '06 12345678', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Norway: NOK, nb-NO, MVA 15 % on takeaway food (data on the format), allergen card on its own allowed
  ('NO', 'Norway', false, 'NOK', 'nb-NO', '24h', 'dmy', 'monday', '47', 'no', array['Europe/Oslo'], 'Europe/Oslo', true, 'MVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 2.40, 200, 1.40, 100, 105, 'Norwegian and EEA cards', null, null, null, null, 'europe-settings draft', 'Norway', '40 61 23 45', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Poland: PLN, pl-PL, VAT 8 % on takeaway food (data on the format), allergen card on its own NOT allowed (per-dish written information required)
  ('PL', 'Poland', false, 'PLN', 'pl-PL', '24h', 'dmy', 'monday', '48', 'pl', array['Europe/Warsaw'], 'Europe/Warsaw', true, 'VAT', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 100, 1.40, 0, 40, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Poland', '512 345 678', 'length', 'km', 'truck', null, null, null, null, false, false, false),
  -- Portugal: EUR, pt-PT, IVA 13 % on takeaway food (data on the format), allergen card on its own allowed
  ('PT', 'Portugal', false, 'EUR', 'pt-PT', '24h', 'dmy', 'monday', '351', 'pt', array['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'], 'Europe/Lisbon', true, 'IVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Portugal', '912 345 678', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Romania: RON, ro-RO, TVA 11 % on takeaway food (data on the format), allergen card on its own NOT allowed (per-dish written information required)
  ('RO', 'Romania', false, 'RON', 'ro-RO', '24h', 'dmy', 'monday', '40', 'ro', array['Europe/Bucharest'], 'Europe/Bucharest', true, 'TVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 100, 1.40, 25, 50, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Romania', '0712 034 567', 'length', 'km', 'truck', null, null, null, null, false, false, false),
  -- Slovakia: EUR, sk-SK, DPH 19 % on takeaway food (data on the format), allergen card on its own NOT allowed (per-dish written information required)
  ('SK', 'Slovakia', false, 'EUR', 'sk-SK', '24h', 'dmy', 'monday', '421', 'sk', array['Europe/Bratislava'], 'Europe/Bratislava', true, 'DPH', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Slovakia', '0912 123 456', 'length', 'km', 'truck', null, null, null, null, false, false, false),
  -- Slovenia: EUR, sl-SI, DDV 9.5 % on takeaway food (data on the format), allergen card on its own allowed
  ('SI', 'Slovenia', false, 'EUR', 'sl-SI', '24h', 'dmy', 'monday', '386', 'si', array['Europe/Ljubljana'], 'Europe/Ljubljana', true, 'DDV', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Slovenia', '031 234 567', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Spain: EUR, es-ES, IVA 10 % on takeaway food (data on the format), allergen card on its own allowed
  ('ES', 'Spain', false, 'EUR', 'es-ES', '24h', 'dmy', 'monday', '34', 'es', array['Europe/Madrid', 'Atlantic/Canary'], 'Europe/Madrid', true, 'IVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 25, 1.40, 10, 10, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Spain', '612 34 56 78', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Sweden: SEK, sv-SE, moms 6 % on takeaway food (data on the format), allergen card on its own allowed
  ('SE', 'Sweden', false, 'SEK', 'sv-SE', '24h', 'dmy', 'monday', '46', 'se', array['Europe/Stockholm'], 'Europe/Stockholm', true, 'moms', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 1.50, 180, 1.40, 100, 105, 'EEA cards', null, null, null, null, 'europe-settings draft', 'Sweden', '070-123 45 67', 'length', 'km', 'truck', null, null, null, null, false, false, true),
  -- Switzerland: CHF, de-CH, MWST 2.6 % on takeaway food (data on the format), allergen card on its own allowed
  ('CH', 'Switzerland', false, 'CHF', 'de-CH', '24h', 'dmy', 'monday', '41', 'ch', array['Europe/Zurich'], 'Europe/Zurich', true, 'MWST', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'uk14', null, null, null, null, null, null, 2.90, 30, 2.90, 10, 10, 'Swiss cards', null, null, null, null, 'europe-settings draft', 'Switzerland', '078 123 45 67', 'length', 'km', 'truck', null, null, null, null, false, false, true);

-- Plans: euro countries at €29 / €69, Pro including €4,000 of online orders (the brief). Every other currency: the PROPOSED
-- local prices (ECB reference rates of 22 October 2026), ⚠️ AWAITING DOMINIC'S APPROVAL — change the numbers here before running
-- if he picks others. Extra van = the plan's price.
insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg', 'AT', 0, 0, 99, 0),
  ('pro', 'AT', 2900, 400000, 99, 2900),
  ('unlimited', 'AT', 6900, null, 0, 6900),
  ('payg', 'BE', 0, 0, 99, 0),
  ('pro', 'BE', 2900, 400000, 99, 2900),
  ('unlimited', 'BE', 6900, null, 0, 6900),
  ('payg', 'BG', 0, 0, 99, 0),
  ('pro', 'BG', 2900, 400000, 99, 2900),
  ('unlimited', 'BG', 6900, null, 0, 6900),
  ('payg', 'HR', 0, 0, 99, 0),
  ('pro', 'HR', 2900, 400000, 99, 2900),
  ('unlimited', 'HR', 6900, null, 0, 6900),
  ('payg', 'CY', 0, 0, 99, 0),
  ('pro', 'CY', 2900, 400000, 99, 2900),
  ('unlimited', 'CY', 6900, null, 0, 6900),
  ('payg', 'CZ', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'CZ', 69900, 10000000, 99, 69900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'CZ', 169000, null, 0, 169000),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'DK', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'DK', 21900, 3000000, 99, 21900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'DK', 51900, null, 0, 51900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'EE', 0, 0, 99, 0),
  ('pro', 'EE', 2900, 400000, 99, 2900),
  ('unlimited', 'EE', 6900, null, 0, 6900),
  ('payg', 'FI', 0, 0, 99, 0),
  ('pro', 'FI', 2900, 400000, 99, 2900),
  ('unlimited', 'FI', 6900, null, 0, 6900),
  ('payg', 'DE', 0, 0, 99, 0),
  ('pro', 'DE', 2900, 400000, 99, 2900),
  ('unlimited', 'DE', 6900, null, 0, 6900),
  ('payg', 'GI', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'GI', 2900, 400000, 99, 2900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'GI', 6900, null, 0, 6900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'GR', 0, 0, 99, 0),
  ('pro', 'GR', 2900, 400000, 99, 2900),
  ('unlimited', 'GR', 6900, null, 0, 6900),
  ('payg', 'HU', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'HU', 1099000, 150000000, 99, 1099000),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'HU', 2499000, null, 0, 2499000),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'IT', 0, 0, 99, 0),
  ('pro', 'IT', 2900, 400000, 99, 2900),
  ('unlimited', 'IT', 6900, null, 0, 6900),
  ('payg', 'LV', 0, 0, 99, 0),
  ('pro', 'LV', 2900, 400000, 99, 2900),
  ('unlimited', 'LV', 6900, null, 0, 6900),
  ('payg', 'LI', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'LI', 2700, 370000, 99, 2700),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'LI', 6500, null, 0, 6500),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'LT', 0, 0, 99, 0),
  ('pro', 'LT', 2900, 400000, 99, 2900),
  ('unlimited', 'LT', 6900, null, 0, 6900),
  ('payg', 'LU', 0, 0, 99, 0),
  ('pro', 'LU', 2900, 400000, 99, 2900),
  ('unlimited', 'LU', 6900, null, 0, 6900),
  ('payg', 'MT', 0, 0, 99, 0),
  ('pro', 'MT', 2900, 400000, 99, 2900),
  ('unlimited', 'MT', 6900, null, 0, 6900),
  ('payg', 'NL', 0, 0, 99, 0),
  ('pro', 'NL', 2900, 400000, 99, 2900),
  ('unlimited', 'NL', 6900, null, 0, 6900),
  ('payg', 'NO', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'NO', 29900, 4200000, 99, 29900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'NO', 72900, null, 0, 72900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'PL', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'PL', 12900, 1750000, 99, 12900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'PL', 29900, null, 0, 29900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'PT', 0, 0, 99, 0),
  ('pro', 'PT', 2900, 400000, 99, 2900),
  ('unlimited', 'PT', 6900, null, 0, 6900),
  ('payg', 'RO', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'RO', 14900, 2150000, 99, 14900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'RO', 36900, null, 0, 36900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'SK', 0, 0, 99, 0),
  ('pro', 'SK', 2900, 400000, 99, 2900),
  ('unlimited', 'SK', 6900, null, 0, 6900),
  ('payg', 'SI', 0, 0, 99, 0),
  ('pro', 'SI', 2900, 400000, 99, 2900),
  ('unlimited', 'SI', 6900, null, 0, 6900),
  ('payg', 'ES', 0, 0, 99, 0),
  ('pro', 'ES', 2900, 400000, 99, 2900),
  ('unlimited', 'ES', 6900, null, 0, 6900),
  ('payg', 'SE', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'SE', 32900, 4500000, 99, 32900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'SE', 76900, null, 0, 76900),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('payg', 'CH', 0, 0, 99, 0),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('pro', 'CH', 2700, 370000, 99, 2700),   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)
  ('unlimited', 'CH', 6500, null, 0, 6500);   -- ⚠️ AWAITING DOMINIC'S APPROVAL (§8)

commit;

-- Check: select country_code, enabled, currency, locale, address_format, allergen_card_only_allowed from public.country_settings
--   where updated_by = 'europe-settings draft' order by country_code;
--        select country_code, count(*) from public.plan_prices where country_code in ('AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'DE', 'GI', 'GR', 'HU', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH') group by 1 order by 1;
