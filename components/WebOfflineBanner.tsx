'use client'
// WEB-ONLY offline indicator — the counterpart to native/OfflineBanner (which is native-only and backed by a
// durable outbox). The web dashboard has NO offline queue, so this banner deliberately does NOT promise
// "saved — will sync"; it tells the operator plainly that orders won't send until they reconnect, so they fall
// back to paper instead of hitting a silent, confusing failure. Renders null on native (the native banner owns
// that case). Self-contained: it runs its OWN lightweight reachability check (navigator.onLine + a debounced
// HEAD /api/ping poll) and does NOT touch the shared reachability module / isOnline() — so web WRITE behaviour
// is unchanged (the offline gate stays native-gated; this is purely a visual indicator).
import { useEffect, useRef, useState } from 'react'
import { isNativeApp } from '@/lib/native/device'

const PING_URL = '/api/ping'
const INTERVAL_MS = 10_000
const TIMEOUT_MS = 3_000
const FAIL_THRESHOLD = 3   // ~30s of consecutive failures before declaring OFFLINE — debounces momentary blips
const OK_THRESHOLD = 1     // one success flips straight back to ONLINE (prompt recovery)

/** Persistent "you're offline" bar for the WEB dashboard/KDS. Mount alongside <OfflineBanner/>; it self-limits
 *  to web and self-subscribes to connectivity. */
export function WebOfflineBanner() {
  const [offline, setOffline] = useState(false)
  const fails = useRef(0)
  const oks = useRef(0)

  useEffect(() => {
    if (isNativeApp() || typeof window === 'undefined') return
    let cancelled = false

    const ping = async (): Promise<boolean> => {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      try {
        const res = await fetch(`${PING_URL}?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal })
        return res.ok
      } catch { return false } finally { clearTimeout(t) }
    }

    const check = async () => {
      // navigator.onLine === false → no network interface at all → offline immediately (no ping needed).
      // The reverse (onLine true) is NOT trustworthy on a connected-but-dead uplink (the signal-blackspot
      // case), so confirm real reachability with a debounced ping before clearing the banner.
      if (!navigator.onLine) { fails.current = FAIL_THRESHOLD; oks.current = 0; if (!cancelled) setOffline(true); return }
      const ok = await ping()
      if (cancelled) return
      if (ok) { oks.current++; fails.current = 0; if (oks.current >= OK_THRESHOLD) setOffline(false) }
      else { fails.current++; oks.current = 0; if (fails.current >= FAIL_THRESHOLD) setOffline(true) }
    }

    void check()
    const timer = setInterval(() => { void check() }, INTERVAL_MS)
    // Browser online/offline events are INSTANT hints → offline flips the banner up at once; online forces a
    // confirming re-check rather than trusting the event outright.
    const onOffline = () => { fails.current = FAIL_THRESHOLD; oks.current = 0; setOffline(true) }
    const onOnline = () => { void check() }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  if (isNativeApp() || !offline) return null
  return (
    <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
      📴 You&apos;re offline — orders won&apos;t send until you reconnect. Note orders down and retry when you&apos;re back online.
    </div>
  )
}
