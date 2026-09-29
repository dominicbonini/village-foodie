// lib/outreach-mail-message.ts — building an outreach email that is indistinguishable from the ones
// Dominic has already sent by hand from Outlook.
//
// 🔴 THE MARKUP HERE IS NOT A DESIGN. It is a transcription of what
// /api/admin/outreach/mail-diagnostics captured from the real Sent folder: the paragraph div, the
// signature block, the spacers, and the reference block Outlook writes when a reply quotes its parent.
// A prospect who received a hand-sent email in September and a generated chase in October must not be
// able to tell that anything changed. Every literal below is measured; none is invented, and none may be
// "tidied" without re-capturing.
//
// ⚠️ THE SIGNATURE IS APPROVED COPY. Not a word or a tag of it changes without Dominic saying so.
//
// Pure: no network, no database, no nodemailer. `scripts/outreach-mail-send.cjs` proves every rule here.
import { OUTREACH_FROM_ADDRESS, OUTREACH_FROM_NAME, OUTREACH_TZ } from '@/lib/outreach-mail-config'
import { expandBody, type SendTimeValues } from '@/lib/outreach-signature'

/** The paragraph style, exactly as captured. Used for body paragraphs, spacers and the signature lines. */
const P_STYLE = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);'
/* The 10pt opt-out style moved to `lib/outreach-signature.ts#SIG_OPTOUT_STYLE` with the line it
 * styles — the opt-out sentence is stored data now, and its style belongs beside its renderer. */
/** The rule above a quoted message. Captured verbatim, `currentcolor` and all. */
const QUOTE_RULE_STYLE = 'padding: 3pt 0in 0in; border-width: 1pt medium medium; border-style: solid none none; border-color: rgb(181, 196, 223) currentcolor currentcolor;'

/* `OPTOUT_SENTENCE` WAS HERE, AS A CONSTANT IN THIS FILE. It is a row in `outreach_settings` now,
 * edited on the Templates tab's Signature panel and placed by `{{opt_out}}`. The wording is still
 * approved wording and the reply route is still the opt-out — no link, nothing to click, nothing to
 * track — but it is Dominic's to change without a deploy. The seed value in
 * `supabase/migrations/20260929_outreach_settings.sql` is this sentence, word for word. */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const div = (style: string, inner: string) => `<div style="${style}">${inner}</div>`

// ── 🔴 `signatureHtml()` AND `signatureText()` WERE HERE, AND THE AUTOMATIC APPEND WENT WITH THEM ──
// Every message used to get the captured Outlook block appended to it, unconditionally, by
// `buildMessage`. From 29 September 2026 the signature is DATA in `outreach_settings`, placed by a
// `{{signature}}` token in the template, and the opt-out sentence is its own `{{opt_out}}` token.
// 🔎 `lib/outreach-signature.ts` holds both the reasoning and the rendering.
//
// ⚠️ WHAT THIS COSTS, STATED PLAINLY: nothing appends a signature or an opt-out line any more. A
// template without the tokens sends without them, and no code path refuses it — the compose window
// warns, and the Send confirm repeats the warning. That is deliberate (an operator is allowed to mean
// "send exactly this"), but it is a real loss of a guarantee and it is written down rather than
// implied. The same note stands at the top of `lib/outreach-template-render.ts` about the footer that
// preceded it.
//
// 🔴 ONE BUG DIED WITH THE OLD BLOCK. It emitted `<div><b>Dominic Bonini</b></div>` — a div with NO
// font style — so that one line inherited the mail client's default size and arrived visibly smaller
// than the rest. `signatureLineHtml` puts the `<b>` inside the 12pt div instead.

/* `bodyHtml` AND `bodyText` WERE HERE. Both now live in `lib/outreach-signature.ts#expandBody`, which
 * does the same paragraph work AND the token expansion in one pass — two functions that split the same
 * body on the same blank lines would eventually disagree about where a signature sits.
 * 🔴 `bodyText` ALSO CARRIED A DEFECT THAT REACHED A PROSPECT: it passed the body through untouched, so
 * a `<br><br>` typed in a template arrived in the text/plain part as those eight literal characters.
 * `stripHtmlToText` is the replacement, and the harness proves the text part contains no tag. */

/**
 * `dominic@hatchgrab.com <dominic@hatchgrab.com>` when there is no display name — which is what Outlook
 * renders in its own quote header today, because the From carries no name. Reproduced rather than
 * improved: the quote block in a new chase has to match the one in the thread above it.
 */
