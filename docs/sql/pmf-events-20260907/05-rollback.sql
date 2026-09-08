-- 05 — ROLLBACK. Removes exactly these nine rows and nothing else.
-- Keyed on the natural key AND the manual source string, so a genuinely scraped row that later
-- arrives for the same event is NOT caught by this.

-- 1. LOOK FIRST. Expect exactly 9 rows.
SELECT id, event_date, venue_name, source FROM discovery_events
WHERE truck_name = 'Pimp My FIsh'
  AND source = 'Manual entry 2026-09-07: order.pimp-my-fish.co.uk'
  AND (event_date, venue_name) IN (
    ('2026-09-08','Mandeville Hall'), ('2026-09-09','Great Shelford Memorial Hall'),
    ('2026-09-09','Great Abington Post Office'), ('2026-09-10','Great Bradley village hall'),
    ('2026-09-10','Affleck Arms'), ('2026-09-11','FoodPark CB1'),
    ('2026-09-11','Fordham British Legion'), ('2026-09-11','King Bill IV Pub'),
    ('2026-09-12','Wylde Skye'))
ORDER BY event_date;

-- 2. Only when that list is exactly the nine you expect:
DELETE FROM discovery_events
WHERE truck_name = 'Pimp My FIsh'
  AND source = 'Manual entry 2026-09-07: order.pimp-my-fish.co.uk'
  AND (event_date, venue_name) IN (
    ('2026-09-08','Mandeville Hall'), ('2026-09-09','Great Shelford Memorial Hall'),
    ('2026-09-09','Great Abington Post Office'), ('2026-09-10','Great Bradley village hall'),
    ('2026-09-10','Affleck Arms'), ('2026-09-11','FoodPark CB1'),
    ('2026-09-11','Fordham British Legion'), ('2026-09-11','King Bill IV Pub'),
    ('2026-09-12','Wylde Skye'));
