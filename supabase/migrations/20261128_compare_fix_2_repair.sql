-- 20261128_compare_fix_2_repair.sql — compare-fix-2 step 1 (Dominic's decision B, 24 November 2026; docs/compare-fix-2-report.md).
-- UNDO the failed compare-research-1 import's ANSWER changes. The import (public.data_imports: file data/compare-research-1/competitors.json,
-- result 'error', imported_at 2026-11-24 17:17:50.512 UTC — "duplicate key … competitor_feature_values_current") superseded 500 current
-- answers at 17:17:57.23 and inserted 500 new ones at 17:17:57.506256, then failed; 322 answers were left with no current value.
-- This makes all 500 superseded answers current again and deletes the 500 it inserted, so the answers are exactly as before the import
-- (8,012 current). Its competitor changes (18 not relevant, 5 restored, 15 not-sold-in, 13 new competitors) STAY (Dominic).
-- Competitor data only: one table, competitor_feature_values. Every step is checked; any surprise raises and nothing is written.
begin;

-- 1 · exactly the rows of that import's window, untouched since
do $$
declare n_new int; n_new_bad int; n_old int; n_old_bad int; n_cur int;
begin
  select count(*), count(*) filter (where superseded_at is not null or verified_at is not null or auto_verified_at is not null)
    into n_new, n_new_bad from public.competitor_feature_values
   where created_at >= '2026-11-24 17:17:50.512+00' and created_at < '2026-11-24 17:19:00+00';
  select count(*), count(*) filter (where exists (select 1 from public.competitor_feature_values cur
      where cur.competitor_id = o.competitor_id and cur.feature_key = o.feature_key and coalesce(cur.country_code, '') = coalesce(o.country_code, '')
        and cur.superseded_at is null and not (cur.created_at >= '2026-11-24 17:17:50.512+00' and cur.created_at < '2026-11-24 17:19:00+00')))
    into n_old, n_old_bad from public.competitor_feature_values o
   where o.superseded_at >= '2026-11-24 17:17:50.512+00' and o.superseded_at < '2026-11-24 17:19:00+00';
  select count(*) into n_cur from public.competitor_feature_values where superseded_at is null;
  if n_new <> 500 then raise exception 'compare-fix-2: expected 500 answers inserted by the failed import, found %', n_new; end if;
  if n_new_bad <> 0 then raise exception 'compare-fix-2: % of the inserted answers were changed since (superseded or marked) — stop', n_new_bad; end if;
  if n_old <> 500 then raise exception 'compare-fix-2: expected 500 answers superseded by the failed import, found %', n_old; end if;
  if n_old_bad <> 0 then raise exception 'compare-fix-2: % superseded answers already have another current answer — stop', n_old_bad; end if;
  if n_cur <> 8012 then raise exception 'compare-fix-2: expected 8012 current answers before the repair, found %', n_cur; end if;
end $$;

-- 2 · delete the 500 the import inserted (first, so no restored answer meets its replacement in the unique index)
delete from public.competitor_feature_values
 where created_at >= '2026-11-24 17:17:50.512+00' and created_at < '2026-11-24 17:19:00+00';

-- 3 · the 500 it superseded are current again
update public.competitor_feature_values set superseded_at = null
 where superseded_at >= '2026-11-24 17:17:50.512+00' and superseded_at < '2026-11-24 17:19:00+00';

-- 4 · the result: 8,012 current, none left without a current answer by that import, nothing from its window remains
do $$
declare n_cur int; n_window int;
begin
  select count(*) into n_cur from public.competitor_feature_values where superseded_at is null;
  select count(*) into n_window from public.competitor_feature_values
   where (created_at >= '2026-11-24 17:17:50.512+00' and created_at < '2026-11-24 17:19:00+00')
      or (superseded_at >= '2026-11-24 17:17:50.512+00' and superseded_at < '2026-11-24 17:19:00+00');
  if n_cur <> 8012 then raise exception 'compare-fix-2: expected 8012 current answers after the repair, found %', n_cur; end if;
  if n_window <> 0 then raise exception 'compare-fix-2: % rows of the failed import''s window remain', n_window; end if;
end $$;

commit;
