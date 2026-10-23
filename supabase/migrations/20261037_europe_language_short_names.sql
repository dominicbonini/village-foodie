-- europe-languages-1 (22 October 2026, docs/europe-languages-1-report.md) — ⚠️ NOT RUN when written. Run AFTER the deploy of
-- this branch (whose pages are in these languages), in any order relative to switching a country on, but BEFORE switching
-- it on. Each country is switched OFF today, so nothing changes for anyone when this runs.
--
-- WHY: `short_name` is the country's name as the app's own sentences show it — the marketing titles ("HatchGrab {country}"),
-- the pricing footnote, the phone hints and the place the geocoder adds to an address. europe-settings wrote it in English
-- ("Germany"), the convention of the English rows. Now that each of these countries' pages are in its own language, the name
-- must be in that language too, or a German page reads "HatchGrab Germany". The geocoder reads either form. `name` (the admin
-- name, English) is unchanged. Every language's messages put `{country}` where no article or case ending is needed (a colon,
-- a dash, apposition), so "Schweiz", "Nederland" and "België" read correctly.
begin;
update public.country_settings set short_name = 'Deutschland'   where country_code = 'DE' and enabled = false;
update public.country_settings set short_name = 'Österreich'    where country_code = 'AT' and enabled = false;
update public.country_settings set short_name = 'Schweiz'       where country_code = 'CH' and enabled = false;
update public.country_settings set short_name = 'Liechtenstein' where country_code = 'LI' and enabled = false;
update public.country_settings set short_name = 'España'        where country_code = 'ES' and enabled = false;
update public.country_settings set short_name = 'Italia'        where country_code = 'IT' and enabled = false;
update public.country_settings set short_name = 'Portugal'      where country_code = 'PT' and enabled = false;
update public.country_settings set short_name = 'Nederland'     where country_code = 'NL' and enabled = false;
update public.country_settings set short_name = 'België'        where country_code = 'BE' and enabled = false;
update public.country_settings set short_name = 'Sverige'       where country_code = 'SE' and enabled = false;
update public.country_settings set short_name = 'Danmark'       where country_code = 'DK' and enabled = false;
update public.country_settings set short_name = 'Norge'         where country_code = 'NO' and enabled = false;
commit;

-- Check: select country_code, name, short_name, enabled from public.country_settings
--   where country_code in ('DE','AT','CH','LI','ES','IT','PT','NL','BE','SE','DK','NO') order by 1;
