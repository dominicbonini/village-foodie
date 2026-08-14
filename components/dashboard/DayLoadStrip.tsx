'use client'

// At-a-glance day-load strip — DISPLAY ONLY. It surfaces the dashboard's EXISTING per-slot
// traffic-light data (the `slots` state from /api/dashboard, built by buildSlotAvailability for
// the tone + buildSlotIndicators for the per-category `label`) — the SAME engine + backward-
// occupancy projection the Add Order / Edit Order dots read (identical `tone = w?.tone ?? 'green'`
// rule on projectBackwardOccupancy, and the dots' own composition label), so the strip can never
// diverge from the dots. NO capacity computation here, no engine/placement change — it only reads
// fields already on each slot. "now" is event-tz-correct (getNowMinsInTz); past slots excluded;
// earliest upcoming first. Empty windows are green (the engine already folds no-load → green — no
// phantom amber, per the too_soon-fold removal).
//   Desktop: time + dot + per-category wording ("2 Pizzas, 1 Other"), matching the dots.
//   Mobile:  time + dot ONLY — the colour is the at-a-glance value on a small screen; the opaque
//            count was removed (it read as "current_orders/max_orders" = oven units / kitchen
//            capacity, which is confusing in a tiny cell).

import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'
import type { Slot } from './types'

const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

const TONE: Record<'green' | 'amber' | 'red', { dot: string; text: string }> = {
  green: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-700' },
  red: { dot: 'bg-red-500', text: 'text-red-700' },
}

export function DayLoadStrip({ slots, eventDate, variant, tz = 'Europe/London' }: {
  /** The dashboard's existing full-day slot series (already carries tone + counts). */
  slots: Slot[]
  /** Active event's date — drives the cross-day guard (only floor by "now" when the event is today). */
  eventDate: string | null
  /** 'sidebar' = desktop vertical list; 'strip' = mobile horizontal scroll. */
  variant: 'sidebar' | 'strip'
  tz?: string
}) {
  // Cross-day guard mirrors the engine: only exclude past slots when the event IS today; a
  // pre-order event (future date) shows its whole day. nowMins is event-local minute-of-day.
  const isToday = !!eventDate && eventDate === getLocalDateInTz(tz)
  const nowMins = getNowMinsInTz(tz)
  const upcoming = slots
    .filter(s => !s.is_grace && (!isToday || toMins(s.collection_time) >= nowMins))
    .sort((a, b) => toMins(a.collection_time) - toMins(b.collection_time))

  if (!upcoming.length) return null

  if (variant === 'strip') {
    // Mobile: one compact horizontal-scroll row under the New/Confirmed/Done summary — visible
    // at a glance without a tap. Time + colour dot ONLY (no number — the dot is the value here);
    // cells are tightened now that the count line is gone, so it never crushes the order cards.
    return (
      <div className="mb-3">
        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Kitchen capacity</p>
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {upcoming.map(s => {
            const tone = (s.tone ?? 'green') as 'green' | 'amber' | 'red'
            return (
              <div key={s.collection_time} className="flex-shrink-0 flex flex-col items-center gap-1 bg-white border border-slate-200 rounded-lg px-1.5 py-1 min-w-[42px]">
                <span className="text-[11px] font-bold text-slate-600 tabular-nums">{s.collection_time}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${TONE[tone].dot}`} />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Desktop: a vertical sidebar list down the right of the Orders view, scrollable. Each row shows
  // the time + dot + the per-category composition wording the dots use ("2 Pizzas, 1 Other"); empty
  // windows show just the dot (quiet).
  // FLEX FIT, NOT A VIEWPORT FRACTION (14 Aug 2026). This was `max-h-[60vh]` on the list below, which is
  // why the panel stopped partway down an iPad in LANDSCAPE and left dead space under it: `vh` measures the
  // viewport's HEIGHT, which in landscape is the SHORT dimension, so 60vh was about 492px on an iPad13,19 —
  // roughly 19 rows, ending near 18:35 on a 17:00-20:00 event. The number knew nothing about the column it
  // sat in.
  //   - `flex-1 min-h-0` on the card: the card fills whatever height its parent gives it. The parent is the
  //     dashboard's <aside>, which at lg is a bounded flex sibling inside a non-scrolling <main>, itself
  //     inside the `h-dvh` app-shell. So the height is DERIVED FROM dvh at the root, not from a `vh`
  //     fraction here, and it self-adjusts to any header/tab/inset height. No magic offset.
  //   - `flex-1 min-h-0 overflow-y-auto` on the list: it takes the remaining space under the heading and
  //     scrolls internally. `min-h-0` is required or a flex child refuses to shrink below its content and
  //     the scroller never engages.
  //   - EVERY slot stays in the DOM. There is no cap, no slice and no virtualisation here, and adding one
  //     would change what the operator can see rather than how much of it fits.
  // Below lg this component's sidebar variant is not rendered at all (the call site is `hidden lg:flex`),
  // so nothing here reaches portrait or a phone.
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col min-h-0 flex-1">
      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 shrink-0">Kitchen capacity</p>
      <div className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto">
        {upcoming.map(s => {
          const tone = (s.tone ?? 'green') as 'green' | 'amber' | 'red'
          return (
            <div key={s.collection_time} className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-slate-50">
              <span className="text-xs font-bold text-slate-600 tabular-nums w-10 flex-shrink-0">{s.collection_time}</span>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TONE[tone].dot}`} />
              {/* One line per slot: nowrap + truncate so a typical label ("2 Pizzas, 1 Other") fits and
                  an edge-case long composition ellipsis-truncates rather than wrapping to a 2nd line. */}
              {s.label
                ? <span className={`text-xs font-medium truncate min-w-0 flex-1 ${TONE[tone].text}`}>{s.label}</span>
                : <span className="text-xs text-slate-300">—</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
