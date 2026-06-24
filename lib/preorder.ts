// lib/preorder.ts — PRE-ORDER deadline evaluation (V7.8, pre-orders Stage 2).
//
// THE DRY LINCHPIN: a PURE function (no I/O, no side effects) called by BOTH the menu-API sold-out
// read (Stage 3) AND the submit force-pending check (Stage 4), so display and enforcement can NEVER
// diverge. All time reasoning is minutes-of-day + a 'YYYY-MM-DD' date string, EXACTLY like the slot
// engine (slot-availability.ts:123,139-152 / slots/route.ts:198-200) — the caller supplies the
// event-tz "now" via getNowMinsInTz/getLocalDateInTz; this file NEVER reads the clock or constructs a
// Date from a local wall-clock string + compares across timezones (the §V7.4 device-local trap that
// getBundleAvailabilityMessage falls into — deliberately NOT copied here).

/** Per-item pre-order config — maps to the menu_items_db columns:
 *  preorder_enabled / preorder_deadline_type / preorder_deadline_value / preorder_past_action. */
export interface PreorderConfig {
  enabled: boolean | null
  deadlineType: 'hours_before' | 'daily_cutoff' | null
  /** hours_before → whole hours before event start; daily_cutoff → cutoff minutes-of-day on the event's date. */
  deadlineValue: number | null
  pastAction: 'sold_out' | 'force_pending' | null
}

export interface PreorderVerdict {
  /** True only when the item is a configured pre-order item (enabled + type + value all set). */
  isPreorder: boolean
  /** True when the pre-order deadline has passed (only meaningful when isPreorder). */
  passed: boolean
  /** What to do past the deadline — null when not a pre-order item. */
  pastAction: 'sold_out' | 'force_pending' | null
}

/**
 * Add `days` (may be negative) to a 'YYYY-MM-DD' date string and return a 'YYYY-MM-DD' string.
 * Uses UTC noon as the anchor so DST never shifts the calendar date (we only ever read Y/M/D back).
 * This is pure date-string arithmetic — NO local-wall-clock parsing, NO tz comparison. Both the
 * input and output are tz-agnostic calendar dates (the same basis getLocalDateInTz produces).
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  // UTC noon anchor: adding/subtracting whole days can never cross a date boundary via DST.
  const t = Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0) + days * 86400000
  const dt = new Date(t)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** The absolute deadline as an event-tz wall-clock instant: minutes-of-day + the calendar date it
 *  falls on ('YYYY-MM-DD'). `date` may be EARLIER than eventDate for a multi-midnight hours_before. */
export interface PreorderDeadlineClock {
  mins: number
  date: string
}

/**
 * Resolve the absolute pre-order cutoff for a config + event. THE ONE SOURCE of the cross-day math —
 * isPreorderDeadlinePassed (the passed/not verdict) and the customer-label formatter both read this,
 * so the deadline clock can never diverge between display and enforcement. Pure; event-tz inputs.
 *
 * @param cfg            pre-order config (enabled + type + value; pastAction is ignored here).
 * @param eventDate      the RESOLVED event's local date 'YYYY-MM-DD' (getLocalDateInTz form).
 * @param eventStartMins the event's start time as minutes-of-day in event-tz.
 *
 * Returns null when the config isn't a usable pre-order rule (disabled, or type/value unset).
 */
export function preorderDeadlineClock(
  cfg: PreorderConfig,
  eventDate: string,
  eventStartMins: number,
): PreorderDeadlineClock | null {
  // Unconfigured ⇒ no clock. (enabled must be true; type + value must be set.)
  if (!cfg.enabled || cfg.deadlineType == null || cfg.deadlineValue == null) return null

  if (cfg.deadlineType === 'hours_before') {
    // Deadline = event start − N hours. May cross one OR MORE midnights for large N.
    const deadlineTotalMins = eventStartMins - cfg.deadlineValue * 60
    // How many whole days earlier (0 when the deadline is still on eventDate). Math.ceil handles the
    // general multi-midnight case: e.g. −1 → 1 day back, −1441 → 2 days back, exact-midnight stays put.
    const dayOffset = deadlineTotalMins >= 0 ? 0 : Math.ceil(-deadlineTotalMins / 1440)
    // Normalise the minutes into [0,1440) (JS % can be negative, so the +1440 fold).
    const mins = ((deadlineTotalMins % 1440) + 1440) % 1440
    const date = dayOffset === 0 ? eventDate : addDaysToDateStr(eventDate, -dayOffset)
    return { mins, date }
  }
  // 'daily_cutoff': cutoff minutes-of-day on the EVENT'S OWN date (event-scoped — that's why we
  // take eventDate, not a calendar-day cutoff independent of events).
  return { mins: cfg.deadlineValue, date: eventDate }
}

