// lib/outreach-signature.ts — the signature and the opt-out line, as DATA, and the two send-time
// tokens that place them.
//
// 🔴 WHY THIS IS NOT MARKUP IN A FILE ANY MORE. The signature was `signatureHtml()` in
// `lib/outreach-mail-message.ts`: a transcription of the captured Outlook block, appended to EVERY
// message automatically. Two things were wrong with that by 29 September:
//   • Dominic could not change a line of it without a deploy, and
//   • being appended automatically, it could not be placed. There was no way to write a message that
//     ended before the sign-off, or to put the opt-out anywhere but last.
// So the lines live in `outreach_settings` and the templates place them with `{{signature}}` and
// `{{opt_out}}`. 🔴 NOTHING IS APPENDED AUTOMATICALLY ANY MORE. A message with no `{{signature}}` goes
// out with no signature — the compose window warns, and a warning is the correct strength, because
// "send this exact text" is a thing an operator is allowed to mean.
//
// ⚠️ THE 12pt RULE, AND THE BUG IT FIXES. In the received email "Dominic Bonini" rendered SMALLER than
// every other line, because the captured block wrapped it in `<div><b>…</b></div>` with no style at
// all, so it inherited the mail client's own default. A bold line is now a `<b>` INSIDE the styled div,
// never a div of its own. See `signatureLineHtml`.
//
// Pure: no network, no database, no client. The route reads the rows and hands them here.

/** The paragraph style, exactly as captured from the real Sent folder. */
export const SIG_P_STYLE = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);'
/** 10pt, expressed the way the captured mail expressed it. The opt-out line only. */
export const SIG_OPTOUT_STYLE = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 13.333333px; color: rgb(0, 0, 0);'

/** One line of the signature. An empty `text` is a deliberate blank line, not a missing value. */
export interface SignatureLine { text: string; bold: boolean }
export interface SignatureSettings { lines: SignatureLine[] }
export interface OptOutSettings { text: string }

/** The two keys in `outreach_settings` this feature owns. Nothing else in that table is touched. */
export const SIGNATURE_KEY = 'signature'
export const OPT_OUT_KEY = 'opt_out'

/**
 * 🔴 THE SEND-TIME TOKENS. They are NOT resolved by `lib/outreach-template-render.ts` when the compose
 * box is filled — they survive into the text box as literal `{{signature}}` and `{{opt_out}}` and are
 * expanded only when the message is built. Two reasons, and the second is the important one:
 *   • the box would otherwise show eleven lines of signature the operator cannot usefully edit, and
 *   • the signature would then be EDITABLE TEXT in the box, so an accidental edit — or a trimmed
 *     paragraph — would change the opt-out line, which is a legal line under PECR. A token cannot be
 *     half-deleted: it is there or it is not, and the window says which.
 */
export const SEND_TIME_TOKENS = [SIGNATURE_KEY, OPT_OUT_KEY] as const
export type SendTimeToken = (typeof SEND_TIME_TOKENS)[number]

export function isSendTimeToken(name: string): name is SendTimeToken {
  return (SEND_TIME_TOKENS as readonly string[]).includes(name)
}

/** A line of the body that is nothing but one of these tokens. Leading/trailing space is allowed. */
const TOKEN_LINE_RE = /^\s*\{\{\s*(signature|opt_out)\s*\}\}\s*$/

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const div = (style: string, inner: string) => `<div style="${style}">${inner}</div>`

/**
 * One signature line.
 * 🔴 THE `<b>` IS INSIDE THE STYLED DIV. `<div><b>Dominic Bonini</b></div>` — the captured shape — has
 * no font size, so the client picks one, and in the email Dominic received that line came out visibly
 * smaller than the rest. Bold is a property of the text, not a reason to drop the style.
 */
export function signatureLineHtml(line: SignatureLine): string {
  const inner = line.text.trim() === '' ? '<br>' : escapeHtml(line.text)
  return div(SIG_P_STYLE, line.bold ? `<b>${inner}</b>` : inner)
}

export function signatureBlockHtml(sig: SignatureSettings): string {
  return sig.lines.map(signatureLineHtml).join('')
}

