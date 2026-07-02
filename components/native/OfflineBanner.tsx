'use client'
// Phase-1 offline UX. Renders a persistent OFFLINE warning with the queued-order count, and a transient
// "syncing… / synced" state on reconnect. Native-only (renders null on web). Copy uses "device" (not "iPad")
// per the offline UX convention. Mount once per screen (KDS + order/dashboard); it self-subscribes to
// reachability + drives the drain.
import { useEffect, useState, useCallback } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { startReachability, onReachabilityChange } from '@/lib/native/reachability'
import { countOps } from '@/lib/native/outbox'
import { drainOutbox } from '@/lib/native/orderGate'

type Phase = 'online' | 'offline' | 'syncing' | 'synced'

export function OfflineBanner({ onSynced }: { onSynced?: () => void }) {
  const [phase, setPhase] = useState<Phase>('online')
  const [queued, setQueued] = useState(0)
  const [lastResult, setLastResult] = useState<{ synced: number; conflicts: number } | null>(null)

  const refreshCount = useCallback(async () => { setQueued(await countOps()) }, [])

  useEffect(() => {
    if (!isNativeApp()) return
    startReachability()
    void refreshCount()
    const pollCount = setInterval(() => { void refreshCount() }, 5000)

    const unsub = onReachabilityChange((online) => {
      if (!online) { setPhase('offline'); return }
      // Back online → drain the outbox, then re-fetch upstream data.
      void (async () => {
        const pending = await countOps()
        if (pending === 0) { setPhase('online'); return }
        setPhase('syncing')
        const r = await drainOutbox()
        setLastResult({ synced: r.synced, conflicts: r.conflicts })
        await refreshCount()
        setPhase('synced')
        onSynced?.()
        // Auto-hide the "synced" confirmation after a few seconds (conflicts stay until dismissed elsewhere).
        setTimeout(() => setPhase(p => (p === 'synced' ? 'online' : p)), 5000)
      })()
    })

    return () => { clearInterval(pollCount); unsub() }
  }, [refreshCount, onSynced])

  if (!isNativeApp()) return null
  if (phase === 'online' && queued === 0) return null

  if (phase === 'offline') {
    return (
      <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
        📴 Offline — {queued} {queued === 1 ? 'order' : 'orders'} saved on this device, will sync when you&apos;re back online.
      </div>
    )
  }
  if (phase === 'syncing') {
    return (
      <div className="w-full bg-slate-700 text-white text-sm font-semibold px-4 py-2 text-center animate-pulse">
        Syncing {queued} {queued === 1 ? 'order' : 'orders'}…
      </div>
    )
  }
  if (phase === 'synced' && lastResult) {
    const { synced, conflicts } = lastResult
    return (
      <div className={`w-full text-white text-sm font-semibold px-4 py-2 text-center ${conflicts ? 'bg-orange-600' : 'bg-green-600'}`}>
        {conflicts ? `Synced ${synced} · ${conflicts} ${conflicts === 1 ? 'needs' : 'need'} a look` : `Synced ${synced} ✓`}
      </div>
    )
  }
  // Online but still-queued (mid-recovery) → keep the operator informed rather than silent.
  return (
    <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
      {queued} {queued === 1 ? 'order' : 'orders'} saved on this device, syncing…
    </div>
  )
}
