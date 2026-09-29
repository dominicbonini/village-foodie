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
/** 🔴 THE THIRD AND LAST KEY THIS FEATURE OWNS. The settings route writes these three and no others. */
export const FROM_NAME_KEY = 'from_name'

/* 🔴 THE SEND-TIME TOKEN MACHINERY WAS HERE AND IS GONE (29 September 2026, later the same day).
 * `SEND_TIME_TOKENS`, `isSendTimeToken`, `sendTimeTokensIn`, `expandBody`, `expandToPlainText`,
 * `missingSettingsFor`, `stripHtmlToText` and `sendWarnings` all existed because the compose box was a
 * plain textarea: it could not show bold or 10pt, so `{{signature}}` and `{{opt_out}}` had to survive
 * as literal tokens and be expanded by the SERVER at send time.
 *
 * The box is a rich editor now. The tokens are expanded the moment a template is chosen
 * (`lib/outreach-doc.ts#docFromTemplateText`), the result is editable like any other part of the
 * message, and the server expands nothing — it converts the document it is given. So this code had no
 * caller left, and it was deleted rather than kept "in case": a second way to turn a body into email
 * HTML is exactly the thing that drifts from the first one.
 *
 * ⚠️ WHAT STAYED, AND WHY: the parsers and the two renderers below. `parseSignature`, `parseOptOut`
 * and `parseFromName` are how the settings rows are read by everything that reads them, and
 * `signatureBlockHtml` / `optOutHtml` draw the Signature panel's preview. `lib/outreach-doc.ts` owns
 * the email itself and produces byte-identical markup — the harness asserts that equality against the
 * output verified in Dominic's inbox. */

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

/**
 * The sender's display name.
 * ⚠️ AN EMPTY OR MISSING NAME IS `null`, NOT AN ERROR — the send falls back to the bare address, which
 * is what it did before this setting existed. Only the SETTINGS ROUTE cares whether it was saveable.
 */
export function parseFromName(value: unknown): string | null {
  const v = value as { text?: unknown } | null
  if (!v || typeof v.text !== 'string') return null
  return v.text.trim() || null
}

export function parseOptOut(value: unknown): OptOutSettings | null {
  const v = value as { text?: unknown } | null
  if (!v || typeof v.text !== 'string' || !v.text.trim()) return null
  return { text: v.text }
}

// ── EXPANSION ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The two parsed rows, as the settings reader hands them around.
 * ⚠️ The SEND no longer takes this — it takes a document and a display name. This is what the compose
 * window loads to fill the Insert buttons and to expand a template's tokens into the editor.
 */
export interface SendTimeValues {
  signature: SignatureSettings | null
  optOut: OptOutSettings | null
}
