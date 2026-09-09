-- 🔴 THIS — NOT THE MERGE — IS WHAT ACTUALLY CLEARS PRECONDITION 2.
-- It changes NO DATA. It is the shape the DB-sourced site-list query must have, so that two rows which
-- collapse to one normalised name can never emit two site entries, whatever the data does later.
--
-- The Sheet never needed this: it had one row per truck, so uniqueness was a property of the source.
-- The DB has 231 rows for 230 normalised names, so uniqueness must become a property of the QUERY.
--
-- ⚠️ normalizeName (run-scraper.js:55-64) strips punctuation, the stop-words the/street/st/food/ltd/co/
-- company/and, trailing 's', and all spaces. That is why "La Piazza" and "La Piazza Street Food"
-- collapse. Reproducing it exactly in SQL is possible but fragile — it would be a SECOND implementation
-- of a function that already exists in JavaScript, free to drift. RECOMMENDED: do the grouping in JS
-- with the real normalizeName, exactly as the Sheet path already does everything else.
--
-- Sketch of the JS rule the DB site-list builder needs:
--    const byKey = new Map();
--    for (const row of dbRows) {
--      const url = (row.schedule_url ?? '').trim() || (row.website ?? '').trim() || null;
--      if (!url) continue;                       // not a site
--      const key = normalizeName(row.name);
--      if (!byKey.has(key)) byKey.set(key, row);  // 🔴 deterministic winner, see below
--    }
-- 🔴 "First wins" is NOT deterministic unless the query is ordered. Order by created_at, then id:
--    the oldest row wins, ties broken by id, so the same input always yields the same site list.
--
-- The query to feed it:
select id, name, village, schedule_url, website, ai_instructions, scraper_strategy, created_at
from discovery_trucks
where coalesce(nullif(btrim(schedule_url), ''), nullif(btrim(website), '')) is not null
order by created_at asc, id asc;

-- And the standing check, to run whenever you like — it is the collision sweep as SQL, approximated by
-- lower/strip (NOT normalizeName; use the JS sweep in the report for the authoritative answer):
select lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) as rough_key,
       count(*), array_agg(name)
from discovery_trucks
group by 1 having count(*) > 1;
