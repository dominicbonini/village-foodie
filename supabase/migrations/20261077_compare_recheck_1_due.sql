-- supabase/migrations/20261077_compare_recheck_1_due.sql — compare-recheck-1, Dominic's B (6 November 2026, docs/compare-recheck-1-report.md).
-- MAKE THE SHOWN CORE AND COMMERCIAL FEATURES OF THE 12 REQUESTED COMPETITORS DUE, so tonight's routine check (02:10 UTC, 7 November —
-- they are requested by 20261076) asks every one of them and records the pages it reads.
-- SCOPE, exactly: competitor_feature_checks rows with country_code '' (the every-country record a routine check reads to decide what is
-- due — lib/competitor-check/core.ts dueFeatures) for these 12 competitors, and only the features shown on THEIR country's comparison
-- page with tier core or commercial (show_scope 'all', or 'some' naming that country). Scheduling data only: checked_on moves back 91
-- days (the core and commercial interval is 90). Nothing else changes — not rejudge, not pages_checked, no other row, no other table.
-- A feature with no '' row is due already and is not touched. Hatches Up has no rows (never checked).
--
-- THE ORIGINAL checked_on VALUES (read 6 November 2026, ~11:50 UTC) — 246 rows:
--   Aphelios                        2026-11-04 × 27  ahead android capacity cardfee cards discovery domain hardware ipad kds menuphoto monthly notify offline perorder preorder schedule setup social stock term terminal tickets trial vans walkup whatsapp
--   Beat The Queue                  2026-11-04 × 27  (the same 27 keys as Aphelios)
--   Grafterr                        2026-11-04 × 27  (the same 27 keys as Aphelios)
--   Best Food Trucks (BFT)          2026-10-23 × 2   domain preorder
--   Food Truck ONE (Food Truck OS)  2026-10-23 × 1   domain
--                                   2026-11-04 × 25  ahead android capacity cardfee cards hardware ipad kds menuphoto monthly notify offline perorder preorder schedule setup social stock term terminal tickets trial vans walkup whatsapp
--   Food Truck Pub                  2026-10-23 × 2   domain preorder
--                                   2026-11-04 × 24  ahead android capacity cardfee cards hardware ipad kds menuphoto monthly notify offline perorder schedule setup social stock term terminal tickets trial vans walkup whatsapp
--   Goodfynd                        2026-10-23 × 1   preorder
--                                   2026-11-06 × 25  ahead android capacity cardfee cards domain hardware ipad kds menuphoto monthly notify offline perorder schedule setup social stock term terminal tickets trial vans walkup whatsapp
--   FoxiFood                        2026-11-05 × 27  ahead android capacity cardfee cards domain hardware ipad kds menuphoto monthly notify offline paypal perorder preorder schedule setup social stock term terminal tickets trial vans walkup whatsapp
--   gastro25                        2026-11-05 × 27  (the same 27 keys as FoxiFood)
--   GastroDok                       2026-11-05 × 27  (the same 27 keys as FoxiFood)
--   Jamezz                          2026-10-24 × 4   domain kds preorder whatsapp
-- RESTORE (any row tonight's run did not re-check keeps its moved date, before 1 September 2026; a re-checked row reads 7 November):
--   the same scope, `set checked_on = checked_on + 91` where checked_on < '2026-09-01' — exact, row by row.
-- A GUARD: the update must touch exactly 246 rows, or the whole file rolls back.

begin;

do $$
declare n integer;
begin
  with pairs(cc, name) as (values
         ('GB', 'Aphelios'), ('GB', 'Beat The Queue'), ('GB', 'Grafterr'), ('GB', 'Hatches Up'),
         ('US', 'Best Food Trucks (BFT)'), ('US', 'Food Truck ONE (Food Truck OS)'), ('US', 'Food Truck Pub'), ('US', 'Goodfynd'),
         ('DE', 'gastro25'), ('DE', 'GastroDok'), ('DE', 'FoxiFood'), ('DE', 'Jamezz')),
       scope as (
         select c.id as competitor_id, f.key as feature_key
           from pairs p
           join public.competitors c on c.name = p.name
           join public.comparison_features f on f.tier in ('core', 'commercial')
            and (f.show_scope = 'all' or (f.show_scope = 'some' and p.cc = any(f.show_countries))))
  update public.competitor_feature_checks k
     set checked_on = k.checked_on - 91
    from scope s
   where k.competitor_id = s.competitor_id and k.feature_key = s.feature_key and k.country_code = '';
  get diagnostics n = row_count;
  if n <> 246 then raise exception 'compare-recheck-1: expected 246 rows, the update would touch %', n; end if;
end $$;

commit;
