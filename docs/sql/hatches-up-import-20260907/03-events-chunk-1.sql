-- 03 — PART B chunk 1 of 3 — 10 event inserts.
-- Guarded ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING: a re-run is a no-op, and the
-- scraper recovering cannot duplicate these.
INSERT INTO discovery_events
  (event_date, start_time, end_time, truck_name, venue_name, village,
   event_notes, source, ai_notes, discovery_truck_id, venue_id, visibility, show_on_vf, show_on_hg)
VALUES
  ('2026-09-07','11:00','20:00','The Yeerologist','The Yeerologist @ Eat17',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5160161b-a713-4976-8373-89279fb37494','public',true,true),
  ('2026-09-08','16:40','20:00','Buffalo Joe''s','Bishop’s Stortford Cricket Club',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'cd987125-0d40-4cb1-8ad8-0cc47f449a2f','public',true,true),
  ('2026-09-08','18:00','21:00','Tacoman','Thirsty, 46 Chesterton Road, Cambridge. CB4 1EN',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5fc1c752-dd20-40d4-84c7-a3f3ab439fee','public',true,true),
  ('2026-09-08','11:00','20:00','The Yeerologist','The Yeerologist @ Eat17',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5160161b-a713-4976-8373-89279fb37494','public',true,true),
  ('2026-09-08','06:30','12:00','Barista Boy Coffee Co','Flitch Green',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'8d470c35-70b9-42eb-aa2e-dd095d96466e','public',true,true),
  ('2026-09-09','17:15','20:15','Pizza Mondo','Thirsty',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5fc1c752-dd20-40d4-84c7-a3f3ab439fee','public',true,true),
  ('2026-09-09','12:00','14:00','Azahar','foodPark, CB1',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'de22d722-57ae-4c29-9344-5bd13df67d1d','public',true,true),
  ('2026-09-09','17:30','21:00','Clumsies','Mrs Salisburys Carpark',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'bc2173b8-e218-4880-9ad0-bd49e692eb42','public',true,true),
  ('2026-09-09','11:00','20:00','The Yeerologist','The Yeerologist @ Eat17',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5160161b-a713-4976-8373-89279fb37494','public',true,true),
  ('2026-09-09','06:30','12:00','Barista Boy Coffee Co','Flitch Green',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'8d470c35-70b9-42eb-aa2e-dd095d96466e','public',true,true)
ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING;

SELECT count(*) AS imported_so_far FROM discovery_events WHERE source = 'Manual import 2026-09-07: hatchesup.co.uk';
