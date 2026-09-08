-- 05 — PART B chunk 3 of 3 — 8 event inserts.
-- Guarded ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING: a re-run is a no-op, and the
-- scraper recovering cannot duplicate these.
INSERT INTO discovery_events
  (event_date, start_time, end_time, truck_name, venue_name, village,
   event_notes, source, ai_notes, discovery_truck_id, venue_id, visibility, show_on_vf, show_on_hg)
VALUES
  ('2026-09-12','16:45','20:00','Pizza Mondo','Great Wilbraham',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'8aa5eaea-f538-4efc-b354-bc78e82ba4ba','public',true,true),
  ('2026-09-12','16:40','20:00','Buffalo Joe''s','The Yew Tree - Manuden',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'6782fe07-728e-4e9f-a60b-758891a09d51','public',true,true),
  ('2026-09-12','17:30','21:00','Clumsies','Mrs Salisburys Carpark',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'bc2173b8-e218-4880-9ad0-bd49e692eb42','public',true,true),
  ('2026-09-12','11:00','20:00','The Yeerologist','The Yeerologist @ Eat17',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5160161b-a713-4976-8373-89279fb37494','public',true,true),
  ('2026-09-12','10:00','16:00','Crumbelievable','Cambridge Market',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'ff72a5bb-c425-4220-bb67-11c0807f5aa0','public',true,true),
  ('2026-09-13','17:30','20:00','Clumsies','Mrs Salisburys Carpark',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'bc2173b8-e218-4880-9ad0-bd49e692eb42','public',true,true),
  ('2026-09-13','11:00','20:00','The Yeerologist','The Yeerologist @ Eat17',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5160161b-a713-4976-8373-89279fb37494','public',true,true),
  ('2026-09-14','11:00','20:00','The Yeerologist','The Yeerologist @ Eat17',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5160161b-a713-4976-8373-89279fb37494','public',true,true)
ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING;

SELECT count(*) AS imported_so_far FROM discovery_events WHERE source = 'Manual import 2026-09-07: hatchesup.co.uk';
