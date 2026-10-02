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
  /** 🔴 Who it went to. Following up on MY OWN email goes back to THIS address — `from_address` on
   *  an outbound row is our own mailbox, and replying to that would email ourselves. */
  to_address?: string | null
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
  /** 🔴 NON-NULL ⇒ this email is already a rung on the ladder. Null on an outbound row means nothing
   *  recorded a step for it — the Outlook-sent case the sequence report's §0c describes. */
  contact_id?: string | null
  /** 🔴 THE GUARDS THIS SEND WAVED THROUGH, with the sentences that were on screen when it was waved.
   *  Null on a clean send AND on every row written before the column existed — the panel shows the line
   *  only when there is something in it, so the two cases read identically and that is correct.
   *  ⚠️ IT REPLACED A `note` IN THE HISTORY. See the note at the head of lib/outreach-events.ts. */
  guard_override?: GuardOverride[] | null
}

/** One waved guard, as stored. ⚠️ THE SENTENCE IS STORED, NOT RE-DERIVED: a guard's wording can change,
 *  and a record of a decision has to keep the words the decision was made on. */
export interface GuardOverride { id: string; message: string }

/**
 * Read a stored `guard_override` back, refusing anything that is not the shape above.
 * 🔴 IT IS A `jsonb` COLUMN, so the only guarantee is that it is JSON. A malformed value must become
 * null — one grey line missing — rather than reaching the panel and throwing inside a render.
 */
export function parseGuardOverride(raw: unknown): GuardOverride[] | null {
  if (!Array.isArray(raw)) return null
  const out: GuardOverride[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    const message = typeof o.message === 'string' ? o.message.trim() : ''
    if (id && message) out.push({ id, message })
  }
  return out.length > 0 ? out : null
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
  /** 🔴 Present and later than `created_at` ⇒ this note has been edited, and when. Absent until the
   *  column's migration is applied, in which case an edit simply carries no mark. */
  updated_at?: string | null
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
      /* ⚠️ `?? m.sent_copy` WAS HERE AND WAS NEVER THE EMAIL'S WORDS (removed 2 October 2026).
       * `outreach_messages.sent_copy` holds 'server_filed' | 'appended' | 'absent' — WHERE the copy in
       * Sent is, not what the email said. Offered as a fallback for the opening words it could only
       * ever compare the string "absent" against a hand log's first paragraph, so it matched nothing;
       * the harm was in reading as though a second source of the words existed, which is how the send
       * route came to select a `preview` column that does not exist. There is ONE source: `preview`,
       * derived from `text_body` by `previewOf`. A row whose body was never stored has no opening
       * words, and no opening words pairs NOTHING — the same exactly-one-or-nothing rule as above. */
      const matches = ms.filter(m => openingKey(m.preview ?? '') === want)
      if (matches.length !== 1) continue
      // ⚠️ AN EMAIL ALREADY PAIRED WITH ANOTHER LOG IS NOT PAIRED AGAIN.
      if (pairs.has(matches[0].id)) continue
      pairs.set(matches[0].id, c)
      hidden.add(c.id)
    }
  }
  return { pairs, hidden }
}

// ── 🔴 ONE RULE FOR "IS THIS EMAIL ALREADY A RECORDED STEP" ───────────────────────────────────────
//
// THE INCIDENT (Guerrilla Kitchen, 1 October 2026). A first contact was sent from Outlook on 15
// September and logged by hand — an `outreach_contacts` row with no linked message. Import past emails
// later stored that same email as an `outreach_messages` row with `contact_id` null. The HISTORY got it
// right: `pairHandLoggedEmails` pairs the two and shows **one** row. Nothing else knew:
//   • `guardUnattributed` warned "An email went to this prospect 15 Sept … that is not recorded as a
//     step — it was sent from Outlook", on an email that was recorded as a step;
//   • the reading panel offered "Record as Chase 1" to record it a second time, and after the chase
//     went out it offered "Record as Chase 2" — because the button read the prospect's CURRENT step
//     rather than anything about the email in front of it.
//
// 🔴 THREE READERS, THREE ANSWERS, ONE QUESTION. That is the defect. This is the single answer, and
// `buildTimeline`, the guards and the reading panel all read it.
//
// AN OUTBOUND, NON-TEST EMAIL COUNTS AS RECORDED WHEN EITHER:
//   • `contact_id` is set — this system sent it and logged it; or
//   • it PAIRS with a hand-logged outbound email contact whose `kind` is one of `CONTACT_KINDS`.
// 🔴 PAIRING IS `pairHandLoggedEmails` ITSELF, PASSED IN — not a second implementation of the same
// idea with the same name. Same London day and direction with exactly one of each, or the
// opening-words rule when the day is ambiguous, and **ambiguity pairs nothing**. A looser rule here
// than the history's would silence a guard about an email the history still shows as unaccounted for.
//
// ⚠️ A `kind` OUTSIDE `CONTACT_KINDS` IS NOT A RECORDED STEP. `reply` is the case that matters: it
// sits outside the ladder on purpose (see `REPLY_KIND`), so an email logged as a reply has not had a
// rung recorded for it and must still be offered one. Treating it as recorded would strand the ladder.
// ⚠️ DISPLAY AND GUARD LOGIC ONLY. Nothing here writes, links or deletes a row; both records stay as
// they are, because both are true — one is what the mail server did, the other what a person recorded.
/** What a message is recorded as, and how we know. */
export interface RecordedStep {
  /** The `CONTACT_KINDS` rung this email is recorded as. */
  kind: string
  /** `linked` = a contact row points at this message. `paired` = a hand-logged contact matched it. */
  how: 'linked' | 'paired'
  /** The hand-logged contact, when `how` is `paired` — what "(logged by hand, 15 Sep)" is drawn from. */
  contact: TimelineContact | null
}

