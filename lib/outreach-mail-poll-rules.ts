// lib/outreach-mail-poll-rules.ts — the decisions the reply poll makes, as PURE functions.
//
// 🔴 EVERY RULE HERE DECIDES WHETHER SOMETHING GETS WRITTEN, and most of them decide it about a real
// business's reply. A poll that logs the wrong thing is worse than one that logs nothing: the queue
// (§57.1) exits a prospect's sequence on any inbound contact row, so a misread auto-reply would stop
// Dominic chasing someone who never answered — silently, and for good. So the rules live here where a
// harness can run them, and the runner does the I/O and nothing else.
//
// Pure: no network, no database, no imapflow. `scripts/outreach-mail-poll.cjs` proves every rule.

/** The mailbox's own addresses. Mail from either is ours and is never a reply to us. */
export const OWN_ADDRESSES = ['hello@hatchgrab.com', 'dominic@hatchgrab.com'] as const

export function isOwnAddress(address: string | null | undefined): boolean {
  const a = (address ?? '').trim().toLowerCase()
  return (OWN_ADDRESSES as readonly string[]).includes(a)
}

// ── THE WATERMARK ───────────────────────────────────────────────────────────────────────────────────
/** What `outreach_settings['mail_poll_state']` holds, one entry per mailbox. */
export interface PollWatermark { uidvalidity: string; lastUid: number }
export type PollState = Record<string, PollWatermark>

export type PollPlan =
  /** 🔴 THE FIRST LOOK READS BY DATE. See `planFetch` and `POLL_SINCE`. */
  | { mode: 'first_look'; since: Date }
  /** Normal: everything above the watermark. */
  | { mode: 'incremental'; from: number }
  /** The mailbox was rebuilt, so uids mean something else now. */
  | { mode: 'rescan'; sinceDays: number }
  /** Nothing new. */
  | { mode: 'none' }

/** How many days a uidvalidity change re-reads. Short, because `message_id` dedupes anyway. */
export const RESCAN_DAYS = 7

/**
 * What to fetch from one mailbox.
 *
 * 🔴 THE FIRST LOOK READS BY DATE, NOT BY THE CURRENT TOP UID — AND THE OLD WAY LOST A REAL REPLY.
 * A folder with no watermark used to be BASELINED: the watermark was set to whatever uid happened to
 * be at the top and nothing was processed. On 29 September the ten-minute cron baselined
 * `dominic/INBOX` in the gap between Dominic sending a test email and pressing the button, at a uid
 * that INCLUDED the reply he had just had. The reply was below the watermark from that instant on and
 * was skipped permanently. The top uid is a property of WHEN THE POLL RAN; a date is a property of the
 * thing being protected against — history that belongs to the importer.
 *
 * ⚠️ THE ORIGINAL CONCERN IS STILL HONOURED. A mailbox with two years in it is still not walked: only
 * messages at or after that account's `POLL_SINCE` are read, and anything older is left to the
 * importer, which writes no contact rows at all.
 *
 * ⚠️ A uidvalidity CHANGE MEANS THE UIDS ARE MEANINGLESS, not that the mail is new. The server has
 * rebuilt the mailbox, so the stored `lastUid` now points at some unrelated message. Re-reading a week
 * is enough to catch anything that arrived around the rebuild, and `message_id` uniqueness makes the
 * overlap a no-op rather than a duplicate.
 */
export function planFetch(
  stored: PollWatermark | undefined,
  live: { uidvalidity: string; highestUid: number },
  since: Date,
): PollPlan {
  if (!stored) return { mode: 'first_look', since }
  if (String(stored.uidvalidity) !== String(live.uidvalidity)) return { mode: 'rescan', sinceDays: RESCAN_DAYS }
  if (live.highestUid <= stored.lastUid) return { mode: 'none' }
  return { mode: 'incremental', from: stored.lastUid + 1 }
}

/**
 * Is this message inside the first look's window?
 * 🔴 FILTERED IN CODE, BECAUSE IMAP `SINCE` HAS DAY GRANULARITY. `SEARCH SINCE 29-Sep-2026` returns
 * everything from midnight that day in the SERVER's timezone, which is both wider than the instant we
 * mean and offset by an unknown amount. The search narrows the fetch; this decides.
 * ⚠️ IT IS THE INTERNALDATE, not the Date header. A sender's clock can say anything; the internal date
 * is when this server received the message, which is what "since the poll went live" means.
 */
export function withinFirstLook(internalDate: Date | string | null | undefined, since: Date): boolean {
  if (!internalDate) return false
  const t = internalDate instanceof Date ? internalDate.getTime() : Date.parse(String(internalDate))
  if (Number.isNaN(t)) return false
  return t >= since.getTime()
}

