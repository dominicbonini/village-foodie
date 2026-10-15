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
import { useAppLocale } from '@/lib/i18n/use-t'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/nativeShell'

const OFFLINE_ALERT_DELAY_MS = 8000   // debounce: a blip shorter than this never fires

export function useOfflineAlert(autoPauseOn: boolean): void {
  const autoPauseRef = useRef(autoPauseOn)
  autoPauseRef.current = autoPauseOn
  // The words are made when the alert FIRES, in the locale current then (Language Phase 1b). A ref, written in
  // an effect, so the reachability subscription below never re-subscribes when the language arrives.
  const locale = useAppLocale()
  const localeRef = useRef(locale)
  useEffect(() => { localeRef.current = locale }, [locale])
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
          const t = translatorFor(localeRef.current, 'nativeShell')
          await notifyLocal(
            paused ? t('offlineAlert.pausedTitle') : t('offlineAlert.offlineTitle'),
            paused ? t('offlineAlert.pausedBody') : t('offlineAlert.offlineBody'),
          )
        })()
      }, OFFLINE_ALERT_DELAY_MS)
    })
    return () => { clearTimer(); unsub() }
  }, [])
}
