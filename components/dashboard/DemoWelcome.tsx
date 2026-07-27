'use client'

// components/dashboard/DemoWelcome.tsx
// One-time orientation the first time a visitor lands on the demo dashboard.
//
// Same pattern as the KDS intro: dismissible, remembered per token, decided in a lazy useState initialiser
// rather than an effect so someone who already dismissed it never sees a flash of it.
//
// THE CUSTOMER ORDER LINK sits at the BOTTOM with a copy button — it's what closes the loop (order page →
// dashboard → kitchen screen) and the one thing most likely to be missed, and the body copy points "the
// link below" at it. It stays reachable after dismissal from the dashboard header (desktop utility row +
// mobile UserMenu), so the popup isn't the only way to find it.
//
// THE FREE-MONTH LINE gets its OWN emerald block, not folded into the paragraphs: §8 ranks first-event
// reassurance ("no clock until you go live") as the strongest conversion trigger, so it earns visual room.

import { useState } from 'react'

export function DemoWelcome({ token, orderUrl, isSample = false }: { token: string; orderUrl: string | null; isSample?: boolean }) {
  const storeKey = `hg_demo_welcome_${token}`
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem(storeKey) !== 'seen' } catch { return true }
  })
  const [copied, setCopied] = useState(false)

  const dismiss = () => {
    try { localStorage.setItem(storeKey, 'seen') } catch { /* private mode — it'll ask again */ }
    setOpen(false)
  }

  const copy = () => {
    if (!orderUrl) return
    navigator.clipboard.writeText(orderUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={dismiss}>
      {/* Fixed-height flex shell (reference manual): header shrink-0 · body flex-1 min-h-0 overflow-y-auto
          · footer shrink-0. The order-link block makes this tall enough to need it on a short viewport. */}
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
      >
        <div className="px-6 pt-6 pb-4 shrink-0 text-center">
          <div className="text-3xl mb-1" aria-hidden>🎉</div>
          {/* §11: a sample truck must be NAMED as a sample, never "here's your menu". Source comes from the
              ?welcome=sample flag the demo redirect carries (one signal, read on the dashboard). */}
          <h3 className="font-black text-slate-900">{isSample ? 'Here’s a sample truck' : 'Here’s your menu!'}</h3>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 space-y-4">
          {isSample && (
            <p className="text-sm text-slate-600 text-center">
              This is a <strong>stand-in menu</strong> so you can see how it all works — upload your own menu
              any time to make it yours.
            </p>
          )}

          <p className="text-sm text-slate-600 text-center">
            Your ordering page is live — we&apos;ve created some orders so you can see how it runs.
          </p>

          <p className="text-sm text-slate-600 text-center">
            Have a play. Take an order, place a customer order too via the link below, watch the kitchen
            screen. Everything here works exactly as it would on a real service.
          </p>

          <p className="text-sm text-slate-600 text-center">
            Some things are switched off while you&apos;re having a look around. They&apos;re all there when
            you sign up.
          </p>

          {/* §8 — first-event reassurance is the strongest conversion trigger. Plain centred text (no tinted
              box), with extra vertical room (py-2 on top of the parent's space-y-4) so it still reads as the
              closing point. Answers the fear that SIGNING UP starts a clock — not "no rush while you play". */}
          <p className="text-sm text-slate-700 text-center py-2">
            <span aria-hidden>⏱️</span> <strong>Signing up won&apos;t start your free month.</strong><br />
            That begins when you pick your first live event — whenever you&apos;re ready.
          </p>

          {/* Customer order link — at the BOTTOM (the "link below" the copy points at), with a copy button. */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-3">
            <p className="text-xs font-bold text-orange-900 mb-1">Your customer order link</p>
            <p className="text-xs text-orange-900/80 mb-2">Open it, place an order, and watch it land here.</p>
            {orderUrl ? (
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 bg-white border border-orange-200 rounded-lg px-2.5 py-2 text-[11px] font-mono text-slate-700 truncate">
                  {orderUrl}
                </code>
                <button onClick={copy}
                  className="shrink-0 bg-orange-600 text-white text-xs font-bold px-3 rounded-lg hover:bg-orange-700">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-orange-900/70">Your ordering page link is in the menu, top right.</p>
            )}
          </div>
        </div>

        <div className="px-6 pt-4 pb-6 shrink-0">
          <button onClick={dismiss}
            className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl text-sm hover:bg-slate-800">
            Start exploring
          </button>
        </div>
      </div>
    </div>
  )
}
