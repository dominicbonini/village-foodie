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
//
// ── 🔴 THE CONFLICT BANNER NAMES ORDERS, SEPARATES MONEY FROM STATUS, AND NEVER DELETES ─────────────
// It used to say "2 orders couldn't sync" — a COUNT, on a board of thirty, with no way to find which —
// and its Dismiss called clearConflicts(), which REMOVED the ops. Since a queued payment now renders
// identically to a confirmed one, those ops are the only record that money was shown as taken and never
// recorded, so one reflexive tap destroyed the evidence. Three things changed and must stay changed:
//   1. Dismiss ACKNOWLEDGES (hides); the ops survive. Nothing here can delete an op, at any tap count.
//   2. The orders are NAMED. The parent resolves the display id, because only the parent holds orders.
//   3. Money and status get separate bars, and the money one requires an explicit acknowledgement that
//      names the order and says what to check.
// ⚠️ The conflict list is OWNED BY THE PARENT (useOutboxConflicts) and passed in, so this banner and the
// per-order card marker can never disagree about what is conflicted or what has been acknowledged.
import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { startReachability, onReachabilityChange } from '@/lib/native/reachability'
import { countPendingOps } from '@/lib/native/outbox'
import { drainOutbox } from '@/lib/native/orderGate'
import { nameConflictOrders, type ConflictEntry } from '@/lib/native/useOutboxConflicts'

type Phase = 'online' | 'offline' | 'syncing' | 'synced'

