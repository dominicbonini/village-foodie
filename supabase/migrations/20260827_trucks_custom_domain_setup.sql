-- Custom domain Stage 5: enough state to RESUME setup, and nothing else.
--
-- 🔴 NOT RUN. Deploys are frozen and this file is written, not applied. Pizzeria Gusto is a live
-- trading truck on this database; nothing here is executed by anyone but Dominic, by hand.
--
-- CLASSIFICATION: ADDITIVE. Both nullable, no default. Applying it alone changes nothing.
--
-- ── WHY THESE TWO AND NOTHING MORE ──────────────────────────────────────────────────────────────
-- The one thing provisioning owes a truck that closed the tab halfway is the ability to come back to
-- where it was. `custom_domain_setup_state` says which screen that is; `custom_domain_setup_started_at`
-- says when, which is what turns "stuck" into "stuck since Tuesday" for whoever picks up the support
-- conversation.
-- 🔴 THE STAGE 6 COLUMNS ARE DELIBERATELY ABSENT. No last-checked timestamp, no failure count, no
-- notification state. The daily check is a later stage whose schema is not designed, and a column
-- added now by the wrong workstream is the shape this manual already records as dangerous — present,
-- plausible, and meaning something slightly different from what the later reader assumes.
--
-- ── THE STATES, AND WHY 'registered' IS THE ONE THAT MATTERS ────────────────────────────────────
--   'choosing'      the operator is picking an address; nothing exists anywhere yet
--   'registered'    🔴 THE DOMAIN IS ATTACHED TO THE VERCEL PROJECT. This state exists because that
--                   call has a side effect OUTSIDE this database, and a truck that abandons setup
--                   here leaves a domain attached to the project with no DNS pointing at it. Without
--                   a column saying so, that orphan is invisible until someone reads the Vercel
--                   dashboard by hand.
--   'awaiting_dns'  the operator has been shown the record and has not finished
-- NULL means never started. There is no 'done' state: `custom_domain_verified_at` (Stage 4) is what
-- says a domain is serving, and inventing a second answer to that question is how two columns start
-- disagreeing.
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS custom_domain_setup_state      text
    CHECK (custom_domain_setup_state IN ('choosing', 'registered', 'awaiting_dns')),
  ADD COLUMN IF NOT EXISTS custom_domain_setup_started_at timestamptz;

COMMENT ON COLUMN trucks.custom_domain_setup_state IS
  'Where the operator got to in custom-domain setup, so closing the tab resumes rather than restarts: choosing / registered / awaiting_dns. NULL = never started. ''registered'' means the domain is attached to the Vercel project — a side effect outside this database.';
COMMENT ON COLUMN trucks.custom_domain_setup_started_at IS
  'When custom-domain setup began. Turns "stuck" into "stuck since Tuesday" for support. Not a check timestamp — the daily check is a later stage.';