/**
 * message id → what it is recorded as. Absent from the map ⇒ not recorded.
 *
 * ⚠️ IT TAKES THE PAIRING RATHER THAN COMPUTING ONE. Every caller already builds it for the history,
 * and a function that quietly re-derived it could disagree with the rows on screen.
 */
export function recordedStepsFor(input: {
  messages: readonly TimelineMessage[]
  contacts: readonly TimelineContact[]
  pairing: HandLogPairing
  /** The rungs of the ladder. Passed in so this module does not import the outreach vocabulary. */
  ladderKinds: readonly string[]
}): Map<string, RecordedStep> {
  const out = new Map<string, RecordedStep>()
  const isRung = (k: string | null | undefined) => !!k && input.ladderKinds.includes(String(k))
  const byId = new Map(input.contacts.map(c => [c.id, c] as const))

  for (const m of input.messages) {
    if (m.is_test === true) continue
    if (String(m.direction ?? '').toLowerCase() !== 'outbound') continue

    // ① LINKED — this system sent it and wrote the rung.
    if (m.contact_id) {
      const c = byId.get(m.contact_id)
      // ⚠️ THE CONTACT MAY NOT HAVE BEEN READ. `contact_id` alone proves a rung was written; without
      // the row we cannot name it, and naming it wrongly is worse than leaving the panel quiet.
      if (!c) continue
      if (isRung(c.kind)) out.set(m.id, { kind: String(c.kind), how: 'linked', contact: c })
      continue
    }

    // ② PAIRED — somebody sent it from Outlook and logged it by hand.
    const c = input.pairing.pairs.get(m.id)
    if (!c) continue
    if (String(c.direction ?? '').toLowerCase() === 'inbound') continue
    if (isRung(c.kind)) out.set(m.id, { kind: String(c.kind), how: 'paired', contact: c })
  }
  return out
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

// ── WHAT A ROW SAYS IT IS ───────────────────────────────────────────────────────────────────────────
/**
 * The words on a contact row.
 *
 * 🔴 A CALL WAS BEING LABELLED "reply". After a prospect has replied, `oneClickKind` logs every
 * one-click contact as `reply` — correctly, because `reply` is not a rung and a call back must not
 * advance the chase ladder. But the row printed that stored kind, so "Spoke to Libby" appeared as
 * "reply · Spoke to Libby". The KIND is a fact about the ladder; the LABEL is a fact about what
 * happened, and they are not the same sentence.
 * ⚠️ DISPLAY ONLY. Nothing here is stored, and `nextStep` still reads the kind it always read.
 * ⚠️ "reply" SURVIVES FOR EMAIL, because for an email it is exactly the right word.
 */
export function contactRowLabel(c: {
  channel?: string | null
  kind?: string | null
  direction?: string | null
}): string {
  const channel = String(c.channel ?? '').toLowerCase()
  const kind = String(c.kind ?? '')
  if (channel === 'phone' || channel === 'call') return 'Call'
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'sms' || channel === 'text') return 'Text'
  // ⚠️ AN EMAIL, OR A CHANNEL NOBODY RECOGNISES: the rung is the most honest thing left to say, in
  // the vocabulary the rest of the page uses. A blank kind reads as "contact" rather than as blank.
  if (!kind) return 'Contact'
  return kind.replace(/^\d_/, '').replace(/_/g, ' ')
}

/**
 * A note's text, for a ONE-LINE row and for the expanded view.
 *
 * 🔴 A NOTE WAS TAKING SIX ROWS OF HISTORY. It rendered `whitespace-pre-wrap` inline, so a note with
 * line breaks became a tall block with the blank lines between paragraphs still in it, and the
 * history stopped being a list. Runs of empty lines collapse to ONE break; the line breaks Dominic
 * typed are kept, the gaps are not.
 * ⚠️ IT NEVER JOINS LINES. "Collapse the blank lines" is not "make it one paragraph" — the breaks
 * are how a note is read.
 */
