'use client'
// LOCAL offline/paused notification (triggers b + c). Device-generated → works OFFLINE, no server. Fires ONCE
// per offline episode, and only after the offline state PERSISTS past a debounce window (network flaps must
// not spam). Message depends on auto-pause: on → "customer ordering is paused"; off → "you're offline".
// iPad-only (isNativeApp gate) and gated by the Settings prefs (offlineAlertsEnabled). Reachability is the
// SAME signal OfflineBanner/heartbeat/the offline chip use.
import { useEffect, useRef } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { onReachabilityChange } from '@/lib/native/reachability'
import { notifyLocal, offlineAlertsEnabled } from '@/lib/native/notifications'

const OFFLINE_ALERT_DELAY_MS = 8000   // debounce: a blip shorter than this never fires

export function useOfflineAlert(autoPauseOn: boolean): void {
  const autoPauseRef = useRef(autoPauseOn)
  autoPauseRef.current = autoPauseOn
  useEffect(() => {
    if (!isNativeApp()) return
    let fired = false                                   // one alert per offline EPISODE
    let timer: ReturnType<typeof setTimeout> | null = null
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null } }
    // onReachabilityChange fires immediately with the current state, then on every transition. The module
    // already debounces the raw checks (FAIL_THRESHOLD), so a reported 'offline' is confirmed; the timer +
    // once-per-episode below is the extra guard the spec asks for.
    const unsub = onReachabilityChange(online => {
      if (online) { fired = false; clearTimer(); return }   // reconnected → reset the episode
      if (fired || timer) return                            // already alerted / scheduled this episode
      timer = setTimeout(() => {
        timer = null
        void (async () => {
          if (fired) return
          if (!(await offlineAlertsEnabled())) return       // Settings: master + offline-type must be on
          fired = true
          const paused = autoPauseRef.current
          await notifyLocal(
            paused ? 'Ordering paused' : "You're offline",
            paused ? "You're offline — customer ordering is paused." : 'This device has lost its connection.',
          )
        })()
      }, OFFLINE_ALERT_DELAY_MS)
    })
    return () => { clearTimer(); unsub() }
  }, [])
}
