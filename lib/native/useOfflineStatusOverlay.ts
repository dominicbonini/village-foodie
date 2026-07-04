'use client'
// FIX 2 / ISSUE 2 — durable offline status overlay that HOLDS each entry until the SERVER reflects the
// optimistic status, not merely until the op drains. This kills the reconnect FLASH: previously the overlay
// cleared on drain (onSynced) while a stale/intermediate read still showed the pre-sync status, so the order
// briefly flashed back to the queue before the authoritative status landed.
//
// Model: the pending outbox 'status' ops define the optimistic TARGET per order_key (folded via
// buildStatusOverlay). We keep a STICKY map that:
//   • upserts the target while its op is pending,
//   • RETAINS the entry after the op drains, UNTIL the server-merged order actually shows that status
//     (orders[key].status === target — the "server caught up" signal; FIX 1's monotonic updated_at is what
//     guarantees orders[key] reaches the target), then clears it,
//   • drops immediately if the op CONFLICTS (optimistic was rejected → show server truth + the conflict banner),
//   • can be dropped explicitly via dropEntry (the offline UNDO — as-if-never-happened).
//
// Web / non-native → stays empty (the overlay is a no-op; the online FIX-1 path is untouched). Shared by the
// dashboard and the KDS so the two surfaces never diverge.
import { useCallback, useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { listPendingStatusOps, buildStatusOverlay, type PendingStatusOp } from '@/lib/native/orderGate'
import { listConflictOps } from '@/lib/native/outbox'

export interface OverlayStatus { status: string; status_before_collected?: string | null }
type OrderLike = { order_key: string; status?: string; updated_at?: string | null }

export function useOfflineStatusOverlay(orders: OrderLike[]): {
  overlay: Map<string, OverlayStatus>
  refresh: () => void
  dropEntry: (orderKey: string) => void
} {
  const [overlay, setOverlay] = useState<Map<string, OverlayStatus>>(new Map())
  // Outbox snapshot: pending status ops (→ optimistic targets) + conflict status keys (→ drop rejected).
  const [snap, setSnap] = useState<{ ops: PendingStatusOp[]; conflictKeys: Set<string> }>({ ops: [], conflictKeys: new Set() })

  const refresh = useCallback(() => {
    if (!isNativeApp()) return
    Promise.all([listPendingStatusOps(), listConflictOps()])
      .then(([pending, conflicts]) => setSnap({
        ops: pending,
        conflictKeys: new Set(conflicts.filter(o => o.kind === 'status').map(o => o.order_key)),
      }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isNativeApp()) return
    refresh()
    const id = setInterval(refresh, 5000)   // matches OfflineBanner's countPendingOps cadence
    return () => clearInterval(id)
  }, [refresh])

  // Reconcile the sticky overlay whenever the ops snapshot or the (merged) orders change.
  useEffect(() => {
    if (!isNativeApp()) return
    const folded = buildStatusOverlay(orders, snap.ops)          // pending ops → target status per order_key
    const byKey = new Map(orders.map(o => [o.order_key, o]))
    setOverlay(prev => {
      const next = new Map(prev)
      for (const [key, sp] of folded) next.set(key, sp)          // still pending → (re)assert the optimistic target
      for (const [key, entry] of Array.from(next.entries())) {
        if (folded.has(key)) continue                            // still pending → HOLD
        if (snap.conflictKeys.has(key)) { next.delete(key); continue }  // optimistic rejected → server truth wins
        const o = byKey.get(key)
        if (o && o.status === entry.status) next.delete(key)     // SERVER CAUGHT UP (reflects the target) → clear, no flash
        // else: op drained but server not yet caught up → HOLD across the drain→fetch gap (the fix)
      }
      return mapsEqual(prev, next) ? prev : next
    })
  }, [snap, orders])

  const dropEntry = useCallback((orderKey: string) => {
    setOverlay(prev => { if (!prev.has(orderKey)) return prev; const n = new Map(prev); n.delete(orderKey); return n })
  }, [])

  return { overlay, refresh, dropEntry }
}

function mapsEqual(a: Map<string, OverlayStatus>, b: Map<string, OverlayStatus>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (!w || w.status !== v.status || (w.status_before_collected ?? null) !== (v.status_before_collected ?? null)) return false
  }
  return true
}
