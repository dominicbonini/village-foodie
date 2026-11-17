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
import { formatTime, formatYmdShortMonth, getLocalDateInTz, addDaysYmd, timeSettingsOr, type TimeSettings } from '@/lib/time-utils'
import { buildEventListGroups, type ListEvent, type ListDuplicate } from '@/lib/event-default'   // events-overlap-5
import { fmtVenue, eventDateLabel, eventStatusDisplay, EVENT_STATUS_TEXT_ON_LIGHT } from '@/lib/event-display'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/kitchenModals'

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
  /** The truck's time settings (truck.time) — "today", and how the dates and times read. */
  time: TimeSettings | null | undefined
  /** events-overlap-5 (all optional; the KDS passes none and renders exactly as before):
   *  `groupByDate` — the dashboard's list: an amber summary when anything needs approval, date headings, each date's
   *                  events by start time with the time range as the main line, and every unconfirmed event that overlaps
   *                  an approved one attached UNDER that event (lib/event-default.ts buildEventListGroups);
   *  `orderCount`  — the row's orders, as a pill: solid orange "3 orders" / "1 order", light grey "No orders". */
  groupByDate?: boolean
  orderCount?: (event: T) => number | undefined
}

/** A pill for the row's orders: solid orange when there are any, light grey "No orders" otherwise. */
function OrderPill({ n, label }: { n: number; label: string }) {
  return (
    <span data-order-count className={`inline-block text-xs rounded-full px-2 py-0.5 ${n > 0 ? 'bg-orange-600 text-white font-bold' : 'bg-slate-100 text-slate-500 font-semibold'}`}>
      {label}
    </span>
  )
}

