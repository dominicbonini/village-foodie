'use client'

// At-a-glance day-load strip — DISPLAY ONLY. It surfaces the dashboard's EXISTING per-slot
// traffic-light data (the `slots` state from /api/dashboard, built by buildSlotAvailability:
// tone + current_orders + max_orders) — the SAME engine + backward-occupancy projection the
// Add Order / Edit Order dots read (lib/slot-display buildSlotIndicators uses the identical
// `tone = w?.tone ?? 'green'` rule on projectBackwardOccupancy), so the strip can never diverge
// from the dots. NO capacity computation here, no engine/placement change — it only reads fields
// already on each slot. "now" is event-tz-correct (getNowMinsInTz); past slots excluded; earliest
// upcoming first. Empty windows are green (the engine already folds no-load → green — no phantom
// amber, per the too_soon-fold removal).

import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'
import type { Slot } from './types'

const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

// kitchen_capacity null ⇒ buildSlotAvailability fills max_orders with this sentinel (UNLIMITED).
// Above it we have no real denominator, so show the bare count instead of "N/999".
const UNLIMITED = 999

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

  const cell = (s: Slot) => {
    const tone = (s.tone ?? 'green') as 'green' | 'amber' | 'red'
    const t = TONE[tone]
    const finite = typeof s.max_orders === 'number' && s.max_orders < UNLIMITED
    return {
      time: s.collection_time,
      dot: t.dot,
      text: t.text,
      count: finite ? `${s.current_orders}/${s.max_orders}` : `${s.current_orders}`,
      hasLoad: (s.current_orders ?? 0) > 0,
    }
  }

  if (variant === 'strip') {
    // Mobile: one compact horizontal-scroll row under the New/Confirmed/Done summary — visible
    // at a glance without a tap, ~one row tall so it never crushes the order cards below.
    return (
      <div className="mb-3">
        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Day load</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {upcoming.map(s => {
            const c = cell(s)
            return (
              <div key={s.collection_time} className="flex-shrink-0 flex flex-col items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 min-w-[52px]">
                <span className="text-[11px] font-bold text-slate-600 tabular-nums">{c.time}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                <span className={`text-[11px] font-semibold tabular-nums ${c.hasLoad ? c.text : 'text-slate-300'}`}>{c.count}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Desktop: a vertical sidebar list down the right of the Orders view, scrollable.
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Day load</p>
      <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
        {upcoming.map(s => {
          const c = cell(s)
          return (
            <div key={s.collection_time} className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-slate-50">
              <span className="text-xs font-bold text-slate-600 tabular-nums w-10">{c.time}</span>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
              <span className={`text-xs font-semibold tabular-nums ml-auto ${c.hasLoad ? c.text : 'text-slate-300'}`}>{c.count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
