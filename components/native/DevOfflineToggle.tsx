'use client'
// ── DEV-ONLY "simulate offline" toggle ────────────────────────────────────────────────────────────────
// A hidden floating pill (dev/non-production ONLY — renders null in production) that forces the reachability
// health-check to report OFFLINE, so the offline outbox can be validated in the iOS simulator without
// touching the Mac's network. Tap to flip: OFFLINE → app enters outbox mode, shows the offline banner, and
// queues orders (provisional IDs). Tap again → back online → the OfflineBanner drains the outbox and syncs.
// NEVER shipped to operators: the whole render + the underlying setSimulatedOffline() are gated on
// process.env.NODE_ENV. Mount alongside <OfflineBanner/> on the offline-capable screens.
import { useEffect, useState } from 'react'
import { setSimulatedOffline, isSimulatedOffline, startReachability } from '@/lib/native/reachability'

const IS_PROD = process.env.NODE_ENV === 'production'

export function DevOfflineToggle() {
  const [sim, setSim] = useState(false)

  useEffect(() => {
    if (IS_PROD) return
    startReachability()               // idempotent — ensure the checker is live even if the banner hasn't mounted yet
    setSim(isSimulatedOffline())      // reflect any state carried over from a previous screen
  }, [])

  if (IS_PROD) return null

  const toggle = () => {
    const next = !sim
    setSimulatedOffline(next)
    setSim(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Dev: simulate offline"
      className={`fixed left-2 z-[9999] rounded-full px-3 py-1.5 text-xs font-black shadow-lg border transition-colors ${
        sim
          ? 'bg-red-600 text-white border-red-700'
          : 'bg-slate-800/90 text-slate-200 border-slate-600'
      }`}
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
    >
      {sim ? '📴 SIM OFFLINE' : '📶 sim online'}
    </button>
  )
}
