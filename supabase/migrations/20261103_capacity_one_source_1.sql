-- capacity-one-source-1 (13 Nov 2026), DATA SYNC, TEST TRUCKS ONLY. Approved by Dominic in the brief ("Test trucks:
-- copy each first van's values into menu_categories so everything agrees, including Pizza Kitchen").
-- The diagnosis found exactly two trucks whose menu_categories differ from their first van's van_category_settings,
-- both test trucks with only test orders: test-truck (Pizza Kitchen) and test-truck-us (Pizza Kitchen US), Pizza
-- 15m / 8 on the category vs 5m / 4 on the van. No live truck has any van_category_settings row, so no live truck is
-- touched.
-- What changes: menu_categories.prep_secs / batch_size / counts_toward_capacity, for the categories where the first
-- active van has its own row, set to that row's values. Nothing else. Backup: docs/capacity-one-source-1/backup.json.
-- ONE statement = one transaction; any failed check raises and rolls everything back.
do $$
declare
  v_changed int;
  v_left int;
begin
  -- Only these two trucks (named below in every statement).
  with first_van as (
    select distinct on (truck_id) truck_id, id as van_id
      from truck_vans
     where truck_id in ('test-truck', 'test-truck-us') and active is not false
     order by truck_id, created_at asc nulls last, id
  )
  update menu_categories c
     set prep_secs = s.prep_secs,
         batch_size = s.batch_size,
         counts_toward_capacity = s.counts_toward_capacity
    from first_van f
    join van_category_settings s on s.van_id = f.van_id
   where c.truck_id = f.truck_id
     and c.id = s.category_id
     and c.truck_id in ('test-truck', 'test-truck-us')
     and (c.prep_secs is distinct from s.prep_secs
          or c.batch_size is distinct from s.batch_size
          or coalesce(c.counts_toward_capacity, false) is distinct from coalesce(s.counts_toward_capacity, false));
  get diagnostics v_changed = row_count;
  raise notice 'capacity-one-source-1: menu_categories rows synced to the first van: %', v_changed;

  -- 1. The diagnosis found two (one Pizza per truck). More would mean something changed since; stop.
  if v_changed > 2 then
    raise exception 'capacity-one-source-1: expected at most 2 rows, would change %', v_changed;
  end if;

  -- 2. Nothing left differing on the two trucks.
  with first_van as (
    select distinct on (truck_id) truck_id, id as van_id
      from truck_vans
     where truck_id in ('test-truck', 'test-truck-us') and active is not false
     order by truck_id, created_at asc nulls last, id
  )
  select count(*) into v_left
    from menu_categories c
    join first_van f on f.truck_id = c.truck_id
    join van_category_settings s on s.van_id = f.van_id and s.category_id = c.id
   where c.prep_secs is distinct from s.prep_secs
      or c.batch_size is distinct from s.batch_size
      or coalesce(c.counts_toward_capacity, false) is distinct from coalesce(s.counts_toward_capacity, false);
  if v_left <> 0 then
    raise exception 'capacity-one-source-1: % row(s) still differ after the sync', v_left;
  end if;
  raise notice 'capacity-one-source-1: DONE, nothing left differing on test-truck / test-truck-us';
end
$$;
