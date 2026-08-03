'use client'
// ── "Order #12 doesn't have a buzzer" — the conflict-resolution banner (phase 2) ─────────────────
//
// Two devices offline, both hand out buzzer 7. On reconnect assign_buzzer_atomic arbitrates on
// placed_at (later wins) and one order is left without the pager its customer is physically holding.
// That is not something to resolve silently: a customer is standing there with a buzzer the board has
// no record of, which is the exact failure the whole feature exists to prevent.
//
// Modelled on CapacityBreachBanner (components/dashboard/CapacityBreachBanner.tsx), the codebase's
// existing "something was auto-resolved on reconnect, come and look" surface: server-computed
// (/api/dashboard), rendered as a red full-width strip above the board, dismissible, non-blocking.
// Two deliberate differences from it, both forced by what this banner is FOR:
//
//   1. 🔴 DISMISSAL IS PER ORDER, NOT ONE SIGNATURE FOR THE WHOLE SET.
//      CapacityBreachBanner hashes every breach into ONE signature and compares against ONE dismissed
//      value, so dismissing hides the lot until the set changes. That is right for slot capacity,
//      where the operator reviews "the state of the board" in one go. It is WRONG here: each row is a
//      different customer holding a different pager. Dismissing #12 (say, because that customer has
//      already been served) must not swallow #15 arriving ten minutes later in the same service. So
//      the parent holds a Set of dismissed order_keys and each row is filtered independently.
//
//   2. IT HAS AN ACTION, NOT JUST AN ACKNOWLEDGEMENT. "Assign" opens the standard buzzer grid for that
//      order, so the fix is one tap from the notice rather than "now go find order #12 on the board".
//      Dismiss remains for the case where no fix is wanted.
//
// ⚠️ The grid it opens may be entirely red (every buzzer out). That is a valid state, not a dead end —
// taking one from another order is a legitimate move and the grid stays live. See BuzzerGrid.

export interface BuzzerLoss {
  order_key: string
  /** Display number ("12"), NOT order_key. Human-facing. */
  id: string
  customer_name: string
  lost_at: string
}

export function BuzzerLostBanner({
  losses,
  dismissedKeys,
  onDismiss,
  onAssign,
}: {
  /** Server-computed: open orders left without a buzzer by conflict resolution. */
  losses: BuzzerLoss[]
  /** order_keys the operator has already dismissed THIS session. Per order — see the note above. */
  dismissedKeys: Set<string>
  onDismiss: (orderKey: string) => void
  onAssign: (loss: BuzzerLoss) => void
}) {
  const visible = (losses || []).filter(l => l && !dismissedKeys.has(l.order_key))
  if (visible.length === 0) return null

  return (
    <>
      {/* ONE ROW PER ORDER, not one summarised strip. Each row names one order and carries its own two
          actions, because each is a separate customer with a separate pager — an operator has to be
          able to act on #12 and leave #15 alone. */}
      {visible.map(l => (
        <div
          key={l.order_key}
          className="w-full bg-red-600 text-white text-sm px-4 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-bold">
              ⚠ Order #{l.id} doesn&apos;t have a buzzer
            </span>
            <span className="text-xs text-red-50 leading-snug">
              {l.customer_name ? `${l.customer_name} — ` : ''}
              another order claimed the same buzzer while you were offline. Give them a different one.
            </span>
          </div>
          {/* min-h-[44px] on both: this is tapped mid-service on an iPad, the same floor the grid and
              its Done button use. */}
          <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => onDismiss(l.order_key)}
              className="min-h-[44px] underline font-bold px-1"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => onAssign(l)}
              className="min-h-[44px] bg-white text-red-700 font-bold rounded-lg px-4 text-sm"
            >
              Assign
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
