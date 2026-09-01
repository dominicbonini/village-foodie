'use client'
// ── THE BANNER, AND THE MOUNT POINT FOR THE OBSERVER. ────────────────────────────────────────────────
// One component, mounted once at the app boundary (app/layout.tsx). It starts the observer and renders
// the only thing an involuntary sign-out is allowed to produce.
//
// 🔴 IT NEVER NAVIGATES. That is the entire requirement. A kitchen tablet mid-service keeps its board,
// its selected event, its filters and its 68 pieces of component state; the operator is told the session
// needs attention and chooses when to act. `<a href>` — not router.push — so the choice is theirs and
// visibly a link, and so it works even if the router is in a bad state.
//
// ⚠️ NON-BLOCKING BY CONSTRUCTION: `fixed` + `pointer-events-none` on the wrapper, with pointer events
// re-enabled on the bar itself. It cannot swallow a tap meant for an order card underneath it.
// ⚠️ BOTTOM, NOT TOP: the KDS and dashboard both carry sticky headers and the AppHeader owns the safe
// area. A top banner would fight them and could cover an order row.
import { useEffect, useState } from 'react'
import { startSessionObserver, subscribeSessionAlert, type SessionAlert } from '@/lib/auth/session-observer'

export function SessionAlertBanner() {
  const [alert, setAlert] = useState<SessionAlert>(null)

  useEffect(() => {
    // Idempotent; the observer keeps running if this unmounts.
    startSessionObserver()
    return subscribeSessionAlert(setAlert)
  }, [])

  if (!alert) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3 pointer-events-none"
    >
      <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
        <span aria-hidden="true" className="text-lg leading-none">⚠️</span>
        <div className="flex-1 min-w-0">
          {/* 🔴 THE COPY SAYS WHAT IS TRUE AND WHAT IS SAFE. It does NOT say "you have been signed out"
              — the operator has not been, from their point of view: the screen is still theirs and still
              working. It names the one thing that stopped (saving changes) so the sentence is actionable
              rather than alarming, and it does not expose the internal reason. */}
          <p className="text-sm font-bold text-amber-900">Your sign-in needs attention</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Everything on screen is still here. New changes may not save until you sign in again.
          </p>
        </div>
        <a
          href="/login"
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-700"
        >
          Sign in again
        </a>
      </div>
    </div>
  )
}
