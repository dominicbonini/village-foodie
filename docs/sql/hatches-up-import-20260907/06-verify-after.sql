-- AFTER. Compare with 01.
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id,
       count(*) FILTER (WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS pinnable,
       count(DISTINCT e.truck_name) AS trucks
FROM discovery_events e LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= CURRENT_DATE;

-- Everything this import added, as the feed will read it. Expect 28 rows.
SELECT e.event_date, e.start_time, e.end_time, e.truck_name, e.venue_name,
       v.name AS linked_venue, v.village, v.latitude, v.longitude
FROM discovery_events e JOIN venues v ON v.id = e.venue_id
WHERE e.source = 'Manual import 2026-09-07: hatchesup.co.uk' ORDER BY e.event_date, e.truck_name;

SELECT count(*) AS venues_total FROM venues;
