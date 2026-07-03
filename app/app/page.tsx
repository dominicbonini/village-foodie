'use client'
// Native app LANDING (cold-launch + post-login). Checks the persistent native session and AUTO-ROUTES to
// this device's remembered truck/van/screen (or /login). No UI beyond a brief splash — it never waits for
// input. On web this component is only reached in the app shell; a normal browser hitting /app just falls
// through to /dashboard.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isNativeApp, getDeviceId, getLastScreen } from '@/lib/native/device'
import { hasNativeSession, getNativeAccessToken } from '@/lib/native/session'
import { configureStatusBar } from '@/lib/native/statusBar'

export default function AppLanding() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const go = (path: string) => { if (!cancelled) router.replace(path) }

    ;(async () => {
      // Not the native app → this is just a web hit on /app; send to the normal dashboard entry.
      if (!isNativeApp()) return go('/dashboard')

      // Native launch → configure the status bar ONCE here (cold-launch entry), so the WebView overlays the
      // status bar wherever the AppHeader renders (dashboard / manage / kds), not only after visiting KDS.
      // Persists at the native layer across web navigation; no-op on web.
      void configureStatusBar()

      // No persistent session (or no access token) → log in.
      if (!(await hasNativeSession())) return go('/login')
      const jwt = await getNativeAccessToken()
      if (!jwt) return go('/login')

      try {
        const res = await fetch(`/api/native/my-trucks?device_id=${encodeURIComponent(getDeviceId())}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        })
        const data: {
          trucks?: { truck_id: string; dashboard_token: string }[]
          device?: { truck_id: string; default_screen: string } | null
        } = await res.json().catch(() => ({}))

        const trucks = data.trucks || []
        const device = data.device || null

        // This device is pinned to a truck → reopen the screen it was LAST on (restart-to-last-screen).
        // Falls back to the device's configured default_screen the first launch after setup (nothing
        // recorded yet).
        if (device) {
          const t = trucks.find(x => x.truck_id === device.truck_id)
          if (t) {
            const screen = getLastScreen() ?? device.default_screen
            return go(screen === 'kds' ? `/dashboard/${t.dashboard_token}/kds` : `/dashboard/${t.dashboard_token}`)
          }
        }
        // Otherwise open the first permitted truck's dashboard.
        if (trucks.length) return go(`/dashboard/${trucks[0].dashboard_token}`)
        // Authenticated but no permitted truck → login.
        return go('/login')
      } catch {
        return go('/login')
      }
    })()

    return () => { cancelled = true }
  }, [router])

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-white/70 text-sm font-medium animate-pulse">Loading…</p>
    </div>
  )
}
