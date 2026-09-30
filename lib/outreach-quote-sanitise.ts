// lib/outreach-quote-sanitise.ts — making somebody else's HTML safe to put inside an email WE send.
//
// 🔴 THIS IS A DIFFERENT PROBLEM FROM THE ONE `sandbox=""` SOLVES, AND THAT IS WHY IT EXISTS.
// Everywhere else in outreach, mailbox HTML is rendered in a sandboxed iframe: the browser refuses to
// run it, so it does not matter what it contains. A reply is the one place the prospect's own markup
// is copied into a message that goes OUT under Dominic's name and address — into their inbox, their
// colleagues' inboxes when they forward it, and their mail archive. The iframe cannot help there.
//
// 🔴 A BLOCKLIST IS THE WRONG SHAPE OF DEFENCE FOR MARKUP WE AUTHOR, AND `lib/outreach-doc.ts` SAYS SO
// AT LENGTH — which is why the message body is a validated document and the server generates every
// byte of it. This is the other case: the quoted history is markup somebody else authored and the
// whole point is to reproduce it. It cannot be regenerated from a schema, so it is cleaned, and the
// list of what is removed is written down here rather than being implied by a library's defaults.
//
// ⚠️ WHAT THIS IS NOT. It is not a general-purpose HTML sanitiser and must not be used as one. It
// removes the things that execute, fetch or submit inside a mail client; it leaves presentation alone,
// deliberately, because the quoted email has to still look like the email it is quoting.
//
// Pure: no DOM, no network. `scripts/outreach-reply-attach.cjs` proves every rule below.

/**
 * Elements removed WITH THEIR CONTENT.
 * 🔴 EACH ONE IS HERE FOR A REASON, NOT FOR COMPLETENESS:
 *   script            — executes. Outlook will not run it; a webmail client reading the forwarded copy
 *                       might, and it is our From address on the message.
 *   style             — a stylesheet inherited from someone else's email can restyle OUR words above
 *                       it. `position`/`display:none` in a quoted block can hide the reply entirely.
 *   meta, base, link  — `base` re-points every relative URL in the message; `meta refresh` navigates;
 *                       `link` pulls a remote stylesheet, which is a tracking beacon at minimum.
 *   iframe, object, embed — remote or active content inside a message we are signing.
 *   form              — a form inside an email we sent, posting wherever its author chose, under our
 *                       name. This is the phishing shape, and it is the one that would do real harm.
 */
export const STRIPPED_ELEMENTS = [
  'script', 'style', 'meta', 'link', 'base', 'iframe', 'object', 'embed', 'form',
] as const

/** Void-ish elements that may appear without a closing tag; removed as single tags too. */
const SELF_CLOSING = new Set(['meta', 'link', 'base'])

/**
 * The body's inner HTML, when the input is a whole document.
 * ⚠️ A QUOTED EMAIL IS USUALLY A WHOLE DOCUMENT — `<html><head>…<body>`. Embedding that inside our
 * message would nest a second `<head>` in the middle of a `<div>`, which clients render
 * unpredictably: some drop everything after it. Taking the body's contents is what makes the quote a
 * fragment. ⚠️ AND IT IS TAKEN BEFORE ANYTHING IS STRIPPED, so a `<style>` in the head disappears with
 * the head rather than having to be matched.
 */
export function bodyInnerHtml(html: string): string {
  const s = String(html ?? '')
  const open = /<body\b[^>]*>/i.exec(s)
  if (!open) return s
  const start = open.index + open[0].length
  const close = s.toLowerCase().lastIndexOf('</body>')
  return close > start ? s.slice(start, close) : s.slice(start)
}

/**
 * Sanitise a quoted email for embedding in an outgoing message.
 *
 * 🔴 THE ORDER MATTERS. Elements go first (so an `on*` attribute inside a removed `<script>` is never
 * examined), then attributes, then URL schemes. Each pass is applied REPEATEDLY until it stops
 * changing the string, because one removal can reveal another — `<scr<script>ipt>` is the classic
 * case, and a single pass would leave a working tag behind.
 */
export function sanitiseQuotedHtml(html: string | null | undefined): string {
  let s = bodyInnerHtml(String(html ?? ''))
  s = stripComments(s)
  s = stripElements(s)
  s = stripEventAttributes(s)
  s = stripJavascriptUrls(s)
  return s
}

/** Conditional comments can carry markup for Outlook specifically; the whole comment goes. */
function stripComments(s: string): string {
  return repeatUntilStable(s, x => x.replace(/<!--[\s\S]*?-->/g, ''))
}

function stripElements(s: string): string {
  return repeatUntilStable(s, x => {
    let out = x
    for (const tag of STRIPPED_ELEMENTS) {
      // With content, closing tag optional at the end of the string.
      out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:</${tag}\\s*>|$)`, 'gi'), '')
      // And the bare tag, for the ones that legitimately have no closing tag.
      if (SELF_CLOSING.has(tag)) out = out.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '')
    }
    return out
  })
}

/**
 * Every `on*` handler attribute, quoted or bare.
 * ⚠️ IT MATCHES INSIDE TAGS ONLY — the pattern requires the attribute to be preceded by whitespace and
 * followed by `=`, so the words "online" or "on Monday" in the prose are untouched.
 */
function stripEventAttributes(s: string): string {
  return repeatUntilStable(s, x => x.replace(
    /(<[^>]*?)\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '$1'))
}

/**
 * `javascript:` in any attribute value, however it is spelled.
 * 🔴 THE SPELLINGS ARE THE POINT. `java\tscript:`, `JaVaScRiPt:`, and entity forms (`&#106;avascript:`)
 * all reach the same place in a permissive client, so the value is DECODED and de-whitespaced before
 * the test, and an attribute that matches is dropped entirely rather than blanked — an `href` with no
 * value is inert, and leaving `href=""` would turn a link into one that reloads the page it is in.
 */
function stripJavascriptUrls(s: string): string {
  return repeatUntilStable(s, x => x.replace(
    /(<[^>]*?)\s([a-z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (whole, before: string, name: string, _raw: string, dq?: string, sq?: string, bare?: string) => {
      const value = dq ?? sq ?? bare ?? ''
      return looksLikeScriptUrl(value) ? before : whole
    }))
}

/** True when a decoded attribute value is a script URL. Shared with the harness. */
export function looksLikeScriptUrl(value: string): boolean {
  const decoded = decodeEntities(String(value ?? ''))
    .replace(/[\s\u0000-\u001f]/g, '')
    .toLowerCase()
  return decoded.startsWith('javascript:') || decoded.startsWith('vbscript:') || decoded.startsWith('data:text/html')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d) => safeChar(parseInt(d, 10)))
    .replace(/&amp;/gi, '&')
}
const safeChar = (code: number): string =>
  Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''

/** Apply until the output stops changing, bounded so a pathological input cannot spin. */
function repeatUntilStable(s: string, f: (x: string) => string, limit = 8): string {
  let cur = s
  for (let i = 0; i < limit; i++) {
    const next = f(cur)
    if (next === cur) return cur
    cur = next
  }
  return cur
}
