// components/OptionStockBadge.tsx
// Shared "N left" / sold-out badge for modifier-OPTION pills (operator AddOrderPanel + customer
// order page). ONE source of truth for the thresholds + wording so both surfaces are identical and
// match the ITEM stock display. `remaining` is the BASKET-AWARE remaining (optionRemaining from
// lib/basket-utils) so the display agrees with the §28 enforcement gate.
//
// Thresholds (mirror the item badge):
//   null      → no badge (untracked)
//   > 10      → no badge
//   4–10      → "N left"   (orange)
//   1–3       → "N left"   (red)      — same wording, red styling carries the urgency (no "Only"/"!")
//   <= 0      → "sold out" (red)      — the pill is also made unselectable by the caller

export function OptionStockBadge({ remaining }: { remaining: number | null }) {
  if (remaining == null || remaining > 10) return null
  if (remaining <= 0) {
    return <span className="text-[0.625rem] font-bold px-1.5 py-0.5 rounded-full border text-red-600 bg-red-50 border-red-200">sold out</span>
  }
  const low = remaining <= 3
  return (
    <span className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded-full border ${low ? 'text-red-600 bg-red-50 border-red-200' : 'text-orange-600 bg-orange-50 border-orange-200'}`}>
      {remaining} left
    </span>
  )
}
