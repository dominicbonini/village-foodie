-- 20260914_outreach_lead_type_freeze.sql
-- ⛔ PROPOSED — NOT APPLIED. Apply by hand in the Supabase SQL editor, as every migration here is.
-- 🔴 THIS HEADER IS LOAD-BEARING AND MUST BE CORRECTED THE DAY IT IS APPLIED. A stale "NOT APPLIED"
-- header on an applied file is a recorded trap in this repository, and so is the reverse — the run-log
-- migration was read as unapplied for two days while it was live. As at writing, this file has never
-- been executed against any database.
--
-- ── WHAT AND WHY ────────────────────────────────────────────────────────────────────────────────────
-- Adds ONE nullable column to outreach_prospects:
--   lead_type_at_first_contact  text — which of the four lead types this prospect was WHEN THE FIRST
--                                      CONTACT WAS LOGGED. NULL = not captured; derive live instead.
--
-- 🔴 THE PROBLEM IT SOLVES. Lead types 3 (`on_vf`) and 4 (`not_listed`) are DERIVED, and one of the
-- three conditions behind them is "does this truck have an upcoming discovery_events row" — which the
-- scraper rewrites every morning, and which the daily prune deletes from as dates pass. So a prospect
-- can be sent a first contact saying "your schedule is listed on villagefoodie.co.uk" and a chase three
-- days later saying "I could not find you listed anywhere", with nothing having changed but a scrape.
-- 🧪 The operator's figure: 109 of 231 prospects sit in those two types today, so this is most of the
-- list, not an edge. Types 1 and 2 (hu_ordering / hu_map) are hand-set flags and do not drift.
--
-- ── THE VALUES, AND WHAT CONSTRAINS THEM ────────────────────────────────────────────────────────────
-- Exactly one of: 'hu_ordering' | 'hu_map' | 'on_vf' | 'not_listed'.
--
-- 🔴 NO CHECK CONSTRAINT, AND THAT IS THE HOUSE RULE RATHER THAN AN OVERSIGHT. 20260903_outreach_tracking
-- states it: PostgREST exposes no CHECK metadata, so the app cannot read a constraint back to build a
-- dropdown from it, and a constraint there is a rule with no reader that drifts the moment someone edits
-- one side. Validation lives in application code:
--   • the TS union `LeadType` in lib/outreach-step.ts, derived from the `LEAD_TYPES` array
--   • `isLeadType`, which the API route calls before every write (HTTP 400 otherwise)
--   • the modal offers a <select> built from `LEAD_TYPES`, so no other value can be typed
--
-- ⚠️ THE COST OF THAT RULE IS REAL AND IS NAMED HERE. `outreach_contacts.kind` is also unconstrained
-- text, and it is exactly how the vocabulary split into `first_contact` / `1_first_contact` and left 8
-- of 17 rows unreadable this week. The difference: `kind` was renumbered AFTER rows existed, whereas
-- this column starts empty and is only ever written by one validated path. If a second writer is ever
-- added, this is the paragraph that should stop it.
--
-- ── BACKFILL: NONE, DELIBERATELY ────────────────────────────────────────────────────────────────────
-- 🔴 DO NOT BACKFILL. A backfill would stamp TODAY's derived type onto the 9 prospects already
-- mid-sequence — which is precisely the drift this column exists to prevent, applied retroactively and
-- then frozen as if it were evidence. NULL means "fall back to the live derivation", so those 9 and the
-- 222 not yet contacted all keep working unchanged. The column fills itself as first contacts are logged.

set lock_timeout = '3s';

begin;

alter table public.outreach_prospects
  add column if not exists lead_type_at_first_contact text;

comment on column public.outreach_prospects.lead_type_at_first_contact is
  'The lead type captured when the first contact was logged: hu_ordering | hu_map | on_vf | not_listed. '
  'NULL = not captured, so the app derives it live instead. Written once, by the rung-1 log path only; '
  'never backfilled. Unconstrained text by the V12.1 no-CHECK rule — validated by isLeadType in '
  'lib/outreach-step.ts and by the API route before every write.';

commit;

-- Make PostgREST aware of the new column.
notify pgrst, 'reload schema';
