'use client'

// ── CHANGING AN EVENT'S FINISH TIME — ONE CONTROL, BOTH SURFACES ───────────────────────────────────
// 🔴 ONE ACTION HAD TWO SHAPES. The KDS offered an absolute picker with a confirm; the dashboard's Event
// actions menu offered:
//     <button onClick={()=>{extendEvent(activeEvent.id,30);setShowEventMenu(false)}}>Extend event +30 min</button>
// one tap, relative, no confirm and no undo — the exact shape that got pressed by accident on the KDS
// and was removed from its header for it. Both write the SAME thing (one POST to /api/events/action,
// action:'update', payload `{ end_time }`), so the divergence was entirely in what the operator was
// asked before it happened. This component is the KDS's control, lifted, so both menus offer it.
//
// ── ⚠️ IT WRITES NOTHING. THE CALLER OWNS THE REQUEST ──────────────────────────────────────────────
// `onConfirm(newEnd)` hands the caller a validated HH:MM and nothing else. That is deliberate: the KDS
// routes its write through the offline outbox (`data?.queued` → pendingSyncCount) and the dashboard
// through its own toast path, and folding either in here would make this component care about a
// surface's networking. What it DOES own is the two-step gate, the validation and the count — the parts
// that must not differ.
//
// ── 🔴 THE TWO STEPS ARE THE SAFETY, NOT A FLOURISH ────────────────────────────────────────────────
// Step 'pick' writes nothing and can be abandoned freely; step 'confirm' is the only thing that calls
// onConfirm. `selected` lives in this component, so closing discards it and every open starts from the
// event's CURRENT finish time — there is no draft to leak back in.
import { useState } from 'react'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/kitchenModals'
import { instantOfLocal, formatSlot, timeSettingsOr, type TimeSettings } from '@/lib/time-utils'
import { crossesMidnight, clockMins, eventTimeMins, eventTimeInstant } from '@/lib/event-window'

/** Statuses that are over, so an order in one of them cannot be "due after" anything.
 *  ⚠️ THE SAME LIST THE KDS BOARD USES for `activeOrders`, kept here so both surfaces count identically
 *  rather than each pre-filtering to its own idea of "live". Callers pass their per-event order list. */
const TERMINAL_STATUSES = ['collected', 'cancelled', 'rejected']

/** Only what the count needs. Both surfaces' order rows satisfy this structurally. */
export type FinishTimeOrder = { slot: string | null; status: string }

/** The event's own times — what places a clock time on the right day (lib/event-window.ts). */
export type FinishTimeEventTimes = { start_time?: string | null; end_time?: string | null } | null | undefined

/** Every 15-min boundary on the event's date that is STILL AHEAD OF THE CLOCK.
 *  🔴 "FUTURE" MEANS FUTURE RELATIVE TO NOW, NOT TO THE CURRENT FINISH TIME. That distinction is the
 *  whole point: a truck that has sold out at 19:20 must be able to set the finish to 19:30 even though
 *  the event is scheduled until 21:00 — an EARLIER time that is still ahead of the clock. Filtering
 *  against end_time instead would offer only extensions, which is the control this one replaced.
 *  ⚠️ Built against the EVENT'S DATE, not today's, so a past-dated event yields an empty list and the
 *  modal says so rather than offering times that have already gone.
 *  🔴 THE TRUCK'S CLOCK, NOT THE DEVICE'S (17 October 2026): each boundary is read in `tz`, the truck's zone (was
 *  `new Date('YYYY-MM-DDTHH:MM')`, the tablet's zone). 🔴 AN EVENT THAT RUNS PAST MIDNIGHT (lib/event-window.ts): a
 *  boundary earlier than its start is the NEXT day's, and the list runs in event order (20:15 … 23:45, 00:00 …).
 *  🔴 THE EDITOR'S RULE FOR EVERY EVENT WITH A START (17 October 2026, Dominic's decision, docs/midnight-followups-report.md):
 *  every boundary EXCEPT THE START — one after the start is on the event's date (exactly the list a normal event always had),
 *  one EARLIER than the start is the next day's and is offered after them ("00:30 (next day)", `isNextDayFinish`). Choosing
 *  it turns the event into one that runs past midnight; everything else follows the rule. An event with no start (or no
 *  zone) keeps the old list. */
