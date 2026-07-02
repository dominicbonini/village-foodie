-- Discovery visibility model: 4 per-site booleans + is_customer, replacing the tri-state `visibility`.
--
-- CLASSIFICATION: ADDITIVE. Apply BEFORE deploying the code that reads these columns. Old code keeps
-- reading `visibility` (kept, NOT dropped here) → applying this migration ALONE changes nothing. The
-- backfill preserves today's effective state, so after code deploy + before any manual toggle, behaviour
-- is identical to today. Drop the `visibility` columns in a later migration once the booleans are proven.
--
-- LEAK-SAFE ORDERING: this migration + the code that reads it must both be live BEFORE anyone flips
-- Gusto/RTF show_on_vf=true. This migration does NOT set show_on_vf=true for any real truck (backfilled to
-- today's value); that VF flip is a deliberate post-deploy step once discovery_events suppression is live.

-- ── Operator trucks: authoritative per-site visibility + order-link + customer flag ──
-- Fail-safe defaults for NEW trucks: OFF Village Foodie, ON HatchGrab (the test portal); order link OFF VF,
-- ON HG (today's hard-coded behaviour). NOT NULL → the operator-event query never falls back to a "public"
-- default (closes the unlinked-truck leak the audit flagged).
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS show_on_vf    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_hg    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS order_link_vf boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_link_hg boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_customer   boolean NOT NULL DEFAULT false;

-- Backfill show_on_vf/show_on_hg to TODAY'S effective state:
--   linked discovery visibility → public: vf✓ hg✓ | hg_only: vf✗ hg✓ | hidden: vf✗ hg✗
--   NOT linked (today defaults public/both) → vf✓ hg✓
UPDATE trucks t SET
  show_on_vf = CASE d.visibility WHEN 'public' THEN true WHEN 'hg_only' THEN false WHEN 'hidden' THEN false ELSE true END,
  show_on_hg = CASE d.visibility WHEN 'public' THEN true WHEN 'hg_only' THEN true  WHEN 'hidden' THEN false ELSE true END
FROM trucks tid
LEFT JOIN LATERAL (
  SELECT visibility FROM discovery_trucks dt WHERE dt.hatchgrab_truck_id = tid.id LIMIT 1
) d ON true
WHERE t.id = tid.id;
-- order_link_* keep defaults (vf=false, hg=true) = today's hard-coded behaviour for every truck.

-- Customer trucks. SAFE to set now: their discovery_events are already off VF (hg_only truck-level
-- visibility) and never shown on HG (HG shows operator events only), so suppression is a no-op today; it
-- becomes load-bearing only once show_on_vf is later flipped on.
UPDATE trucks SET is_customer = true  WHERE id IN ('pizzeria-gusto', 'real-thai-food');
UPDATE trucks SET is_customer = false WHERE id = 'test-truck';   -- explicit (already the default)

-- ── Scraped trucks: per-site booleans ──
ALTER TABLE discovery_trucks
  ADD COLUMN IF NOT EXISTS show_on_vf boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_hg boolean NOT NULL DEFAULT true;
UPDATE discovery_trucks SET
  show_on_vf = (visibility = 'public'),
  show_on_hg = (visibility IN ('public', 'hg_only'));

-- ── Scraped events: per-site booleans (OPTION A — discovery_events.visibility diverges from its parent in
--    a minority of rows, so per-event granularity must be preserved, not gated by the parent). ──
ALTER TABLE discovery_events
  ADD COLUMN IF NOT EXISTS show_on_vf boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_hg boolean NOT NULL DEFAULT true;
UPDATE discovery_events SET
  show_on_vf = (visibility = 'public'),
  show_on_hg = (visibility IN ('public', 'hg_only'));