export function quoteAddress(address: string, name?: string | null): string {
  const n = (name ?? '').trim()
  return `${n || address} <${address}>`
}

/** "Friday, 11 September 2026 at 13:07" — UK long date, Europe/London, 24-hour, as captured. */
export function referenceDate(d: Date, tz = OUTREACH_TZ): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  // 🔴 ASSEMBLED FROM PARTS, NOT FORMATTED WHOLE. en-GB renders "Friday 11 September 2026" with NO comma
  // after the weekday; the captured header has one. A locale string would be silently wrong.
  return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')} at ${get('hour')}:${get('minute')}`
}

export interface QuotedMessage {
  fromAddress: string
  fromName?: string | null
  toAddress: string
  toName?: string | null
  subject: string
  date: Date
  /** The parent's HTML body, exactly as it was sent or as it sits in Sent. */
  html: string
  /** The parent's plain body, when there is one. */
  text?: string | null
}

/**
 * Outlook's reference block: a rule, a bolded four-line header, then the parent's body.
 * The class names are Outlook's own and are part of what makes a reply LOOK like a reply in its client.
 */
export function referenceBlockHtml(q: QuotedMessage): string {
  const header =
    `<b>From: </b>${escapeHtml(quoteAddress(q.fromAddress, q.fromName))}<br>` +
    `<b>Date: </b>${escapeHtml(referenceDate(q.date))}<br>` +
    `<b>To: </b>${escapeHtml(quoteAddress(q.toAddress, q.toName))}<br>` +
    `<b>Subject: </b>${escapeHtml(q.subject)}<br><br>`
  return [
    div(P_STYLE, '<br>'),
    '<div id="mail-editor-reference-message-container">',
    `<div style="${QUOTE_RULE_STYLE}">`,
    header,
    '</div>',
    '<div id="mail-editor-reference-message-body">',
    q.html,
    '</div>',
    '</div>',
  ].join('')
}

/** The plain-text equivalent of the quote block. */
export function referenceBlockText(q: QuotedMessage): string {
  return [
    '',
    `From: ${quoteAddress(q.fromAddress, q.fromName)}`,
    `Date: ${referenceDate(q.date)}`,
    `To: ${quoteAddress(q.toAddress, q.toName)}`,
    `Subject: ${q.subject}`,
    '',
    (q.text ?? '').trim(),
  ].join('\n')
}

/**
 * "Re: " + the parent's subject with any existing reply/forward prefixes stripped.
 * 🔴 STRIPPED REPEATEDLY, NOT ONCE. A thread that has been round twice carries `RE: FW: RE:`, and a
 * single strip would produce `Re: RE: FW: …`.
 */
export function replySubject(parentSubject: string): string {
  let s = (parentSubject ?? '').trim()
  for (;;) {
    const next = s.replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')
    if (next === s) break
    s = next
  }
  return `Re: ${s}`
}

/** A Message-ID this app owns. The domain is ours, so a bounce or a thread can be traced to us. */
export function newMessageId(random: () => string = () => cryptoRandom()): string {
  return `<${random()}@hatchgrab.com>`
}
function cryptoRandom(): string {
  // Node's webcrypto is available in the Node runtime; a UUID is plenty of entropy for a Message-ID.
  return globalThis.crypto.randomUUID().replace(/-/g, '')
}

export interface BuiltMessage {
  subject: string
  html: string
  text: string
  messageId: string
  inReplyTo: string | null
  references: string | null
}

export interface BuildInput {
  /** The edited body, exactly as the compose window shows it. */
  body: string
  /** The template's subject — used only when this is NOT a reply. */
  subject: string
  messageId: string
  /** The signature and opt-out rows this body's tokens need. Read by the route, never by this module. */
  settings: SendTimeValues
  /** Absent ⇒ a first contact: a new thread with the template's own subject. */
  parent?: {
    messageId: string
    references: string | null
    quoted: QuotedMessage
  } | null
}

/**
 * The whole message, both parts.
 * 🔴 A REPLY IS A REPLY IN THREE PLACES AT ONCE — the subject, `In-Reply-To`, and `References`. A client
 * that threads on any one of them must agree with the other two, or the chase appears as a new
 * conversation in the prospect's inbox and the whole point of chasing in-thread is lost.
 */
