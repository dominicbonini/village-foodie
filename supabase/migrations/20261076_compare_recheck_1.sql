-- supabase/migrations/20261076_compare_recheck_1.sql — compare-recheck-1 (6 November 2026, docs/compare-recheck-1-report.md).
-- "CHECK NOW" FOR THE 12 COMPETITORS THE GB, US AND DE COMPARISON PAGES SHOW (the four-cap's choice, compare-suits-1).
-- Exactly what Admin › Pricing check's "Check now" writes (app/api/admin/competitor-check/route.ts action check_now):
-- competitors.check_requested_at = now. The checker's next scheduled run takes requested competitors first in its routine
-- share (lib/competitor-check/core.ts selectRoutine — requests do not count against the quota) and clears the field after the
-- check. The field is per competitor; each pair below names the country page that shows it. A competitor already requested is
-- left as it is. Nothing else is written; competitors is not a protected table.

begin;

update public.competitors c
   set check_requested_at = now()
  from public.comparison_entries e
 where e.competitor_id = c.id
   and (e.country_code, c.name) in (
     ('GB', 'Aphelios'), ('GB', 'Beat The Queue'), ('GB', 'Grafterr'), ('GB', 'Hatches Up'),
     ('US', 'Best Food Trucks (BFT)'), ('US', 'Food Truck ONE (Food Truck OS)'), ('US', 'Food Truck Pub'), ('US', 'Goodfynd'),
     ('DE', 'gastro25'), ('DE', 'GastroDok'), ('DE', 'FoxiFood'), ('DE', 'Jamezz'))
   and c.check_requested_at is null;

commit;