export function finishTimeOptions(eventDate: string | null | undefined, tz?: string, event?: FinishTimeEventTimes): string[] {
  if (!eventDate) return []
  const startMins = clockMins(event?.start_time)
  if (tz && startMins != null) {
    const start = event!.start_time as string
    const opts: string[] = []
    for (let mins = 0; mins < 24 * 60; mins += 15) {
      if (mins === startMins) continue
      const t = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      // The proposed finish IS the end: earlier than the start ⇒ the next day's (lib/event-window.ts).
      if (eventTimeInstant(eventDate, start, t, t, tz) > Date.now()) opts.push(t)
    }
    return opts.sort((a, b) => (eventTimeMins(start, a, a) as number) - (eventTimeMins(start, b, b) as number))
  }
  const now = Date.now()
  const out: string[] = []
  const overnight = !!event && crossesMidnight(event.start_time, event.end_time)
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    const t = `${hh}:${mm}`
    const at = !tz ? new Date(`${eventDate}T${t}`).getTime()
      : overnight ? eventTimeInstant(eventDate, event!.start_time, event!.end_time, t, tz)
      : instantOfLocal(eventDate, t, tz)
    if (at > now) out.push(t)
  }
  if (overnight) out.sort((a, b) => (eventTimeMins(event!.start_time, event!.end_time, a) as number) - (eventTimeMins(event!.start_time, event!.end_time, b) as number))
  return out
}

/** True when a finish time falls on the NEXT day: earlier than the event's start (lib/event-window.ts). */
export function isNextDayFinish(start: string | null | undefined, finish: string | null | undefined): boolean {
  return crossesMidnight(start, finish)
}

/** Live orders this event still owes that are due AFTER a proposed finish time.
 *  ⚠️ NULL-SLOT (ASAP) ORDERS ARE DELIBERATELY EXCLUDED: they have no promised time to fall after.
 *  🔴 AN EVENT THAT RUNS PAST MIDNIGHT (pass `event`): the slot and the proposed finish are both read on the event's
 *  timeline (lib/event-window.ts), so a 00:15 order is "after" a 23:00 finish. Any other event: the string compare. */
export function ordersDueAfter(orders: FinishTimeOrder[], endTime: string, event?: FinishTimeEventTimes): number {
  if (event && crossesMidnight(event.start_time, event.end_time)) {
    const at = (t: string) => eventTimeMins(event.start_time, event.end_time, t) as number
    const end = at(endTime)
    return orders.filter(o =>
      !TERMINAL_STATUSES.includes(o.status) && !!o.slot && at(o.slot.slice(0, 5)) > end
    ).length
  }
  return orders.filter(o =>
    !TERMINAL_STATUSES.includes(o.status) && !!o.slot && o.slot.slice(0, 5) > endTime
  ).length
}

