-- 01 — Baseline. Run before any chunk. Expect: 669 | 69 | 69
SELECT count(*) AS future_events,
       count(e.venue_id) AS with_venue_id,
       count(*) FILTER (WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS pinnable
FROM discovery_events e
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= CURRENT_DATE;
