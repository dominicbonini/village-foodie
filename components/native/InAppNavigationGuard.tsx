'use client'
// components/native/InAppNavigationGuard.tsx — app-fixes-1 (14 November 2026, docs/app-fixes-1-report.md §4).
//
// IN THE APP ONLY (isNativeApp()); on the web it attaches nothing, so the website behaves exactly as before.
// One click listener for the whole document, in the CAPTURE phase — before any component's own handler, because a Next <Link>
// (the user menu's Privacy / Terms) would otherwise soft-navigate first. It acts ONLY on links that leave the app; every
// 'stay' link (AppLink's router.push, the menu's own routes) reaches its own handlers untouched:
//   • a link to a customer-facing page (lib/app-navigation.ts 'browser': the order page, schedule, legal…) → opened in the
//     phone's browser, never inside the app;
//   • a link to the landing page or any marketing page ('app') → /app, which routes to the dashboard or to login;
//   • everything else ('stay': dashboard, KDS, Manage, login…), other sites, mailto:/tel:, downloads → untouched.
// proxy.ts catches whatever does not go through a link (a redirect, a typed address) with the same list.
import { useEffect } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { inAppRoute, browserUrlFor } from '@/lib/app-navigation'

export function InAppNavigationGuard() {
  useEffect(() => {
    if (!isNativeApp()) return
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.hasAttribute('download')) return
      let url: URL
      try { url = new URL(a.getAttribute('href') || '', window.location.href) } catch { return }
      if (url.origin !== window.location.origin) return   // another site: the shell already hands it to the browser
      const where = inAppRoute(url.pathname)
      if (where === 'stay') return
      e.preventDefault()
      e.stopPropagation()
      // A top-level navigation to the bare domain: neither shell keeps it (iOS opens Safari, Android the default browser).
      if (where === 'browser') window.location.href = browserUrlFor(url)
      else window.location.assign('/app')
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
