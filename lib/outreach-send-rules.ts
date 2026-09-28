// lib/outreach-send-rules.ts — the refusals and the cap window, as PURE functions.
//
// 🔴 WHY THESE ARE NOT INLINE IN THE ROUTE. Every rule here is a reason NOT to send an email, and a rule
// that cannot be run without a database and a mailbox cannot be proven. §58.2 records what happens when a
// guard is re-implemented next to the thing it guards: three copies of one regex shared one blind spot and
// a malformed token shipped on an active template. So the route calls these and the harness calls these —
// one implementation, two callers, no second copy to drift.
//
// Pure: no network, no database, no clock of its own (every function that needs "now" is given it).
import { OUTREACH_DAILY_SEND_CAP, OUTREACH_TZ } from '@/lib/outreach-mail-config'
import { londonDay } from '@/lib/outreach-mail-message'

/** A refusal is a sentence for the operator, plus whatever the UI needs to offer the way forward. */
export interface SendRefusal { refusal: string; needsConfirm?: boolean }

// ── THE DAILY CAP ───────────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 `sending` COUNTS. A row stuck at `sending` is one whose SMTP conversation has not come back, which
 * means it may well be on its way to a prospect. Counting only `sent` would let a run of hung sends slip
 * an unbounded number of emails past a cap whose whole job is to bound them.
 * `failed` does not count: the server said no, so nothing reached anyone.
 */
export const CAP_COUNTED_STATUSES = ['sending', 'sent', 'uncertain'] as const

/** The zone's offset from UTC at an instant, in ms. `+3_600_000` in British Summer Time. */
function tzOffsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - at.getTime()
}

/**
 * The UTC instant at which the CURRENT Europe/London day began — the lower bound of the cap's window.
 *
 * 🔴 NOT `${day}T00:00:00Z`. For seven months of the year London is an hour ahead of UTC, so UTC midnight
 * is 01:00 in London and an hour of that day's sends sit BELOW the bound and are never counted. The cap
 * would then admit thirty-one, thirty-two emails on a British Summer Time morning — silently, and only
 * ever in the direction of sending more.
 *
 * The offset is applied, then re-read at the corrected instant: one correction settles the clock-change
 * days too, because an offset change moves the instant by an hour and never by more.
 */
export function londonDayStartUtc(now: Date, tz = OUTREACH_TZ): string {
  const day = londonDay(now, tz)
  const naive = Date.parse(`${day}T00:00:00Z`)
  let inst = naive - tzOffsetMs(new Date(naive), tz)
  inst = naive - tzOffsetMs(new Date(inst), tz)
  return new Date(inst).toISOString()
}

/**
 * Does one row count against the cap? The predicate the database query is built from: same statuses, same
 * window, same direction, and `is_test` excluded.
 * ⚠️ A TEST IS NOT CAPPED. The cap protects prospects; a message to Dominic's own address reaches none of
 * them, and counting it would make the safety check punish the safest thing an operator can do.
 */
export function countsTowardCap(
  row: { direction: string; is_test: boolean; status: string; created_at: string },
  now: Date,
): boolean {
  if (row.direction !== 'outbound') return false
  if (row.is_test) return false
  if (!(CAP_COUNTED_STATUSES as readonly string[]).includes(row.status)) return false
  return row.created_at >= londonDayStartUtc(now)
}

export function capRefusal(sentToday: number, cap = OUTREACH_DAILY_SEND_CAP, tz = OUTREACH_TZ): SendRefusal | null {
  if (sentToday < cap) return null
  return { refusal: `${cap} outreach emails have already gone today. The cap resets at midnight (${tz}).` }
}

// ── THE PROSPECT ────────────────────────────────────────────────────────────────────────────────────
export interface ProspectForSend {
  do_not_contact: boolean | null
  contact_email: string | null
  hatchgrab_truck_id: string | null
}

/**
 * The three reasons a prospect is never emailed, in the order they are checked.
 * 🔴 A LINKED HATCHGRAB TRUCK IS NOT A PROSPECT. It is a customer, a demo or the test truck — outreach copy
 * sent to one pitches a product they already have, and in the test truck's case emails Dominic's own
 * operator address as though it were a lead. This is also what keeps a LIVE TRADING TRUCK out of reach of
 * this route entirely: Pizzeria Gusto's discovery row carries `hatchgrab_truck_id`, so it is refused here
 * before any address is read.
 */
export function prospectRefusal(p: ProspectForSend): SendRefusal | null {
  if (p.do_not_contact === true) return { refusal: 'This prospect is marked do not contact.' }
  if (!(p.contact_email ?? '').trim()) return { refusal: 'This prospect has no email address on its truck row.' }
  if (p.hatchgrab_truck_id) return { refusal: 'This row is linked to a HatchGrab truck, so outreach is never sent to it.' }
  return null
}

// ── THE RETRY ───────────────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 AN `uncertain` ROW NEEDS A HUMAN, EVERY TIME. The data was handed to the server and nothing came
 * back: the prospect may already have this exact email. A retry without the operator confirming they have
 * looked in Sent is a second copy, and a second copy of a cold approach is the one mistake that cannot be
 * taken back. `needsConfirm` is what turns the UI's Retry into "check your Sent folder first".
 */
export function retryRefusal(row: { status: string }, confirmUncertain: boolean): SendRefusal | null {
  if (row.status === 'sent') return { refusal: 'That message was already sent.' }
  if (row.status === 'uncertain' && confirmUncertain !== true) {
    return { refusal: 'May have been sent — check your Sent folder before retrying.', needsConfirm: true }
  }
  return null
}