/**
 * The watermark for a folder that holds NOTHING.
 * 🔴 AN EMPTY FOLDER USED TO GET NO WATERMARK AT ALL, and that is the second half of the same defect.
 * `withReadOnlyMailbox` skips an empty mailbox — correctly, because `fetch('1:*')` on one throws — so
 * the callback that stores the watermark never ran. hello/Spam and hello/Archive therefore reported
 * "first look" on every run for hours, and the FIRST message ever to arrive in one of them would have
 * been swallowed by the next baseline. `lastUid: 0` means "nothing seen yet", so the next message is
 * processed incrementally from uid 1.
 */
export function emptyWatermark(uidvalidity: string): PollWatermark {
  return { uidvalidity: String(uidvalidity), lastUid: 0 }
}

/** The watermark after a run. ⚠️ NEVER GOES BACKWARDS — a short read must not re-process on the next run. */
export function advanceWatermark(
  stored: PollWatermark | undefined,
  live: { uidvalidity: string; highestUid: number },
  seenUids: number[],
): PollWatermark {
  const sameValidity = stored && String(stored.uidvalidity) === String(live.uidvalidity)
  const floor = sameValidity ? stored.lastUid : 0
  const highestSeen = seenUids.length ? Math.max(...seenUids) : 0
  return { uidvalidity: String(live.uidvalidity), lastUid: Math.max(floor, highestSeen, 0) || live.highestUid }
}

// ── THE OVERLAP LOCK ────────────────────────────────────────────────────────────────────────────────
/** A run older than this is assumed dead — a container that was frozen mid-poll never releases. */
export const LOCK_STALE_MS = 2 * 60_000

/**
 * 🔴 THE CRON AND THE BUTTON CAN COLLIDE. Both call the same routine, and two polls reading the same
 * new reply at the same time would each insert a row — `message_id` is unique so the second insert
 * fails, but the *contact log* has no such constraint, so the reply could be logged twice and the
 * ladder would show two replies from one email.
 * ⚠️ AND THE LOCK EXPIRES. A lock that only a successful run releases is a lock that a single frozen
 * invocation turns into a permanent outage of the feature.
 */
export function lockIsHeld(takenAt: string | null | undefined, now: Date): boolean {
  if (!takenAt) return false
  const t = Date.parse(takenAt)
  if (Number.isNaN(t)) return false
  return now.getTime() - t < LOCK_STALE_MS
}

// ── CLASSIFYING AN INCOMING MESSAGE ─────────────────────────────────────────────────────────────────
export type IncomingKind = 'auto_reply' | 'bounce' | 'reply'

export interface IncomingHeaders {
  /** Lower-cased header name → value. Folded values already unfolded. */
  get(name: string): string | null
  subject: string | null
  fromAddress: string | null
  contentType: string | null
}

const AUTO_SUBJECT_RE = /^\s*(automatic reply|auto:|autoreply|out of office)/i
const AUTO_PRECEDENCE = new Set(['auto_reply', 'bulk', 'junk', 'list'])

/**
 * 🔴 AN AUTO-REPLY IS NOT A REPLY, AND THE DIFFERENCE MATTERS MORE THAN IT LOOKS. §57.1 exits a
 * prospect's sequence the moment an inbound contact row exists. An out-of-office logged as a reply
 * would therefore stop Dominic ever chasing that prospect again — because their mail server was polite
 * while they were on holiday. So these are recorded as messages and never as contacts.
 *
 * ⚠️ FOUR INDEPENDENT TESTS, because no single one is reliable. `Auto-Submitted` is the RFC3834 answer
 * and is the one well-behaved servers send; `X-Autoreply` / `X-Autorespond` are what several older
 * systems send instead; `Precedence` is what list software and some autoresponders set; and the subject
 * prefixes catch Outlook's and Gmail's own vacation replies, which frequently carry none of the above.
 */
export function isAutoReply(h: IncomingHeaders): boolean {
  const autoSubmitted = (h.get('auto-submitted') ?? '').trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (h.get('x-autoreply') !== null || h.get('x-autorespond') !== null) return true
  const precedence = (h.get('precedence') ?? '').trim().toLowerCase()
  if (precedence && AUTO_PRECEDENCE.has(precedence)) return true
  return AUTO_SUBJECT_RE.test(h.subject ?? '')
}

const DAEMON_RE = /^(mailer-daemon|postmaster)@/i

/**
 * A delivery failure report.
 * 🔴 BOTH TESTS ARE NEEDED. Most bounces come from `mailer-daemon@` or `postmaster@`, but some arrive
 * from the receiving domain's own address with a `multipart/report; report-type=delivery-status` body,
 * which is the RFC3464 form and the only reliable marker when the From has been rewritten.
 */
