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

/** The paragraph style, exactly as captured. Used for body paragraphs, spacers and the signature lines. */
const P_STYLE = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);'
/** The opt-out line sits at the browser's own 10pt equivalent, which is what Outlook emitted. */
const OPTOUT_STYLE = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 13.333333px; color: rgb(0, 0, 0);'
/** The rule above a quoted message. Captured verbatim, `currentcolor` and all. */
const QUOTE_RULE_STYLE = 'padding: 3pt 0in 0in; border-width: 1pt medium medium; border-style: solid none none; border-color: rgb(181, 196, 223) currentcolor currentcolor;'

/** ⚠️ APPROVED WORDING. The reply route is the opt-out: no link, nothing to click, nothing to track. */
export const OPTOUT_SENTENCE =
  'If you would rather not hear from me again, reply with "no thanks" and I will not contact you.'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const div = (style: string, inner: string) => `<div style="${style}">${inner}</div>`

/**
 * The signature, as captured.
 *
 * 🔴 THE ORDER AND THE EMPTY DIVS ARE THE FORMAT. Outlook's spacing is not CSS margins — it is literal
 * empty divs, and two of them are `direction: ltr` wrappers around a bold `<br>`. Collapsing them into
 * one, or replacing them with a margin, changes the rendered gap in every client.
 * ⚠️ NO LINKS. `hatchgrab.com | villagefoodie.co.uk` is plain text in the captured mail, and an `<a>`
 * here would both look different and give a spam filter something to score.
 */
export function signatureHtml(): string {
  return [
    div(P_STYLE, 'Kind regards,'),
    div(P_STYLE, 'Dominic'),
    '<div style="direction: ltr;"><b><br></b></div>',
    '<div style="direction: ltr;"><b><br></b></div>',
    '<div><b>Dominic Bonini</b></div>',
    div(P_STYLE, 'Founder, HatchGrab'),
    div(P_STYLE, 'hatchgrab.com | villagefoodie.co.uk'),
    div(P_STYLE, '07941 042 253'),
    div(P_STYLE, '<br>'),
    div(P_STYLE, '<br>'),
    div(OPTOUT_STYLE, escapeHtml(OPTOUT_SENTENCE)),
  ].join('')
}

/** The same signature as text, for the text/plain part. Blank lines where the empty divs are. */
export function signatureText(): string {
  return [
    'Kind regards,', 'Dominic', '', '',
    'Dominic Bonini', 'Founder, HatchGrab', 'hatchgrab.com | villagefoodie.co.uk', '07941 042 253',
    '', '', OPTOUT_SENTENCE,
  ].join('\n')
}

/**
 * The editable body → the captured paragraph divs.
 * A single `<br>` in the template is a line break INSIDE a paragraph; a blank line starts a new one, and
 * the gap between paragraphs is an empty div of the same style — Outlook's own shape, not a margin.
 * Substituted values are escaped: a truck called `Bill & Ben's` must not become markup.
 */
export function bodyHtml(body: string): string {
  const paragraphs = body.replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const out: string[] = []
  paragraphs.forEach((p, i) => {
    if (i > 0) out.push(div(P_STYLE, '<br>'))
    out.push(div(P_STYLE, escapeHtml(p).replace(/\n/g, '<br>')))
  })
  return out.join('')
}

/** The same content as text/plain: paragraphs separated by a blank line. */
export function bodyText(body: string): string {
  return body.replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).join('\n\n')
}

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
  const sig = signatureHtml()
  const sigText = signatureText()
  if (!input.parent) {
    return {
      subject: input.subject,
      html: bodyHtml(input.body) + sig,
      text: `${bodyText(input.body)}\n\n${sigText}\n`,
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
    html: bodyHtml(input.body) + sig + referenceBlockHtml(q),
    text: `${bodyText(input.body)}\n\n${sigText}\n${referenceBlockText(q)}\n`,
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

/** The Europe/London calendar day of an instant, as `YYYY-MM-DD` — what the daily cap counts within. */
export function londonDay(d: Date, tz = OUTREACH_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

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