export function buildMessage(input: BuildInput): BuiltMessage {
  // 🔴 THE BODY IS EXPANDED, NOT DECORATED. `expandBody` turns `{{signature}}` and `{{opt_out}}` lines
  // into their blocks IN PLACE and leaves everything else exactly where the operator put it. Nothing
  // is appended here — see the note where `signatureHtml()` used to be.
  const { html: bodyH, text: bodyT } = expandBody(input.body, input.settings)
  if (!input.parent) {
    return {
      subject: input.subject,
      html: bodyH,
      text: `${bodyT}\n`,
      messageId: input.messageId,
      inReplyTo: null,
      references: null,
    }
  }
  const q = input.parent.quoted
  // The chain is the parent's own chain plus the parent. Space-separated, as the header stores it.
  const chain = [input.parent.references, input.parent.messageId].filter(Boolean).join(' ').trim()
  return {
    subject: replySubject(q.subject),
    html: bodyH + referenceBlockHtml(q),
    text: `${bodyT}\n${referenceBlockText(q)}\n`,
    messageId: input.messageId,
    inReplyTo: input.parent.messageId,
    references: chain || null,
  }
}

/**
 * 🔴 THE ONLY HEADERS THIS APP PUTS ON AN OUTREACH EMAIL.
 * No `X-Mailer`, no `List-Unsubscribe`, no `Precedence`, no tracking pixel, no rewritten links. Every one
 * of those is a marker that says "bulk", and the whole premise is that these are the same personal emails
 * Dominic was sending by hand. The opt-out is a sentence asking for a reply, not a header.
 */
export const ALLOWED_HEADERS = [
  'from', 'to', 'subject', 'date', 'message-id', 'mime-version', 'content-type',
  'content-transfer-encoding', 'in-reply-to', 'references',
] as const

/** Header names present in a raw message that are NOT on the allow-list. Empty is the only passing state. */
export function disallowedHeaders(raw: string): string[] {
  const head = raw.replace(/\r\n/g, '\n').split('\n\n')[0] ?? ''
  const names: string[] = []
  for (const line of head.split('\n')) {
    if (!line || /^[ \t]/.test(line)) continue
    const i = line.indexOf(':')
    if (i <= 0) continue
    const name = line.slice(0, i).trim().toLowerCase()
    if (!(ALLOWED_HEADERS as readonly string[]).includes(name) && !names.includes(name)) names.push(name)
  }
  return names
}

/** The From header value: a bare address when there is no display name. */
export function fromHeader(): string {
  const n = OUTREACH_FROM_NAME.trim()
  return n ? `${n} <${OUTREACH_FROM_ADDRESS}>` : OUTREACH_FROM_ADDRESS
}

/* `londonDay` WAS HERE. It existed only to bound the daily cap's window, and the cap is gone. */

// ── 🔴 DID IT FAIL, OR DO WE NOT KNOW? ──────────────────────────────────────────────────────────────
// The most dangerous outcome of a send is not a failure — it is an UNKNOWN treated as a failure and then
// retried, which sends a prospect the same email twice. So the two are separated by the shape of the
// error, and the uncertain case is never retried without a human saying so.
//
//   FAILED    — the server said no, or was never reached: a connect failure, a DNS failure, an auth
//               failure, a rejected envelope or message, or ANY 4xx/5xx reply including one that arrives
//               after the data. In every one of these the server has told us it did not accept the mail.
//   UNCERTAIN — the data was handed over and nothing came back: a socket that dropped or a read that
//               timed out mid-conversation. The message may well have been delivered.
//
// ⚠️ THE DEFAULT IS UNCERTAIN, NOT FAILED. An error shape nobody anticipated must land on the cautious
// side: worst case an operator checks a Sent folder they did not need to.
const DEFINITE_FAILURE_CODES = new Set([
  'EAUTH',        // credentials refused
  'ECONNECTION',  // could not open the connection
  'EDNS',         // the host did not resolve
  'EENVELOPE',    // the server rejected MAIL FROM / RCPT TO
  'EMESSAGE',     // the server rejected the message outright
])

export type SendOutcome = 'failed' | 'uncertain'

export function classifySendFailure(err: unknown): SendOutcome {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown }
  // A numeric reply code means the server SPOKE. Whatever it said, it is an answer.
  if (typeof e.responseCode === 'number' && e.responseCode >= 400) return 'failed'
  if (typeof e.code === 'string' && DEFINITE_FAILURE_CODES.has(e.code)) return 'failed'
  return 'uncertain'
}
