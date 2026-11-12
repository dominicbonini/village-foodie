-- supabase/migrations/20261095_world_countries_5_switch_on.sql — world-countries-5 BLOCK C (12 November 2026, docs/world-countries-5-report.md).
-- ⛔ NOT RUN. Dominic asks for it AFTER the code is deployed. It needs --approved-by-dominic (it UPDATEs country_settings).
-- 1 · switches ON the 167 new countries (enabled = true) — each then has its /<code> page, its place in the sitemap, hreflang, the
--     country selector (under its region) and signup;
-- 2 · switches OFF Mexico (no truck has ever been in MX — checked 12 Nov 2026, report §2);
-- 3 · sets vat_number_required on the two LIVE countries the list marks (AE, BR) — the 39 new ones already have it from block B.
begin;

update public.country_settings set enabled = true, updated_at = now(), updated_by = 'world-countries-5 switch-on'
 where country_code in ('AL', 'AD', 'AM', 'AZ', 'BA', 'FO', 'GE', 'GL', 'GG', 'VA', 'IS', 'IM', 'JE', 'MD', 'MC', 'ME', 'MK', 'SM', 'RS', 'SJ', 'TR', 'UA', 'AX', 'AI', 'AG', 'AR', 'AW', 'BS', 'BZ', 'BM', 'BO', 'BQ', 'KY', 'CL', 'CO', 'CR', 'CW', 'DM', 'DO', 'EC', 'SV', 'FK', 'GF', 'GD', 'GP', 'GT', 'GY', 'HN', 'JM', 'MQ', 'MS', 'NI', 'PA', 'PY', 'PE', 'PR', 'BL', 'KN', 'LC', 'MF', 'PM', 'VC', 'SX', 'SR', 'TT', 'TC', 'UY', 'VG', 'VI', 'AS', 'BD', 'BT', 'BN', 'KH', 'CX', 'CC', 'CK', 'FJ', 'PF', 'GU', 'IN', 'ID', 'KZ', 'KI', 'KR', 'KG', 'LA', 'MO', 'MV', 'MH', 'FM', 'MN', 'NR', 'NP', 'NC', 'NU', 'NF', 'MP', 'PK', 'PW', 'PG', 'PN', 'WS', 'SB', 'LK', 'TW', 'TJ', 'TL', 'TK', 'TO', 'TM', 'TV', 'UZ', 'VU', 'WF', 'BH', 'IL', 'JO', 'KW', 'OM', 'QA', 'SA', 'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CF', 'TD', 'KM', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GN', 'GW', 'LS', 'LR', 'MG', 'MW', 'MR', 'MU', 'YT', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RE', 'SH', 'ST', 'SN', 'SC', 'SL', 'ZA', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW')
   and enabled = false;

update public.country_settings set enabled = false, updated_at = now(), updated_by = 'world-countries-5 switch-on (Mexico off)'
 where country_code = 'MX';

update public.country_settings set vat_number_required = true, updated_at = now(), updated_by = 'world-countries-5'
 where country_code in ('AE', 'BR');

commit;
