-- docs/scraper-diagnosis-queries.sql
-- Diagnostic queries for "few trucks on the map" — see docs/scraper-diagnosis-report.md
--
-- 🔴 THESE ARE READ-ONLY DIAGNOSTICS, NOT A MIGRATION. Every statement is a SELECT.
-- Deliberately NOT in supabase/migrations/ — anything in that folder reads as something to apply,
-- and these are questions, not changes. Nothing here writes, alters or drops.
--
-- RUN IN ORDER. Queries 1 and 2 come first because migrations in this project are applied by hand,
-- so a schema listing is a photograph and column names must be confirmed before they are trusted.
--
-- THE FINDING THEY TEST (measured from the live API, 7 September 2026):
--   639 future events · 39 trucks · but only 69 events (10.8%) and 7 trucks (18%) can be pinned.
--   Coordinates come ONLY from joining discovery_events.venue_id -> venues.latitude/longitude,
--   and nothing in the codebase ever creates a venues row.


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1. WHAT COLUMNS ACTUALLY EXIST
--    Run this FIRST. If a column named below is absent here, substitute what this returns
--    rather than assuming — do not edit the query to match what you expected.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('discovery_events','discovery_trucks','venues','truck_events','scraper_run_log')
order by table_name, ordinal_position;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2. DOES scraper_run_log EXIST AT ALL?
--    The reference manual names it; nothing in app/ or lib/ reads it. This settles whether it
--    is a live table, a dead one, or was never created.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like '%scraper%';


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3. 🔴 THE DECISIVE ONE — WHEN DID THE SCRAPER LAST WRITE?
--    Everything in the report assumes the data is current. The API only returns FUTURE events,
--    so live data proves the rows exist, NOT that they were written recently. This is the only
--    query that separates "it ran last night" from "these are old future-dated rows".
--    ⚠️ If query 1 shows no created_at, substitute the timestamp column it does have.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
select
  max(created_at)                                                 as last_write,
  now() - max(created_at)                                         as ago,
  count(*)                                                        as total_rows,
  count(*) filter (where created_at > now() - interval '24 hours') as written_last_24h,
  count(*) filter (where created_at > now() - interval '7 days')   as written_last_7d
from public.discovery_events;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4. WRITES PER DAY, LAST FORTNIGHT
--    A scraper that ran shows a cluster on each run day. A flat gap is a scraper that stopped.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
select date(created_at) as day, count(*) as rows_written
from public.discovery_events
where created_at > now() - interval '14 days'
group by 1
order by 1 desc;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5. 🔴 THE ROOT CAUSE, COUNTED IN THE DATABASE RATHER THAN INFERRED FROM THE API
--    Expect roughly: 639 future events, ~570 with venue_id null, ~89% unpinnable.
--    A materially different answer means the API view and the table disagree — worth knowing.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
select
  count(*)                                     as future_events,
  count(*) filter (where venue_id is null)     as no_venue_row,
  count(*) filter (where venue_id is not null) as has_venue_row,
  round(100.0 * count(*) filter (where venue_id is null) / nullif(count(*),0), 1) as pct_unpinnable
from public.discovery_events
where event_date >= current_date
  and show_on_vf = true;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6. 🔴 THE WORK LIST — the missing venues, ranked by how many events each would restore
--    Each row is ONE venues row that would put every event under it back on the map.
--    ⚠️ READ IT BEFORE ACTING. At least one scraped name ("Near the Co op Store") is an
--    extraction artefact rather than a real venue, so this needs a human pass, not 123 inserts.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
select venue_name, village, count(*) as lost_events
from public.discovery_events
where event_date >= current_date
  and show_on_vf = true
  and venue_id is null
group by 1, 2
order by lost_events desc;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7. WHEN DID VENUE CREATION STOP?
--    The manual records 11 June 2026 and says the map "did not break; it drained".
-- ═══════════════════════════════════════════════════════════════════════════════════════════
select date(created_at) as day, count(*) as venues_created
from public.venues
group by 1
order by 1 desc
limit 20;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 8. HOW MANY EXISTING VENUES ARE THEMSELVES UNPINNABLE?
--    A venues row with no coordinates joins fine and still yields no pin — a second, quieter
--    way to lose an event. Not measured in the report; worth knowing before creating more.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
select
  count(*)                                                              as total_venues,
  count(*) filter (where latitude is null or longitude is null)         as missing_coords,
  count(*) filter (where postcode is null or btrim(postcode) = '')      as missing_postcode
from public.venues;
