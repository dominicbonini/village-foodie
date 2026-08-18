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
  orders?: Array<{ order_key: string; id: string | number; slot?: string | null; items?: Array<{ quantity?: number }> }>
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
  // The order's OWN collection time, so a contributor can be found on the board. It is often NOT the
  // breached window's time -- that is the whole point of the attribution fix.
  const slotOf = (order_key: string): string | null =>
    (orders || []).find(x => x.order_key === order_key)?.slot ?? null
  const qtyOf = (order_key: string): number => {
    const o = (orders || []).find(x => x.order_key === order_key)
    if (!o || !Array.isArray(o.items)) return 0
    return o.items.reduce((t, it) => t + (Number(it?.quantity) || 0), 0)
  }
  // `unitWord` (the over-category's own name) was removed with the per-window lines: after grouping,
  // one line can span several windows whose over-categories differ, so a single category word would be
  // wrong for part of its own list. "items" is true of every grouping.
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
        {/* -- ONE LINE PER COLLECTION TIME, NOT PER COOKING WINDOW ---------------------------------
            The detector emits one breach per WINDOW, and adjacent windows fed by the same orders are one
            problem to an operator: too much food promised for 17:00. So the banner regroups -- and the
            grouping lives HERE, not in the detector, for two reasons: `breachSignature` hashes the
            detector's `collection_time` and `over_total`, so changing its output would re-fire every
            dismissal made before this deploy; and the strip marker reads `collection_time` from every
            breach to mark the WINDOWS, which is correct for a live view and must not change.
            THE GROUPING KEY IS THE ORDER'S OWN COLLECTION TIME -- the time the customer was promised and
            the thing the operator has to renegotiate. An order therefore appears exactly ONCE, under its
            own time, however many windows it feeds.
            THE NUMBER IS THE ITEM COUNT OF THE ORDERS LISTED, NOT AN OVERAGE, and that is a deliberate
            choice: it is the only figure that equals the list beneath it. Summing the windows' overages
            would double-count an order feeding two windows; taking the max would understate two windows
            breaching for different reasons. The copy therefore says what the number IS. */}
        <div className="text-xs text-red-50 leading-snug flex flex-col gap-0.5">
          {(() => {
            // Union every breached window's contributors, then regroup by each order's OWN slot.
            const bySlot = new Map<string, Array<{ id: string | number; qty: number }>>()
            const seen = new Set<string>()
            for (const b of breaches) {
              b.order_keys.forEach((k, idx) => {
                if (seen.has(k)) return
                seen.add(k)
                const slot = slotOf(k) ?? b.collection_time
                const arr = bySlot.get(slot) ?? []
                arr.push({ id: b.order_ids[idx], qty: qtyOf(k) })
                bySlot.set(slot, arr)
              })
            }
            // Windows whose load could not be attributed to any order -- surfaced, never hidden.
            const orphans = breaches.filter(b => b.order_keys.length === 0).map(b => b.collection_time)
            const rows = [...bySlot.entries()].sort((a, b2) => a[0].localeCompare(b2[0]))
            return (
              <>
                {rows.map(([slot, list]) => {
                  const total = list.reduce((t, c) => t + c.qty, 0)
                  return (
                    <span key={slot}>
                      <span className="font-semibold">
                        {`Kitchen over capacity — ${total} ${total === 1 ? 'item' : 'items'} cooking for ${slot}`}
                      </span>
                      {list.length > 0 && (
                        <>
                          {'  '}
                          {list.map(c => `#${c.id}${c.qty > 0 ? ` — ${c.qty} ${c.qty === 1 ? 'item' : 'items'}` : ''}`).join('  ·  ')}
                        </>
                      )}
                    </span>
                  )
                })}
                {orphans.length > 0 && (
                  <span className="font-semibold">
                    {`${orphans.join(', ')} over capacity — no orders found to attribute it to`}
                  </span>
                )}
              </>
            )
          })()}
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
