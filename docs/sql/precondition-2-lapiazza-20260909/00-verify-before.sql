-- PRECONDITION 2 — the `La Piazza` duplicate.
--
-- ⚠️ THIS PACK IS OPTIONAL AND IS NOT THE FIX FOR THE PRECONDITION. The precondition is that a
-- DB-sourced site list could emit two entries for one truck; that is solved deterministically by the
-- site-list QUERY (see 04-the-query-rule.sql), which changes no data at all. This pack is data hygiene,
-- and it is a judgement about whether these two rows are one business. Read the report before running it.
--
-- 🧪 The sweep found exactly ONE colliding set in all 231 discovery_trucks rows. There are no others.

select id, name, website, schedule_url, order_url, contact_email, phone, scraper_strategy, aliases,
       excluded, hatchgrab_truck_id, created_at,
       (select count(*) from discovery_events e where e.discovery_truck_id = t.id) as events,
       (select count(*) from outreach_prospects p where p.discovery_truck_id = t.id) as prospects
from discovery_trucks t
where id in ('fa09b6c8-9723-404a-b6f2-4888d55c79aa','5a9bbae8-edc4-4f38-9feb-017acf0bfc24');
-- expect: fa09b6c8 "La Piazza" 8 events 1 prospect · 5a9bbae8 "La Piazza Street Food" 7 events 1 prospect

-- 🔴 outreach_prospects.discovery_truck_id is `not null unique references discovery_trucks(id)` with NO
-- on-delete clause (20260903_outreach_tracking.sql:40) — so it is NO ACTION and BLOCKS a delete. It is
-- also UNIQUE, so the loser's prospect cannot be repointed to the keeper; it has to go.
-- Both are stage 'not_contacted' with no notes and ZERO outreach_contacts, so nothing is lost.
select id, discovery_truck_id, stage, notes,
       (select count(*) from outreach_contacts c where c.prospect_id = p.id) as contacts
from outreach_prospects p
where discovery_truck_id in ('fa09b6c8-9723-404a-b6f2-4888d55c79aa','5a9bbae8-edc4-4f38-9feb-017acf0bfc24');
-- expect 2 rows, contacts = 0 on both
