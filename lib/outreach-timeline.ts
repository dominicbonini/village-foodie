// lib/outreach-timeline.ts — one conversation, from three tables, in one order.
//
// 🔴 WHAT REPLACED WHAT. The prospect modal used to show a Contact-history TABLE and, below it, an
// Emails list. The same email appeared in both — once as the rung it wrote and once as the message it
// was — and neither list knew about the other's ordering, so reading "what happened with this truck"
// meant reading two lists and merging them by eye. This merges them once, here, where it can be
// tested, instead of in a component where it cannot.
//
// ⚠️ PURE AND SYNCHRONOUS. It takes rows and returns rows; every caller has already read them.

export interface TimelineMessage {
  id: string
  direction: string | null
  status: string | null
  is_test?: boolean | null
  source?: string | null
  subject?: string | null
  /** 🔴 Who wrote it. A reply goes back to THIS address, not to the truck's stored one. */
  from_address?: string | null
  message_date?: string | null
  created_at?: string | null
  handled_at?: string | null
  snoozed_until?: string | null
  /** The first few lines only. The full body is fetched when a row is expanded. */
  preview?: string | null
  sent_copy?: string | null
  last_error?: string | null
  attempts?: number | null
  has_body?: boolean
  attachment_count?: number
}

export interface TimelineContact {
  id: string
  contacted_at?: string | null
  created_at?: string | null
  channel?: string | null
  direction?: string | null
  kind?: string | null
  message?: string | null
  /** 🔴 Non-null ⇒ this contact IS one of the emails above, and the email is what gets shown. */
  email_message_id?: string | null
}

export interface TimelineEvent {
  id: string
  kind: string
  from_stage?: string | null
  to_stage?: string | null
  body?: string | null
  created_at: string
}

export type TimelineItem =
  | { type: 'email'; at: string; id: string; message: TimelineMessage }
  | { type: 'contact'; at: string; id: string; contact: TimelineContact }
  | { type: 'event'; at: string; id: string; event: TimelineEvent }

/** The instant a row belongs at. `contacted_at` is a DATE the operator picked, so `created_at`
 *  breaks same-day ties — the rule the history table already used, kept. */
const atOf = (primary: string | null | undefined, fallback: string | null | undefined): string =>
  String(primary ?? fallback ?? '')

/**
 * Build the timeline, newest first.
 *
 * 🔴 AN EMAIL LINKED TO A CONTACT ROW APPEARS ONCE, AS THE EMAIL. The contact row carries a rung and
 * a timestamp; the email carries the subject, the status, the body and the actions. Showing both is
 * showing one thing twice, and the one to drop is the thinner of the two.
 * ⚠️ A CONTACT WHOSE EMAIL IS FILTERED OUT IS STILL DROPPED. Hiding test sends hides the email; the
 * rung behind it (if any) is not then promoted into view, because that would make "show test sends"
 * change what the ladder looks like rather than what is displayed.
 */
export function buildTimeline(input: {
  messages: readonly TimelineMessage[]
  contacts: readonly TimelineContact[]
  events: readonly TimelineEvent[]
  /** Test sends are hidden unless this is true. They are not correspondence. */
  showTests?: boolean
  /**
   * 🔴 THE HAND-LOG PAIRING, FROM `pairHandLoggedEmails`. Absent ⇒ no pairing, which is exactly the
   * behaviour before it existed. The contacts it names are left out here; the EMAIL carries the
   * marker and the logged text.
   */
  pairing?: HandLogPairing
}): TimelineItem[] {
  const items: TimelineItem[] = []

  for (const m of input.messages) {
    if (m.is_test === true && !input.showTests) continue
    items.push({ type: 'email', at: atOf(m.message_date, m.created_at), id: m.id, message: m })
  }
  for (const c of input.contacts) {
    // 🔴 THE DE-DUPLICATION. `email_message_id` is set by the routes from `outreach_messages.contact_id`.
    if (c.email_message_id) continue
    // 🔴 AND THE SECOND ONE, FOR AN EMAIL SENT FROM OUTLOOK AND THEN LOGGED BY HAND. Display only —
    // the row is still in the database and the email it paired with says so.
    if (input.pairing?.hidden.has(c.id)) continue
    items.push({ type: 'contact', at: atOf(c.contacted_at, c.created_at), id: c.id, contact: c })
  }
  for (const e of input.events) {
    items.push({ type: 'event', at: e.created_at, id: e.id, event: e })
  }

  // Newest first. ⚠️ The id breaks a dead tie so the order is stable between renders rather than
  // whatever the sort happened to do with two equal keys.
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1))
}

