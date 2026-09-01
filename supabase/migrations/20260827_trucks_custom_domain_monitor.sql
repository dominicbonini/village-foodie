-- Custom domain Stage 6: what the daily check writes, and the operator's acknowledgement.
--
-- 🔴 NOT RUN. Deploys are frozen and this file is written, not applied. Pizzeria Gusto is a live
-- trading truck on this database; nothing here is executed by anyone but Dominic, by hand.
--
-- CLASSIFICATION: ADDITIVE. All four nullable, no defaults. Applying it alone changes nothing.
--
-- ── 🔴 FOUR COLUMNS, AND NO HISTORY TABLE. THE ABSENCE IS THE DESIGN. ──────────────────────────
-- Outage duration is `now() - custom_domain_last_ok_at`. That single subtraction answers "how long
-- has this been down", which is the only question a history table would have been built to answer —
-- so a history table would be a second source for a fact that is already derivable, and the two would
-- disagree the first time a row was missed. Nothing here counts, and nothing appends.
--
-- ── WHY `last_seen_value` IS TEXT AND NOT A STATUS ─────────────────────────────────────────────
-- 🔴 A STATUS COLUMN ALONE CANNOT BE DIAGNOSED FROM. "Not resolving" is the same status for a record
-- that was mistyped, a record that conflicts with an existing one, and a domain that has moved host
-- entirely — three different conversations with the operator. This column holds WHAT IS ACTUALLY
-- THERE, so the difference is visible without anyone running a lookup by hand:
--   NULL                     nothing resolves at that name
--   the expected target      correct
--   some other host          it points somewhere else — usually their old site or a typo
-- ⚠️ It records an observation, not a verdict. Whoever reads it draws the conclusion.
--
-- ── `confirmed_at` GATES NOTHING ────────────────────────────────────────────────────────────────
-- It records that a human looked at their own page and said it was right. An operator who never
-- clicks it keeps a fully working page; the column exists so the admin table can tell "live and
-- checked by a person" from "live as far as a machine can tell", which are not the same claim.
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS custom_domain_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS custom_domain_last_ok_at      timestamptz,
  ADD COLUMN IF NOT EXISTS custom_domain_last_seen_value text,
  ADD COLUMN IF NOT EXISTS custom_domain_confirmed_at    timestamptz;

COMMENT ON COLUMN trucks.custom_domain_last_checked_at IS
  'When the daily check last ran for this truck, whatever the answer. A stale value here means the job stopped, not that the domain is down.';
COMMENT ON COLUMN trucks.custom_domain_last_ok_at IS
  'When the domain was last seen resolving correctly. Outage duration is now() minus this — which is why there is no history table.';
COMMENT ON COLUMN trucks.custom_domain_last_seen_value IS
  'What is ACTUALLY resolving at the custom domain, verbatim. NULL = nothing. The diagnostic that separates a mistyped record from a conflicting one from a domain that moved host. An observation, not a verdict.';
COMMENT ON COLUMN trucks.custom_domain_confirmed_at IS
  'When the operator acknowledged that they looked at their own page and it was right. Gates nothing.';
