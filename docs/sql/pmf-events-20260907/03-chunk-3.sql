-- 03 — CHUNK 3 of 3 — inserts 3 rows. Nothing is updated or deleted.
-- The two 17:00 rows on 11 September are the deliberate two-van overlap, twenty miles apart.
-- They differ in venue_name, so the natural key does not collide and nothing dedups them.
INSERT INTO discovery_events
  (event_date, start_time, end_time, truck_name, venue_name, village,
   event_notes, source, ai_notes, discovery_truck_id, venue_id,
   visibility, show_on_vf, show_on_hg)
VALUES
 ('2026-09-11','17:00','19:45','Pimp My FIsh','Fordham British Legion','Fordham',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  '44 Church St, Fordham, Ely CB7 5NJ',
  NULL,'b28f4230-db89-4290-813c-94a950b3c316','public',true,true),
 ('2026-09-11','17:00','19:45','Pimp My FIsh','King Bill IV Pub','Histon',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  '8 Church St, Histon, Cambridge CB24 9EP',
  NULL,'798dd8a3-7b4b-48f1-9cb7-25f51f10b712','public',true,true),
 ('2026-09-12','17:00','19:45','Pimp My FIsh','Wylde Skye','Linton',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  'Unit 8A, The Grip Industrial Estate, Hadstock Rd, Linton, Cambridge CB21 4XN',
  NULL,'ffd79c43-7ba8-4913-9928-153153d71b0b','public',true,true)
ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING;

-- Expect 9.
SELECT count(*) AS pmf_future FROM discovery_events
WHERE truck_name ILIKE '%pimp%' AND event_date >= CURRENT_DATE;
