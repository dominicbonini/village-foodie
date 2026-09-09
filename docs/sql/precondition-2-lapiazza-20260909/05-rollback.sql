-- Reverses 02 exactly, in the inverse order.
begin;
insert into discovery_trucks select * from lapiazza_backup_20260909_truck
  on conflict (id) do nothing;
insert into outreach_prospects select * from lapiazza_backup_20260909_prospect
  on conflict (id) do nothing;
update discovery_events e
  set discovery_truck_id = b.discovery_truck_id
  from lapiazza_backup_20260909_events b
  where b.id = e.id;
update discovery_trucks set order_url = null
  where id = 'fa09b6c8-9723-404a-b6f2-4888d55c79aa'
    and order_url = 'https://lapiazzastreetfood.hatchesup.app';
commit;

select count(*) as loser_restored from discovery_trucks where id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';  -- expect 1
select count(*) as loser_events from discovery_events where discovery_truck_id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';  -- expect 7
