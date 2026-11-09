'use client'
// components/pricing/PlanTableHeadHeight.tsx — /features only (PlanTable variant="features"): publishes the sticky plan
// header's MEASURED height as `--pt-head-h` on the table, so each group heading pins directly beneath it.
//
// The old table (FeatureComparison, c6c44c9e) used a fixed `--cmp-head-h` per breakpoint, measured once for fixed plan
// names. The plan names are data now ("Pay as you go" wraps in a narrow column, a renamed plan may wrap anywhere), so the
// height is measured — the same measured-offset pattern as the Add Order tabs (AddOrderPanel `--addorder-sticky-top`).
// landing.css keeps a per-breakpoint fallback for the first paint and for no-JS. Renders an empty, hidden span.
// compare-ux-1 (8 November 2026): the measuring lives in the ONE shared sticky header, components/StickyTableHead.tsx, which the
// comparison pages use too (there it also pins the header under the nav while the table scrolls sideways). Same markup as before.
import { StickyTableHead } from '@/components/StickyTableHead'

export function PlanTableHeadHeight() {
  return <StickyTableHead head=".pt-head" heightVar="--pt-head-h" />
}
