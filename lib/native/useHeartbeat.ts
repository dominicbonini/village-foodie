'use client'
// ── ONE HEARTBEAT EMITTER, BOTH SURFACES ────────────────────────────────────────────────────────────
// The dashboard and the KDS each carried their own copy of the same 15-second POST to /api/heartbeat.
// Per docs/offline-protection-kds-report.md Q7 this is the `useGatedActionResult` case and not the
// `applyPending` case: it closes over `token`, `vanId` and `activeEventLive` only, touches no shared
// ref, and has no call site beyond its own effect. So it is extracted rather than copied a third time.
//
// 🔴 THE DASHBOARD'S BEHAVIOUR IS THE REFERENCE AND IS PRESERVED EXACTLY. Every difference between the
// two inline versions was a thing the DASHBOARD had and the KDS lacked, so the extraction raises the
// KDS rather than meeting in the middle:
//   • `deviceOnline` in the deps — an offline→online transition re-arms immediately instead of waiting
//     up to 15s for the next tick. The KDS had no such dep.
//   • an `onAppResume` re-ping — a backgrounded WebView suspends setInterval, so the van goes stale in
//     30s; the dashboard recovered on foreground and the KDS did not.
//   • the console logging, which is the dashboard's and is now on both.
// ⚠️ NOTHING WAS PARAMETERISED AWAY. If a future caller needs one of these OFF, add a flag and say why
// in the call — do not fork this file.
import { useEffect } from 'react'
import { onAppResume } from '@/lib/native/app'

/** One ping. Skipped while the browser reports offline, exactly as both inline versions did. */
async function ping(token: string, vanId: string | undefined, log: boolean): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (log) console.log('[Heartbeat] sending token:', token, 'vanId:', vanId || '(none)')
  try {
    const res = await fetch('/api/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, vanId: vanId || undefined }),
    })
    if (log) { const data = await res.json(); console.log('[Heartbeat] response:', data) }
  } catch (err) { if (log) console.error('[Heartbeat] failed:', err) }
}

export function useHeartbeat(opts: {
  token: string
  vanId?: string
  /** The 15s interval runs ONLY while the resolved event is `status==='open'`. */
  activeEventLive: boolean
  /** `navigator.onLine` + its listeners. Present so a reconnect re-arms the interval immediately. */
  deviceOnline: boolean
  /**
   * 🔴 ONE PING AS EARLY AS THE SURFACE CAN, BEFORE `activeEventLive` RESOLVES — the switch-gap fix.
   * The dashboard's interval clears the instant it unmounts; a KDS mount then has to complete auth,
   * `/api/dashboard` AND a second `/api/events/manage` round trip before `activeEvent` exists, and the
   * monitor's threshold is 30 SECONDS. That gap is the whole budget.
   * ⚠️ WHY WEAKENING THE `activeEventLive` GATE IS SAFE HERE, ESTABLISHED BEFORE IT WAS WEAKENED: the
   * gate's own comment says it exists because "offline protection only matters for a live event … and
   * THE MONITOR ONLY PAUSES status='open' EVENTS". So a stamp made while no event is live cannot cause
   * a wrong pause — the guard was avoiding pointless traffic, not preventing a wrong write. The route
   * is idempotent and the dashboard's own `onAppResume` comment already calls an off-event ping
   * "harmless". ONE ping, on mount only; the INTERVAL stays gated.
   */
  earlyPing?: boolean
}): void {
  const { token, vanId, activeEventLive, deviceOnline, earlyPing } = opts

  // The early ping. Mount-scoped and deliberately ungated on `activeEventLive`.
  useEffect(() => {
    if (!earlyPing || !token) return
    void ping(token, vanId, true)
  }, [token, vanId, earlyPing])

  // The 15s interval — gated on a LIVE event, exactly as both inline versions were.
  useEffect(() => {
    if (!activeEventLive || !token) return
    void ping(token, vanId, true)          // immediate ping on the confirmed→open flip / a reconnect
    const id = setInterval(() => { void ping(token, vanId, true) }, 15000)
    return () => clearInterval(id)
  }, [token, vanId, activeEventLive, deviceOnline])

  // Native foreground: a suspended interval leaves the van stale, so re-ping on resume. No-op on web.
  useEffect(() => {
    if (!token) return
    return onAppResume(() => { void ping(token, vanId, true) })
  }, [token, vanId])
}
