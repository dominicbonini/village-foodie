'use client'
// components/public/PublicAnalytics.tsx — cwv-2 (6 November 2026, docs/cwv-2-report.md §4, Dominic's Q2 = A): POSTHOG ON THE PUBLIC
// PAGES, STARTED ONCE THE PAGE HAS LOADED AND GONE IDLE, so its ~65 KB never competes with the first screen.
// 🔴 IT LOADS TODAY'S MODULE, NOT A COPY: app/(app)/providers.tsx (unchanged) initialises PostHog at module scope with every setting it
// has today — cookieless memory persistence, no session recording, before_send's credential and web-vitals guards, web vitals for a
// public entry. Importing it later runs exactly that code, later. Its guards read window.location when it is evaluated, which on a
// public page is still a public address (a visitor would have to switch country within that moment to differ — then the address is
// still public, and it is the one PostHog would have seen for the page view).
// • The first page view: posthog-js captures it when init runs, as today — for the page the visitor is on.
// • Web vitals (cwv-1): the web-vitals library reads the browser's buffered LCP and CLS entries when it starts; INP waits for a tap.
// • Nothing on a public page calls PostHog itself (no capture, no usePostHog — scripts/cwv-2.cjs checks), so there is no event to queue.
// • ⚠️ The one difference, accepted (Q2 = A): a visit that ends before this point sends nothing, where today it sent its page view on
//   unload. That is a bounce within ~0.5–1 s of the page finishing loading on a slow phone (a fraction of a second on a fast one).
// • The demo funnel (public.demo_events) is recorded on the server by the demo's own routes and never passed through PostHog.
import { useEffect } from 'react'

export function PublicAnalytics() {
  useEffect(() => {
    let done = false
    const start = () => {
      if (done) return
      done = true
      void import('@/app/(app)/providers')
    }
    const whenIdle = () => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      if (ric) ric(start, { timeout: 3000 })
      else setTimeout(start, 200)
    }
    if (document.readyState === 'complete') whenIdle()
    else window.addEventListener('load', whenIdle, { once: true })
    return () => window.removeEventListener('load', whenIdle)
  }, [])
  return null
}
