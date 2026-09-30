// lib/outreach-quote-split.ts — showing the NEW part of an email first.
//
// 🔴 THE PROBLEM THIS SOLVES. A reply in a thread that has been round four times is four emails long,
// and the three words that matter are at the top. Opening one used to mean a 320px window onto a
// wall of quoted history. This finds where the new text ends and the quoted history begins, so the
// reply can be shown at full length with the rest behind "Show quoted text".
//
// 🔴 BEST-EFFORT, AND THE FALLBACK IS THE WHOLE EMAIL. There is no standard for this — every client
// marks a quote differently and some mark it not at all — so a split point that is not found means
// the email is shown entire. ⚠️ THE FAILURE TO AVOID IS HIDING SOMETHING: a wrong split that put new
// text behind "Show quoted text" would lose a sentence the prospect wrote. Every marker below is
// therefore one a client writes at the START of its quote block and nowhere else.
//
// Pure: no DOM, no network. `scripts/outreach-workspace-v2.cjs` proves every marker.

/**
 * The markers, in the order they are searched for — most specific first.
 * 🔴 EACH ONE IS A CLIENT'S OWN, MEASURED FROM REAL MAIL:
 *   `divRplyFwdMsg`          — Outlook.com / Outlook 365 wrap their quote in this exact id.
 *   `mail-editor-reference-message-container` — OUR OWN block, from `referenceBlockHtml`. A reply to
 *                              a reply of ours quotes it back, and we know exactly what it looks like.
 *   `gmail_quote`            — Gmail's class, on the div holding the quoted message.
 *   `blockquote type="cite"` — Apple Mail and Thunderbird.
 * ⚠️ THE OUTLOOK RULE-LINE IS LAST AND IS THE LOOSEST. Outlook desktop writes a bordered div holding
 * a bolded `From:` header instead of an id, so it is matched by BOTH of those together — the border
 * alone appears in ordinary signatures.
 */
export const QUOTE_MARKERS = [
  'divRplyFwdMsg',
  'mail-editor-reference-message-container',
  'gmail_quote',
  'blockquote-cite',
  'outlook-rule-line',
] as const
export type QuoteMarker = (typeof QUOTE_MARKERS)[number]

export interface SplitQuote {
  /** What was newly written. The whole email when no split point was found. */
  main: string
  /** The quoted history, or null when there is none to hide. */
  quoted: string | null
  /** Which marker split it. Null when nothing did. Reported so a wrong split is diagnosable. */
  marker: QuoteMarker | null
}

/** The index at which each marker's block starts, or -1. */
function markerIndex(html: string, marker: QuoteMarker): number {
  const lower = html.toLowerCase()
  switch (marker) {
    case 'divRplyFwdMsg':
      return indexOfTagStart(html, lower, 'divrplyfwdmsg')
    case 'mail-editor-reference-message-container':
      return indexOfTagStart(html, lower, 'mail-editor-reference-message-container')
    case 'gmail_quote':
      return indexOfTagStart(html, lower, 'gmail_quote')
    case 'blockquote-cite': {
      const m = /<blockquote[^>]*type\s*=\s*["']?cite["']?/i.exec(html)
      return m ? m.index : -1
    }
    case 'outlook-rule-line': {
      // 🔴 TWO SIGNALS TOGETHER, NEVER ONE. A top border alone is an ordinary divider; a bolded
      // `From:` alone appears in forwarded text. The quote block is the div that has both, with the
      // `From:` inside the first 400 characters after the border.
      const re = /<div[^>]*border-(?:top|width)[^>]*>/gi
      let m: RegExpExecArray | null
      while ((m = re.exec(html))) {
        const after = html.slice(m.index, m.index + 400)
        if (/<b>\s*from:?\s*<\/b>|<b>\s*from:\s/i.test(after)) return m.index
      }
      return -1
    }
    default:
      return -1
  }
}

/** The start of the TAG that carries this id or class, not the position of the word itself. */
function indexOfTagStart(html: string, lower: string, needle: string): number {
  const at = lower.indexOf(needle)
  if (at < 0) return -1
  const open = html.lastIndexOf('<', at)
  return open < 0 ? -1 : open
}

/**
 * Split an email into what is new and what is quoted.
 * ⚠️ THE EARLIEST MARKER WINS. A thread can carry two clients' quote blocks — ours inside theirs —
 * and the new text ends at the first of them.
 * ⚠️ AND A SPLIT AT POSITION ZERO IS NOT A SPLIT. An email that is nothing but a quote has no new
 * part to show, so it is returned whole rather than as an empty message with a "show more" link.
 */
export function splitQuotedHtml(html: string | null | undefined): SplitQuote {
  const s = String(html ?? '')
  if (!s.trim()) return { main: s, quoted: null, marker: null }

  let bestAt = -1
  let bestMarker: QuoteMarker | null = null
  for (const marker of QUOTE_MARKERS) {
    const at = markerIndex(s, marker)
    if (at > 0 && (bestAt < 0 || at < bestAt)) { bestAt = at; bestMarker = marker }
  }
  if (bestAt <= 0 || !bestMarker) return { main: s, quoted: null, marker: null }

  const main = s.slice(0, bestAt)
  // ⚠️ A "new part" of nothing but whitespace and empty divs is not a new part.
  if (!textOf(main).trim()) return { main: s, quoted: null, marker: null }
  return { main, quoted: s.slice(bestAt), marker: bestMarker }
}

/** Tags out, entities left alone — only used to ask "is there anything here". */
const textOf = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
