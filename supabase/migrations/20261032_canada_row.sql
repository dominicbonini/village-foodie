-- canada-1 (22 October 2026, docs/canada-1-report.md §8) — BLOCK B, "RUN AFTER DEPLOY", after block A
-- (20261031_canada_allergen_set.sql). ⚠️ NOT RUN when written.
-- Canada's country_settings row and its plan_prices, SWITCHED OFF (enabled = false): /ca keeps redirecting to /uk and Canada is in
-- no router pick, hreflang set, sitemap, menu, /llms.txt or signup list until it is switched on in Admin › Countries.
-- After the deploy because the deployed code is what reads allergen_set 'ca', address format 'ca' regions with their sales tax,
-- Quebec's closed signups and the en-CA locale. (Before it, the live loader would leave the row out of every list — no harm, but
-- nothing to gain.) Rows before prices (plan_prices references country_settings).
--
-- Values (each sourced in the report):
--   currency CAD · locale en-CA · 12-hour · date order mdy (written dates month-first, as the Canada.ca Content Style Guide writes
--   them: "July 31, 2016"; the all-numeric yyyy-mm-dd form has no date_order value — the CHECK allows dmy / mdy only) · week starts
--   Sunday · km · +1, example 416-555-0123 (NANPA's reserved fictional 555-01xx) · address format 'ca' (city, province, postal code;
--   each province's sales tax and Quebec's closed signups are data on it, lib/address-formats.ts) · prices EXCLUDE tax, as the US:
--   the tax line's name and default rate come from the truck's province; 'Sales tax' is the name only when the province is unknown.
--   Card fees: stripe.com/en-ca/pricing — online 2.9% + CA$0.30, in person 2.7% + CA$0.05, Tap to Pay + CA$0.15 ("Canadian cards").
--   Time zones: the current tzdb (2026e) Canadian zones, Toronto first; America/Yellowknife is only an alias of Edmonton now.
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
  'CA', 'Canada', false, 'CAD', 'en-CA', '12h', 'mdy', 'sunday',
  '1', 'ca',
  array['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Regina', 'America/Halifax',
        'America/St_Johns', 'America/Moncton', 'America/Whitehorse', 'America/Iqaluit'],
  'America/Toronto',
  false, 'Sales tax',
  -- Card surcharges OFF for now. Later: Visa / Mastercard allow surcharging CREDIT cards only, capped at the lesser of 2.4% and
  -- the merchant's own cost, never debit or prepaid; Quebec prohibits card fees outright (Consumer Protection Act).
  false, null, false, '{}'::text[],
  -- ⛔ SERVICE FEE OFF — DO NOT SWITCH ON WITHOUT LEGAL ADVICE (Dominic, 22 October 2026). Competition Act s. 74.01(1.1): "the
  -- making of a representation of a price that is not attainable due to fixed obligatory charges or fees constitutes a false or
  -- misleading representation", unless the charge is imposed by law (taxes). A service fee added to every online order at checkout
  -- is such a fee: in Canada it would have to be inside the menu price (drip pricing). The US row allows it; Canada does not.
  false,
  -- Tipping ON, with the US row's choices (10 / 15 / 20 %): an optional tip the customer chooses is not an obligatory fee.
  true, array[10, 15, 20]::numeric[], 'ca',
  null, null, null, null, null, null,
  2.90, 30, 2.70, 5,
  15, 'Canadian cards',
  null, null, null, null, 'canada-1 draft',
  'Canada', '416-555-0123', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false, true   -- allergen card on its own allowed: Canada's allergen labelling rules are for PREPACKAGED food (FDR B.01.010.1)
);

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'CA',    0,      0, 99,    0),
  ('pro',       'CA', 3900, 550000, 99, 3900),
  ('unlimited', 'CA', 9900,   null,  0, 9900);

commit;

-- Check: select country_code, enabled, currency, locale, date_order, allergen_set, service_fee_allowed, tipping_enabled_default from
--   public.country_settings where country_code = 'CA';
--        select plan_key, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from public.plan_prices where country_code = 'CA';
