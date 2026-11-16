-- 20261117_partners_3_mx_hold.sql — partners-3 research ON HOLD (Dominic, 16 November 2026, docs/partners-3-report.md §3): Mexico is
-- not a live HatchGrab country (country_settings.enabled = false), so every Mexican partner partners-3 imported (3 from the second
-- lists, 8 from research batch 1) becomes not_now with the note "country not live". Nothing else changes.
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261117_partners_3_mx_hold.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

update public.partner_orgs
   set status = 'not_now',
       notes = coalesce(nullif(notes, '') || ' ', '') || 'country not live',
       updated_at = now()
 where country_code = 'MX' and source like 'partners-3-%'
   and (notes is null or notes not like '%country not live%');

commit;

-- VERIFY (read-only):
-- select status, notes, count(*) from public.partner_orgs where country_code = 'MX' group by 1, 2;
