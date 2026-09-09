-- OPTIONAL. Merges 5a9bbae8 ("La Piazza Street Food") into fa09b6c8 ("La Piazza").
--
-- 🔴 ORDER MATTERS AND THIS ORDER IS THE POINT. discovery_events.discovery_truck_id is ON DELETE SET
-- NULL, so deleting the loser FIRST would silently ORPHAN its 7 events — they would survive with a null
-- link and no error. The events are repointed BEFORE anything is deleted, so no event is ever orphaned.
-- 🧪 A merge changes only discovery_truck_id, never the natural key (event_date, truck_name, venue_name),
-- so no unique-key collision is possible: 15 events, 15 distinct natural keys.
begin;

-- 1. Carry across the one field the keeper lacks and the loser has: the Hatches Up ordering page.
--    🔴 This is the outreach platform signal (app manual V12.2). Losing it would silently drop
--    La Piazza off the "has a Hatches Up ordering page" list. Only written if the keeper's is null.
update discovery_trucks
set order_url = (select order_url from discovery_trucks where id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24')
where id = 'fa09b6c8-9723-404a-b6f2-4888d55c79aa' and order_url is null;

-- 2. REPOINT THE EVENTS FIRST. Expect 7.
update discovery_events
set discovery_truck_id = 'fa09b6c8-9723-404a-b6f2-4888d55c79aa'
where discovery_truck_id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';

-- 3. Remove the loser's outreach row. It BLOCKS the delete (NO ACTION) and cannot be repointed
--    (the column is UNIQUE and the keeper already has one). Safe: stage 'not_contacted', no notes,
--    0 outreach_contacts.
delete from outreach_prospects where discovery_truck_id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';

-- 4. Now the row can go.
delete from discovery_trucks where id = '5a9bbae8-edc4-4f38-9feb-017acf0bfc24';

commit;
