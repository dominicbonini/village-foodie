-- Website-embed Stage 1: per-truck opt-in for the public /embed/<slug> schedule surface.
--
-- 🔴 NOT RUN. Deploys are frozen and this file is written, not applied. Pizzeria Gusto is a live
-- trading truck on this database; nothing here may be executed by anyone but Dominic, by hand.
--
-- CLASSIFICATION: ADDITIVE, and safe to apply before the code that reads it. The column defaults to
-- FALSE, so applying this migration ALONE changes nothing for any truck: every existing row becomes
-- explicitly opted OUT, which is the same state they are in today (no embed route existed).
--
-- WHY THE DEFAULT IS FALSE AND MUST STAY FALSE. This column is the ONLY thing standing between a
-- truck's schedule and a page designed to be framed on a third-party website. The plan gate beside it
-- (canAccess(..., 'embed_schedule', ...)) does NOT provide that protection on its own: 'embed_schedule'
-- is a Max feature, TRIAL_FEATURES is a copy of MAX_FEATURES, and canAccess grants the full trial set
-- when trial_expires_at is NULL — which is exactly what self-serve signup writes. So every self-serve
-- truck passes the plan half of the gate on day one. THIS COLUMN IS THE GATE THAT ACTUALLY BITES.
-- (See lib/features.ts:123-127 and docs/website-embed-build-report.md.)
--
-- NOT NULL so the route never has to decide what a NULL means. `trucks.show_on_vf` and its siblings
-- were made NOT NULL for the same reason on 2 July — a missing-link default was the leak that audit
-- flagged, and a nullable boolean is a third state nobody writes a branch for.
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS embed_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN trucks.embed_enabled IS
  'Per-truck opt-in for the public /embed/<slug> schedule surface, framed on the operator''s own site. Default false. Paired with the Max feature ''embed_schedule''; BOTH must be true for the schedule to render.';
