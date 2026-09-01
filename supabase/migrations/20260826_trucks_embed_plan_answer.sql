-- Website-embed Stage 2b: the operator's answer to the platform plan-requirement question.
--
-- 🔴 NOT RUN. Deploys are frozen and this file is written, not applied. Pizzeria Gusto is a live
-- trading truck on this database; nothing here is executed by anyone but Dominic, by hand.
--
-- CLASSIFICATION: ADDITIVE. One nullable text column, no default, no constraint beyond the CHECK.
-- Applying it alone changes nothing: every existing row gets NULL, which reads as "never asked" —
-- the correct state for a truck that has not been through the wizard.
--
-- ── WHY IT IS RECORDED AT ALL ───────────────────────────────────────────────────────────────────
-- The plan-requirement screen is a WARNING, NOT A LOCK: an operator who answers "no" or "not sure"
-- can still continue. So the answer is the only trace of what they told us, and it is the difference
-- between "their embed is not showing because they are on a plan that cannot host it" and "their
-- embed is not showing for some unknown reason". Without it, support has to ask again.
--
-- ⚠️ THREE VALUES AND NOT A BOOLEAN. "not sure" is a real answer and the commonest honest one — an
-- operator who does not know which plan they are on is exactly who this screen exists for. Folding it
-- into false would record a claim they did not make.
--
-- 🔴 NO PLAN TIER IS STORED, DELIBERATELY. The column holds OUR question's answer, not a name for
-- somebody else's product. A tier name is a claim about another company's pricing that goes stale on
-- their next rename, and a stale name in a database outlives a stale name in copy.
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS embed_plan_answer text
    CHECK (embed_plan_answer IN ('yes', 'no', 'not_sure'));

COMMENT ON COLUMN trucks.embed_plan_answer IS
  'What the operator answered when told their website builder may not include the feature on its cheapest plan: yes / no / not_sure. NULL = never asked. A warning, not a lock — "no" and "not_sure" both allow the operator to continue.';
