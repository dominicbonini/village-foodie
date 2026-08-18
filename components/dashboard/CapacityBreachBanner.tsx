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
  orders,
}: {
  breaches: CapacityBreach[]
  dismissedSig: string | null
  onDismiss: (sig: string) => void
  /** The event's orders, for the contributor line. OPTIONAL: without it the banner renders the
   *  headline and the bare order numbers exactly as it did before, so no caller is forced to change. */
  orders?: Array<{ order_key: string; id: string | number; items?: Array<{ quantity?: number }> }>
}) {
  if (!breaches || breaches.length === 0) return null
  const sig = breachSignature(breaches)
  if (sig === dismissedSig) return null

  const n = breaches.length
  // WHAT AN OPERATOR CAN ACT ON: a collection slot, a quantity, and order numbers.
  // `collection_time` on a breach IS ALREADY THE COLLECTION SLOT -- detectCapacityBreaches iterates the
  // slot list and looks the cooking window UP from it (pileByStart / byStart(slot - step)), so the times
  // in this banner were never raw cooking windows. What was missing is the quantity and the per-order
  // split, and `reason` ("global ceiling") is engine vocabulary rather than kitchen vocabulary.
  // QUANTITIES ARE COMPUTED HERE, FROM THE ORDERS THE DASHBOARD ALREADY HOLDS -- nothing was added to
  // any API. `capacityBreaches` carries collection_time, reason, over_total, over_cats, order_keys and
  // order_ids; per-order quantities are the one thing it does not carry.
  const qtyOf = (order_key: string): number => {
    const o = (orders || []).find(x => x.order_key === order_key)
    if (!o || !Array.isArray(o.items)) return 0
    return o.items.reduce((t, it) => t + (Number(it?.quantity) || 0), 0)
  }
  // The word for what is over. One over-category -> its own name; anything else -> "items", which is
  // true whatever the mix. Never invents a category the engine did not name.
  const unitWord = (b: { over_cats: Array<{ cat: string }> }) =>
    b.over_cats.length === 1 ? b.over_cats[0].cat : 'items'
  return (
    <div
      className="w-full bg-red-600 text-white text-sm px-4 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-bold">
          ⚠ {n} {n === 1 ? 'slot' : 'slots'} over capacity — review
        </span>
        {/* ONE LINE PER BREACHED SLOT: what is promised, then who is holding it. No explanation
            paragraph -- the numbers are the message. */}
        <div className="text-xs text-red-50 leading-snug flex flex-col gap-0.5">
          {breaches.map(b => {
            const total = b.order_keys.reduce((t, k) => t + qtyOf(k), 0)
            const contributors = b.order_keys
              .map((k, idx) => ({ id: b.order_ids[idx], qty: qtyOf(k) }))
              .filter(c => c.id !== undefined && c.id !== null)
            return (
              <span key={b.collection_time}>
                <span className="font-semibold">
                  {total > 0 ? `${total} ${unitWord(b)} booked for ${b.collection_time}` : `${b.collection_time} over capacity`}
                  {total > 0 ? ' — over capacity' : ''}
                </span>
                {contributors.length > 0 && (
                  <>
                    {'  '}
                    {contributors.map(c => `#${c.id}${c.qty > 0 ? ` — ${c.qty}` : ''}`).join('  ·  ')}
                  </>
                )}
              </span>
            )
          })}
        </div>
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
