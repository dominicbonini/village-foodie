'use client'
// components/shared/EventPickerPanel.tsx
//
// ── 🔴 ONE EVENT PICKER, TWO CALLERS. A CHANGE HERE LANDS IN BOTH — THAT IS THE POINT. ──────────────
//
// It replaced two hand-rolled modals that had drifted apart: three date formatters, two venue
// formatters, two status vocabularies, two sets of row padding, and an offline gate that existed on
// only one of them. Full diagnosis: docs/last-report.md.
//
// 🔴 NO FORMATTER IS WRITTEN IN THIS FILE. Date is `eventDateLabel(date, 'compact')`, venue is
// `fmtVenue`, times are `formatTime`, and the status WORDS are `eventStatusDisplay` with the colour
// coming from `EVENT_STATUS_TEXT_ON_LIGHT` — this card is white, which is the surface that table is
// for. Adding an inline `toLocaleDateString` here is how the drift started; do not.
//
// ── WHAT IS HARDCODED, AND WHY IT MUST STAY THAT WAY ────────────────────────────────────────────────
// Row layout, padding, hover, badges, the offline gate and the demo hide are IDENTICAL in both callers
// by decision. If one surface needs a different one of these, that is a product decision to take
// deliberately — not a prop to add quietly, which is how two pickers became two pickers.
//
// ── WHAT IS A PROP, AND WHY ─────────────────────────────────────────────────────────────────────────
// `onSelect` and `isSelected` only. The two callers do genuinely different jobs: the KDS switches which
// event the kitchen screen shows (and confirms first, because switching discards on-screen orders);
// AddOrderPanel picks the event an order is being built against (and resets the basket, refetches
// slots). Neither belongs in here.
//
// ── 🔴 THE LAYOUT IS LOAD-BEARING. DO NOT SIMPLIFY IT. ──────────────────────────────────────────────
// Carried from the KDS fix of 1 September 2026 (docs/kds-picker-fix-report.md), where 17 events grew
// the card past the viewport inside a `fixed inset-0` overlay that cannot scroll:
//   • `max-h-[85dvh]` — `dvh` NOT `vh`. `vh` resolves against the LARGEST viewport and ignores a
//     webview's dynamic toolbars, and this renders inside the iOS and Android shells.
//   • `flex flex-col` on the card, so the list can flex.
//   • `flex-1 min-h-0 overflow-y-auto` on the LIST. `min-h-0` is load-bearing: a flex child defaults to
//     `min-height:auto` and refuses to shrink below its content, so without it `overflow-y-auto` never
//     engages and the card grows exactly as it did before the fix — silently.
//   • Header and footer are `shrink-0` siblings OUTSIDE the scroll region, so the title and the close
//     control stay reachable at every scroll position.
//   • The card stops click propagation so a tap on a row's padding cannot dismiss the modal; the
//     backdrop's own dismiss is unchanged.
import { formatTime } from '@/lib/time-utils'
import { fmtVenue, eventDateLabel, eventStatusDisplay, EVENT_STATUS_TEXT_ON_LIGHT } from '@/lib/event-display'

/** The shape both callers already hold. Deliberately minimal — anything richer is the caller's. */
export interface PickableEvent {
  id: string
  event_date: string
  start_time: string
  end_time: string
  // ⚠️ `| undefined` IS DELIBERATE, NOT SLOPPY. The two callers type these differently — the KDS's
  // `TruckEvent` has `string | null`, AddOrderPanel's `EventRecord` has them optional — and this
  // constraint must accept BOTH without either caller casting. Every one is display-only here, and
  // `fmtVenue` and `eventStatusDisplay` both already take `null | undefined`.
  venue_name?: string | null
  town?: string | null
  status?: string | null
}

/**
 * ⚠️ GENERIC OVER THE EVENT TYPE, AND THAT IS NOT DECORATION. Each caller holds a RICHER event than
 * `PickableEvent`: the KDS has a full `TruckEvent` (its `switchEvent` needs `truck_id`, `postcode`,
 * `opened_at` and nine more fields), AddOrderPanel has an `EventRecord`. Typing the callbacks as
 * `PickableEvent` would hand each caller back a narrowed object and force a cast at the one place a
 * cast is most dangerous — the handler that changes what a kitchen screen is showing. `T` means each
 * caller gets back exactly what it passed in, checked.
 */
export interface EventPickerPanelProps<T extends PickableEvent> {
  open: boolean
  /** 🔴 HIDES THE PICKER ENTIRELY. KDS behaviour, applied to both callers by decision. */
  isDemo?: boolean
  events: T[]
  /** The caller decides what "selected" means: the KDS compares its active event, AddOrderPanel its manual one. */
  isSelected: (event: T) => boolean
  /** The caller's own job — a confirm-and-switch, or a basket reset. Never performed here. */
  onSelect: (event: T) => void
  onClose: () => void
  title: string
  closeLabel: string
  /** Offline gate, from AddOrderPanel and now applied in both. A row with no cached data cannot be chosen. */
  isEventBlocked?: (event: T) => boolean
  /** Rendered in place of the list when there are no events — skeletons, an empty line, whatever the caller wants. */
  emptyState?: React.ReactNode
}

export function EventPickerPanel<T extends PickableEvent>({
  open, isDemo, events, isSelected, onSelect, onClose, title, closeLabel, isEventBlocked, emptyState,
}: EventPickerPanelProps<T>) {
  if (!open || isDemo) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[85dvh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto px-5">
          {events.length === 0
            ? emptyState
            : events.map(event => {
                const blocked = isEventBlocked?.(event) ?? false
                const selected = isSelected(event)
                // ⚠️ `false` for `paused`: pausing is a truck-wide state the picker has no view of, and a
                // per-row "Paused" would be wrong on every row but the live one. Status words only.
                const status = eventStatusDisplay(event.status, false)
                const venue = fmtVenue(event.venue_name, event.town)
                return (
                  <button
                    key={event.id}
                    disabled={blocked}
                    onClick={() => { if (blocked) return; onSelect(event) }}
                    className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${
                      blocked
                        ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                        : selected
                          ? 'border-orange-400 bg-orange-50'
                          : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 flex-1">
                        {eventDateLabel(event.event_date, 'compact')} · {formatTime(event.start_time)}–{formatTime(event.end_time)}
                      </p>
                      {blocked && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">
                          📴 Reconnect to load
                        </span>
                      )}
                      <span className={`text-[10px] font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0 ${EVENT_STATUS_TEXT_ON_LIGHT[status.tone]}`}>
                        {status.label}
                      </span>
                    </div>
                    {venue && <p className="text-xs text-slate-500 mt-0.5">{venue}</p>}
                    {selected && <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">Selected</span>}
                  </button>
                )
              })}
        </div>

        <div className="px-5 pb-5 shrink-0">
          <button
            onClick={onClose}
            className="mt-3 w-full text-sm text-slate-400 hover:text-slate-600 py-2"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
