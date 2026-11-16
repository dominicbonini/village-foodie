-- 20261109_partners_site_addresses.sql — Dominic, 16 November 2026 (partners-3 report §0): for the 13 organisations whose own site
-- publishes a different address from the one on the Gemini list (partners-2 report, "Site-published addresses"), the SITE'S address
-- becomes the primary and the listed one is kept as an alternate. Each site address was seen on the organisation's own site in the
-- partners-2 verification (docs/partners-2/verification.json, suggested_primary) and its domain has MX (dig, 16 November 2026), so
-- the row is ✓ verified. Status and auto_send are NOT changed: the four fta.team city sites stay not_now / auto_send off (only the
-- hub is auto-sendable, agreed), StreetFoodApp stays a software platform (not_now).
-- ⚠️ An alternate is never sent to (lib/partner-send.ts reads alternates only for the do-not-contact list). The four city sites'
-- listed addresses are on domains that do not exist or are not theirs — kept as alternates as asked, named in the report.
-- Guarded: each update runs only while the row still holds exactly what partners-2 imported (email = the listed one, or null for
-- the four city sites), so a hand edit since is never overwritten.
--
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261109_partners_site_addresses.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

update public.partner_orgs set email = 'help@foodtrucksphoenix.com', alternate_emails = array['info@foodtrucksphoenix.com']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address help@foodtrucksphoenix.com is now the primary (MX ok); the listed info@foodtrucksphoenix.com kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'Phoenix Food Truck Association' and country_code = 'US'
   and (email is null or lower(email) = lower('info@foodtrucksphoenix.com')) and not ('info@foodtrucksphoenix.com' = any(alternate_emails));
update public.partner_orgs set email = 'svp@urbanjustice.org', alternate_emails = array['info@streetvendor.org']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address svp@urbanjustice.org is now the primary (MX ok); the listed info@streetvendor.org kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'Street Vendor Project (NYC)' and country_code = 'US'
   and (email is null or lower(email) = lower('info@streetvendor.org')) and not ('info@streetvendor.org' = any(alternate_emails));
update public.partner_orgs set email = 'info@ftasd.org', alternate_emails = array['info@sdfta.org']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address info@ftasd.org is now the primary (MX ok); the listed info@sdfta.org kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'FTA network — San Diego (SDFTA)' and country_code = 'US'
   and (email is null or lower(email) = lower('info@sdfta.org')) and not ('info@sdfta.org' = any(alternate_emails));
update public.partner_orgs set email = 'info@ftalv.org', alternate_emails = array['info@lvfta.org']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address info@ftalv.org is now the primary (MX ok); the listed info@lvfta.org kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'FTA network — Las Vegas (LVFTA)' and country_code = 'US'
   and (email is null or lower(email) = lower('info@lvfta.org')) and not ('info@lvfta.org' = any(alternate_emails));
update public.partner_orgs set email = 'info@ftabos.org', alternate_emails = array['info@bosfta.org']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address info@ftabos.org is now the primary (MX ok); the listed info@bosfta.org kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'FTA network — Boston (BOSFTA)' and country_code = 'US'
   and (email is null or lower(email) = lower('info@bosfta.org')) and not ('info@bosfta.org' = any(alternate_emails));
update public.partner_orgs set email = 'info@phifta.org', alternate_emails = array['info@phlfta.org']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address info@phifta.org is now the primary (MX ok); the listed info@phlfta.org kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'FTA network — Philadelphia (PHLFTA)' and country_code = 'US'
   and (email is null or lower(email) = lower('info@phlfta.org')) and not ('info@phlfta.org' = any(alternate_emails));
update public.partner_orgs set email = 'info@welcometothornbury.com', alternate_emails = array['hello@welcometothornbury.com']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address info@welcometothornbury.com is now the primary (MX ok); the listed hello@welcometothornbury.com kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'Melbourne Food Truck Collective / Welcome to Thornbury' and country_code = 'AU'
   and (email is null or lower(email) = lower('hello@welcometothornbury.com')) and not ('hello@welcometothornbury.com' = any(alternate_emails));
update public.partner_orgs set email = 'info@eventpeople.com.au', alternate_emails = array['info@foodtruckcarnivale.com.au']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address info@eventpeople.com.au is now the primary (MX ok); the listed info@foodtruckcarnivale.com.au kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'Food Truck Carnivale (SA Network)' and country_code = 'AU'
   and (email is null or lower(email) = lower('info@foodtruckcarnivale.com.au')) and not ('info@foodtruckcarnivale.com.au' = any(alternate_emails));
update public.partner_orgs set email = 'hello@greatervanfoodtruckfest.com', alternate_emails = array['info@greatervanfoodtruckfest.com']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address hello@greatervanfoodtruckfest.com is now the primary (MX ok); the listed info@greatervanfoodtruckfest.com kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'Greater Vancouver Food Truck Festival Collective' and country_code = 'CA'
   and (email is null or lower(email) = lower('info@greatervanfoodtruckfest.com')) and not ('info@greatervanfoodtruckfest.com' = any(alternate_emails));
update public.partner_orgs set email = 'hello@calgaryfoodtrucks.com', alternate_emails = array['info@yycfoodtrucks.com']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address hello@calgaryfoodtrucks.com is now the primary (MX ok); the listed info@yycfoodtrucks.com kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'YYC Food Trucks' and country_code = 'CA'
   and (email is null or lower(email) = lower('info@yycfoodtrucks.com')) and not ('info@yycfoodtrucks.com' = any(alternate_emails));
update public.partner_orgs set email = 'us@mobile-cuisine.com', alternate_emails = array['editor@mobile-cuisine.com']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address us@mobile-cuisine.com is now the primary (MX ok); the listed editor@mobile-cuisine.com kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'Mobile Cuisine' and country_code = 'US'
   and (email is null or lower(email) = lower('editor@mobile-cuisine.com')) and not ('editor@mobile-cuisine.com' = any(alternate_emails));
update public.partner_orgs set email = 'support@foodtruckempire.com', alternate_emails = array['brett@foodtruckempire.com']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address support@foodtruckempire.com is now the primary (MX ok); the listed brett@foodtruckempire.com kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'Food Truck Empire' and country_code = 'US'
   and (email is null or lower(email) = lower('brett@foodtruckempire.com')) and not ('brett@foodtruckempire.com' = any(alternate_emails));
update public.partner_orgs set email = 'info@streetfoodapp.com', alternate_emails = array['contact@streetfoodapp.com']::text[], verify_status = 'verified',
  verify_note = coalesce(verify_note || ' ', '') || 'Dominic 16 Nov 2026: the site address info@streetfoodapp.com is now the primary (MX ok); the listed contact@streetfoodapp.com kept as an alternate.',
  verified_at = now(), updated_at = now()
 where source = 'gemini-2026-11-16' and name = 'StreetFoodApp' and country_code = 'US'
   and (email is null or lower(email) = lower('contact@streetfoodapp.com')) and not ('contact@streetfoodapp.com' = any(alternate_emails));

commit;

-- VERIFY (read-only):
-- select name, email, alternate_emails, verify_status, status, auto_send from public.partner_orgs where verify_note like '%Dominic 16 Nov 2026: the site address%' order by name;