export function isBounce(h: IncomingHeaders): boolean {
  if (DAEMON_RE.test((h.fromAddress ?? '').trim())) return true
  const ct = (h.contentType ?? '').toLowerCase()
  return ct.includes('multipart/report') && ct.includes('report-type=delivery-status')
}

export function classifyIncoming(h: IncomingHeaders): IncomingKind {
  // ⚠️ BOUNCE IS TESTED FIRST. A delivery report often carries `Auto-Submitted: auto-replied`, so the
  // other order would file every bounce as an out-of-office and never mark the address bad.
  if (isBounce(h)) return 'bounce'
  if (isAutoReply(h)) return 'auto_reply'
  return 'reply'
}

/** Every `<id>` in a References/In-Reply-To value, in order. */
export function messageIdsIn(value: string | null | undefined): string[] {
  const out: string[] = []
  for (const m of String(value ?? '').matchAll(/<[^<>\s]+>/g)) if (!out.includes(m[0])) out.push(m[0])
  return out
}

/**
 * The Message-ID of the email a bounce is about.
 * 🔴 THE RETURNED COPY IS THE AUTHORITY. A delivery report includes the original message (or at least
 * its headers) as a `message/rfc822` or `text/rfc822-headers` part, and the id in there is the one that
 * identifies the row to mark. `In-Reply-To` on the report itself is a fallback because several servers
 * set it and several do not.
 */
export function bouncedOriginalId(
  returnedPart: string | null | undefined,
  h: Pick<IncomingHeaders, 'get'>,
): string | null {
  const inPart = /^message-id:\s*(<[^<>\s]+>)/im.exec(String(returnedPart ?? ''))
  if (inPart) return inPart[1]
  const fromHeaders = messageIdsIn(h.get('in-reply-to'))
  if (fromHeaders.length) return fromHeaders[0]
  const refs = messageIdsIn(h.get('references'))
  return refs.length ? refs[refs.length - 1] : null
}

// ── MATCHING A MESSAGE TO A PROSPECT ────────────────────────────────────────────────────────────────
export type Match =
  | { kind: 'thread'; prospectId: string }
  | { kind: 'address'; prospectId: string }
  | { kind: 'ambiguous' }
  | { kind: 'none' }

/**
 * Which prospect an incoming message belongs to.
 *
 * 🔴 THREAD FIRST, ADDRESS SECOND, AND NEVER A GUESS. The thread ids are ours — we generated them and
 * stored them — so a match on one is certain. An address match is an inference, and it is only made
 * when it is unambiguous: two prospects sharing a contact address (a chain, a shared agency inbox)
 * would otherwise have one of them chosen at random, and the reply logged against a business that
 * never wrote it.
 * ⚠️ UNMATCHED MAIL IS NOT A PROBLEM TO REPORT IN DETAIL. `hello@` receives order and support mail, so
 * most of what this sees is nothing to do with outreach. It is counted and then forgotten — never
 * stored, never logged, never named.
 */
export function matchIncoming(
  headers: Pick<IncomingHeaders, 'get'> & { fromAddress: string | null },
  byMessageId: Map<string, string>,
  byAddress: Map<string, string[]>,
): Match {
  const threadIds = [...messageIdsIn(headers.get('in-reply-to')), ...messageIdsIn(headers.get('references'))]
  for (const id of threadIds) {
    const p = byMessageId.get(id)
    if (p) return { kind: 'thread', prospectId: p }
  }
  const from = (headers.fromAddress ?? '').trim().toLowerCase()
  if (!from) return { kind: 'none' }
  const hits = byAddress.get(from) ?? []
  const distinct = Array.from(new Set(hits))
  if (distinct.length === 1) return { kind: 'address', prospectId: distinct[0] }
  if (distinct.length > 1) return { kind: 'ambiguous' }
  return { kind: 'none' }
}

/** A message in Sent, to exactly one prospect. Same rule, but over the To/Cc addresses. */
export function matchOutgoing(toAddresses: string[], byAddress: Map<string, string[]>): Match {
  const hits: string[] = []
  for (const a of toAddresses) {
    for (const p of byAddress.get(a.trim().toLowerCase()) ?? []) if (!hits.includes(p)) hits.push(p)
  }
  if (hits.length === 1) return { kind: 'address', prospectId: hits[0] }
  if (hits.length > 1) return { kind: 'ambiguous' }
  return { kind: 'none' }
}

