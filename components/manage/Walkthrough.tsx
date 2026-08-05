'use client'

// components/manage/Walkthrough.tsx
// Coach marks over the Manage tab bar. Opened ONLY from an explicit click (the wizard's done screen, the
// reminder strip, or Settings → Show me around) — this component has no auto-open path of its own and
// the caller has none either, which is what keeps it invisible to every operator who has never asked
// for it.
//
// ── HOW IT ANCHORS ───────────────────────────────────────────────────────────────────────────────────
// By `[data-tab-id="..."]`, resolved from the live DOM at open time, never by index or position. Two
// consequences that are the point of doing it this way:
//   • A stop whose tabs are ALL missing is dropped before the tour starts, so a manager (who has no
//     Billing tab) simply gets four stops instead of five rather than a mark pointing at empty space.
//   • The tab bar can be reordered or extended without touching this file or lib/walkthrough.ts.
//
// ── NARROW SCREENS ───────────────────────────────────────────────────────────────────────────────────
// The Manage tab row is `overflow-x-auto`, so on a phone the later tabs (Team, Settings, Billing) are
// off-screen until scrolled. Each stop therefore scrolls its own anchor into view BEFORE measuring —
// `inline: 'center'`, `behavior: 'auto'` so the measurement is not racing an animation — and the popover
// is clamped to the viewport rather than aligned to the anchor's left edge, which would push it off the
// right-hand side for the last tab.

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { WALKTHROUGH_INTRO, type WalkthroughStop } from '@/lib/walkthrough'

interface Box { top: number; left: number; width: number; height: number }

/** Union of the anchors' rects — one box even when a stop points at two tabs (Deals + Extras). */
function measure(tabIds: string[]): Box | null {
  const els = tabIds
    .map(id => document.querySelector(`[data-tab-id="${id}"]`))
    .filter((el): el is Element => !!el)
  if (els.length === 0) return null
  const rects = els.map(el => el.getBoundingClientRect())
  const top = Math.min(...rects.map(r => r.top))
  const left = Math.min(...rects.map(r => r.left))
  return {
    top,
    left,
    width: Math.max(...rects.map(r => r.right)) - left,
    height: Math.max(...rects.map(r => r.bottom)) - top,
  }
}

export function Walkthrough({ stops, onClose }: { stops: WalkthroughStop[]; onClose: () => void }) {
  // 🔴 RESOLVED ONCE, AT OPEN. Filtering on every render would let the tour change length underneath the
  // operator (a pending-count relabel re-renders the bar), and `index` would then point somewhere else.
  const [live] = useState<WalkthroughStop[]>(
    () => (typeof document === 'undefined' ? stops : stops.filter(s => measure(s.tabIds) !== null)),
  )
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)

  const stop = live[index]

  // Layout effect, not an effect: measure before paint so the mark never renders at a stale position.
  // A coach mark's position can only be known by measuring the live DOM, which cannot happen during
  // render. A layout effect is the correct place for exactly this, and measuring before paint is what
  // stops the mark flashing at a stale position when the stop changes.
  useLayoutEffect(() => {
    if (!stop) return
    const el = document.querySelector(`[data-tab-id="${stop.tabIds[0]}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBox(measure(stop.tabIds))
  }, [stop])

  // Re-measure on resize/scroll — the bar is horizontally scrollable and the operator can move it.
  useEffect(() => {
    if (!stop) return
    const remeasure = () => setBox(measure(stop.tabIds))
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)   // capture: the scroller is the tab row, not window
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [stop])

  // Escape closes, and closing by ANY route counts as completing it — see the caller.
  const close = useCallback(() => onClose(), [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Nothing to point at (no tab rendered at all) ⇒ close rather than show an empty tour.
  useEffect(() => { if (live.length === 0) close() }, [live.length, close])
  if (!stop || !box) return null

  const isLast = index === live.length - 1
  const CARD = 320
  const left = Math.max(8, Math.min(box.left + box.width / 2 - CARD / 2, window.innerWidth - CARD - 8))

  return (
    // Click-outside closes: the backdrop owns the handler and the card stops propagation.
    <div className="fixed inset-0 z-[70] bg-black/50" onClick={close} role="dialog" aria-modal="true"
      aria-label="Dashboard walkthrough">
      {/* The highlight. pointer-events-none so it never eats the backdrop's click-outside. */}
      <div aria-hidden className="fixed rounded-lg ring-4 ring-orange-400 pointer-events-none transition-all duration-200"
        style={{ top: box.top - 3, left: box.left - 3, width: box.width + 6, height: box.height + 6 }} />
      <div
        onClick={e => e.stopPropagation()}
        className="fixed bg-white rounded-2xl shadow-2xl p-4"
        // Clamped to the viewport (see the header note) and capped so it fits a ~320px phone.
        style={{ top: box.top + box.height + 14, left, width: `min(${CARD}px, calc(100vw - 16px))` }}
      >
        {/* Q9: the orientation line, on the FIRST stop only. It answers the question an operator has
            before any individual tab means anything — which of the two places they are in. Repeating
            it on every stop would just be noise once they know. */}
        {index === 0 && (
          <p className="text-xs text-slate-600 mb-3 pb-3 border-b border-slate-100">{WALKTHROUGH_INTRO}</p>
        )}
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600">
          {index + 1} of {live.length}
        </p>
        <h3 className="font-black text-slate-900 mt-0.5">{stop.title}</h3>
        <p className="text-sm text-slate-600 mt-1">{stop.body}</p>
        <div className="flex items-center gap-2 mt-4">
          {/* Skip is on EVERY stop, including the last, where it sits beside Done — an operator who
              wants out should never have to work out which control ends it. */}
          <button type="button" onClick={close}
            className="text-xs font-bold text-slate-400 hover:text-slate-600">
            Skip
          </button>
          <div className="flex-1" />
          {index > 0 && (
            <button type="button" onClick={() => setIndex(i => i - 1)}
              className="text-xs font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100">
              ← Back
            </button>
          )}
          <button type="button" onClick={() => (isLast ? close() : setIndex(i => i + 1))}
            className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-black px-4 py-2 rounded-lg">
            {isLast ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