export function EventPickerPanel<T extends PickableEvent>({
  open, isDemo, events, isSelected, onSelect, onClose, title, closeLabel, isEventBlocked, emptyState, time,
  groupByDate = false, orderCount,
}: EventPickerPanelProps<T>) {
  const t = useT('kitchenModals')
  if (!open || isDemo) return null

  /* ── the KDS's flat list (and the dashboard's before events-overlap-5): one card per event, date · time ── */
  const flatRow = (event: T) => {
    const blocked = isEventBlocked?.(event) ?? false
    const selected = isSelected(event)
    // ⚠️ `false` for `paused`: pausing is a truck-wide state the picker has no view of, and a
    // per-row "Paused" would be wrong on every row but the live one. Status words only.
    const status = eventStatusDisplay(event.status, false)
    const venue = fmtVenue(event.venue_name, event.town)
    const count = orderCount?.(event)
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
            {eventDateLabel(event.event_date, time, 'compact')} · {formatTime(event.start_time, time)}–{formatTime(event.end_time, time)}
          </p>
          {blocked && (
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">
              📴 {t('picker.reconnect')}
            </span>
          )}
          <span className={`text-[10px] font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0 ${EVENT_STATUS_TEXT_ON_LIGHT[status.tone]}`}>
            {t('picker.status', { tone: status.tone })}
          </span>
        </div>
        {venue && <p className="text-xs text-slate-500 mt-0.5">{venue}</p>}
        {count !== undefined && <div className="mt-1.5"><OrderPill n={count} label={t('picker.orders', { n: count, count: String(count) })} /></div>}
        {selected && <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">{t('picker.selected')}</span>}
      </button>
    )
  }

  /* ── events-overlap-5: the dashboard's grouped list ───────────────────────────────────────────────────────────── */
  const grouped = () => {
    const days = buildEventListGroups(events as unknown as (T & ListEvent)[], countsOf(events, orderCount))
    const pendingN = events.filter(e => e.status === 'unconfirmed').length
    const s = timeSettingsOr(time, 'event picker')
    const today = getLocalDateInTz(s.timeZone)
    const tomorrow = addDaysYmd(today, 1)
    const heading = (d: string) => {
      const full = formatYmdShortMonth(d, s, { weekday: 'short', day: 'numeric', month: 'short' })
      return d === today || d === tomorrow ? `${eventDateLabel(d, time, 'compact')} · ${full}` : full
    }
    const timeRange = (e: T) => `${formatTime(e.start_time, time)}–${formatTime(e.end_time, time)}`
    const needsBadge = <span className="text-[10px] font-bold text-white bg-amber-500 rounded px-1.5 py-0.5 flex-shrink-0" data-needs-approval-badge>{t('picker.needsApproval')}</span>
    const offlineChip = (blocked: boolean) => blocked && (
      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">📴 {t('picker.reconnect')}</span>
    )
    /** One event's card body: time range (main line) + status or "Needs approval" + venue + order pill. */
    const body = (e: T, opts: { unapproved: boolean; pillAlways: boolean }) => {
      const count = orderCount?.(e)
      const status = eventStatusDisplay(e.status, false)
      const venue = fmtVenue(e.venue_name, e.town)
      const blocked = isEventBlocked?.(e) ?? false
      /* events-overlap-8: an APPROVED card (confirmed, open or closed) carries a green "✓ Approved" badge to the left of its
       * status badge; an unapproved one keeps the amber "Needs approval" badge alone. The badges are ONE group that never
       * shrinks or breaks: the time keeps its size, and when the row is too narrow the whole group wraps onto its own line
       * under the time (flex-wrap; the time takes the remaining width). */
      return (<>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-card-top>
          <p className="text-sm font-bold text-slate-900 flex-1 whitespace-nowrap" data-card-time>{timeRange(e)}</p>
          <div className="flex items-center gap-1 flex-shrink-0 whitespace-nowrap" data-card-badges>
            {offlineChip(blocked)}
            {opts.unapproved ? needsBadge : (<>
              <span className="text-[10px] font-bold bg-green-50 text-green-800 border border-green-300 rounded px-1.5 py-0.5" data-approved-badge>
                <span aria-hidden>✓ </span>{t('picker.approved')}
              </span>
              <span className={`text-[10px] font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 ${EVENT_STATUS_TEXT_ON_LIGHT[status.tone]}`}>
                {t('picker.status', { tone: status.tone })}
              </span>
            </>)}
          </div>
        </div>
        {venue && <p className="text-xs text-slate-500 mt-0.5">{venue}</p>}
        {count !== undefined && (opts.pillAlways || count > 0) && <div className="mt-1.5"><OrderPill n={count} label={t('picker.orders', { n: count, count: String(count) })} /></div>}
      </>)
    }
    /* events-overlap-6: EVERY EVENT IS ITS OWN CARD (own border, rounded corners, 8px apart). A likely duplicate is a separate
     * card indented 22px, amber, joined to the approved card above it by a 2px amber connector that drops from the approved
     * card and curves into the duplicate's left side. The selected card alone has a 2px orange border and "SELECTED". */
    const tap = (x: T) => { if (isEventBlocked?.(x)) return; onSelect(x) }
    const card = (e: T) => {
      const blocked = isEventBlocked?.(e) ?? false
      const selected = isSelected(e)
      const unapproved = e.status === 'unconfirmed'
      return (
        <button key={e.id} disabled={blocked} onClick={() => tap(e)} data-event-row={e.id}
          className={`w-full text-left px-3 py-3 rounded-xl transition-colors ${
            selected ? 'border-2 border-orange-400 bg-orange-50' : 'border border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'
          }${unapproved ? ' border-l-4 border-l-amber-400' : ''}${blocked ? ' bg-slate-50 opacity-60 cursor-not-allowed' : ''}`}>
          {body(e, { unapproved, pillAlways: true })}
          {selected && <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">{t('picker.selected')}</span>}
        </button>
      )
    }
    const duplicateCard = (d: ListDuplicate<T>, last: boolean) => {
      const blocked = isEventBlocked?.(d.event) ?? false
      const selected = isSelected(d.event)
      return (
        <div key={d.event.id} className="relative ml-[22px]" data-duplicate-row={d.event.id}>
          {/* the connector: down from the card above (across the 8px gap), curving into this card's left side */}
          <span aria-hidden className="pointer-events-none absolute -left-[12px] -top-[8px] h-[calc(50%+8px)] w-[12px] rounded-bl-lg border-b-2 border-l-2 border-amber-400" />
          {/* …and on to the next duplicate under the same approved event */}
          {!last && <span aria-hidden className="pointer-events-none absolute -left-[12px] top-1/2 -bottom-[8px] border-l-2 border-amber-400" />}
          <button disabled={blocked} onClick={() => tap(d.event)}
            className={`w-full text-left px-3 py-2.5 rounded-xl bg-amber-50 transition-colors ${selected ? 'border-2 border-orange-400' : 'border border-amber-300 hover:bg-amber-100/70'}${blocked ? ' opacity-60 cursor-not-allowed' : ''}`}>
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide mb-0.5"><span aria-hidden>↑ </span>{t(d.sameTime ? 'picker.duplicateSameTime' : 'picker.duplicateOverlaps')}</p>
            {body(d.event, { unapproved: true, pillAlways: false })}
            {selected && <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">{t('picker.selected')}</span>}
          </button>
        </div>
      )
    }
    return (<>
      {pendingN > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2" data-approval-summary>
          <p className="text-sm font-bold text-amber-900"><span aria-hidden>⚠ </span>{t('picker.approvalSummary', { n: pendingN, count: String(pendingN) })}</p>
          <p className="text-xs text-amber-800">{t('picker.approvalSummaryNote', { n: pendingN })}</p>
        </div>
      )}
      {days.map(day => {
        // the day's events, duplicates included
        const n = day.items.reduce((sum, it) => sum + 1 + it.duplicates.length, 0)
        return (
          <div key={day.date} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 mt-2" data-date-heading>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{heading(day.date)}</p>
              <p className="text-xs text-slate-400 flex-shrink-0" data-day-count>{t('picker.dayCount', { n, count: String(n) })}</p>
            </div>
            {day.items.flatMap(it => [card(it.event), ...it.duplicates.map((d, i) => duplicateCard(d, i === it.duplicates.length - 1))])}
          </div>
        )
      })}
    </>)
  }

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
            aria-label={t('close')}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto px-5">
          {events.length === 0 ? emptyState : groupByDate ? grouped() : events.map(flatRow)}
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

/** The order counts as a map, for the grouping's "most orders" choice. */
function countsOf<T extends PickableEvent>(events: T[], orderCount?: (e: T) => number | undefined): Record<string, number> {
  const m: Record<string, number> = {}
  if (orderCount) for (const e of events) m[e.id] = orderCount(e) ?? 0
  return m
}
