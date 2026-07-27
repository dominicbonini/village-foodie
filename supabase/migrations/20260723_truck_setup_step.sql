-- 20260723_truck_setup_step.sql
-- M5 (Phase 4 Step 3): where a truck got to in the setup wizard, so signup is resumable.
--
-- ADDITIVE / RUN-ANYTIME. Nothing reads it until the wizard ships; ORDER-REQUIRED before that deploy.
--
-- ── WHY THIS IS THE ONLY COLUMN RESUME NEEDS ────────────────────────────────────────────────────────
-- Split by WHERE someone abandons, most of the state is already durable:
--   • before creating an account — signup is ONE screen (email + password); there is no partial state,
--     and the demo return-link already restores the demo itself.
--   • after the identity step  — the TRUCK ROW is the saved state (name, contact are on it).
--   • after the first-event step — the event row is the saved state.
--   • mid menu-wizard          — the only genuinely volatile state (grouping choices, category prep,
--     allergen answers, price fixes live in component state until commit).
-- So the coarse answer — WHICH STEP — is one column, and re-entering the menu wizard rebuilds from
-- `demo_sessions.extraction`, which is already stored. Nothing is lost but in-progress edits.
--
-- Fine-grained resume (autosaving the working payload as jsonb) is DEFERRED: it is a draft-state problem
-- with its own staleness questions, and it deserves evidence that people actually abandon mid-menu first.
--
-- ── WHY ON `trucks`, NOT `operators` ────────────────────────────────────────────────────────────────
-- An operator can own several trucks — one still in setup while others trade. Setup progress is a property
-- of the TRUCK being set up, not of the person. Putting it on the operator would make a second truck's
-- setup silently overwrite the first's.
--
-- NULL = never entered the wizard (every truck that predates this, and every admin-created truck).
-- Readers must treat NULL as "not in setup", NOT as "at step 1" — an existing live truck has no setup
-- state and must never be routed into a wizard.
alter table trucks add column if not exists setup_step text;

comment on column trucks.setup_step is
  'Furthest step reached in the onboarding wizard (identity | menu | event | done). NULL = never entered the wizard — treat as NOT-in-setup, not as step 1, or existing live trucks get routed into onboarding. Resume reads this; the "never went live" admin filter can too.';

-- Partial index: the only query is "trucks still mid-setup", which is a tiny slice of the table.
create index if not exists trucks_setup_step_incomplete on trucks(setup_step)
  where setup_step is not null and setup_step <> 'done';