/** The first two or three lines of an email, for the collapsed row. */
export const PREVIEW_LINES = 3
export function previewOf(text: string | null | undefined, lines = PREVIEW_LINES): string {
  const clean = String(text ?? '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!clean.length) return ''
  return clean.slice(0, lines).join('\n')
}

// ── ONE EVENT, ONE ROW ──────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 THE SAME EMAIL TWICE, FROM TWO HONEST RECORDS. `buildTimeline` already drops a contact row that
 * is LINKED to a message (`email_message_id`), which covers everything this app sent. It does not
 * cover the other case: an email sent from Outlook that Dominic then logged by hand. The mail poll
 * later finds that email in Sent and records it — correctly — and now the history shows the same
 * conversation as two rows, one thin and one whole.
 *
 * 🔴 DISPLAY ONLY. NOTHING IS DELETED AND NOTHING IS EDITED. Both rows are true: one is what the mail
 * server did, the other is what a person recorded, and the app has no business deciding that one of
 * them did not happen. This pairs them for the eye and marks the result.
 *
 * 🔴 AND IT REFUSES WHEN IT CANNOT BE SURE. Two emails and one hand-logged contact on the same day
 * is not a pairing, it is a guess — and a wrong guess HIDES a row. Ambiguity pairs nothing and shows
 * everything, which is the failure mode that costs a second of confusion rather than a lost record.
 */
export interface HandLogPairing {
  /** message id → the hand-logged contact it is almost certainly the same event as. */
  pairs: Map<string, TimelineContact>
  /** The contact rows those pairs absorb. `buildTimeline` leaves them out. */
  hidden: Set<string>
}

/** The London calendar day of a timestamp, for "the same day". '' when there is no usable date. */
export function londonDay(iso: string | null | undefined): string {
  const raw = String(iso ?? '')
  if (!raw) return ''
  // ⚠️ A DATE-ONLY VALUE IS ALREADY A DAY. `contacted_at` is 'YYYY-MM-DD' when a person picked it,
  // and putting that through a timezone conversion would move it backwards for anywhere west of us.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

/** An email contact row that no stored message claims — the only kind that can be paired. */
const isUnlinkedEmailContact = (c: TimelineContact): boolean =>
  !c.email_message_id && String(c.channel ?? '').toLowerCase() === 'email'

export function pairHandLoggedEmails(input: {
  messages: readonly TimelineMessage[]
  contacts: readonly TimelineContact[]
}): HandLogPairing {
  const pairs = new Map<string, TimelineContact>()
  const hidden = new Set<string>()

  /** key = day + direction. Both sides must agree on both, or they are not the same event. */
  const key = (day: string, direction: string | null | undefined) =>
    `${day}|${String(direction ?? '').toLowerCase()}`

  const messagesByKey = new Map<string, TimelineMessage[]>()
  for (const m of input.messages) {
    // ⚠️ A TEST SEND IS NOT CORRESPONDENCE and can never be the email somebody logged by hand.
    if (m.is_test === true) continue
    const day = londonDay(m.message_date ?? m.created_at)
    if (!day) continue
    const k = key(day, m.direction)
    messagesByKey.set(k, [...(messagesByKey.get(k) ?? []), m])
  }

  const contactsByKey = new Map<string, TimelineContact[]>()
  for (const c of input.contacts) {
    if (!isUnlinkedEmailContact(c)) continue
    const day = londonDay(c.contacted_at ?? c.created_at)
    if (!day) continue
    const k = key(day, c.direction)
    contactsByKey.set(k, [...(contactsByKey.get(k) ?? []), c])
  }

  for (const [k, cs] of contactsByKey) {
    const ms = messagesByKey.get(k) ?? []
    // 🔴 EXACTLY ONE EACH SIDE — the day is enough to be sure, and this is the common case.
    if (ms.length === 1 && cs.length === 1) {
      pairs.set(ms[0].id, cs[0])
      hidden.add(cs[0].id)
      continue
    }
    /* ── 🔴 THE SECOND RULE: THE SAME OPENING WORDS ────────────────────────────────────────────
     * 🧪 Pig-Casso's, 15 September: TWO outbound emails and ONE hand-logged first contact. The day
     * rule correctly refused to guess, so the same approach showed twice — once as the email and
     * once as the log of it. The words are the evidence the day could not supply: a hand log is
     * usually the first paragraph of the email pasted in, so the first 60 meaningful characters
     * identify it.
     * 🔴 AND IT IS STILL EXACTLY-ONE-OR-NOTHING. If two emails that day open with the same words,
     * this pairs NOTHING — the same rule as before, for the same reason: a wrong pairing HIDES a
     * record, which is worse than showing two. The count is of MATCHES, not of candidates.
     * ⚠️ GREETINGS ARE SKIPPED ON BOTH SIDES, by the same `meaningfulText` the previews use, so
     * "Hi George," against "Hi Stephen," never matches and never blocks a real match. */
    for (const c of cs) {
      const want = openingKey(c.message)
      if (!want) continue
      const matches = ms.filter(m => openingKey(m.preview ?? m.sent_copy ?? '') === want)
      if (matches.length !== 1) continue
      // ⚠️ AN EMAIL ALREADY PAIRED WITH ANOTHER LOG IS NOT PAIRED AGAIN.
      if (pairs.has(matches[0].id)) continue
      pairs.set(matches[0].id, c)
      hidden.add(c.id)
    }
  }
  return { pairs, hidden }
}

/**
 * The first 60 characters that carry words, normalised — the key the second pairing rule compares.
 *
 * 🔴 WHAT IS NORMALISED AND WHY: case (one side was typed, the other pasted), every run of
 * whitespace and every line break (a hand log loses the email's wrapping), and the six quote
 * characters that a mail client and a keyboard disagree about (’ vs ', “ ” vs "). What is NOT
 * normalised is the words themselves — this is a comparison, not a fuzzy match.
 * ⚠️ SHORTER THAN 60 CHARACTERS IS STILL COMPARED, in full. A three-word log that matches a
 * three-word email is a match; what it must never do is match a LONGER email that merely begins
 * with those words, which is why the email is cut to the same length before comparing.
 * ⚠️ AN EMPTY KEY NEVER MATCHES ANYTHING — `''` is returned for a log with no words in it, and the
 * caller skips it rather than pairing every wordless row together.
 */
export const OPENING_CHARS = 60

export function normaliseForMatch(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The text with greeting-only lines removed — the same skip the previews make. */
export function meaningfulText(text: string | null | undefined): string {
  const lines = String(text ?? '').split(/\r?\n/)
  const kept: string[] = []
  let started = false
  for (const line of lines) {
    if (!started && isGreetingLine(line)) continue
    if (line.trim()) started = true
    kept.push(line)
  }
  return kept.join('\n').trim()
}

export function openingKey(text: string | null | undefined): string {
  return normaliseForMatch(meaningfulText(text)).slice(0, OPENING_CHARS)
}

/**
 * Is the hand-logged text just a copy of the email?
 *
 * 🧪 Between Buns Royston, 18 September: the reading panel showed a grey block headed "Logged by
 * hand:" carrying the ENTIRE email as plain text, and then the formatted email underneath it. The
 * same words twice, the plain copy first. The hand log is usually the email pasted in, so the
 * default has to be: say it happened, do not print it again.
 *
 * 🔴 TRUE ⇒ SHOW NOTHING BUT THE MARKER. FALSE ⇒ SHOW A COLLAPSED LINK, never an expanded block.
 * ⚠️ "I CANNOT TELL" IS FALSE, NOT TRUE. When the email's text has not loaded (or has none), this
 * returns false, so the sentence somebody typed is still reachable behind one click. The failure to
 * avoid is HIDING something that was written down, not showing one extra link.
 */
export const SAME_TEXT_CHARS = 200

export function handTextIsRedundant(
  handText: string | null | undefined, emailText: string | null | undefined,
): boolean {
  const hand = normaliseForMatch(meaningfulText(handText))
  if (!hand) return true                       // nothing was written down; there is nothing to show
  const email = normaliseForMatch(meaningfulText(emailText))
  if (!email) return false                     // cannot tell — keep it reachable
  if (email.includes(hand)) return true
  const n = Math.min(SAME_TEXT_CHARS, hand.length, email.length)
  return n > 0 && hand.slice(0, n) === email.slice(0, n)
}

// ── WHAT A ROW SAYS BEFORE IT IS OPENED ─────────────────────────────────────────────────────────────
/**
 * 🔴 "Hi Stephen," IS NOT A PREVIEW. Every email opens with a greeting, so a preview that starts at
 * the first line tells you only that this is an email — which the row already said. The useful line
 * is the first one that carries a fact.
 * ⚠️ IT FALLS BACK RATHER THAN BLANKING. A message that is nothing but a greeting, or nothing at
 * all, shows its SUBJECT: the row must never be a date and an empty space.
 */
const GREETING_RE = /^(hi|hello|hey|dear|morning|afternoon|evening|good\s+(morning|afternoon|evening)|greetings)\b[^a-z0-9]*$|^(hi|hello|hey|dear|morning|afternoon|evening|good\s+(morning|afternoon|evening)|greetings)\b[\s,!-]*[a-z'’\-. ]{0,40}[,!.]?$/i

/** True when a line is only a salutation — "Hi", "Hi Stephen,", "Good morning Sam", "Dear Sir". */
export function isGreetingLine(line: string): boolean {
  const s = String(line ?? '').trim()
  if (!s) return true
  return GREETING_RE.test(s)
}

/**
 * The first line of an email that says something.
 * ⚠️ IT IS A LINE, NOT A SENTENCE-SPLIT. Splitting on full stops breaks "Ltd." and "3.30pm" and
 * turns one thought into half of one; the first meaningful LINE is what a person reads first anyway.
 */
export function meaningfulPreview(
  text: string | null | undefined,
  subject: string | null | undefined,
  max = 140,
): string {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').map(l => l.trim())
  for (const line of lines) {
    if (!line || isGreetingLine(line)) continue
    const flat = line.replace(/\s+/g, ' ')
    return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`
  }
  return String(subject ?? '').trim()
}
