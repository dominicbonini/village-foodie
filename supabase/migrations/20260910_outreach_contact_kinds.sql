-- 20260910_outreach_contact_kinds.sql
-- Re-map `outreach_contacts.kind` onto the numbered contact sequence.
--
-- ⛔ NOT APPLIED. Run by hand in the Supabase SQL editor. Idempotent (each UPDATE is scoped to the old
--    value, so a second run matches nothing).
-- 🔴 AFTER APPLYING, RUN THE LAST LINE: `notify pgrst, 'reload schema';`
--    PostgREST caches the schema; until it reloads, a table that exists still answers PGRST205 — which
--    reads as "the migration failed" and cost a red scrape on 9 September.
--
-- ── 🔴 THIS IS A DATA MIGRATION, NOT A SCHEMA ONE ───────────────────────────────────────────────────
-- `kind` is plain `text` with NO CHECK constraint and NO enum — 20260903_outreach_tracking.sql declares
-- it as `kind text` and `lib/outreach.ts` carries the comment "the migration carries no CHECK, so THESE
-- are the enforcement". So the application could adopt the new vocabulary WITHOUT this file at all; the
-- app already renders legacy values correctly via `kindLabel`. This file exists only to make the stored
-- history read consistently with the picker. Nothing breaks if it is never run.
--
-- ── 🔴 WHAT THE LIVE ROWS ACTUALLY ARE (measured 10 September, count-asserted) ───────────────────────
--   9 rows total — NOT the 6 assumed when this change was specified.
--     first_contact  6   (5 outbound, 1 inbound)
--     follow_up      2   (both outbound)
--     reply          1   (OUTBOUND)
--
-- ── 🔴 WHY `reply` IS DELIBERATELY LEFT ALONE ───────────────────────────────────────────────────────
-- The brief's instruction is "do not lose them or rewrite their meaning". The one `reply` row is
-- OUTBOUND — it is Dominic's closing reply to a prospect who declined ("Ok thanks for getting back to me
-- … I wont reach out to you again"). It is therefore NOT a first contact and NOT a chase, and mapping it
-- to either would rewrite what happened. There is no slot for it in a three-step outbound ladder, and
-- inventing one would re-create the very problem the ladder removes.
-- So it stays as `reply`, a legacy value the picker no longer offers and `kindLabel` renders as
-- "reply (legacy)". `kind` is unconstrained text, so a value outside the current vocabulary is legal.
-- ⚠️ NOTE the same thread's INBOUND row is stored as `first_contact` — the old vocabulary was already
-- being applied inconsistently, which is the reason for this change. It maps to `1_first_contact` below;
-- `direction = 'inbound'` is what records that they replied, and it is untouched.

begin;

-- Expect 6 → 1_first_contact
update public.outreach_contacts set kind = '1_first_contact' where kind = 'first_contact';

-- Expect 2 → 2_chase_1. "follow up" and "chase" named the same step; `chase` was never once written.
update public.outreach_contacts set kind = '2_chase_1'       where kind = 'follow_up';

-- 🔴 Deliberately absent: any UPDATE touching `reply`, and any touching `chase` (0 rows carry it).
--    `3_chase_2` has no legacy equivalent — nothing has reached that step yet.

commit;

-- ── VERIFY AFTER RUNNING ────────────────────────────────────────────────────────────────────────────
-- Expected afterwards: 1_first_contact 6 · 2_chase_1 2 · reply 1 · TOTAL 9 (unchanged).
-- 🔴 If TOTAL is not 9, something deleted rows — this file only ever UPDATEs.
--   select kind, count(*) from public.outreach_contacts group by kind order by kind;

notify pgrst, 'reload schema';
