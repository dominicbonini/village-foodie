'use client'
// FIX 2 — shared hook for the offline pending-status overlay. Both the dashboard and the KDS use it so
// the two surfaces never diverge. Returns the pending 'status' ops + a manual refresh.
//
// Cadence: polls every 5s (matching OfflineBanner's countPendingOps cadence) while native. Callers ALSO
// call refresh() immediately after queueing an offline status op (instant card advance, no 5s wait) and
// after a drain (OfflineBanner onSynced) so the overlay clears the moment ops sync. Web / no native →
// stays [] (overlay is a no-op → the online FIX-1 path is untouched).
import { useCallback, useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { listPendingStatusOps, type PendingStatusOp } from '@/lib/native/orderGate'

export function usePendingStatusOps(): { ops: PendingStatusOp[]; refresh: () => void } {
  const [ops, setOps] = useState<PendingStatusOp[]>([])

  const refresh = useCallback(() => {
    if (!isNativeApp()) return
    listPendingStatusOps().then(setOps).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isNativeApp()) return
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  return { ops, refresh }
}
