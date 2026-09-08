-- Snapshot BEFORE. Lets you prove afterwards exactly which rows this pack added.
create table if not exists venues_backup_20260909 as select * from venues;
select count(*) as venues_before from venues;                     -- expect 559
select count(*) as backup_rows from venues_backup_20260909;       -- must equal the line above