/** The same lines as plain text. A blank line stays a blank line. */
export function signatureBlockText(sig: SignatureSettings): string {
  return sig.lines.map(l => l.text).join('\n')
}

export function optOutHtml(o: OptOutSettings): string {
  return div(SIG_OPTOUT_STYLE, escapeHtml(o.text))
}
export function optOutText(o: OptOutSettings): string {
  return o.text
}

// ── PARSING WHAT CAME OUT OF THE TABLE ──────────────────────────────────────────────────────────────
// ⚠️ `value` IS `jsonb`, SO IT CAN BE ANYTHING. These parse defensively and report failure rather than
// throwing inside a send: a malformed row must refuse the send with a sentence, not 500 the route.

export function parseSignature(value: unknown): SignatureSettings | null {
  const v = value as { lines?: unknown } | null
  if (!v || !Array.isArray(v.lines)) return null
  const lines: SignatureLine[] = []
  for (const raw of v.lines) {
    const l = raw as { text?: unknown; bold?: unknown }
    if (!l || typeof l.text !== 'string') return null
    lines.push({ text: l.text, bold: l.bold === true })
  }
  return { lines }
}

export function parseOptOut(value: unknown): OptOutSettings | null {
  const v = value as { text?: unknown } | null
  if (!v || typeof v.text !== 'string' || !v.text.trim()) return null
  return { text: v.text }
}

// ── EXPANSION ───────────────────────────────────────────────────────────────────────────────────────

/** Which send-time tokens a body actually uses, so a send only needs the rows it will read. */
export function sendTimeTokensIn(body: string): SendTimeToken[] {
  const out: SendTimeToken[] = []
  for (const line of String(body ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(TOKEN_LINE_RE)
    if (m && !out.includes(m[1] as SendTimeToken)) out.push(m[1] as SendTimeToken)
  }
  return out
}

export interface SendTimeValues {
  signature: SignatureSettings | null
  optOut: OptOutSettings | null
}

/**
 * Split a paragraph's lines into runs: prose, and token lines standing on their own.
 * 🔴 A TOKEN IS A BLOCK, NOT A WORD. `{{signature}}` in the middle of a sentence is not supported and
 * is left alone — it would have to be inlined into a `<div>` that already has a style, and a
 * nine-line signature inside a sentence is not a thing anyone means.
 */
function runsOf(paragraph: string): ({ token: SendTimeToken } | { lines: string[] })[] {
  const out: ({ token: SendTimeToken } | { lines: string[] })[] = []
  let buf: string[] = []
  const flush = () => { if (buf.length) { out.push({ lines: buf }); buf = [] } }
  for (const line of paragraph.split('\n')) {
    const m = line.match(TOKEN_LINE_RE)
    if (m) { flush(); out.push({ token: m[1] as SendTimeToken }) } else buf.push(line)
  }
  flush()
  return out
}

/**
 * 🔴 `<br>` TYPED IN A TEMPLATE IS A LINE BREAK, NOT FOUR CHARACTERS TO SHOW THE PROSPECT.
 * `escapeHtml` turned a typed `<br><br>` into a visible `&lt;br&gt;&lt;br&gt;`, and the text part
 * carried the tags verbatim — which is exactly what the last test send did. Everything else is still
 * escaped, so a truck called `Bill & Ben's <Truck>` cannot become markup.
 */
const BR_RE = /<br\s*\/?>/gi
function proseToHtml(lines: string[]): string {
  return lines.map(l => escapeHtml(l).replace(/&lt;br\s*\/?&gt;/gi, '<br>')).join('<br>')
}

/**
 * The text/plain equivalent: NO HTML AT ALL.
 * `<br>` becomes a line break, any other tag-like span is dropped, and entities are decoded last.
 * ⚠️ DECODING IS LAST ON PURPOSE. Decoding first would turn a literal `&lt;b&gt;` — text a template
 * meant to SHOW — into a tag and then delete it.
 */
export function stripHtmlToText(s: string): string {
  return decodeEntities(
    String(s ?? '')
      .replace(BR_RE, '\n')
      // A tag-like span only: `<` followed by a letter or `/`. `price < £5` is prose and survives.
      .replace(/<\/?[a-zA-Z][^>]*>/g, ''),
  )
}
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // 🔴 `&amp;` LAST, or `&amp;lt;` would decode twice and produce a `<` the text never had.
    .replace(/&amp;/g, '&')
}

