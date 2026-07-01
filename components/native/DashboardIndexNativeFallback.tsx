'use client'
// Native-aware fallback for the token-less /dashboard INDEX guard (app/dashboard/page.tsx). The index is a
// SERVER component that resolves the user from the COOKIE session; the native app has NO cookie (only a
// native localStorage session), so `if (!user)` always fires there → redirect → login loop. Rendered ONLY
// in the no-cookie-user branch:
//   • NATIVE app WITH a native session → go to the native landing /app (which routes to the truck). No loop.
//   • WEB (not native) or no native session → /login, exactly the old outcome (byte-identical destination).
// So the cookie path for a logged-in web user never reaches this (server finds the cookie user first), and
// a logged-out web user still ends at /login. Additive; web behaviour unchanged.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isNativeApp } from '@/lib/native/device'
import { hasNativeSession } from '@/lib/native/session'

export function DashboardIndexNativeFallback() {
  const router = useRouter()
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const native = isNativeApp() && (await hasNativeSession())
      if (cancelled) return
      router.replace(native ? '/app' : '/login')
    })()
    return () => { cancelled = true }
  }, [router])
  return null
}
