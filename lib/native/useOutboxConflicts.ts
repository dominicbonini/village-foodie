'use client'
// ── THE CONFLICT SIGNAL — one source, read by the banner AND by the per-order marker ────────────────
//
// 🔴 WHY THIS EXISTS. A queued payment renders IDENTICALLY to a confirmed one (see OrderCard's note on
// `pendingPayment`), which was a deliberate decision and stands. The whole safety case for that decision
// therefore rests here: if a payment replay fails, this signal is the ONLY thing between the operator and
// believing they were paid when they were not. It previously said "1 order couldn't sync" — a COUNT, on a
// board of thirty — and its Dismiss button DELETED the ops.
//
// 🔴 ONE HOOK, MOUNTED IN THE PARENT, PASSED TO BOTH CONSUMERS. The banner and the card marker must never
// disagree about which orders are conflicted or which have been acknowledged. Two independent pollers
// would drift for up to a poll interval — acknowledge in the banner and the card would keep its red strip
// for five more seconds, which reads as broken. So the surface owns the state and hands it down.
//
// ⚠️ THIS IS NOT THE PENDING OVERLAY AND MUST NOT BECOME IT. A QUEUED op is invisible by design. This
// reports only FAILED ops (state === 'conflict'), which is a different state and is allowed to look
// different, because it is.
//
// ⚠️ IT DOES NOT RETRY. A failed replay stays failed. The job here is that the operator KNOWS.
//
// Web / non-native → stays empty, so the online path is untouched.
import { useCallback, useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { listUnacknowledgedConflicts, acknowledgeConflicts } from '@/lib/native/outbox'
import { isPaymentAction, opAction } from '@/lib/native/orderGate'

/** 🔴 MONEY IS NOT STATUS. A failed 'ready' and a failed 'mark_paid' are not the same failure and must not
 *  produce the same bar. `kind` cannot separate them (both are 'status'); the discriminator is the action
 *  — see isPaymentAction, which is the single owner of that decision. */
export type ConflictKind = 'payment' | 'status'

export interface ConflictEntry {
  op_id: string
  order_key: string
  action: string
  kind: ConflictKind
  /** Device-prefixed display number for an offline-created order ('A13'); '' for ops on server orders. */
  provisional_id: string
  last_error?: string
}

/** How many orders are named before the rest become "+N more". Enough to act on, short enough to read on
 *  one line of a busy board — and 🔴 NEVER a bare count, which is the defect this whole module replaces. */
const NAMED_LIMIT = 3

/** 🔴 NAME THE ORDERS. Pure, and exported so it can be EXECUTED rather than eyeballed — the "+N more" and
 *  the unresolved branches are exactly where a naming bug would hide.
 *  `resolveLabel` returns null when THIS surface cannot resolve the order. Those entries are counted as
 *  "not on this screen" — ⚠️ never folded into the named ones and never given an invented number, because
 *  an operator sent hunting for an order id that does not exist is worse off than one told plainly that
 *  the order is not on the screen they are looking at. */
export function nameConflictOrders(
  list: ConflictEntry[],
  resolveLabel: (e: ConflictEntry) => string | null,
  limit = NAMED_LIMIT,
): string {
  const named: string[] = []
  let unresolved = 0
  for (const c of list) {
    const label = resolveLabel(c)
    if (label) { if (!named.includes(label)) named.push(label) }   // one order, two failed ops → named once
    else unresolved++
  }
  const shown = named.slice(0, limit)
  const overflow = named.length - shown.length
  const parts: string[] = []
  if (shown.length) parts.push(shown.join(', '))
  // ⚠️ TWO DIFFERENT SUFFIXES, DELIBERATELY. "+2 more" means there ARE more and they are findable;
  // "not on this screen" means this surface could not identify them at all. Folding them into one count
  // would tell an operator to go looking for orders that nothing here can point them at.
  if (overflow > 0) parts.push(`+${overflow} more`)
  if (unresolved > 0) {
    parts.push(shown.length
      ? `+${unresolved} not on this screen`
      : `${unresolved} ${unresolved === 1 ? 'order' : 'orders'} not on this screen`)
  }
  return parts.join(' ')
}

export function useOutboxConflicts(): {
  /** Unacknowledged conflicts, oldest first. */
  conflicts: ConflictEntry[]
  /** order_key → the LOUDER of that order's conflicts. Payment wins: an order with both a failed status
   *  op and a failed payment op is a money problem first. Drives the per-order card marker. */
  byOrderKey: Map<string, ConflictKind>
  refresh: () => void
  acknowledge: (opIds: string[]) => Promise<void>
} {
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([])

  const refresh = useCallback(() => {
    if (!isNativeApp()) return
    listUnacknowledgedConflicts()
      .then(ops => setConflicts(prev => {
        const next: ConflictEntry[] = ops
          .sort((a, b) => a.seq - b.seq)
          .map(o => {
            const action = opAction(o)
            return {
              op_id: o.op_id,
              order_key: o.order_key,
              action,
              kind: isPaymentAction(action) ? 'payment' : 'status',
              provisional_id: o.provisional_id,
              last_error: o.last_error,
            }
          })
        // Identity-stable when nothing changed, so a 5s poll cannot re-render every card on the board.
        return sameEntries(prev, next) ? prev : next
      }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isNativeApp()) return
    refresh()
    const id = setInterval(refresh, 5000)   // same cadence as the overlays + OfflineBanner
    return () => clearInterval(id)
  }, [refresh])

  const acknowledge = useCallback(async (opIds: string[]) => {
    await acknowledgeConflicts(opIds)   // 🔴 hides. Deletes nothing.
    refresh()                           // immediate, so the banner and the card clear together
  }, [refresh])

  const byOrderKey = new Map<string, ConflictKind>()
  for (const c of conflicts) {
    if (c.kind === 'payment' || !byOrderKey.has(c.order_key)) byOrderKey.set(c.order_key, c.kind)
  }

  return { conflicts, byOrderKey, refresh, acknowledge }
}

function sameEntries(a: ConflictEntry[], b: ConflictEntry[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i].op_id !== b[i].op_id || a[i].kind !== b[i].kind) return false
  return true
}
