'use client'

import { prepTimeOptionsFor } from '@/lib/kitchen-capacity'

// Shared prep-time dropdown (V7.8 §42) — ONE control for category prep on BOTH the dashboard
// Menu & Stock section and the Manage category editor. Value = prep_secs (SECONDS), fed straight to
// the caller's existing write (updateCategoryField / upsert_category) via onChange — no payload
// change. OFF-GRID PRESERVATION: prepTimeOptionsFor renders the stored value as a selectable extra
// if it isn't on the 30s/1m grid, and onChange fires ONLY on a user pick — so an untouched off-grid
// category keeps its exact prep_secs (clamping would rewrite a value the capacity engine reads).
export function PrepTimeSelect({
  valueSecs,
  onChange,
  className,
  disabled,
  ariaLabel = 'Prep time',
}: {
  valueSecs: number | null | undefined
  onChange: (secs: number) => void
  className?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const v = Number(valueSecs) || 0
  const options = prepTimeOptionsFor(v)
  return (
    <select
      value={v}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
      className={className}
    >
      {options.map(o => (
        <option key={o.secs} value={o.secs}>{o.label}</option>
      ))}
    </select>
  )
}
