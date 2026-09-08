-- 02 — CHUNK 2 of 3 — inserts 3 rows. Nothing is updated or deleted.
INSERT INTO discovery_events
  (event_date, start_time, end_time, truck_name, venue_name, village,
   event_notes, source, ai_notes, discovery_truck_id, venue_id,
   visibility, show_on_vf, show_on_hg)
VALUES
 ('2026-09-10','17:00','19:45','Pimp My FIsh','Great Bradley village hall','Great Bradley',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  'The St, Great Bradley, Newmarket CB8 9LH',
  NULL,'6518def7-a84b-41fc-b168-eb3760d7d699','public',true,true),
 ('2026-09-10','17:30','20:15','Pimp My FIsh','Affleck Arms','Dalham',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  'Brookside, Dalham, Newmarket CB8 8TG',
  NULL,'1b0f612e-c2cd-444b-b9c9-cdee7ab09541','public',true,true),
 ('2026-09-11','12:00','13:45','Pimp My FIsh','FoodPark CB1','Cambridge',
  NULL,'Manual entry 2026-09-07: order.pimp-my-fish.co.uk',
  '3/4 Station Square, Cambridge CB1 2GB',
  NULL,'de22d722-57ae-4c29-9344-5bd13df67d1d','public',true,true)
ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING;

-- Expect 6.
SELECT count(*) AS pmf_future FROM discovery_events
WHERE truck_name ILIKE '%pimp%' AND event_date >= CURRENT_DATE;
