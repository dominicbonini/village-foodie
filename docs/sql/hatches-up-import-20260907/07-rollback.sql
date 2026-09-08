-- ROLLBACK. Keyed on the manual-import source string, so a genuinely SCRAPED row arriving later for
-- the same event is never caught by this.
-- 1. LOOK FIRST. Expect 28 rows.
SELECT id, event_date, truck_name, venue_name, source
FROM discovery_events WHERE source = 'Manual import 2026-09-07: hatchesup.co.uk' ORDER BY event_date;

-- 2. Then:
DELETE FROM discovery_events WHERE source = 'Manual import 2026-09-07: hatchesup.co.uk';

-- 3. The 3 venues this import created — remove ONLY if nothing else now references them.
SELECT v.id, v.name, v.village,
       (SELECT count(*) FROM discovery_events e WHERE e.venue_id = v.id) AS events_referencing
FROM venues v WHERE v.id IN ('5160161b-a713-4976-8373-89279fb37494','bc2173b8-e218-4880-9ad0-bd49e692eb42','67597fa0-1bcf-4a03-9717-bb83dadf532c');

-- DELETE FROM venues WHERE id IN ('5160161b-a713-4976-8373-89279fb37494','bc2173b8-e218-4880-9ad0-bd49e692eb42','67597fa0-1bcf-4a03-9717-bb83dadf532c');
