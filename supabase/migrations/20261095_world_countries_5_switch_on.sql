-- supabase/migrations/20261095_world_countries_5_switch_on.sql — world-countries-5 BLOCK C (12 November 2026, docs/world-countries-5-report.md).
-- ⛔ NOT RUN. Dominic asks for it AFTER the code is deployed. It needs --approved-by-dominic (it UPDATEs country_settings).
-- 1 · switches ON the 167 new countries (enabled = true) — each then has its /<code> page, its place in the sitemap, hreflang, the
--     country selector (under its region) and signup;
-- 2 · switches OFF Mexico (no truck has ever been in MX — checked 12 Nov 2026, report §2);
-- 3 · sets vat_number_required on the two LIVE countries the list marks (AE, BR) — the 39 new ones already have it from block B.
-- 4 · (Dominic, 12 Nov) ios_app_available ON for the 56 new countries that had it off — the app is now in EVERY App Store storefront, and
--     where a country has no storefront of its own people use an Apple ID from another and the badge opens their own store.
-- 5 · (Dominic, 12 Nov) Iceland's week starts on Monday (block B took Intl's Sunday).
-- 6 · (Dominic, 12 Nov: "yes, turn it on for the 17 with no Google Play storefront (same reasoning as iOS)") android_app_available ON
--     for the 17 new countries that had it off.
begin;

update public.country_settings set enabled = true, updated_at = now(), updated_by = 'world-countries-5 switch-on'
 where country_code in ('AL', 'AD', 'AM', 'AZ', 'BA', 'FO', 'GE', 'GL', 'GG', 'VA', 'IS', 'IM', 'JE', 'MD', 'MC', 'ME', 'MK', 'SM', 'RS', 'SJ', 'TR', 'UA', 'AX', 'AI', 'AG', 'AR', 'AW', 'BS', 'BZ', 'BM', 'BO', 'BQ', 'KY', 'CL', 'CO', 'CR', 'CW', 'DM', 'DO', 'EC', 'SV', 'FK', 'GF', 'GD', 'GP', 'GT', 'GY', 'HN', 'JM', 'MQ', 'MS', 'NI', 'PA', 'PY', 'PE', 'PR', 'BL', 'KN', 'LC', 'MF', 'PM', 'VC', 'SX', 'SR', 'TT', 'TC', 'UY', 'VG', 'VI', 'AS', 'BD', 'BT', 'BN', 'KH', 'CX', 'CC', 'CK', 'FJ', 'PF', 'GU', 'IN', 'ID', 'KZ', 'KI', 'KR', 'KG', 'LA', 'MO', 'MV', 'MH', 'FM', 'MN', 'NR', 'NP', 'NC', 'NU', 'NF', 'MP', 'PK', 'PW', 'PG', 'PN', 'WS', 'SB', 'LK', 'TW', 'TJ', 'TL', 'TK', 'TO', 'TM', 'TV', 'UZ', 'VU', 'WF', 'BH', 'IL', 'JO', 'KW', 'OM', 'QA', 'SA', 'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CF', 'TD', 'KM', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GN', 'GW', 'LS', 'LR', 'MG', 'MW', 'MR', 'MU', 'YT', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RE', 'SH', 'ST', 'SN', 'SC', 'SL', 'ZA', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW')
   and enabled = false;

update public.country_settings set enabled = false, updated_at = now(), updated_by = 'world-countries-5 switch-on (Mexico off)'
 where country_code = 'MX';

update public.country_settings set vat_number_required = true, updated_at = now(), updated_by = 'world-countries-5'
 where country_code in ('AE', 'BR');

update public.country_settings set ios_app_available = true, updated_at = now(), updated_by = 'world-countries-5 switch-on'
 where country_code in ('AD', 'AS', 'AW', 'AX', 'BD', 'BI', 'BL', 'BQ', 'CC', 'CF', 'CK', 'CW', 'CX', 'DJ', 'ER', 'ET', 'FK', 'FO', 'GF', 'GG', 'GL', 'GN', 'GP', 'GQ', 'GU', 'IM', 'JE', 'KI', 'KM', 'LS', 'MC', 'MF', 'MH', 'MP', 'MQ', 'NC', 'NF', 'NU', 'PF', 'PM', 'PN', 'PR', 'RE', 'SH', 'SJ', 'SM', 'SX', 'TG', 'TK', 'TL', 'TV', 'VA', 'VI', 'WF', 'WS', 'YT') and ios_app_available = false;

update public.country_settings set week_start = 'monday', updated_at = now(), updated_by = 'world-countries-5 switch-on'
 where country_code = 'IS';

update public.country_settings set android_app_available = true, updated_at = now(), updated_by = 'world-countries-5 switch-on'
 where country_code in ('AD', 'BD', 'BI', 'CF', 'DJ', 'ER', 'ET', 'GN', 'GQ', 'KI', 'KM', 'LS', 'MH', 'TG', 'TL', 'TV', 'WS') and android_app_available = false;

commit;
