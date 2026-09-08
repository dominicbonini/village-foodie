-- 04 — PART B chunk 2 of 3 — 10 event inserts.
-- Guarded ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING: a re-run is a no-op, and the
-- scraper recovering cannot duplicate these.
INSERT INTO discovery_events
  (event_date, start_time, end_time, truck_name, venue_name, village,
   event_notes, source, ai_notes, discovery_truck_id, venue_id, visibility, show_on_vf, show_on_hg)
VALUES
  ('2026-09-10','12:00','13:45','Kerief Catering Ltd','foodPark Cambridge Science park',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'b602a457-27db-4b44-970c-6c74a5f5a235','public',true,true),
  ('2026-09-10','17:30','21:00','Clumsies','Mrs Salisburys Carpark',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'bc2173b8-e218-4880-9ad0-bd49e692eb42','public',true,true),
  ('2026-09-10','17:00','20:00','Broadside Pizza','Daisy''s Milk Shed, Attleborough',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'67597fa0-1bcf-4a03-9717-bb83dadf532c','public',true,true),
  ('2026-09-10','11:00','20:00','The Yeerologist','The Yeerologist @ Eat17',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5160161b-a713-4976-8373-89279fb37494','public',true,true),
  ('2026-09-10','06:30','12:00','Barista Boy Coffee Co','Flitch Green',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'8d470c35-70b9-42eb-aa2e-dd095d96466e','public',true,true),
  ('2026-09-11','17:30','21:00','Clumsies','Mrs Salisburys Carpark',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'bc2173b8-e218-4880-9ad0-bd49e692eb42','public',true,true),
  ('2026-09-11','11:00','20:00','The Yeerologist','The Yeerologist @ Eat17',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'5160161b-a713-4976-8373-89279fb37494','public',true,true),
  ('2026-09-11','06:30','12:00','Barista Boy Coffee Co','Flitch Green',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'8d470c35-70b9-42eb-aa2e-dd095d96466e','public',true,true),
  ('2026-09-11','10:00','16:00','Crumbelievable','Cambridge Market',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'ff72a5bb-c425-4220-bb67-11c0807f5aa0','public',true,true),
  ('2026-09-12','16:45','20:00','Pizza Mondo','Three Horseshoes Comberton',NULL,NULL,'Manual import 2026-09-07: hatchesup.co.uk',NULL,NULL,'6085096a-009a-4d04-9093-9252126c9a81','public',true,true)
ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING;

SELECT count(*) AS imported_so_far FROM discovery_events WHERE source = 'Manual import 2026-09-07: hatchesup.co.uk';
