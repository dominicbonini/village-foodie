-- 01 — BEFORE. Note these numbers.
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id,
       count(*) FILTER (WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS pinnable,
       count(DISTINCT e.truck_name) AS trucks
FROM discovery_events e LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= CURRENT_DATE;

SELECT count(*) AS venues_total FROM venues;
