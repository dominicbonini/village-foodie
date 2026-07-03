'use client'
// Phase-1 offline UX. Renders a persistent OFFLINE warning with the queued-order count, a transient
// "syncing… / synced" state on reconnect, and a SEPARATE dismissible conflict banner. Native-only (renders
// null on web). Copy uses "device" (not "iPad") per the offline UX convention. Mount once per screen
// (KDS + order/dashboard); it self-subscribes to reachability + drives the drain.
//
// The banner's count is ACTIONABLE-PENDING ops only (countPendingOps) — a 'conflict' op needs operator
// review, so it is shown in its own red banner with a Dismiss action, NEVER left as an invisible perpetual
// "syncing…". A backoff RETRY re-drains while online when pending ops remain, so a transient non-409 failure
// recovers instead of sticking until the next offline→online transition.
import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { startReachability, onReachabilityChange } from '@/lib/native/reachability'
import { countPendingOps, listConflictOps, clearConflicts } from '@/lib/native/outbox'
import { drainOutbox } from '@/lib/native/orderGate'

type Phase = 'online' | 'offline' | 'syncing' | 'synced'

export function OfflineBanner({ onSynced }: { onSynced?: () => void }) {
  const [phase, setPhase] = useState<Phase>('online')
  const [queued, setQueued] = useState(0)        // ACTIONABLE pending ops (excludes conflicts)
  const [conflicts, setConflicts] = useState(0)  // flagged-for-review ops, surfaced separately
  const [lastSynced, setLastSynced] = useState(0)

  // onSynced held in a ref so the reachability effect doesn't tear down + re-subscribe on every parent render
  // (the prop is an inline arrow) — which would also cancel in-flight retries.
  const onSyncedRef = useRef(onSynced); onSyncedRef.current = onSynced
  const onlineRef = useRef(true)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryAttempt = useRef(0)

  const refreshCounts = useCallback(async () => {
    setQueued(await countPendingOps())
    setConflicts((await listConflictOps()).length)
  }, [])

  const cancelRetry = useCallback(() => {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null }
  }, [])

  // Re-drain while ONLINE as long as actionable pending ops remain → a transient non-409 failure retries
  // instead of sticking. Backoff (5s,10s,20s,40s,60s cap) so it never hammers.
  const scheduleRetry = useCallback(() => {
    if (retryTimer.current || !onlineRef.current) return
    const delay = Math.min(5000 * 2 ** retryAttempt.current, 60000)
    retryTimer.current = setTimeout(async () => {
      retryTimer.current = null
      if (!onlineRef.current) return
      retryAttempt.current++
      const r = await drainOutbox()
      setLastSynced(r.synced)
      await refreshCounts()
      if (r.synced > 0) onSyncedRef.current?.()
      if (r.remaining > 0 && onlineRef.current) scheduleRetry()
      else retryAttempt.current = 0
    }, delay)
  }, [refreshCounts])

  useEffect(() => {
    if (!isNativeApp()) return
    startReachability()
    void refreshCounts()
    const pollCount = setInterval(() => { void refreshCounts() }, 5000)

    const unsub = onReachabilityChange((online) => {
      onlineRef.current = online
      if (!online) { cancelRetry(); retryAttempt.current = 0; setPhase('offline'); return }
      // Back online → drain, re-fetch upstream data, then keep retrying anything still pending.
      void (async () => {
        const pending = await countPendingOps()
        if (pending === 0) { await refreshCounts(); setPhase('online'); return }
        setPhase('syncing')
        const r = await drainOutbox()
        setLastSynced(r.synced)
        await refreshCounts()
        setPhase('synced')
        if (r.synced > 0) onSyncedRef.current?.()
        if (r.remaining > 0) scheduleRetry()   // transient failure left pending ops → retry with backoff
        setTimeout(() => setPhase(p => (p === 'synced' ? 'online' : p)), 5000)
      })()
    })

    return () => { clearInterval(pollCount); unsub(); cancelRetry() }
  }, [refreshCounts, scheduleRetry, cancelRetry])

  if (!isNativeApp()) return null

  // Conflicts — their OWN banner, always actionable (never a silent stuck "syncing").
  const conflictBanner: ReactNode = conflicts > 0 ? (
    <div className="w-full bg-red-600 text-white text-sm font-semibold px-4 py-2 flex items-center justify-center gap-3">
      <span>⚠ {conflicts} {conflicts === 1 ? 'order' : 'orders'} couldn&apos;t sync — needs review</span>
      <button type="button" onClick={() => { void (async () => { await clearConflicts(); await refreshCounts() })() }}
        className="underline font-bold">Dismiss</button>
    </div>
  ) : null

  // Sync/pending banner — driven by the ACTIONABLE pending count, so conflicts can't keep it up.
  let syncBanner: ReactNode = null
  if (phase === 'offline') {
    syncBanner = (
      <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
        📴 Offline — {queued} {queued === 1 ? 'order' : 'orders'} saved on this device, will sync when you&apos;re back online.
      </div>
    )
  } else if (phase === 'syncing') {
    syncBanner = (
      <div className="w-full bg-slate-700 text-white text-sm font-semibold px-4 py-2 text-center animate-pulse">
        Syncing {queued} {queued === 1 ? 'order' : 'orders'}…
      </div>
    )
  } else if (phase === 'synced' && lastSynced > 0) {
    // Only when something actually synced — a drain that produced only conflicts is carried by the conflict banner.
    syncBanner = (
      <div className="w-full bg-green-600 text-white text-sm font-semibold px-4 py-2 text-center">
        Synced {lastSynced} ✓
      </div>
    )
  } else if (queued > 0) {
    // Online but still-queued (mid-recovery / retrying) → keep the operator informed rather than silent.
    syncBanner = (
      <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
        {queued} {queued === 1 ? 'order' : 'orders'} saved on this device, syncing…
      </div>
    )
  }

  if (!conflictBanner && !syncBanner) return null
  return <>{conflictBanner}{syncBanner}</>
}
