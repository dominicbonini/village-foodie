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
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Kitchen capacity</p>
      <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
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
