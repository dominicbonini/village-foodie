// lib/outreach-attention.ts — which replies are waiting for Dominic, and when a snooze comes back.
//
// 🔴 ONE PREDICATE, AND EVERYTHING ASKS IT. The Today screen, the timeline's "Waiting for you" badge
// and the tab's count are three renderings of one question. Written three times they would disagree
// the first time a rule moved — and the disagreement would read as "the page is wrong about my work",
// which is the one thing a work queue may never be.
//
// ⚠️ PURE. No Supabase, no Date.now() inside the predicate: the caller passes `now`, so the harness can
// stand on either side of a snooze and of a clock change.

/** The fields the predicate reads. A row with more than this is fine; these are what decide. */
export interface AttentionRow {
  status: string | null
  is_test?: boolean | null
  direction?: string | null
  handled_at?: string | null
  snoozed_until?: string | null
}

/**
 * Does this inbound message need Dominic?
 *
 * 🔴 EVERY CLAUSE IS A REFUSAL AND EACH ONE HAS A CASE BEHIND IT:
 *   • `status === 'received'` — an auto-reply (`auto_reply`) and a delivery report (`bounce`) are
 *     inbound rows the poll deliberately does NOT log as contacts. An out-of-office is not work.
 *   • not a test — a reply to a test send is Dominic answering himself. §57 and the poll both already
 *     refuse to treat it as correspondence; Today must not be the one place that does.
 *   • `handled_at` null — done is done, whether he pressed the button or an outbound contact did it.
 *   • not snoozed into the future — "not now" is a state, and it expires on its own.
 *   • the prospect is not a linked HatchGrab truck — it is a customer, a demo or the test truck, and
 *     the whole outreach process skips it (§52). Chasing a customer through a prospecting queue is
 *     the mistake that rule exists to prevent.
 * ⚠️ `linkedTruck` IS PASSED IN, not read off the row: the link lives on `discovery_trucks`, and a
 * predicate that went looking for it would need a database.
 */
export function needsAttention(
  row: AttentionRow,
  opts: { now: Date; linkedTruck?: boolean },
): boolean {
  if (opts.linkedTruck) return false
  if (row.status !== 'received') return false
  if (row.is_test === true) return false
  if (row.direction != null && row.direction !== 'inbound') return false
  if (row.handled_at) return false
  if (row.snoozed_until && new Date(row.snoozed_until).getTime() > opts.now.getTime()) return false
  return true
}

// ── SNOOZING ────────────────────────────────────────────────────────────────────────────────────────
/** The three offers, as the buttons read them. Nothing else may be snoozed to. */
export const SNOOZE_OPTIONS = ['tomorrow', '3_days', '1_week'] as const
export type SnoozeOption = (typeof SNOOZE_OPTIONS)[number]
export const isSnoozeOption = (v: unknown): v is SnoozeOption =>
  typeof v === 'string' && (SNOOZE_OPTIONS as readonly string[]).includes(v)

export const SNOOZE_LABELS: Record<SnoozeOption, string> = {
  tomorrow: 'Tomorrow 8am',
  '3_days': 'In 3 days',
  '1_week': 'In a week',
}

const DAYS_FOR: Record<SnoozeOption, number> = { tomorrow: 1, '3_days': 3, '1_week': 7 }

/** The hour a snooze comes back at. 🔴 ALL THREE LAND AT THE SAME TIME OF DAY, so "in 3 days" means a
 *  morning and not "whenever I happened to press it, 72 hours ago". */
export const SNOOZE_HOUR = '08:00'
export const OUTREACH_TIMEZONE = 'Europe/London'

/**
 * The instant a snooze expires: 08:00 in LONDON on the chosen morning.
 *
 * 🔴 LONDON, NOT UTC, AND THE DIFFERENCE IS HALF THE YEAR. During BST, 08:00 London is 07:00Z; a
 * snooze computed in UTC would return an hour late all summer and be right all winter, which is the
 * hardest kind of wrong to notice. ⚠️ The offset is resolved AT THE TARGET INSTANT, not today's, so a
 * week's snooze taken the week of a clock change still comes back at eight in the morning.
 */
