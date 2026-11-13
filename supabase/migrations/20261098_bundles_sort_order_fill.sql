-- supabase/migrations/20261098_bundles_sort_order_fill.sql — deals-order-1 (13 November 2026, docs/deals-order-1-report.md).
-- Run by Claude with scripts/db-migrate.cjs (Dominic, 13 Nov: "If formules have no stored order yet, add one (migration: run it
-- yourself…). Fill it from today's display order for every truck, so nothing moves until a truck drags something.").
--
-- bundles_db already HAS a sort_order column (integer, default 0), and Manage reads `order by sort_order` — but nothing ever
-- wrote it, so every formule holds 0 and the order shown was the table's physical order (Manage), or none (the order page and the
-- dashboard read /api/menu, which did not sort). This numbers each truck's formules 1, 2, 3, … in the order they are shown
-- today: sort_order, then created_at (the order rows were added, which is also their physical order — checked read-only for
-- the one truck that has formules, §2 of the report), then id. From now on Manage › Menu › Deals sets it by dragging, and a new
-- formule goes to the bottom (app/api/manage/route.ts upsert_bundle).
-- Touches only bundles_db.sort_order, and only where it changes. Idempotent: run twice, the second run changes nothing.
begin;

update public.bundles_db b
   set sort_order = r.rn
  from (
    select id, row_number() over (partition by truck_id order by sort_order, created_at, id) as rn
      from public.bundles_db
  ) r
 where b.id = r.id
   and b.sort_order is distinct from r.rn;

commit;