/**
 * The body, expanded to the two parts.
 *
 * The paragraph model is unchanged: paragraphs split on a blank line, one empty styled div between
 * them, internal newlines as `<br>`. A token line is a block inside that model, so the spacing around
 * a signature is whatever the template's blank lines say it is — which is the point of placing it.
 */
export function expandBody(body: string, values: SendTimeValues): { html: string; text: string } {
  const src = String(body ?? '').replace(/\r\n/g, '\n')
  const paragraphs = src.split(/\n{2,}/).map(p => p.replace(/[ \t]+$/gm, '')).filter(p => p.trim() !== '')
  const htmlOut: string[] = []
  const textOut: string[] = []
  paragraphs.forEach((p, i) => {
    if (i > 0) htmlOut.push(div(SIG_P_STYLE, '<br>'))
    const hParts: string[] = []
    const tParts: string[] = []
    for (const run of runsOf(p)) {
      if ('token' in run) {
        if (run.token === SIGNATURE_KEY && values.signature) {
          hParts.push(signatureBlockHtml(values.signature))
          tParts.push(signatureBlockText(values.signature))
        } else if (run.token === OPT_OUT_KEY && values.optOut) {
          hParts.push(optOutHtml(values.optOut))
          tParts.push(optOutText(values.optOut))
        }
        // A token whose settings row is missing expands to NOTHING here. The caller refuses the send
        // before reaching this point — see `missingSettingsFor` — so this branch is unreachable in a
        // send and exists only so a preview cannot throw.
      } else {
        const lines = run.lines.filter((l, idx, arr) => !(l.trim() === '' && (idx === 0 || idx === arr.length - 1)))
        if (!lines.length) continue
        hParts.push(div(SIG_P_STYLE, proseToHtml(lines)))
        tParts.push(stripHtmlToText(lines.join('\n')))
      }
    }
    htmlOut.push(hParts.join(''))
    textOut.push(tParts.join('\n'))
  })
  return { html: htmlOut.join(''), text: textOut.join('\n\n') }
}

/** The same expansion as PLAIN TEXT ONLY — what Copy and the contact log get. */
export function expandToPlainText(body: string, values: SendTimeValues): string {
  return expandBody(body, values).text
}

/**
 * Which rows a body needs but has not got.
 * 🔴 A MISSING SETTINGS ROW IS A REFUSAL, NOT A BLANK. A template that says `{{opt_out}}` is asserting
 * that the email carries an opt-out line; sending it with the token silently expanding to nothing
 * would send an outreach email without one and record no sign of it.
 */
export function missingSettingsFor(body: string, values: SendTimeValues): SendTimeToken[] {
  return sendTimeTokensIn(body).filter(t =>
    (t === SIGNATURE_KEY && !values.signature) || (t === OPT_OUT_KEY && !values.optOut))
}

// ── THE WARNINGS THE COMPOSE WINDOW SHOWS ───────────────────────────────────────────────────────────
/** The four outreach rungs. An email on one of these is a cold approach and wants an opt-out line. */
const LADDER_KINDS = new Set(['1_first_contact', '2_chase_1', '3_chase_2', '4_final_chase'])

/**
 * ⚠️ WARNINGS, NOT REFUSALS, AND DELIBERATELY SO. Nothing in the codebase can know that a particular
 * message is an outreach approach rather than a reply to a question — `kind` is the operator's own
 * word for it. A refusal would be wrong for the second case and would train him to work around it.
 * A sentence under the buttons, repeated in the Send confirm, is the correct strength.
 */
export function sendWarnings(body: string, kind: string | null): string[] {
  const has = sendTimeTokensIn(body)
  const out: string[] = []
  if (!has.includes(SIGNATURE_KEY)) {
    out.push('No {{signature}} in this message — it will go without your signature.')
  }
  if (kind && LADDER_KINDS.has(kind) && !has.includes(OPT_OUT_KEY)) {
    out.push('This outreach email has no {{opt_out}} line.')
  }
  return out
}