export function snoozeUntil(option: SnoozeOption, now: Date): Date {
  const ymd = addDaysInTz(now, DAYS_FOR[option], OUTREACH_TIMEZONE)
  return wallClockToUtc(ymd, SNOOZE_HOUR, OUTREACH_TIMEZONE)
}

/** 'YYYY-MM-DD', n days after `now` as the calendar in `tz` counts days. */
export function addDaysInTz(now: Date, days: number, tz: string): string {
  const today = ymdInTz(now, tz)
  const [y, m, d] = today.split('-').map(Number)
  // Midday UTC as the anchor: far enough from either midnight that adding whole days cannot slip a
  // date across a DST boundary before the calendar arithmetic is done.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  anchor.setUTCDate(anchor.getUTCDate() + days)
  return anchor.toISOString().slice(0, 10)
}

export function ymdInTz(at: Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

/**
 * A wall clock in `tz` → the UTC instant it names.
 * ⚠️ TWO PASSES, DELIBERATELY. The offset depends on the instant, and the instant is what is being
 * solved for; one pass is wrong by an hour on the two days a year the clocks move, and the second
 * pass lands on the answer.
 */
export function wallClockToUtc(ymd: string, hhmm: string, tz: string): Date {
  const asIfUtc = Date.parse(`${ymd}T${hhmm}:00Z`)
  let guess = new Date(asIfUtc)
  for (let i = 0; i < 2; i++) guess = new Date(asIfUtc - offsetOf(guess, tz))
  return guess
}

/** How far ahead of UTC `tz` is at that instant, in milliseconds. */
function offsetOf(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? '0')
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
  return asUtc - at.getTime()
}

// ── WHAT THE ROW SAYS ───────────────────────────────────────────────────────────────────────────────
/**
 * The first ~140 characters of a reply, on one line, for the Today list.
 * ⚠️ IT NEVER RETURNS AN EMPTY STRING for a row that has text — a blank line in a work queue reads as
 * "they sent nothing", which is a different fact from "the text has not been read yet".
 */
export const REPLY_SNIPPET_CHARS = 140
export function replySnippet(text: string | null | undefined, chars = REPLY_SNIPPET_CHARS): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!flat) return '(no text was recorded with this reply)'
  return flat.length <= chars ? flat : `${flat.slice(0, chars).trimEnd()}…`
}

// ── WHAT "AFTER" MEANS WHEN THE CONTACT ONLY HAS A DATE ─────────────────────────────────────────────
/**
 * The instant an outbound contact counts as having happened, for the "earlier replies are handled"
 * sweep.
 *
 * 🔴 A LOGGED CALL CARRIES A DATE, NOT A TIME, AND THE NAIVE COMPARISON IS WRONG IN BOTH DIRECTIONS.
 * The Log-a-contact form stores `contacted_at` as 'YYYY-MM-DD' — the operator picks a day. Compared
 * as an instant that is MIDNIGHT, so logging a call today would leave a reply that arrived at 20:57
 * this evening still sitting in Today, and Dominic would mark it done by hand wondering why the call
 * did not count. Extending it to the END of the day instead would be wrong the other way for a
 * BACK-DATED contact: "I rang them on the 25th" would silently mark every reply up to the 26th as
 * answered.
 *
 * 🔴 SO: A DATE-ONLY CONTACT COUNTS AS THE EARLIER OF (the end of that day) AND (now).
 *   • logged today   ⇒ `now` — everything that arrived earlier today is before it, nothing later is.
 *   • back-dated     ⇒ the end of that day — replies on later days are untouched, as they must be.
 * ⚠️ A FULL TIMESTAMP IS USED AS IT STANDS. The poll and the send path both write real instants, and
 * those are exact — this rule exists only for the value a person types.
 */
export function handledBoundary(contactedAt: string | null | undefined, now: Date): string {
  const raw = String(contactedAt ?? '').trim()
  if (!raw) return now.toISOString()
  // A date with no time: exactly 'YYYY-MM-DD'.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw).toISOString()
  const endOfDay = wallClockToUtc(raw, '23:59', OUTREACH_TIMEZONE).getTime() + 59_999
  return new Date(Math.min(endOfDay, now.getTime())).toISOString()
}