export function EventFinishTimeModal({
  event,
  orders,
  busy = false,
  time,
  onClose,
  onConfirm,
}: {
  /** The event being changed. `end_time` may be null; the modal says so rather than guessing. `start_time` places an
   *  overnight event's times on the right day (lib/event-window.ts). */
  event: { id: string; end_time: string | null; event_date: string | null; start_time?: string | null }
  /** This event's orders. Terminal ones are excluded HERE, so callers pass their list unfiltered. */
  orders: FinishTimeOrder[]
  /** True while the caller's write is in flight. Disables both buttons. */
  busy?: boolean
  /** The truck's time settings: the zone the options are read in, and the style every time is WRITTEN in (GB "18:30"
   *  exactly as before, US "6:30 PM"). The option VALUES stay "HH:MM". */
  time: TimeSettings | null | undefined
  /** The NON-COMMITTING arm. Wired to Cancel, to the backdrop, and to Android back by both callers. */
  onClose: () => void
  /** Fired ONLY from the confirm step. The caller performs the write and then closes. */
  onConfirm: (newEnd: string) => void
}) {
  const t = useT('kitchenModals')
  const current = (event.end_time || '').slice(0, 5)
  const [selected, setSelected] = useState(current)
  const [step, setStep] = useState<'pick' | 'confirm'>('pick')

  const ts = timeSettingsOr(time, 'finish time')
  /** A time for the screen, in the truck's style (GB: the string itself). */
  const fmt = (t: string) => String(formatSlot(t, ts))
  // 🔴 AN EVENT THAT RUNS PAST MIDNIGHT reads its times on the event's timeline (lib/event-window.ts).
  const times = { start_time: event.start_time, end_time: event.end_time }
  /** A finish time on the NEXT day (earlier than the start) — the current one, or one being chosen. */
  const nextDay = (x: string) => !!x && isNextDayFinish(event.start_time, x)
  /** A time for the screen, marked "(next day)" when it falls there. */
  const label = (x: string) => (nextDay(x) ? t('finish.optionNextDay', { time: fmt(x) }) : fmt(x))
  // 🔴 ON THE EVENT'S TIMELINE when the current OR the chosen finish runs past midnight (lib/event-window.ts); a same-day
  // choice on a normal event is compared exactly as before.
  const overnight = nextDay(current) || nextDay(selected)
  const options = finishTimeOptions(event.event_date, ts.timeZone, times)
  const affected = ordersDueAfter(orders, selected, { start_time: event.start_time, end_time: nextDay(selected) ? selected : event.end_time })
  /** "Is the chosen finish earlier than the current one?" — on the event's timeline when either runs past midnight. */
  const at = (x: string) => eventTimeMins(event.start_time, x, x) ?? -1
  const earlier = !!current && (overnight ? at(selected) < at(current) : selected < current)

  // ── STEP 2: THE CONFIRM. THIS IS THE ONLY THING THAT WRITES. ────────────────────────────────────
  // 🔴 A CONFIRMATION, NOT AN UNDO. An undo toast expires, and the KDS runs UNATTENDED: a tap nobody
  // was standing in front of would be undoable only by someone who saw the toast in the seconds it was
  // up. §38's rule points the same way — back may dismiss a decision, never make one.
  // 🔴 THE AFFECTED-ORDER COUNT IS ON THIS SCREEN because shortening an event does NOT touch the orders
  // already taken for the times being removed — the update handler writes end_time and updated_at and
  // nothing else. Those orders stay live, stay on the board and are still owed. This count is what stops
  // that being SILENT; it does not change what the write does.
  // ⚠️ THE SAFE BUTTON NAMES THE TIME IT KEEPS. "Cancel" beside an event control is the word this
  // codebase has been burned by before (the event-cancel window.confirm).
  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 className="font-black text-slate-900 text-base mb-1">{t('finish.confirmTitle')}</h3>
          <p className="text-sm text-slate-600">
            {t.rich('finish.willFinish', { selected: label(selected), current: label(current), hasCurrent: current ? 'yes' : 'no', b: c => <span className="font-bold text-slate-900">{c}</span> })}
          </p>
          {affected > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-3">
              {t.rich('finish.dueAfter', { n: affected, count: String(affected), selected: label(selected), b: c => <span className="font-bold">{c}</span> })}
            </p>
          )}
          <div className="flex gap-2 mt-5">
            <button disabled={busy} onClick={() => onConfirm(selected)}
              className="flex-1 bg-teal-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-teal-700 disabled:bg-slate-300">
              {busy ? t('finish.saving') : t('finish.confirm')}
            </button>
            <button disabled={busy} onClick={onClose}
              className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">
              {current ? t('finish.keepCurrent', { current: label(current) }) : t('finish.keepAsIs')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 1: THE PICKER. WRITES NOTHING. ────────────────────────────────────────────────────────
  // 🔴 EARLIER TIMES ARE OFFERED, AND THAT IS DELIBERATE. A truck that has run out of dough at 19:20
  // needs to stop taking orders for 20:45, and the control this replaced moved the finish in one
  // direction only. The list spans both sides of the current finish.
  // ⚠️ THE CURRENT TIME IS STATED TWICE — in the sentence and as the select's starting value — so the
  // change is visible before it is made, which is the thing "+30 min" could not do.
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-slate-900 text-base mb-1">{t('finish.title')}</h3>
        <p className="text-sm text-slate-600">
          {current
            ? t.rich('finish.currentlySet', { current: label(current), b: c => <span className="font-bold text-slate-900">{c}</span> })
            : t('finish.noFinishTime')}
        </p>
        {options.length === 0 ? (
          <p className="text-sm text-slate-500 mt-4">{t('finish.noTimesLeft')}</p>
        ) : (
          <>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mt-4 mb-1">{t('finish.newFinishTime')}</label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              {/* The current value is kept as an option even once it is in the past, so the select is
                  never showing a blank while the operator decides. It cannot be SUBMITTED — the
                  button below is disabled while selected === current. */}
              {!options.includes(selected) && (
                <option value={selected}>{t('finish.optionCurrent', { time: selected ? label(selected) : '--:--' })}</option>
              )}
              {options.map(opt => (
                <option key={opt} value={opt}>{opt === current ? t('finish.optionCurrent', { time: label(opt) }) : label(opt)}</option>
              ))}
            </select>
            {earlier && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                {t('finish.earlier')}
              </p>
            )}
          </>
        )}
        <div className="flex gap-2 mt-5">
          <button
            disabled={options.length === 0 || selected === current}
            onClick={() => setStep('confirm')}
            className="flex-1 bg-teal-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400">
            {t('finish.review')}
          </button>
          <button onClick={onClose} className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}
