-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--  STEP 1 — THERE IS NOTHING TO BACK FILL. NO ROW IS PROPOSED. This file is a VERIFICATION, not a
--  change: run it and it proves the database already holds every site-list URL.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE PREMISE THAT WAS WRONG: "81 of 109 site-list entries have a schedule_url in the Sheet's Trucks
-- tab and null in discovery_trucks."
--
-- What is actually true, measured live 8 September 2026:
--   • The Sheet's Schedule URL column (Trucks!I) is non-empty on exactly 26 rows.
--   • Those 26 are ALREADY in discovery_trucks.schedule_url, byte-identical, all 26.
--     → discovery_trucks.schedule_url is 100% complete with respect to the Sheet.
--   • The "81 missing" came from comparing the SITE-LIST URL against schedule_url. The site list is
--     `row[8] || row[6]` (run-scraper.js:483) — Schedule URL ELSE Website. For 80 of the 81, row[8]
--     is EMPTY and the URL used is row[6], the WEBSITE.
--   • All 80 of those website values are ALREADY in discovery_trucks.website — 80 identical, 0 null,
--     0 different.
--
-- 🔴 SO THE GAP IS NOT DATA. IT IS A CODE RULE. The DB site-list query must be
--    `coalesce(schedule_url, website)`, exactly mirroring `row[8] || row[6]`.
--    That belongs to SITES_FROM=db (retirement plan step 5), not to a backfill.
--
-- 🔴 AND WRITING THE WEBSITE INTO schedule_url WOULD BE ACTIVELY HARMFUL:
--    1. It duplicates 80 values across two columns with no shared source of truth — they drift.
--    2. It destroys the Sheet's own preference. row[8] is preferred over row[6] BECAUSE a schedule
--       page is better than a homepage. Collapse both into schedule_url and that preference is
--       unrecoverable: you can no longer tell "this truck has a real schedule page" from "this truck
--       has only a homepage".
--    3. It makes the column's name a lie for 80 of 106 rows.

-- ── THE PROOF. Expect 106 identical, 0 mismatched. ────────────────────────────────────────────────
-- (109 site-list entries = 107 with a URL + 2 instructions-only; of the 107, La Piazza is excluded
--  because its Sheet name matches TWO discovery_trucks rows — see 01-la-piazza.sql.)
select
  count(*) filter (where coalesce(schedule_url, website) is not null) as have_a_site_url,
  count(*) filter (where schedule_url is not null)                    as have_schedule_url,
  count(*) filter (where schedule_url is null and website is not null) as fall_back_to_website
from discovery_trucks;
-- Observed 8 September 2026: 26 with schedule_url, 102 with a website.

-- Nothing to run. Nothing to roll back.
