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

/** Statuses that are over, so an order in one of them cannot be "due after" anything.
 *  ⚠️ THE SAME LIST THE KDS BOARD USES for `activeOrders`, kept here so both surfaces count identically
 *  rather than each pre-filtering to its own idea of "live". Callers pass their per-event order list. */
const TERMINAL_STATUSES = ['collected', 'cancelled', 'rejected']

/** Only what the count needs. Both surfaces' order rows satisfy this structurally. */
export type FinishTimeOrder = { slot: string | null; status: string }

/** Every 15-min boundary on the event's date that is STILL AHEAD OF THE CLOCK.
 *  🔴 "FUTURE" MEANS FUTURE RELATIVE TO NOW, NOT TO THE CURRENT FINISH TIME. That distinction is the
 *  whole point: a truck that has sold out at 19:20 must be able to set the finish to 19:30 even though
 *  the event is scheduled until 21:00 — an EARLIER time that is still ahead of the clock. Filtering
 *  against end_time instead would offer only extensions, which is the control this one replaced.
 *  ⚠️ Built against the EVENT'S DATE, not today's, so a past-dated event yields an empty list and the
 *  modal says so rather than offering times that have already gone. */
export function finishTimeOptions(eventDate: string | null | undefined): string[] {
  if (!eventDate) return []
  const now = Date.now()
  const out: string[] = []
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    if (new Date(`${eventDate}T${hh}:${mm}`).getTime() > now) out.push(`${hh}:${mm}`)
  }
  return out
}

/** Live orders this event still owes that are due AFTER a proposed finish time.
 *  ⚠️ NULL-SLOT (ASAP) ORDERS ARE DELIBERATELY EXCLUDED: they have no promised time to fall after. */
export function ordersDueAfter(orders: FinishTimeOrder[], endTime: string): number {
  return orders.filter(o =>
    !TERMINAL_STATUSES.includes(o.status) && !!o.slot && o.slot.slice(0, 5) > endTime
  ).length
}

export function EventFinishTimeModal({
  event,
  orders,
  busy = false,
  onClose,
  onConfirm,
}: {
  /** The event being changed. `end_time` may be null; the modal says so rather than guessing. */
  event: { id: string; end_time: string | null; event_date: string | null }
  /** This event's orders. Terminal ones are excluded HERE, so callers pass their list unfiltered. */
  orders: FinishTimeOrder[]
  /** True while the caller's write is in flight. Disables both buttons. */
  busy?: boolean
  /** The NON-COMMITTING arm. Wired to Cancel, to the backdrop, and to Android back by both callers. */
  onClose: () => void
  /** Fired ONLY from the confirm step. The caller performs the write and then closes. */
  onConfirm: (newEnd: string) => void
}) {
  const current = (event.end_time || '').slice(0, 5)
  const [selected, setSelected] = useState(current)
  const [step, setStep] = useState<'pick' | 'confirm'>('pick')

  const options = finishTimeOptions(event.event_date)
  const affected = ordersDueAfter(orders, selected)

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
          <h3 className="font-black text-slate-900 text-base mb-1">Change finish time?</h3>
          <p className="text-sm text-slate-600">
            This event will finish at <span className="font-bold text-slate-900">{selected}</span>
            {current ? <> instead of <span className="font-bold text-slate-900">{current}</span></> : null}.
          </p>
          {affected > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-3">
              <span className="font-bold">{affected} order{affected === 1 ? ' is' : 's are'} due after {selected}.</span>{' '}
              {affected === 1 ? 'It stays' : 'They stay'} on the board and still {affected === 1 ? 'needs' : 'need'} making. Changing the finish time only stops NEW orders being placed for later times.
            </p>
          )}
          <div className="flex gap-2 mt-5">
            <button disabled={busy} onClick={() => onConfirm(selected)}
              className="flex-1 bg-teal-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-teal-700 disabled:bg-slate-300">
              {busy ? 'Saving...' : 'Change finish time'}
            </button>
            <button disabled={busy} onClick={onClose}
              className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">
              {current ? `Keep ${current}` : 'Keep as is'}
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
        <h3 className="font-black text-slate-900 text-base mb-1">Change finish time</h3>
        <p className="text-sm text-slate-600">
          {current
            ? <>This event is currently set to finish at <span className="font-bold text-slate-900">{current}</span>.</>
            : 'This event has no finish time set.'}
        </p>
        {options.length === 0 ? (
          <p className="text-sm text-slate-500 mt-4">There are no times left today. Use Finish event instead.</p>
        ) : (
          <>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mt-4 mb-1">New finish time</label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              {/* The current value is kept as an option even once it is in the past, so the select is
                  never showing a blank while the operator decides. It cannot be SUBMITTED — the
                  button below is disabled while selected === current. */}
              {!options.includes(selected) && (
                <option value={selected}>{selected || '--:--'} (current)</option>
              )}
              {options.map(t => (
                <option key={t} value={t}>{t}{t === current ? ' (current)' : ''}</option>
              ))}
            </select>
            {current && selected < current && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                That is earlier than the current finish time. Customers will not be able to order for times after it.
              </p>
            )}
          </>
        )}
        <div className="flex gap-2 mt-5">
          <button
            disabled={options.length === 0 || selected === current}
            onClick={() => setStep('confirm')}
            className="flex-1 bg-teal-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400">
            Review change
          </button>
          <button onClick={onClose} className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">Cancel</button>
        </div>
      </div>
    </div>
  )
}
