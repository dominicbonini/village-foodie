-- 🔴 THE ORPHAN CHECK — the one that matters. Expect 0.
select count(*) as orphaned_events
from discovery_events
where discovery_truck_id is null
  and truck_name in ('La Piazza','La Piazza Street Food')
  and id in (select id from lapiazza_backup_20260909_events);

select count(*) as keeper_events from discovery_events
where discovery_truck_id = 'fa09b6c8-9723-404a-b6f2-4888d55c79aa';   -- expect 15 (8 + 7)

select count(*) as loser_rows from discovery_trucks
where id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';                    -- expect 0

select order_url from discovery_trucks where id = 'fa09b6c8-9723-404a-b6f2-4888d55c79aa';
-- expect https://lapiazzastreetfood.hatchesup.app

select count(*) as total_trucks from discovery_trucks;                -- expect 230 (was 231)
select count(*) as total_prospects from outreach_prospects;           -- expect 230 (was 231)
select count(*) as total_events from discovery_events;                -- expect 4300, UNCHANGED
