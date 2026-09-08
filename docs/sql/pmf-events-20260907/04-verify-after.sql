-- 04 — AFTER. Expect: future_events 9 | with_venue_id 9 | pinnable 9
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id,
       count(*) FILTER (WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS pinnable
FROM discovery_events e
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.truck_name ILIKE '%pimp%' AND e.event_date >= CURRENT_DATE;

-- The nine, as the public feed will read them.
SELECT e.event_date, e.start_time, e.end_time, e.venue_name, e.village,
       v.name AS linked_venue, v.latitude, v.longitude, e.show_on_vf
FROM discovery_events e
JOIN venues v ON v.id = e.venue_id
WHERE e.truck_name ILIKE '%pimp%' AND e.event_date >= CURRENT_DATE
ORDER BY e.event_date, e.start_time;

-- Delta must be exactly 9 against the number 00-verify-before.sql gave you.
SELECT count(*) AS discovery_events_total FROM discovery_events;
