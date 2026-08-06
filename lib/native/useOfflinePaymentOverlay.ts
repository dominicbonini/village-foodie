'use client'
// ── DURABLE OFFLINE PAYMENT OVERLAY ─────────────────────────────────────────────────────────────────
// The payment sibling of useOfflineStatusOverlay. Same shape, same lifecycle, one deliberate difference:
// the "server caught up" test is the LEDGER, not `order.status`.
//
// 🔴 WHY THIS EXISTS. Payment ops were already gated, queued durably and replayed — persistence was never
// the problem. The problem was that NOTHING ON SCREEN CHANGED: the chip is rendered from
// getOrderBalance(order, ledgerRows), the ledger rows come from the server, and offline there is no new
// poll — so an operator who took cash and tapped "Mark paid" saw an unpaid card and a button still
// inviting the tap. The rational response is to tap again.
//
// 🔴 THE CARD RENDERS THIS IDENTICALLY TO A CONFIRMED PAYMENT — same chip, same colour, same buttons.
// A distinct "syncing" treatment was built first and REVERSED: offline STATUS changes are already
// indistinguishable from online ones (OFFLINE_STATUS_MAP), so making payment the one action in the same
// workflow that looks different is an inconsistency the operator has to learn mid-service. The global
// OfflineBanner carries the state of the world; the card carries their action. See OrderCard's note.
//
// ⚠️ THE CONSEQUENCE, STATED PLAINLY: the operator is shown a payment as recorded before the server has
// accepted it, so a FAILED REPLAY means they were shown something false — possibly for a long time. The
// entry drops the moment the op is flagged 'conflict' (below) and the card reverts to server truth, but
// the loud signal is the conflict banner, which names no order. That trade is assessed in
// docs/offline-coverage-report.md; do not treat it as free.
//
// ⚠️ getOrderBalance() IS NOT BYPASSED. It remains the resolver for confirmed state; this map layers on
// top of its output at render. No balance arithmetic happens here or in the card.
//
// Web / non-native → stays empty, so the online path is untouched.
import { useCallback, useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { listPendingPaymentOps, buildPaymentOverlay, type PendingPaymentState } from '@/lib/native/orderGate'
import { listConflictOps } from '@/lib/native/outbox'
import type { PendingStatusOp } from '@/lib/native/orderGate'

/** Minimal per-order input: the CONFIRMED payment state the resolver produced, so the overlay can tell
 *  when the server has caught up. `confirmedPaid` is `balance.status === 'paid' | 'refunded'` — computed
 *  by the caller from getOrderBalance, never recomputed here. */
export interface PaymentOrderLike { order_key: string; confirmedPaid: boolean }

export function useOfflinePaymentOverlay(orders: PaymentOrderLike[]): {
  overlay: Map<string, PendingPaymentState>
  refresh: () => void
} {
  const [overlay, setOverlay] = useState<Map<string, PendingPaymentState>>(new Map())
  const [snap, setSnap] = useState<{ ops: PendingStatusOp[]; conflictKeys: Set<string> }>({ ops: [], conflictKeys: new Set() })

  const refresh = useCallback(() => {
    if (!isNativeApp()) return
    Promise.all([listPendingPaymentOps(), listConflictOps()])
      .then(([pending, conflicts]) => setSnap({
        ops: pending,
        conflictKeys: new Set(conflicts.filter(o => o.kind === 'status').map(o => o.order_key)),
      }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isNativeApp()) return
    refresh()
    const id = setInterval(refresh, 5000)   // same cadence as the status overlay + OfflineBanner
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (!isNativeApp()) return
    const folded = buildPaymentOverlay(snap.ops)
    const byKey = new Map(orders.map(o => [o.order_key, o]))
    setOverlay(prev => {
      const next = new Map(prev)
      for (const [key, st] of folded) next.set(key, st)              // still pending → (re)assert
      for (const [key, entry] of Array.from(next.entries())) {
        if (folded.has(key)) continue                                 // still pending → HOLD
        // ⚠️ CONFLICT DROPS IMMEDIATELY. A 409 or a poison op means the optimistic state was REJECTED.
        // Holding a "pending paid" chip there would leave the operator believing money was recorded when
        // it was not — the one outcome worse than showing nothing. Server truth wins and the existing
        // conflict banner is what surfaces it.
        if (snap.conflictKeys.has(key)) { next.delete(key); continue }
        const o = byKey.get(key)
        // 🔴 THE "SERVER CAUGHT UP" TEST — THE LEDGER, NOT THE STATUS. The op has drained; hold the chip
        // until getOrderBalance actually reports the state the op was driving towards. This is what stops
        // the reconnect flash (drain → next poll is a real window) AND what stops a double-count: the
        // overlay is a RENDER-TIME layer that disappears, never a value added to a balance.
        if (o && entry === 'pending_paid' && o.confirmedPaid) { next.delete(key); continue }
        if (o && entry === 'pending_unpaid' && !o.confirmedPaid) { next.delete(key); continue }
        // else: drained but the ledger has not landed yet → HOLD across the drain→fetch gap.
      }
      return mapsEqual(prev, next) ? prev : next
    })
  }, [snap, orders])

  return { overlay, refresh }
}

function mapsEqual(a: Map<string, PendingPaymentState>, b: Map<string, PendingPaymentState>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}
