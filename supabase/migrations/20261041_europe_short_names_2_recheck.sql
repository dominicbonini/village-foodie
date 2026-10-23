-- admin-countries-1 (23 October 2026, docs/admin-countries-1-report.md §4) — 20261038, RE-CHECKED. ⚠️ NOT RUN when written.
-- RUN AFTER DEPLOY — only if Dominic wants the 14 countries' own names live (it changes the words on 14 LIVE country pages).
--
-- WHY A NEW FILE: 20261038 guards every update with `and enabled = false`. All 14 of its countries were SWITCHED ON on
-- 23 October (read-only SQL, docs/manual-v16-5-report.md §4), so 20261038 as written would now update NO row. This is the same
-- 14 names, guarded instead by the English name still being there — so it changes only a row that still reads in English, and
-- running it twice changes nothing. 20261038 is left as it was; run THIS one, not both.
--
-- WHAT IT CHANGES: `short_name` is shown inside each language's own sentences ("HatchGrab {country}", the pricing footnote, the
-- phone hints) on these 14 switched-on countries' pages, which today read e.g. "HatchGrab Poland" in Polish. After it: "Polska".
-- `name` (English, Admin only) is untouched. Luxembourg, Malta and Gibraltar already read correctly — not here.
begin;
update public.country_settings set short_name = 'Polska'       where country_code = 'PL' and short_name = 'Poland';
update public.country_settings set short_name = 'Česko'        where country_code = 'CZ' and short_name = 'the Czech Republic';
update public.country_settings set short_name = 'Slovensko'    where country_code = 'SK' and short_name = 'Slovakia';
update public.country_settings set short_name = 'Magyarország' where country_code = 'HU' and short_name = 'Hungary';
update public.country_settings set short_name = 'România'      where country_code = 'RO' and short_name = 'Romania';
update public.country_settings set short_name = 'Hrvatska'     where country_code = 'HR' and short_name = 'Croatia';
update public.country_settings set short_name = 'Slovenija'    where country_code = 'SI' and short_name = 'Slovenia';
update public.country_settings set short_name = 'Suomi'        where country_code = 'FI' and short_name = 'Finland';
update public.country_settings set short_name = 'Eesti'        where country_code = 'EE' and short_name = 'Estonia';
update public.country_settings set short_name = 'Latvija'      where country_code = 'LV' and short_name = 'Latvia';
update public.country_settings set short_name = 'Lietuva'      where country_code = 'LT' and short_name = 'Lithuania';
update public.country_settings set short_name = 'Ελλάδα'       where country_code = 'GR' and short_name = 'Greece';
update public.country_settings set short_name = 'Κύπρος'       where country_code = 'CY' and short_name = 'Cyprus';
update public.country_settings set short_name = 'България'     where country_code = 'BG' and short_name = 'Bulgaria';
commit;

-- Check (14 rows, each in its own language): select country_code, short_name from public.country_settings
--   where country_code in ('PL','CZ','SK','HU','RO','HR','SI','FI','EE','LV','LT','GR','CY','BG') order by 1;