export function OfflineBanner({ conflicts, resolveLabel, onAcknowledge, onSynced }: {
  /** UNACKNOWLEDGED conflicts, from the surface's useOutboxConflicts. 🔴 Required, not optional: a mount
   *  that forgot to pass them would silently fall back to a count-only banner, which is the whole defect. */
  conflicts: ConflictEntry[]
  /** order_key → the operator-facing order number ('#12'), or null if this surface cannot resolve it.
   *  🔴 NULL MUST DEGRADE HONESTLY — never invent an id the operator would go looking for. */
  resolveLabel: (entry: ConflictEntry) => string | null
  /** Records the conflicts as SEEN. 🔴 Hides them. Does not delete them. */
  onAcknowledge: (opIds: string[]) => void | Promise<void>
  onSynced?: () => void
}) {
  const [phase, setPhase] = useState<Phase>('online')
  const [queued, setQueued] = useState(0)        // ACTIONABLE pending ops (excludes conflicts)
  const [lastSynced, setLastSynced] = useState(0)
  const [confirming, setConfirming] = useState(false)   // payment dismissal — the second, explicit step

  // onSynced held in a ref so the reachability effect doesn't tear down + re-subscribe on every parent render
  // (the prop is an inline arrow) — which would also cancel in-flight retries.
  const onSyncedRef = useRef(onSynced); onSyncedRef.current = onSynced
  const onlineRef = useRef(true)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryAttempt = useRef(0)

  const refreshCounts = useCallback(async () => {
    setQueued(await countPendingOps())
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

  // ── Conflicts — their OWN banners, always actionable (never a silent stuck "syncing") ────────────
  const paymentConflicts = conflicts.filter(c => c.kind === 'payment')
  const statusConflicts = conflicts.filter(c => c.kind === 'status')
  // ⚠️ DERIVED, not trusted. If the last payment conflict is acknowledged on the OTHER surface, the open
  // confirm panel must not survive in state and greet the NEXT payment failure already half-confirmed —
  // which would put a one-tap dismissal back. Deriving it costs nothing and removes the possibility.
  const confirmingNow = confirming && paymentConflicts.length > 0

  // Naming lives in the conflict module as a PURE function so it can be executed in a harness rather
  // than eyeballed in a screenshot — see nameConflictOrders.
  const nameOrders = (list: ConflictEntry[]): string => nameConflictOrders(list, resolveLabel)

  // 🔴 MONEY — the louder bar, and the one that cannot be dismissed in a single tap. Its copy states the
  // consequence (nothing was recorded) and the required check, because "couldn't sync" does not tell an
  // operator that they are owed money.
  const paymentBanner: ReactNode = paymentConflicts.length > 0 ? (
    <div className="w-full bg-red-700 text-white px-4 py-3 border-b-2 border-red-900">
      <div className="flex items-start justify-center gap-3 flex-wrap">
        <div className="text-center">
          <div className="text-base font-black tracking-wide">⚠ PAYMENT NOT RECORDED</div>
          <div className="text-sm font-semibold mt-0.5">
            {nameOrders(paymentConflicts)} — marked paid on this device only. It hasn&apos;t gone through.
          </div>
          <div className="text-xs font-medium mt-0.5 opacity-90">Check the order and take payment again if it is still owed.</div>
        </div>
        {!confirmingNow && (
          <button type="button" onClick={() => setConfirming(true)}
            className="underline font-bold text-sm flex-shrink-0 mt-1">Dismiss</button>
        )}
      </div>
      {confirmingNow && (
        // The explicit second step. It names the orders and states what is kept, so dismissing is a
        // decision rather than a reflex. 🔴 Neither button deletes anything.
        <div className="mt-2 rounded-lg bg-red-900/60 px-3 py-2 text-center">
          <div className="text-sm font-bold">
            Confirm you have checked {nameOrders(paymentConflicts)}
          </div>
          <div className="text-xs mt-0.5 opacity-90">
            This hides the warning. The record is kept on this device either way.
          </div>
          <div className="flex items-center justify-center gap-3 mt-2">
            <button type="button" onClick={() => setConfirming(false)}
              className="px-3 py-1.5 rounded-md bg-white/20 text-sm font-bold">Not yet</button>
            <button type="button"
              onClick={() => { setConfirming(false); void onAcknowledge(paymentConflicts.map(c => c.op_id)) }}
              className="px-3 py-1.5 rounded-md bg-white text-red-800 text-sm font-black">
              I&apos;ve checked {nameOrders(paymentConflicts)}
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null

  // STATUS — the lighter one. A failed 'ready' costs an operator a re-tap, not money, so a single-tap
  // dismissal is proportionate. It still names the orders.
  const statusBanner: ReactNode = statusConflicts.length > 0 ? (
    <div className="w-full bg-red-600 text-white text-sm font-semibold px-4 py-2 flex items-center justify-center gap-3">
      <span>⚠ {nameOrders(statusConflicts)} — this change didn&apos;t go through. Check the order.</span>
      <button type="button" onClick={() => { void onAcknowledge(statusConflicts.map(c => c.op_id)) }}
        className="underline font-bold flex-shrink-0">Dismiss</button>
    </div>
  ) : null

  const conflictBanner: ReactNode = (paymentBanner || statusBanner) ? <>{paymentBanner}{statusBanner}</> : null

  // Sync/pending banner — driven by the ACTIONABLE pending count, so conflicts can't keep it up.
  let syncBanner: ReactNode = null
  if (phase === 'offline') {
    syncBanner = (
      <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
        📴 No connection — {queued} {queued === 1 ? 'change' : 'changes'} saved on this device. They&apos;ll be sent when you&apos;re back online. Settings are locked.
      </div>
    )
  } else if (phase === 'syncing') {
    syncBanner = (
      <div className="w-full bg-slate-700 text-white text-sm font-semibold px-4 py-2 text-center animate-pulse">
        Back online — sending {queued} {queued === 1 ? 'change' : 'changes'}…
      </div>
    )
  } else if (phase === 'synced' && lastSynced > 0) {
    // Only when something actually synced — a drain that produced only conflicts is carried by the conflict banner.
    syncBanner = (
      <div className="w-full bg-green-600 text-white text-sm font-semibold px-4 py-2 text-center">
        All changes sent.
      </div>
    )
  } else if (queued > 0) {
    // Online but still-queued (mid-recovery / retrying) → keep the operator informed rather than silent.
    syncBanner = (
      <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
        {queued} {queued === 1 ? 'change' : 'changes'} saved on this device. Still trying to send them.
      </div>
    )
  }

  if (!conflictBanner && !syncBanner) return null
  return <>{conflictBanner}{syncBanner}</>
}
