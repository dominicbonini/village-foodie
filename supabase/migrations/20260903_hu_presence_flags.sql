-- 20260903_hu_presence_flags.sql
-- ⛔ PROPOSED — NOT APPLIED. Awaiting Dominic's approval (Part B item 3). DO NOT RUN until then.
--
-- Adds two INDEPENDENT tri-state facts to outreach_prospects:
--   hu_map      — is the truck present on the Hatches Up MAP / does it hold a Hatches Up ordering page?
--   hu_ordering — is the truck seen USING Hatches Up online ordering (the list-view ✓ badge)?
--
-- ── WHY NULLABLE BOOLEAN (three states, NULL ≠ false) ───────────────────────────────────────────────
-- A nullable boolean is exactly a tri-state: TRUE / FALSE / NULL. NULL = nobody has checked (distinct
-- from false = checked and absent). This preserves the "null means nobody looked" distinction the
-- platform-detection pass established and that Dominic relies on. No CHECK constraint is needed — a
-- boolean is already domain-constrained, and (per the V12.1 no-CHECK rule) PostgREST could not expose one
-- to the UI anyway.
--
-- ── WHY THIS DOES NOT VIOLATE "STORE THE PLATFORM AS TEXT, NOT A BOOLEAN" (V12.1) ───────────────────
-- That rule governs the `platform` IDENTITY column — a multi-valued fact (which platform), where a boolean
-- cannot represent a third platform and collapses unknown into false. It is kept as text and UNTOUCHED
-- here (no drop, no value deleted). These two new columns encode a different kind of fact: the presence /
-- use of ONE specific named platform (Hatches Up), which is genuinely binary — and the unknown state is
-- carried by NULL, not lost. Two orthogonal facts that `platform` (one column) cannot hold, exactly the
-- reason the manual gives for not overloading one column with two questions.
--
-- ── WHERE THEY LIVE ─────────────────────────────────────────────────────────────────────────────────
-- On outreach_prospects (RLS on, anon/authenticated/public revoked), NOT on discovery_trucks. This is
-- outreach-derived competitive intel; the V12.1 rule "outreach data must not hang off discovery_trucks"
-- (which is public-read) applies directly.
--
-- ── HOW TO APPLY (when approved) ────────────────────────────────────────────────────────────────────
-- Run BY HAND in the Supabase SQL editor, as every migration here is. Idempotent (`if not exists`).
-- The backfill is a SEPARATE, separately-approved step (see docs/hu-columns-report.md) and is NOT in
-- this file — this file only adds the columns, all rows start NULL (nobody has looked yet).

set lock_timeout = '3s';

begin;

alter table public.outreach_prospects
  add column if not exists hu_map      boolean,   -- NULL = not checked; true = on HU map / holds HU ordering page; false = checked, absent
  add column if not exists hu_ordering boolean;   -- NULL = not checked; true = seen using HU online ordering; false = checked, not seen

comment on column public.outreach_prospects.hu_map is
  'Hatches Up MAP presence (has a Hatches Up ordering page). NULL = not checked (distinct from false). Set by the reconciliation backfill; never inferred as false from absence in a partial capture.';
comment on column public.outreach_prospects.hu_ordering is
  'Hatches Up ONLINE ORDERING in use (the list-view ✓ badge). NULL = not checked (distinct from false). listed_only in a 7-day window stays NULL, never false.';

commit;

-- Make PostgREST aware of the new columns.
notify pgrst, 'reload schema';