/**
 * Has this item's pre-order deadline passed? Pure; event-tz inputs supplied by the caller.
 *
 * @param cfg            per-item pre-order config (the 4 columns).
 * @param eventDate      the RESOLVED event's local date 'YYYY-MM-DD' (getLocalDateInTz form).
 * @param eventStartMins the event's start time as minutes-of-day in event-tz.
 * @param nowDate        today's local date in event-tz (getLocalDateInTz).
 * @param nowMins        now as minutes-of-day in event-tz (getNowMinsInTz).
 *
 * NOT a pre-order item (unconfigured) ⇒ { isPreorder:false, passed:false, pastAction:null } (inert).
 */
export function isPreorderDeadlinePassed(
  cfg: PreorderConfig,
  eventDate: string,
  eventStartMins: number,
  nowDate: string,
  nowMins: number,
): PreorderVerdict {
  // Single source of the cross-day cutoff math (DRY): null ⇒ unconfigured ⇒ inert.
  const clock = preorderDeadlineClock(cfg, eventDate, eventStartMins)
  if (!clock) return { isPreorder: false, passed: false, pastAction: null }

  // Lexical comparison is chronological for zero-padded 'YYYY-MM-DD'. Then minute-of-day on the same day.
  const passed = nowDate > clock.date || (nowDate === clock.date && nowMins >= clock.mins)
  return { isPreorder: true, passed, pastAction: cfg.pastAction }
}

// Fixed month/weekday abbreviations — NEVER new Date().toLocale… (device-local trap, §V7.4). The
// label is computed server-side in event-tz; only the calendar Y/M/D is read back here.
const PREORDER_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PREORDER_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] // getUTCDay() index: 0=Sun

/**
 * Customer-facing pre-order label — PURE formatting, NO device-local time. The caller supplies the
 * deadline clock (mins/date from preorderDeadlineClock) so this never touches the clock or a tz.
 *
 * @param state     'before' (deadline not yet passed) | 'closed_pending' (passed, force-pending).
 * @param mins      deadline minutes-of-day (event-tz) — used by 'before' only.
 * @param date      deadline calendar date 'YYYY-MM-DD' — used by 'before' only.
 * @param eventDate the event's date 'YYYY-MM-DD'; when date ≠ eventDate the label appends ", Ddd D Mon".
 *
 * 'before'         → "Pre-order by HH:MM" (+ ", Ddd D Mon" when the cutoff is on an earlier day).
 * 'closed_pending' → "Pre-orders closed. Kitchen to approve." (mins/date/eventDate ignored).
 * (sold_out-after-cutoff never reaches here — that item is hidden, available:false.)
 */
export function formatPreorderLabel(
  state: 'before' | 'closed_pending',
  mins: number,
  date: string,
  eventDate: string,
): string {
  if (state === 'closed_pending') return 'Pre-orders closed. Kitchen to approve.'
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const mm = String(mins % 60).padStart(2, '0')
  let label = `Pre-order by ${hh}:${mm}`
  if (date !== eventDate) {
    const [y, m, d] = date.split('-').map(Number)
    // UTC-noon anchor (same basis as addDaysToDateStr) so getUTCDay is tz/DST-independent — NOT a
    // device-local getDay() on a wall-clock-parsed string (§V7.4 trap).
    const wd = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).getUTCDay()
    label += `, ${PREORDER_WEEKDAYS[wd]} ${d} ${PREORDER_MONTHS[(m || 1) - 1]}`
  }
  return label
}

/** OPTIONAL — a short human description of the deadline, for the operator modal (Stage 5). */
export function describePreorderDeadline(cfg: PreorderConfig): string {
  if (!cfg.enabled || cfg.deadlineType == null || cfg.deadlineValue == null) return 'No pre-order deadline'
  if (cfg.deadlineType === 'hours_before') {
    const h = cfg.deadlineValue
    return `Order by ${h} hour${h === 1 ? '' : 's'} before the event`
  }
  const mins = cfg.deadlineValue
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const mm = String(mins % 60).padStart(2, '0')
  return `Order by ${hh}:${mm} on the event day`
}