// ── THE REPLY TEXT ──────────────────────────────────────────────────────────────────────────────────
/** What goes in the contact log. Long enough for a real reply, short enough not to be a document. */
export const REPLY_TEXT_CAP = 4000

const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*_{10,}\s*$/m,                                  // Outlook's rule line above its header block
  /^\s*On .{0,200}\bwrote:\s*$/im,
  /^\s*From:\s.+$/im,                                 // an Outlook quote header block
  /^\s*Sent from my \w+/im,
]

/**
 * The reply, with the quoted history cut off — best effort, and best effort is the honest word.
 *
 * 🔴 IT CUTS AT THE EARLIEST MARKER, NOT THE LAST. A reply that quotes twice would otherwise keep the
 * first quote. ⚠️ AND IT NEVER RETURNS EMPTY: a top-post with no text above the quote, or a marker that
 * matched too eagerly, falls back to the whole message rather than logging a blank contact row — a
 * blank row is indistinguishable from "they said nothing" and this is the record Dominic reads later.
 */
export function stripQuotedHistory(text: string, cap = REPLY_TEXT_CAP): string {
  const src = String(text ?? '').replace(/\r\n/g, '\n')
  let cut = src.length
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(src)
    if (m && m.index < cut) cut = m.index
  }
  const head = src.slice(0, cut).trim()
  const body = head || src.trim()
  return body.length > cap ? `${body.slice(0, cap - 1)}…` : body
}

// ── HOUSEKEEPING ────────────────────────────────────────────────────────────────────────────────────
/** A send whose SMTP conversation never came back. Ten minutes is far beyond any real timeout. */
export const STUCK_SENDING_MS = 10 * 60_000

/**
 * 🔴 `sending` → `uncertain`, NOT `failed`, AND NEVER A RE-SEND. The row was written before the socket
 * opened, so a stuck one may well have been delivered. Calling it failed is what makes an operator
 * press Send again; `uncertain` is the state that already requires a human to confirm before a retry.
 */
export function isStuckSending(row: { status: string; is_test: boolean; updated_at: string | null }, now: Date): boolean {
  if (row.status !== 'sending' || row.is_test) return false
  const t = Date.parse(row.updated_at ?? '')
  if (Number.isNaN(t)) return false
  return now.getTime() - t > STUCK_SENDING_MS
}

/** How long after a failure an automatic retry is still appropriate. */
export const RETRY_WINDOW_MS = 30 * 60_000
export const MAX_AUTO_ATTEMPTS = 3

/**
 * Is this failure worth retrying by itself?
 *
 * 🔴 ONLY A TEMPORARY ONE, AND THE LIST IS DELIBERATELY SHORT.
 *   • a 4xx reply is the SMTP spec's own word for "try later" — greylisting, a full mailbox, a rate
 *     limit. Retrying is what the code means.
 *   • a connection-class error (ECONNECTION / EDNS / ETIMEDOUT / ECONNRESET / ESOCKET) never reached a
 *     server that could form an opinion.
 * ⚠️ AND NEVER THESE:
 *   • EAUTH — the credentials are wrong. Retrying hammers a login that will keep failing, and repeated
 *     auth failures are how a mail host locks an account out.
 *   • a 5xx reply — the server has refused permanently. "No such mailbox" does not become true on the
 *     third attempt; it just sends the same rejection to the same postmaster three times.
 * 🔴 AND A `uncertain` ROW IS NEVER AUTO-RETRIED AT ALL — it is not in this function's remit, because
 * the whole point of `uncertain` is that a human looks in Sent first.
 */
export function isTemporaryFailure(lastError: string | null | undefined): boolean {
  const e = String(lastError ?? '')
  if (/\bEAUTH\b/i.test(e)) return false
  // The sanitised error is `CODE: message`; a numeric code is the SMTP reply.
  const numeric = /^(\d{3})\s*:/.exec(e.trim())
  if (numeric) {
    const code = Number(numeric[1])
    return code >= 400 && code < 500
  }
  if (/\b5\d\d\b/.test(e) && !/\b4\d\d\b/.test(e)) return false
  return /\b(ECONNECTION|EDNS|ETIMEDOUT|ECONNRESET|ESOCKET|ECONNREFUSED)\b/i.test(e)
}

export function shouldAutoRetry(
  row: { status: string; is_test: boolean; attempts: number; last_error: string | null; created_at: string | null },
  now: Date,
): boolean {
  if (row.status !== 'failed') return false
  if ((row.attempts ?? 0) >= MAX_AUTO_ATTEMPTS) return false
  const t = Date.parse(row.created_at ?? '')
  if (Number.isNaN(t) || now.getTime() - t > RETRY_WINDOW_MS) return false
  return isTemporaryFailure(row.last_error)
}
