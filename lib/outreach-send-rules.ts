// lib/outreach-send-rules.ts — the refusals and the cap window, as PURE functions.
//
// 🔴 WHY THESE ARE NOT INLINE IN THE ROUTE. Every rule here is a reason NOT to send an email, and a rule
// that cannot be run without a database and a mailbox cannot be proven. §58.2 records what happens when a
// guard is re-implemented next to the thing it guards: three copies of one regex shared one blind spot and
// a malformed token shipped on an active template. So the route calls these and the harness calls these —
// one implementation, two callers, no second copy to drift.
//
// Pure: no network, no database, no clock of its own (every function that needs "now" is given it).
/** A refusal is a sentence for the operator, plus whatever the UI needs to offer the way forward. */
export interface SendRefusal { refusal: string; needsConfirm?: boolean }

// ── 🔴 THE DAILY CAP IS GONE (29 September 2026), AND THIS NOTE IS WHY ──────────────────────────────
// There was a cap of 30 non-test outbound emails per Europe/London day, with `CAP_COUNTED_STATUSES`,
// `londonDayStartUtc`, `countsTowardCap` and `capRefusal` to enforce it. Dominic removed it: every email
// goes out by hand, one press at a time, so a limit only ever gets in the way of the person it is meant
// to protect him from being.
//
// ⚠️ IT ALSO MISFIRED IMMEDIATELY. On its first day live the cap counted by `created_at` with no filter
// on `source`, so a single run of "Import past emails" — 37 rows recorded at once, every one of them an
// email sent MONTHS ago from Outlook — read as 37 sends today and refused the next one. The refusal
// even reached a TEST send, which the spec said the cap must never count.
// A limit may come back with automation, and if it does it counts `source = 'system'` rows and skips
// tests, because those are the two mistakes this one made.
//
// 🔴 NOTHING REPLACES IT. There is no send-count check anywhere in the send path now — the harness
// asserts that, including for a test send with many non-test rows on the same day.

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
