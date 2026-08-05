// lib/url-normalise.ts
// ONE definition of "turn what an operator typed into a URL, or refuse".
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
// `www.example.com/events` is how a large share of people type a web address, and every URL field in
// the operator console rejected it. The schedule verifier rejected it fastest and worst: the server's
// `if (!url || !url.startsWith('http'))` returned a bare 400, the client's
// `data.reason || (res.status >= 500 ? … : 'unreachable')` mapped a 400 to 'unreachable', and the
// operator was told "Couldn't reach this website" about a site nothing had tried to reach.
//
// The same scheme-less string also silently defeated the Facebook/Instagram block: `isBlockedDomain`
// does `new URL(url).hostname` inside a try/catch that returns FALSE on throw, so `www.facebook.com/x`
// was not recognised as blocked — it was simply unparseable, and the guard failed open.
//
// ⚠️ THE RENDER LAYER ALREADY PATCHED THIS TWICE, INDEPENDENTLY:
//   app/trucks/[slug]/TruckClient.tsx:199 — `href={url.startsWith('http') ? url : `https://${url}`}`
//   app/venues/[slug]/VenueClient.tsx:83  — the same expression again
// Two copies of one fix, applied where the value is DISPLAYED rather than where it is ENTERED. Fixing
// it at the input is what stops a third appearing. (Those two are left alone — they are customer-facing
// render code and still correctly defend against rows stored before this existed.)
//
// 🔴 NEVER GUESSES. A string that is not plausibly a hostname returns null so the caller can say "that
// address doesn't look right", rather than being prefixed with https:// and reported as a network
// failure. Guessing is what produced the original misleading error; doing it more politely would not
// be an improvement.

/**
 * A hostname we are willing to assume, with an optional port. Deliberately conservative:
 *   • two or more dot-separated labels — a bare word is a typo, not a host
 *   • each label is letters/digits/hyphens and cannot start or end with a hyphen
 *   • the last label (the TLD) is at least two LETTERS — so `192.168.0.1` is refused
 *   • an optional numeric :port
 * `@` is absent from the character class on purpose: credentials in a typed URL are not something to
 * silently accept and forward to a scraper.
 *
 * ⚠️ It cannot tell a real TLD from a file extension, so `notes.txt` normalises to
 * `https://notes.txt`. That is an accepted false-accept: the DNS lookup then fails and the operator
 * gets the honest "we couldn't reach this website" — which is true, unlike the old message. Refusing
 * it would mean shipping a TLD list, and being wrong about a NEW TLD is worse than one bad fetch.
 */
const PLAUSIBLE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?$/i

/**
 * Anything of the form `scheme:` at the start. Used to tell "no scheme" from "a scheme we refuse".
 *
 * 🔴 NO DOT IN THE SCHEME CHARACTER CLASS, AND THAT IS DELIBERATE. RFC 3986 permits a dot in a scheme
 * name, but nothing real uses one — while `example.com:8080/events` is a perfectly ordinary address an
 * operator might type. With `.` in the class this pattern matched `example.com:` and the whole thing
 * was refused as "some scheme we don't accept". Caught by testing the helper against a host:port case
 * before shipping it. Excluding the dot keeps every scheme that matters (http, https, ftp, mailto,
 * tel, data, javascript) matching, and lets host:port through to the hostname test where it belongs.
 */
const HAS_SCHEME = /^[a-z][a-z0-9+-]*:/i

/**
 * Normalise an operator-typed web address.
 *
 * - `'  www.example.com/events '` → `'https://www.example.com/events'`
 * - `'example.com/events'`        → `'https://example.com/events'`
 * - `'http://example.com'`        → `'http://example.com'`   (returned EXACTLY as typed, only trimmed)
 * - `'https://example.com'`       → `'https://example.com'`  (likewise)
 * - `'my events page'`            → `null`
 * - `'ftp://example.com'`         → `null`
 * - `''`                          → `null`
 *
 * @returns the URL to use, or null when the input is not plausibly a web address.
 */
