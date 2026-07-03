'use client'
// PIECE 2 — reconnect "capacity exceeded" banner (WARNING ONLY, non-blocking, dismissible).
//
// Surfaces the server-detected breaches (detectCapacityBreaches, §31) so the operator can find the
// over-subscribed slot(s) and bump/amend BY JUDGMENT. No auto-bump, no gating, no placement change.
//
// Appears whenever the authoritative production_slot_usage has a slot genuinely OVER a ceiling —
// the common cause being an offline order colliding with an online booking on the same slot while the
// truck was offline (accepted as unavoidable; §31 only asks that it be FLAGGED on reconnect). Also
// covers an operator override that pushed a slot over. Dismiss hides it until the breach set CHANGES
// (a new/worse breach re-shows), so it never nags about an already-reviewed slot.

import type { CapacityBreach } from '@/lib/capacity-breach'

/** Stable signature of the current breach set — dismiss is keyed to this so a NEW breach re-shows. */
export function breachSignature(breaches: CapacityBreach[]): string {
  return (breaches || [])
    .map(b => `${b.collection_time}:${b.over_total}:${b.over_cats.map(c => `${c.cat}${c.over}`).join(',')}`)
    .sort()
    .join('|')
}

export function CapacityBreachBanner({
  breaches,
  dismissedSig,
  onDismiss,
}: {
  breaches: CapacityBreach[]
  dismissedSig: string | null
  onDismiss: (sig: string) => void
}) {
  if (!breaches || breaches.length === 0) return null
  const sig = breachSignature(breaches)
  if (sig === dismissedSig) return null

  const n = breaches.length
  return (
    <div className="w-full bg-red-600 text-white text-sm px-4 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="font-bold">
          ⚠ {n} {n === 1 ? 'slot' : 'slots'} over capacity — review
        </span>
        <span className="text-xs text-red-50 leading-snug">
          {breaches.map(b => {
            const ids = b.order_ids.length ? ` (orders ${b.order_ids.map(i => `#${i}`).join(', ')})` : ''
            return `${b.collection_time} — ${b.reason}${ids}`
          }).join('  ·  ')}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(sig)}
        className="self-end sm:self-auto underline font-bold shrink-0"
      >
        Dismiss
      </button>
    </div>
  )
}
