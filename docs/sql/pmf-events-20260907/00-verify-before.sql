-- 00 — BEFORE. Expect: future_events 0 | with_venue_id 0 | pinnable 0
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id,
       count(*) FILTER (WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS pinnable
FROM discovery_events e
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.truck_name ILIKE '%pimp%' AND e.event_date >= CURRENT_DATE;

-- None of the nine may already exist on the unique key. Expect 0 rows.
SELECT event_date, truck_name, venue_name FROM discovery_events
WHERE truck_name ILIKE '%pimp%' AND (event_date, venue_name) IN (
  ('2026-09-08','Mandeville Hall'), ('2026-09-09','Great Shelford Memorial Hall'),
  ('2026-09-09','Great Abington Post Office'), ('2026-09-10','Great Bradley village hall'),
  ('2026-09-10','Affleck Arms'), ('2026-09-11','FoodPark CB1'),
  ('2026-09-11','Fordham British Legion'), ('2026-09-11','King Bill IV Pub'),
  ('2026-09-12','Wylde Skye'));

-- Note your current total, to confirm the delta is exactly 9 afterwards.
SELECT count(*) AS discovery_events_total FROM discovery_events;
