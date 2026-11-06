'use client'

// components/landing/DemoUpload.tsx
// The public demo entry point (spec Stage 1-2, §11).
//
// ── HOW ALL SIX CTAs OPEN ONE MODAL ────────────────────────────────────────────────────────────────
// The landing page is a SERVER component, so its CTAs can't hold an onClick, and the modal state has to
// live somewhere every one of them can reach. Three parts, exported from here:
//   <DemoModalProvider>  — client context holding `open`. Wraps the whole page tree; a client component
//                          can take server-rendered children, so nothing else has to become a client
//                          component.
//   <DemoCta>            — a client <button> that opens it. Drops in where each `<a href="#try">` was,
//                          taking the same className so the page's styling is untouched.
//   <DemoModal>          — the modal itself, mounted ONCE at the end of the page.
// Context over a window CustomEvent: type-safe, no listener lifecycle to get wrong, and the dependency is
// visible in the tree rather than implied by a magic string.
//
// ⚠️ FIXED-HEIGHT MODAL RULE (reference manual): header shrink-0 · body flex-1 min-h-0 overflow-y-auto ·
// footer shrink-0. The failure screen is tall (three fallback routes + an email field) and would push the
// footer off-screen on a short viewport without it. That bug has bitten this codebase before.
//
// Behaviour below the presentation layer is UNCHANGED: same endpoint, same load-screen timing, same
// failure handling. Rate limiting and the size/type caps live server-side and are untouched.

import { useState, useEffect, createContext, useContext } from 'react'
import dynamic from 'next/dynamic'
// The words stay registered HERE, as before, so the page's language boundary loads them exactly when it did (Language Phase 1c).
import '@/lib/i18n/catalog/demoUpload'
import '@/lib/i18n/catalog/errorsOnboarding'

// ── Context ─────────────────────────────────────────────────────────────────────────────────────────
const DemoModalCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null)

export function DemoModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <DemoModalCtx.Provider value={{ open, setOpen }}>{children}</DemoModalCtx.Provider>
}

function useDemoModal() {
  const ctx = useContext(DemoModalCtx)
  if (!ctx) throw new Error('DemoCta/DemoModal must be inside <DemoModalProvider>')
  return ctx
}

/** Drop-in replacement for the old `<a href="#try">` CTAs — opens the modal wherever the visitor is,
 *  instead of scrolling them to a section. Same className in, same look out. */
// ⚠️ `id` IS OPTIONAL AND PURELY ADDITIVE — every existing caller renders byte-identically (React omits
// an undefined id). It exists so the landing hero's CTA can be OBSERVED: HeroCtaWatcher needs a stable
// handle on this exact button to drive the header CTA's mobile reveal, and a CSS-class selector would
// couple that behaviour to landing.css's class names. A wrapper element was the alternative and is
// worse — `.hero-cta-row .btn-lg { width: 100% }` sizes the BUTTON, so a wrapper would become the flex
// item and the button would collapse to its text width.
export function DemoCta({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  const { setOpen } = useDemoModal()
  return (
    <button type="button" id={id} className={className} onClick={() => setOpen(true)}
      onPointerEnter={preloadDemoModal} onFocus={preloadDemoModal} onTouchStart={preloadDemoModal}>
      {children}
    </button>
  )
}

// ── The modal ───────────────────────────────────────────────────────────────────────────────────────
// cwv-2 (6 November 2026, docs/cwv-2-report.md §5): the pop-up's code is components/landing/DemoModalBody.tsx, loaded off the first
// screen's path — when the page has gone idle, or when a demo button is pointed at, focused or touched (preloadDemoModal), whichever is
// first. It renders nothing until the pop-up is first opened (as before: `open` can only flip on a click, after hydration), and from
// then on stays mounted with its own state, as the inline modal did.
const DemoModalBody = dynamic(() => import('./DemoModalBody'), { ssr: false })
let preloaded = false
/** Start fetching the pop-up's code (once). */
export function preloadDemoModal(): void {
  if (preloaded) return
  preloaded = true
  void import('./DemoModalBody')
}

export function DemoModal() {
  const { open, setOpen } = useDemoModal()
  const [shown, setShown] = useState(false)
  if (open && !shown) setShown(true)
  useEffect(() => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const idle = () => (ric ? ric(preloadDemoModal, { timeout: 4000 }) : setTimeout(preloadDemoModal, 300))
    if (document.readyState === 'complete') idle()
    else window.addEventListener('load', idle, { once: true })
    return () => window.removeEventListener('load', idle)
  }, [])
  return shown ? <DemoModalBody open={open} setOpen={setOpen} /> : null
}