export function tidyNoteText(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** The first line of a note, for the collapsed row. ⚠️ Truncation is the CSS's job, not this one's. */
export function noteFirstLine(text: string | null | undefined): string {
  return tidyNoteText(text).split('\n')[0] ?? ''
}

/**
 * Is there more of this note than the collapsed row shows?
 *
 * 🔴 A ROW THAT CAN BE OPENED MUST LOOK LIKE ONE, and a row that cannot must not pretend. Two ways
 * there is more: further LINES, which is certain, or a first line long enough that the column will
 * cut it, which is a judgement — the browser decides where a `truncate` actually bites and this
 * cannot ask it. `NOTE_ONE_LINE_CHARS` is deliberately generous: showing the chevron on a note that
 * happened to fit costs one click that does nothing, while hiding it on a note that was cut costs
 * the words.
 */
export const NOTE_ONE_LINE_CHARS = 70

export function noteHasMore(text: string | null | undefined): boolean {
  const tidy = tidyNoteText(text)
  if (!tidy) return false
  const first = tidy.split('\n')[0] ?? ''
  return tidy !== first || first.length > NOTE_ONE_LINE_CHARS
}

// ── ONE LABEL FOR EVERY ROW ─────────────────────────────────────────────────────────────────────────
/**
 * 🔴 EVERY HISTORY ROW SAYS WHAT IT IS, IN THE SAME SHAPE: an icon for the channel and a WORD for
 * what happened, in a fixed column so the rows line up.
 *
 * WHAT THIS REPLACES: emails carried `↗` and `↙` — two unicode arrows that mean "sent" and
 * "received" only once somebody has told you so — and a received email carried a GREEN ROW
 * BACKGROUND, which is a colour doing the work of a word. Calls and notes had their own characters
 * (`☎`, `✎`, `·`), chosen one at a time. Six kinds of row, four vocabularies.
 *
 * ⚠️ THE ICON IS A NAME, NOT A COMPONENT. This module is pure and is compiled by a harness with no
 * React in it; `components/admin/outreach-icons.tsx` turns the name into the one SVG. That is also
 * what stops a row inventing its own icon: there is nowhere to put one.
 * ⚠️ DISPLAY ONLY. Nothing here is stored, and nothing reads it back.
 */
export type RowIconName = 'envelope' | 'phone' | 'chat' | 'pencil' | 'arrows'

export interface RowLabel {
  icon: RowIconName
  word: string
  /**
   * 🔴 "Received" IS THE ONE THING WORTH SPOTTING IN A COLUMN OF ROWS — somebody is waiting. It is a
   * small pill in bold dark text rather than a colour, so it survives a greyscale print, a colour
   *-blind reader and a phone in sunlight. Every other word is plain grey.
   */
  pill: boolean
}

export function rowLabel(item: TimelineItem): RowLabel {
  if (item.type === 'event') {
    return item.event.kind === 'stage_change'
      ? { icon: 'arrows', word: 'Stage', pill: false }
      : { icon: 'pencil', word: 'Note', pill: false }
  }
  if (item.type === 'email') {
    return item.message.direction === 'inbound'
      ? { icon: 'envelope', word: 'Received', pill: true }
      : { icon: 'envelope', word: 'Sent', pill: false }
  }
  // A logged contact: the CHANNEL decides the icon, and `contactRowLabel` the word — the same
  // function the row's own text uses, so a call cannot be an envelope saying "Call".
  const channel = String(item.contact.channel ?? '').toLowerCase()
  const inbound = String(item.contact.direction ?? '').toLowerCase() === 'inbound'
  if (channel === 'phone' || channel === 'call') return { icon: 'phone', word: 'Call', pill: false }
  if (channel === 'whatsapp') return { icon: 'chat', word: 'WhatsApp', pill: false }
  if (channel === 'email') {
    return inbound
      ? { icon: 'envelope', word: 'Received', pill: true }
      : { icon: 'envelope', word: 'Sent', pill: false }
  }
  // ⚠️ AN UNRECOGNISED CHANNEL IS STILL A CONTACT, and it says so rather than borrowing an icon that
  // would claim it was something it is not.
  return { icon: 'chat', word: contactRowLabel(item.contact), pill: false }
}

/**
 * The same two words for a message outside the timeline — the reading panel's header, Today's lists.
 * ⚠️ NOT `directionLabel`: `lib/outreach.ts` already exports one of those, and it returns a plain
 * string for a contact row. Two functions with one name, one returning an object, is how a file ends
 * up importing the wrong one and rendering `[object Object]`.
 */
export function messageRowLabel(direction: string | null | undefined): RowLabel {
  return String(direction ?? '').toLowerCase() === 'inbound'
    ? { icon: 'envelope', word: 'Received', pill: true }
    : { icon: 'envelope', word: 'Sent', pill: false }
}
