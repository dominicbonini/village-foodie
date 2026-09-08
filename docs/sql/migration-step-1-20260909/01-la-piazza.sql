-- ⚠️ THE ONE AMBIGUOUS ROW — reported, not fixed, and NOT proposed for any write.
--
-- Sheet Trucks row 47 "La Piazza" (url https://www.facebook.com/Lapiazzacambridge) normalises to
-- `lapiazza` under the scraper's normalizeName — and TWO discovery_trucks rows share that key:
--     fa09b6c8-9723-404a-b6f2-4888d55c79aa  "La Piazza"              (website already set, correct)
--     5a9bbae8-edc4-4f38-9feb-017acf0bfc24  "La Piazza Street Food"  (website null)
-- 🔴 "Street" and "Food" are both stripped by normalizeName (run-scraper.js:58), so
--    "La Piazza Street Food" and "La Piazza" collapse to the SAME key. This is the documented
--    behaviour of the normaliser (manual §4.1), not a data error.
--
-- The Sheet cannot say which row it means, so nothing is proposed. Look, then decide by hand:
select id, name, website, schedule_url, created_at,
       (select count(*) from discovery_events e where e.discovery_truck_id = t.id) as events
from discovery_trucks t
where id in ('fa09b6c8-9723-404a-b6f2-4888d55c79aa','5a9bbae8-edc4-4f38-9feb-017acf0bfc24');

-- If they are the same truck, the fix is a MERGE (and one of them should not exist), not a backfill.
