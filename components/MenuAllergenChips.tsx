// Shared allergen / dietary PILL styling — the SINGLE source for BOTH the customer order-page per-item
// chips AND the operator allergen-wizard "selected" preview pills, so the operator previews exactly what
// the customer will see. Do NOT restyle a second pill anywhere — import these.
// (Pure presentational components — no hooks, safe in any client/server tree.)

export function DietaryChip({ label }: { label: string }) {
  return <span className="text-[0.625rem] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-md font-medium">{label}</span>
}

export function AllergenChip({ label }: { label: string }) {
  return <span className="text-[0.625rem] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-md font-medium">{label}</span>
}
