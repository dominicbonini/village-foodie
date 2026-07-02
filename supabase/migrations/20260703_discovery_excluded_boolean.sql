-- Visibility redesign: dedicated `excluded` master-hide boolean + shadow-exclusion suppression.
--
-- CLASSIFICATION: ADDITIVE. Apply BEFORE deploying the code that reads `excluded`. Backfill preserves
-- today's exclusion state exactly (all 37 currently-excluded discovery trucks), so applying this alone
-- changes nothing on the public sites. is_customer + hatchgrab_truck_id columns are KEPT (reversible) but
-- removed from the runtime path by the accompanying code.

-- ── `excluded` = master hide (overrides show_on_vf/show_on_hg). Unifies the two prior exclusion signals. ──
ALTER TABLE trucks           ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;
ALTER TABLE discovery_trucks ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

-- Backfill the 37 currently-excluded scraped trucks:
--   (a) 24 hidden via both site-booleans off (old visibility='hidden')
--   (b) 13 held via exclude_reason ~ 'y' ("Yes - New Truck" etc. — same predicate the endpoint used)
UPDATE discovery_trucks SET excluded = true
WHERE (show_on_vf = false AND show_on_hg = false)
   OR position('y' in lower(coalesce(exclude_reason, ''))) > 0;

-- Operator trucks hidden via both-off → excluded (none today; future-proof + consistent).
UPDATE trucks SET excluded = true WHERE show_on_vf = false AND show_on_hg = false;

-- ── Shadow exclusion: a graduated operator truck's scraped shadow must never surface publicly (its public
--    schedule is its confirmation-gated truck_events only). Exclude Gusto/RTF shadows by normalized name.
--    No-op on today's display (both are hg_only / off VF); sets up leak-safe suppression before the VF flip. ──
UPDATE discovery_trucks SET excluded = true
WHERE lower(btrim(name)) IN ('pizzeria gusto', 'real thai food');

-- ── VERIFICATION (run and eyeball; do NOT trust "success") ──
-- 1) 37-preservation: the count of originally-excluded scraped trucks must be exactly 37.
--    SELECT count(*) FROM discovery_trucks
--     WHERE (show_on_vf = false AND show_on_hg = false)
--        OR position('y' in lower(coalesce(exclude_reason,''))) > 0;   -- expect 37
-- 2) Total excluded now (37 + the 2 Gusto/RTF shadows, unless a shadow already counted):
--    SELECT count(*) FROM discovery_trucks WHERE excluded = true;      -- expect 39
-- 3) Confirm Gusto/RTF shadows flipped:
--    SELECT name, excluded FROM discovery_trucks WHERE lower(btrim(name)) IN ('pizzeria gusto','real thai food');