export function normaliseUrl(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return null

  // 🔴 http:// and https:// pass through UNCHANGED. An operator who typed a scheme has already made the
  // choice; rewriting http→https would silently change where their request goes, and some schedule
  // pages genuinely are http-only. Default-to-https applies ONLY when there is no scheme to respect.
  if (/^https?:\/\//i.test(raw)) return parseable(raw) ? raw : null

  // Some OTHER scheme (ftp:, mailto:, javascript:, data:) — not a website, and not something to coerce
  // into one. Refused rather than prefixed.
  if (HAS_SCHEME.test(raw)) return null

  // No scheme: this is the `www.example.com/events` case. Take the authority (everything before the
  // first /, ? or #) and require it to look like a host before assuming anything.
  const authority = raw.split(/[/?#]/, 1)[0]
  if (!PLAUSIBLE_HOST.test(authority)) return null

  const candidate = `https://${raw}`
  return parseable(candidate) ? candidate : null
}

// ── V2: THE BLOCKED-DOMAIN GUARD, ONE DEFINITION, FAILING CLOSED ─────────────────────────────────────
// 🔴 THE OLD BEHAVIOUR WAS `catch { return false }` — an unparseable string read as NOT BLOCKED.
// It was written twice, identically, in app/manage/[token]/page.tsx (the setup wizard's Route A and
// Settings' schedule field), and both copies failed OPEN: `new URL('www.facebook.com/x')` throws, the
// catch swallowed it, and the answer came back "not a blocked domain" — not because it had been
// checked and cleared, but because it could not be read at all.
//
// A guard whose error path grants permission is the wrong way round. This one returns TRUE — treated as
// not-permitted — when it cannot tell.
export const SCRAPER_BLOCKED_DOMAINS = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'instagr.am']

/**
 * True when the URL's host is a social page the scraper cannot read — **or when it cannot be parsed at
 * all**, which is the V2 change.
 *
 * ⚠️ THE FAIL-CLOSED BRANCH IS CURRENTLY UNREACHABLE, AND THAT IS WHY IT IS SAFE TO ADD.
 * All three call sites now pass the output of `normaliseUrl`, which returns null for anything that will
 * not parse — so an unparseable string is refused earlier, with the accurate "that doesn't look like a
 * web address" message, and never reaches here. This closes the hole for any FUTURE caller that forgets
 * to normalise first, without changing what any present caller sees.
 */
export function isScraperBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return SCRAPER_BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return true   // cannot read it ⇒ cannot clear it
  }
}

// ── V3: THE DISPLAY-SIDE SIBLING ─────────────────────────────────────────────────────────────────────
// 🔴 A SEPARATE FUNCTION FROM normaliseUrl, DELIBERATELY, BECAUSE REFUSING IS WRONG HERE.
// normaliseUrl returns null for anything not plausibly a hostname — correct when an operator is typing
// and can be told to fix it, and WRONG when rendering a value already in the database. A row stored
// before normalisation existed might hold anything; refusing it would replace a link the customer used
// to see with nothing at all, which is worse than the odd broken link.
//
// This replaces two independent inline copies of the same expression:
//   app/trucks/[slug]/TruckClient.tsx  — href={url.startsWith('http') ? url : `https://${url}`}
//   app/venues/[slug]/VenueClient.tsx  — the same expression again
//
// ⚠️ BYTE-IDENTICAL TO THOSE COPIES, ON PURPOSE — `startsWith('http')` and not a stricter regex, and NO
// trim. Both were considered and rejected: `/^https?:\/\//` would newly prefix a value beginning
// "httpx…", and trimming would change the href for a value stored with leading whitespace. Both would
// be improvements in isolation and both would be behaviour changes on a customer-facing page, which V3
// forbids. Fix the stored values if they matter, not the renderer.
export function hrefFromStoredUrl(value: string | null | undefined): string {
  if (!value) return ''
  return value.startsWith('http') ? value : `https://${value}`
}

/** Final sanity check — whatever we are about to hand on must actually parse as a URL. */
function parseable(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
