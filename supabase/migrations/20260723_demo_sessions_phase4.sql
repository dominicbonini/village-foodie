-- 20260723_demo_sessions_phase4.sql
-- Phase 4 (signup): the three columns the demo → real-truck migration needs.
--
-- ⚠️ WHY THIS IS A SEPARATE FILE, NOT AN EDIT TO 20260723_demo_sessions.sql
-- That file was recorded — in its own header, in docs/onboarding-flow.md, and in conversation — as NOT YET
-- APPLIED. It HAS been applied: both tables exist in the live DB. Folding these columns into it would have
-- been silently useless, because its `create table if not exists` is a no-op against the existing tables —
-- the file would "run clean" and add nothing, while every downstream reader assumed the columns existed.
--
-- That is the FOURTH instance of this family (see docs/onboarding-flow.md §9.3 #1): a belief about the
-- database is not a fact about the database. This time the belief erred in the safe-looking direction
-- ("not applied" when it was), which is if anything more dangerous — it invites a rewrite of a file that
-- has already run.
--
-- ADDITIVE / RUN-ANYTIME, but ORDER-REQUIRED: nothing reads these columns until the Phase 4 code ships,
-- and every statement is `if not exists`, so this is safe to run now and safe to run twice. It must land
-- BEFORE the provision-demo change that writes `extraction`, or that insert fails.

-- ── extraction ──────────────────────────────────────────────────────────────────────────────────────
-- The MenuExtraction payload (categories + items + modifier groups) exactly as the AI returned it, stored
-- at provision time.
--
-- WHY STORE IT: signup re-COMMITS the menu into the new truck rather than copying rows. The demo silently
-- decided grouped-vs-separate ("beef curry + chicken curry" as one item with a choice, or two items) —
-- that decision is the SHAPE of the committed rows, so it cannot be re-asked after a copy. Re-committing
-- from the original payload puts the question back to the operator. It loses nothing a copy would keep:
-- menu editing is hidden in the demo, so the committed rows are a pure function of this payload.
--
-- RETENTION: it is their menu content, and it cascades with the truck (the table's PK is the FK), so it is
-- deleted by the same 24h/14d cleanup as everything else. No separate retention rule.
alter table demo_sessions add column if not exists extraction jsonb;

comment on column demo_sessions.extraction is
  'MenuExtraction payload as returned by the AI at provision time. Signup re-commits from this rather than copying rows, so the demo''s silent grouped-vs-separate decision can be re-asked. Cascades with the truck.';

-- ── claimed_by_operator_id ──────────────────────────────────────────────────────────────────────────
-- Set when a visitor signs up and this demo's menu is migrated to their real truck.
--
-- TWO JOBS: (1) it tells the cleanup job not to delete a demo that is mid-migration — nothing currently
-- prevents that, and the window is exactly when losing it would be worst; (2) it supplies the link target
-- for the retirement interstitial, so a demo tab left open in another window can say "you're set up, your
-- real dashboard is here" instead of 404ing at the moment of conversion.
--
-- ON DELETE SET NULL, not CASCADE: deleting an operator must never delete demo lifecycle history.
alter table demo_sessions add column if not exists claimed_by_operator_id uuid
  references operators(id) on delete set null;

comment on column demo_sessions.claimed_by_operator_id is
  'Operator who converted this demo. Blocks cleanup mid-migration and supplies the retirement interstitial''s link target.';

-- ── retired_at ──────────────────────────────────────────────────────────────────────────────────────
-- Set on successful migration. The demo is NOT deleted at that moment.
--
-- WHY RETIRE RATHER THAN DELETE: once the truck row is gone, a demo tab still open in another window
-- cannot tell WHY it broke — "you signed up", "this expired" and "the network dropped" are indistinguishable,
-- so the only honest message is a vague one about a thing that just vanished. Retiring keeps the row alive
-- long enough for the tab to say something true and specific. `expires_at` is pushed to ~1h on retirement,
-- so the EXISTING hourly cleanup performs the delete — no new job, no new schedule.
alter table demo_sessions add column if not exists retired_at timestamptz;

comment on column demo_sessions.retired_at is
  'Set on successful signup migration. The row survives ~1h so an open demo tab can show a handoff instead of a 404; the existing cleanup then deletes it via expires_at.';

-- Cleanup reads `where expires_at < now()` and must skip rows mid-migration; this keeps that predicate
-- index-supported once the claimed filter is added to it.
create index if not exists demo_sessions_claimed on demo_sessions(claimed_by_operator_id)
  where claimed_by_operator_id is not null;
