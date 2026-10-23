-- europe-languages-2 (23 October 2026, docs/europe-languages-2-report.md) — ⚠️ NOT RUN when written. Run AFTER the deploy of
-- this branch and BEFORE switching any of these countries on (each is switched OFF today, so nothing changes for anyone).
-- Same reason as 20261037 (europe-languages-1): `short_name` is shown inside the language's own sentences ("HatchGrab {country}",
-- the pricing footnote, the phone hints), so it is the country's name in its own language. Every message puts `{country}` where no
-- case ending is needed (a colon, a dash, brackets), so the nominative reads correctly in these inflecting languages.
-- Luxembourg, Malta and Gibraltar already read correctly ("Luxembourg" is the French name too; MT and GI are English) — unchanged.
begin;
update public.country_settings set short_name = 'Polska'       where country_code = 'PL' and enabled = false;
update public.country_settings set short_name = 'Česko'        where country_code = 'CZ' and enabled = false;
update public.country_settings set short_name = 'Slovensko'    where country_code = 'SK' and enabled = false;
update public.country_settings set short_name = 'Magyarország' where country_code = 'HU' and enabled = false;
update public.country_settings set short_name = 'România'      where country_code = 'RO' and enabled = false;
update public.country_settings set short_name = 'Hrvatska'     where country_code = 'HR' and enabled = false;
update public.country_settings set short_name = 'Slovenija'    where country_code = 'SI' and enabled = false;
update public.country_settings set short_name = 'Suomi'        where country_code = 'FI' and enabled = false;
update public.country_settings set short_name = 'Eesti'        where country_code = 'EE' and enabled = false;
update public.country_settings set short_name = 'Latvija'      where country_code = 'LV' and enabled = false;
update public.country_settings set short_name = 'Lietuva'      where country_code = 'LT' and enabled = false;
update public.country_settings set short_name = 'Ελλάδα'       where country_code = 'GR' and enabled = false;
update public.country_settings set short_name = 'Κύπρος'       where country_code = 'CY' and enabled = false;
update public.country_settings set short_name = 'България'     where country_code = 'BG' and enabled = false;
commit;

-- Check: select country_code, name, short_name, enabled from public.country_settings
--   where country_code in ('PL','CZ','SK','HU','RO','HR','SI','FI','EE','LV','LT','GR','CY','BG') order by 1;
