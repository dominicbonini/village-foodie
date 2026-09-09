create table if not exists lapiazza_backup_20260909_truck as
  select * from discovery_trucks where id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';
create table if not exists lapiazza_backup_20260909_prospect as
  select * from outreach_prospects where discovery_truck_id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';
create table if not exists lapiazza_backup_20260909_events as
  select id, discovery_truck_id from discovery_events where discovery_truck_id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';

select (select count(*) from lapiazza_backup_20260909_truck)    as truck_rows,      -- expect 1
       (select count(*) from lapiazza_backup_20260909_prospect) as prospect_rows,   -- expect 1
       (select count(*) from lapiazza_backup_20260909_events)   as event_rows;      -- expect 7
