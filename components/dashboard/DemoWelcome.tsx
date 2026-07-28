'use client'

// components/dashboard/DemoWelcome.tsx
// One-time orientation the first time a visitor lands on the demo dashboard.
//
// Same pattern as the KDS intro: dismissible, remembered per token, decided in a lazy useState initialiser
// rather than an effect so someone who already dismissed it never sees a flash of it.
//
// ── COPY: SHORT, AND TWO INSTRUCTIONS ONLY ──────────────────────────────────────────────────────────
// This modal appears at the exact moment someone has waited ~45s to see their board — and it is COVERING
// that board. Every word is rent. The previous version ran ~78 words across four paragraphs; this is two
// bullets and one reassurance line. What was removed, and why:
//   · "your ordering page is live, we've created some orders" — they can SEE the orders behind the modal.
//   · "some things are switched off" — the padlocks explain themselves in context, at the moment it
//     matters. A pre-emptive apology for restrictions they haven't hit yet just adds doubt.
//   · the free-month line — it answers a question they haven't asked. It lives in the Save-my-menu modal,
//     where the signup decision is actually made; duplicating it here dilutes it in both places.
//
// ── THE RESERVATION LINE IS DELIBERATELY SCOPED ─────────────────────────────────────────────────────
// "Everything works exactly as it would on a real service" was NOT strictly true — printing, notifications
// and event actions are off in demo. "The ordering and kitchen flow is exactly as it runs live" IS true:
// the board is genuine engine output (§6). It also answers the actual suspicion, which is not "which
// features are on?" but "is this a mock-up?".
//
// ── THE QR IS RENDERED HERE, NOT LINKED ─────────────────────────────────────────────────────────────
// The copy tells them to scan it, so it has to be in front of them. generateQRWithLogo is a pure async
// function over a URL (dynamically imported, canvas-based, client-only) — it needs no Manage state and no
// fetch, so the popup can render it directly. That replaced the old copy-the-link box entirely: copying a
// URL and retyping it into a phone mid-demo is friction nobody actually goes through.
//   Logo argument is null + the 'Your logo here' placeholder plate, matching what the nav QR renders in
//   demo (a provisioned demo truck has no logo — provision-demo.ts never sets one). ⚠️ If demo trucks ever
//   gain a logo, this and handleShowQR in app/dashboard/[token]/page.tsx will diverge — change both.
// The copy-link box survives ONLY as a fallback for when there is no QR to show (no slug, or generation
// failed). Without it the copy would instruct "scan the QR code" beside an empty space.

import { useEffect, useState } from 'react'

export function DemoWelcome({ token, orderUrl, isSample = false }: { token: string; orderUrl: string | null; isSample?: boolean }) {
  const storeKey = `hg_demo_welcome_${token}`
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem(storeKey) !== 'seen' } catch { return true }
  })
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrFailed, setQrFailed] = useState(false)

  // Generated on open, not on mount, so a visitor who already dismissed the popup never pays for the
  // qrcode chunk. Guarded against setting state after dismissal.
  useEffect(() => {
    if (!open || !orderUrl || qrDataUrl || qrFailed) return
    let live = true
    ;(async () => {
      try {
        const { generateQRWithLogo } = await import('@/lib/generateQRCode')
        const dataUrl = await generateQRWithLogo(orderUrl, null, 320, 'Your logo here')
        if (live) setQrDataUrl(dataUrl)
      } catch (err) {
        console.error('[DemoWelcome] QR generation failed:', err)
        if (live) setQrFailed(true)
      }
    })()
    return () => { live = false }
  }, [open, orderUrl, qrDataUrl, qrFailed])

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

  const showQr = !!orderUrl && !qrFailed

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={dismiss}>
      {/* Fixed-height flex shell (reference manual): header shrink-0 · body flex-1 min-h-0 overflow-y-auto
          · footer shrink-0. The QR makes this tall enough to need it on a short viewport. */}
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
      >
        <div className="px-6 pt-6 pb-4 shrink-0 text-center">
          <div className="text-3xl mb-1" aria-hidden>🎉</div>
          {/* §11: a sample truck must be NAMED as a sample, never "here's your menu". The source is
              demo_sessions.extraction_source === 'template', served in /api/dashboard's `demo` block and
              passed down as isSample. It was previously the ?welcome=sample redirect param, which did not
              survive a reload — a stored column does. */}
          <h3 className="font-black text-slate-900">{isSample ? 'Here’s a sample truck' : 'Here’s your menu'}</h3>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 space-y-4">
          {isSample && (
            <p className="text-sm text-slate-600 text-center">
              This is a <strong>stand-in menu</strong> so you can see how it all works — upload your own menu
              any time to make it yours.
            </p>
          )}

          {/* The two instructions. One action on the board they're looking at, one that closes the loop
              from a real phone. Nothing else competes with them. */}
          <div>
            <p className="text-sm font-bold text-slate-900 mb-2">Two things to try:</p>
            <ul className="space-y-2">
              <li className="flex gap-2 text-sm text-slate-600">
                <span className="text-slate-400 shrink-0" aria-hidden>·</span>
                <span>Hit <strong className="text-slate-900">Mark paid &amp; done</strong> on an order</span>
              </li>
              <li className="flex gap-2 text-sm text-slate-600">
                <span className="text-slate-400 shrink-0" aria-hidden>·</span>
                <span>
                  Scan the <strong className="text-slate-900">QR code</strong> with your phone and order as a
                  customer — watch it land
                </span>
              </li>
            </ul>
          </div>

          {/* The QR itself, sized so a phone camera picks it up off a laptop screen without leaning in. */}
          {showQr && (
            <div className="flex justify-center">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- canvas data: URL, not an optimisable asset
                <img
                  src={qrDataUrl}
                  alt="QR code to your customer ordering page"
                  className="w-40 h-40 rounded-xl border border-slate-200"
                />
              ) : (
                <div className="w-40 h-40 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" aria-hidden />
              )}
            </div>
          )}

          {/* FALLBACK ONLY — no slug, or the QR failed to generate. The copy above says "scan the QR code",
              so something has to close that loop rather than leave a gap. */}
          {!showQr && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-3">
              <p className="text-xs font-bold text-orange-900 mb-2">Your customer order link</p>
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
          )}

          {/* Scoped reassurance — see the header note. Answers "is this a mock-up?", and stays true. */}
          <p className="text-sm text-slate-500 text-center italic">
            The ordering and kitchen flow is exactly as it runs live.
          </p>
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
