'use client'
// components/pricing/PlanTableHeadHeight.tsx — /features only (PlanTable variant="features"): publishes the sticky plan
// header's MEASURED height as `--pt-head-h` on the table, so each group heading pins directly beneath it.
//
// The old table (FeatureComparison, c6c44c9e) used a fixed `--cmp-head-h` per breakpoint, measured once for fixed plan
// names. The plan names are data now ("Pay as you go" wraps in a narrow column, a renamed plan may wrap anywhere), so the
// height is measured — the same measured-offset pattern as the Add Order tabs (AddOrderPanel `--addorder-sticky-top`).
// landing.css keeps a per-breakpoint fallback for the first paint and for no-JS. Renders an empty, hidden span.
import { useEffect, useRef } from 'react'

export function PlanTableHeadHeight() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const table = ref.current?.parentElement
    const head = table?.querySelector<HTMLElement>('.pt-head')
    if (!table || !head) return
    const publish = () => table.style.setProperty('--pt-head-h', `${head.getBoundingClientRect().height}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])
  return <span ref={ref} hidden />
}
