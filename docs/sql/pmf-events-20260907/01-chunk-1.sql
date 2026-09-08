-- 01 — CHUNK 1 of 3 — inserts 3 rows. Nothing is updated or deleted.
-- ON CONFLICT DO NOTHING on the natural key makes a re-run a no-op, never a duplicate.
INSERT INTO discovery_events
  (event_date, start_time, end_time, truck_name, venue_name, village,
   event_notes, source, ai_notes, discovery_truck_id, venue_id,
   visibility, show_on_vf, show_on_hg)
VALUES
 ('2026-09-08','17:00','19:45','Pimp My FIsh','Mandeville Hall','Burwell',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  'Reach Road, Burwell, Cambridge CB25 0AR',
  NULL,'59359ff1-bf76-461d-958f-c2cf57e6727d','public',true,true),
 ('2026-09-09','17:00','19:45','Pimp My FIsh','Great Shelford Memorial Hall','Great Shelford',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  'Woollards Ln, Great Shelford, Cambridge CB22 5LZ',
  NULL,'f2d6bd2b-97e1-476a-a361-79c22ec6d2ed','public',true,true),
 ('2026-09-09','17:15','19:45','Pimp My FIsh','Great Abington Post Office','Great Abington',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  '81 High St, Great Abington, Cambridge CB21 6AB',
  NULL,'25eb0982-70d2-4ca7-983e-4976189ac0bd','public',true,true)
ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING;

-- Expect 3.
SELECT count(*) AS pmf_future FROM discovery_events
WHERE truck_name ILIKE '%pimp%' AND event_date >= CURRENT_DATE;
