// lib/admin/truck-details.ts
//
// The TRUCK-DETAILS half of the admin Screenshots tab: classification, extraction, normalisation,
// matching and fill-planning. Pure functions only — no I/O, no Supabase, no fetch — so every rule here
// is testable without an admin session, for the same reason `lib/admin/screenshot-events.ts` is.
//
// ── 🔴 WHY THE PROMPTS LIVE HERE AND NOT IN THE ROUTE ────────────────────────────────────────────────
// The rule is that in-repo extraction imports its prompt from `lib/`. `lib/schedule-extract.ts` owns the
// OPERATOR schedule prompt; `lib/admin/screenshot-events.ts` owns the ADMIN schedule prompt (its header
// says why those two are separate). This module owns the CLASSIFY prompt and the DETAILS prompt — one
// owner each, beside the schedule one, never a copy in a route.
//
// ── 🔴 CLASSIFICATION IS ITS OWN CALL, AND THAT IS DELIBERATE ───────────────────────────────────────
// It would be cheaper to ask one prompt for "the class AND the events AND the details". It is not done,
// because the brief requires the schedule payload to stay BYTE-IDENTICAL to the path that runs today:
// `buildScreenshotPrompt` is unchanged, `parseScreenshotEvents` is unchanged, `toInboundEvents` is
// unchanged. Editing that prompt to also return a class would change what the schedule path extracts.
// So: one cheap classify call, then the existing schedule call and/or the details call.
//
// ── 🔴 THE HAZARD THIS MODULE EXISTS TO CONTAIN ──────────────────────────────────────────────────────
// `/api/inbound-schedule` EMAILS the operator of a linked truck (route.ts:233-293, awaited). A Facebook
// page screenshot carries post timestamps — "20 September at 18:18" — which a schedule prompt will read
// as events. So a details screenshot reaching that route emails a real person about events that do not
// exist. `shouldRunSchedule` is the one gate, and the harness holds a broken variant of it.

import { normalizeVenue, venuesFuzzyMatch } from '@/lib/venue-signature'
import { normaliseUrl, isScraperBlockedDomain } from '@/lib/url-normalise'
import { phoneNationalDigits, isPlausiblePhone, phoneDisplay, type PhoneCountry } from '@/lib/phone'
import { MARKETING_COUNTRY } from '@/lib/marketing-country'

/* ─────────────────────────────── 1. CLASSIFICATION ─────────────────────────────── */

export const CLASSIFICATIONS = ['schedule', 'truck_details', 'both', 'neither'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

export function isClassification(v: unknown): v is Classification {
  return CLASSIFICATIONS.includes(v as Classification)
}

/**
 * 🔴 TOLD WHAT A POST TIMESTAMP IS, BECAUSE THAT IS THE MISTAKE THAT COSTS AN EMAIL.
 * A Facebook page screenshot is full of dates. The classifier is given the distinction explicitly
 * rather than being left to infer it: a schedule is a LIST OF FUTURE PITCHES; a post date is when
 * something was written.
 */
export function buildClassifyPrompt(): string {
  return `Look at this image and say what kind of screenshot it is. Answer with JSON only.

"schedule"      — it shows WHERE AND WHEN a food truck (or several) will be trading: a list or table of
                  dates/days with venues, pitches or times.
"truck_details" — it shows a business's OWN CONTACT OR PROFILE INFORMATION: a Facebook page's
                  "Details"/"Contact info"/"Intro" panel, an About page, a website footer, a business
                  card. Phone numbers, email addresses, a website, an area it serves, social links.
"both"          — it genuinely contains both of the above.
"neither"       — anything else (a menu, a food photo, a receipt, a plain post).

CRITICAL — DO NOT MISTAKE A POST DATE FOR A SCHEDULE:
- A social-media post's timestamp ("20 September at 18:18", "3 days ago", "Yesterday at 09:14") is WHEN
  THE POST WAS WRITTEN. It is NOT an event and NOT a schedule. A page covered in post timestamps and
  contact details is "truck_details", never "schedule" and never "both".
- Only answer "schedule" or "both" if the image lists a venue or pitch against a day or date, as a
  trading plan.

JSON FORMAT ONLY — no markdown, no explanation:
{ "kind": "schedule" | "truck_details" | "both" | "neither" }`
}

/** ⚠️ An unreadable or unknown answer is 'neither' — the class that does NOTHING, never the one that writes. */
export function parseClassification(raw: string): Classification {
  let parsed: unknown
  try { parsed = JSON.parse(cleanJson(raw)) } catch { return 'neither' }
  const kind = (parsed as { kind?: unknown } | null)?.kind
  const v = String(kind ?? '').trim().toLowerCase()
  return isClassification(v) ? v : 'neither'
}

/**
 * 🔴 THE ONE GATE ON THE SCHEDULE PATH. Only 'schedule' and 'both' may reach /api/inbound-schedule.
 * ⚠️ WRITTEN AS AN ALLOW-LIST, NEVER AS `!== 'truck_details'`. A new class added later would default to
 * ALLOWED under a deny-list, and the thing it would be allowed to do is email an operator.
 */
export function shouldRunSchedule(c: Classification): boolean {
  return c === 'schedule' || c === 'both'
}

/** The details path. Same allow-list shape, though the downside here is only a wasted call. */
export function shouldRunTruckDetails(c: Classification): boolean {
  return c === 'truck_details' || c === 'both'
}

/** Strips the ``` fences a model sometimes adds. Mirrors `cleanModelJson` in the schedule module. */
export function cleanJson(raw: string): string {
  const bt = String.fromCharCode(96, 96, 96)
  return String(raw ?? '').replace(new RegExp(bt + 'json', 'gi'), '').replace(new RegExp(bt, 'g'), '').trim()
}

/* ─────────────────────────────── 2. THE DETAILS PROMPT ─────────────────────────────── */

/**
 * 🔴 "LEAVE IT OUT RATHER THAN GUESS" IS STATED FIVE TIMES, ONCE PER FIELD THAT COULD BE INVENTED.
 * A guessed email is worse than a missing one: this path FILLS EMPTY COLUMNS, so a hallucinated address
 * becomes the saved value and nothing later contradicts it.
 * 🔴 THE ADDRESS BAR IS ASKED FOR EXPLICITLY. Safari's "Show full website address" means the Facebook URL
 * is often ONLY in the browser chrome at the top of the image, and a model reading "the page" will skip
 * it. It is also told not to build one from the page's name — the failure mode the addendum names.
 */
export function buildTruckDetailsPrompt(): string {
  return `Read this screenshot of a food business's contact or profile information. Extract only what is
VISIBLY WRITTEN in the image. Answer with JSON only.

Fields:
- "name"      — the business/trading name as shown. If you cannot see a name, use "".
- "email"     — an email address shown in the image. If none is visible, use "".
- "phone"     — a telephone number shown in the image, exactly as written (keep +44, spaces, 0s). If none, "".
- "website"   — a website address shown in the image. If none, "".
- "facebook"  — a facebook.com URL. LOOK AT THE BROWSER ADDRESS BAR AT THE TOP OF THE IMAGE as well as
                the page body: when the address bar shows the full address (e.g.
                "facebook.com/3brosburgers" or "facebook.com/profile.php?id=100039496906958") copy it
                EXACTLY as shown. If the address bar shows only "facebook.com" with no page after it, use "".
- "instagram" — an instagram.com URL or an @handle shown in the image (often under "Links" or in the
                intro text), or an instagram.com address in the address bar. If none, "".
- "area"      — the town, city or area it says it serves (e.g. "Brighton and Hove"). If none, "".

CRITICAL RULES:
- Copy what is written. Do NOT guess, complete, correct or infer any value.
- NEVER build a Facebook or Instagram URL out of the business's name. If you did not SEE the address,
  return "" for it.
- Do NOT turn a phone number into an email, or an email into a website.
- If you are not confident a value is really there, return "" for that field. An empty field is correct
  and useful; a wrong value is not.
- Ignore post dates, times, like/comment counts, and menu prices entirely.

JSON FORMAT ONLY — no markdown, no explanation:
{ "name": "", "email": "", "phone": "", "website": "", "facebook": "", "instagram": "", "area": "" }`
}

/* ─────────────────────────────── 3. NORMALISATION ─────────────────────────────── */

/**
 * ⚠️ DELIBERATELY NOT RFC 5322. The job is to reject what the model may have mangled out of a page —
 * a phone number, a sentence, a truncated address — not to admit every legal exotic. One @, a dotted
 * host with a 2+ letter TLD, no whitespace, nothing quoted.
 */
const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/

/** Lower-cased and validated, or null. */
export function normaliseEmail(input: string | null | undefined): string | null {
  const v = String(input ?? '').trim().toLowerCase().replace(/^mailto:/, '')
  if (!v || v.length > 254) return null
  if (v.includes('..')) return null
  return EMAIL_RE.test(v) ? v : null
}

/**
 * UK phone, split by KIND because the two go to different columns: `discovery_trucks.mobile` and
 * `discovery_trucks.phone`.
 *
 * 🔴 +44 AND 0044 BOTH BECOME A LEADING 0, and anything that is not then a plausible UK number is
 * DISCARDED rather than stored half-normalised. A number we cannot classify is a number we do not write.
 * ⚠️ THE GROUPING IS COSMETIC AND THE DIGITS ARE NOT. Spacing follows Ofcom's usual groups so a saved
 * value reads the way Dominic would dial it; the harness pins both the digits and the spacing so a later
 * change to the grouping cannot pass unnoticed.
 */
export function normaliseUkPhone(input: string | null | undefined, country: PhoneCountry): { mobile: string | null; landline: string | null } {
  const none = { mobile: null, landline: null }
  // 🔴 THE +44 / 0044 / 44 → 0 STEP IS lib/phone.ts's NATIONAL FORM (Phase 2C), read in `country`. The
  // grouping and the mobile / landline split below are this admin screen's own and unchanged, so a UK
  // number displays byte-for-byte as before (scripts/phone-parity.cjs). A number that is not a plausible
  // length, or not this country's, is not written — as before.
  const d = phoneNationalDigits(input, country)
  if (!d || !d.startsWith('0')) return none

  // Mobile: 07 + 9 digits. 11 digits exactly; anything else is not a UK mobile.
  if (/^07\d{9}$/.test(d)) return { mobile: `${d.slice(0, 5)} ${d.slice(5)}`, landline: null }

  // Landline / non-geographic: 01, 02, 03. 10 or 11 digits.
  if (/^0[123]\d{8,9}$/.test(d)) {
    let grouped: string
    if (d.startsWith('02')) grouped = `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`           // 020 7946 0018
    else if (d.startsWith('03')) grouped = `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`      // 0300 123 1234
    else if (/^011\d/.test(d) || /^01\d1/.test(d)) grouped = `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` // 0113 496 0000
    else grouped = `${d.slice(0, 5)} ${d.slice(5)}`                                                // 01223 123456
    return { mobile: null, landline: grouped }
  }
  return none
}

/** Digits only, for comparing two numbers that may be spaced or prefixed differently. */
export function phoneDigits(input: string | null | undefined, country: PhoneCountry): string | null {
  // The national form as digits (lib/phone.ts, Phase 2C) — both sides of a comparison go through it.
  const d = phoneNationalDigits(input, country)
  return d && d.length >= 10 ? d : null
}

/**
 * A bare domain for `discovery_trucks.website` — `example.co.uk`, no scheme, no www., no path.
 *
 * 🔴 A FACEBOOK OR INSTAGRAM ADDRESS IS NEVER A WEBSITE HERE, and that is not tidiness. `website` is one
 * of the two columns the scraper reads to build its site list (run-scraper.js:939), and
 * `isScraperBlockedDomain` already exists precisely because the scraper cannot read those pages. A social
 * URL goes to `facebook_url` / `instagram_url` and nowhere else.
 * ⚠️ Reuses `normaliseUrl` rather than parsing by hand — one definition of "is this plausibly a web
 * address", which is that module's whole purpose.
 */
export function bareDomain(input: string | null | undefined): string | null {
  const url = normaliseUrl(String(input ?? '').trim())
  if (!url) return null
  if (isScraperBlockedDomain(url)) return null
  let host: string
  try { host = new URL(url).hostname.toLowerCase() } catch { return null }
  host = host.replace(/^www\./, '')
  if (!host.includes('.') || host.endsWith('.')) return null
  return host
}

const FB_HOSTS = ['facebook.com', 'fb.com']
/** First path segments that are Facebook's own furniture, not a page's vanity name. */
const FB_RESERVED = new Set([
  'pages', 'groups', 'events', 'watch', 'marketplace', 'gaming', 'sharer', 'login', 'help', 'policies',
  'permalink.php', 'story.php', 'photo.php', 'photo', 'media', 'search', 'hashtag', 'people', 'pg', 'p',
  'home.php', 'reel', 'share', 'privacy', 'legal', 'settings',
])
/** Tails that hang off a page's vanity and are not part of its identity. */
const FB_TAILS = new Set(['about', 'photos', 'posts', 'videos', 'reviews', 'events', 'community', 'shop', 'menu', 'reels', 'live'])

/**
 * Canonical Facebook URL, or null.
 *
 * Accepted shapes out:
 *   https://www.facebook.com/<vanity>
 *   https://www.facebook.com/profile.php?id=<digits>
 *
 * 🔴 BARE "facebook.com" RETURNS NULL, never a guess. The addendum is explicit: if the address bar shows
 * only the host, record no URL.
 * ⚠️ THE VANITY'S CASE IS PRESERVED, because the addendum says to lower-case the HOST and lists exactly
 * what else to drop; it does not say to rewrite the page name. Matching compares case-insensitively
 * (`sameFacebookPage`), so a saved "3BrosBurgers" and a read "3brosburgers" are still the same page.
 */
export function canonicalFacebookUrl(input: string | null | undefined): string | null {
  const url = normaliseUrl(String(input ?? '').trim())
  if (!url) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.toLowerCase().replace(/^(?:m|web|www|mobile|touch|[a-z]{2}-[a-z]{2})\./, '')
  if (!FB_HOSTS.includes(host)) return null

  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length === 0) return null

  if (segs[0].toLowerCase() === 'profile.php') {
    const id = u.searchParams.get('id')
    if (!id || !/^\d+$/.test(id)) return null
    return `https://www.facebook.com/profile.php?id=${id}`
  }

  const vanity = segs[0]
  if (FB_RESERVED.has(vanity.toLowerCase())) return null
  if (FB_TAILS.has(vanity.toLowerCase())) return null
  if (!/^[A-Za-z0-9.\-_]{2,}$/.test(vanity)) return null
  return `https://www.facebook.com/${vanity}`
}

const IG_HOSTS = ['instagram.com', 'instagr.am']
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'tv', 'accounts', 'direct', 'about', 'legal'])

/**
 * Canonical Instagram URL: `https://www.instagram.com/<handle>`, handle lower-cased (the addendum says so
 * for Instagram, and Instagram handles are themselves lower-case).
 * ⚠️ Accepts a bare `@handle`, because that is how a Facebook "Links" row usually writes it.
 */
export function canonicalInstagramUrl(input: string | null | undefined): string | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null

  if (/^@[A-Za-z0-9._]{2,30}$/.test(raw)) {
    return `https://www.instagram.com/${raw.slice(1).toLowerCase()}`
  }

  const url = normaliseUrl(raw)
  if (!url) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.toLowerCase().replace(/^(?:m|web|www|mobile|[a-z]{2}-[a-z]{2})\./, '')
  if (!IG_HOSTS.includes(host)) return null
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length === 0) return null
  const handle = segs[0].toLowerCase()
  if (IG_RESERVED.has(handle)) return null
  if (!/^[a-z0-9._]{2,30}$/.test(handle)) return null
  return `https://www.instagram.com/${handle}`
}

/* ─────────────────────────────── 4. PARSING THE DETAILS REPLY ─────────────────────────────── */

export type TruckDetails = {
  name: string | null
  contact_email: string | null
  mobile: string | null
  phone: string | null
  website: string | null
  facebook_url: string | null
  instagram_url: string | null
  area: string | null
}

export const EMPTY_DETAILS: TruckDetails = {
  name: null, contact_email: null, mobile: null, phone: null,
  website: null, facebook_url: null, instagram_url: null, area: null,
}

/** True when the model saw nothing worth having. */
export function detailsAreEmpty(d: TruckDetails): boolean {
  return !d.contact_email && !d.mobile && !d.phone && !d.website && !d.facebook_url && !d.instagram_url && !d.area
}

/**
 * Parse and normalise in one step: the only `TruckDetails` that exists anywhere is a normalised one, so
 * no caller can accidentally store a raw value.
 * ⚠️ `area` is free text and is NOT normalised — it goes into a note a human reads, not a key anything
 * matches on. Trimmed and length-capped, nothing more.
 */
export function parseTruckDetails(raw: string, country: PhoneCountry = MARKETING_COUNTRY): TruckDetails {
  let parsed: Record<string, unknown>
  try {
    const p = JSON.parse(cleanJson(raw))
    parsed = (p && typeof p === 'object' && !Array.isArray(p)) ? p as Record<string, unknown> : {}
  } catch { return { ...EMPTY_DETAILS } }

  const str = (k: string) => String(parsed[k] ?? '').trim()
  // 🔴 PHASE 2D-2: the number is read in the CHOSEN country (the screenshot panel's picker). The UK keeps its
  // own grouping and mobile/landline split byte for byte (normaliseUkPhone). Any other country keeps a number
  // of a plausible length for it — a +1 number is no longer thrown away — in that country's own display
  // form, as `phone` (a US mobile and landline look the same, so no split is guessed).
  const ph = country === 'GB'
    ? normaliseUkPhone(str('phone'), country)
    : (() => {
        const raw = str('phone')
        const shown = raw && isPlausiblePhone(raw, country, 'length') ? phoneDisplay(raw, country) : null
        return { mobile: null, landline: shown }
      })()
  const area = str('area').replace(/\s+/g, ' ').slice(0, 120)

  return {
    name: str('name').replace(/\s+/g, ' ').slice(0, 200) || null,
    contact_email: normaliseEmail(str('email')),
    mobile: ph.mobile,
    phone: ph.landline,
    website: bareDomain(str('website')),
    facebook_url: canonicalFacebookUrl(str('facebook')),
    instagram_url: canonicalInstagramUrl(str('instagram')),
    area: area || null,
  }
}

/* ─────────────────────────────── 5. MATCHING ─────────────────────────────── */

/** The truck columns matching reads. Shaped structurally so the route's richer row satisfies it. */
export type MatchRow = {
  prospect_id: string
  truck_id: string
  name: string | null
  contact_email: string | null
  phone: string | null
  mobile: string | null
  website: string | null
  facebook_url?: string | null
  instagram_url?: string | null
}

export type MatchKey = 'facebook' | 'website' | 'phone' | 'email' | 'name'

export type MatchResult =
  | { kind: 'definite'; row: MatchRow; on: MatchKey; why: string }
  /** `ask: 'phone_only'` — the number matched one prospect and the name did not (see `matchProspect`). */
  | { kind: 'needs_a_look'; candidates: MatchRow[]; why: string; ask?: 'phone_only' }
  | { kind: 'none'; why: string }

/**
 * The question a phone-only match asks. One owner for the words, so the row summary, the log line and the
 * harness all read the same sentence.
 */
export function phoneOnlyQuestion(prospectName: string | null, screenshotName: string | null): string {
  const p = prospectName?.trim() || 'an unnamed prospect'
  const said = screenshotName?.trim() ? `The screenshot says ${screenshotName.trim()}.` : 'The screenshot shows no name.'
  return `This number belongs to ${p}. ${said} Is this ${p}, or a different truck?`
}

/** Case-insensitive comparison of two canonical Facebook URLs. See `canonicalFacebookUrl`. */
export function sameFacebookPage(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = canonicalFacebookUrl(a), y = canonicalFacebookUrl(b)
  return !!x && !!y && x.toLowerCase() === y.toLowerCase()
}

/**
 * 🔴 STRONGEST KEY FIRST, AND ANY ONE OF THEM IS DEFINITE — the brief's rule, in its order:
 * Facebook URL/id, website domain, phone, email, exact normalised name.
 *
 * 🔴 A VANITY URL AND A NUMERIC-ID URL ARE NOT A MATCH (addendum item 3). `sameFacebookPage` compares
 * canonical forms, and `/3brosburgers` is not `/profile.php?id=123`, so such a pair simply falls through
 * to the next key instead of being asserted as the same page.
 *
 * 🔴 TWO DIFFERENT PROSPECTS MATCHING IS "NEEDS A LOOK", NOT "THE STRONGEST KEY WINS". If the Facebook
 * URL names one truck and the phone number names another, the data disagrees with itself and a human
 * must look. Collecting every key's hit before deciding is what makes that observable.
 *
 * ⚠️ INSTAGRAM IS NOT A MATCH KEY. The brief lists five keys and Instagram is not among them; it is
 * extracted and filled, never used to assert identity.
 *
 * 🔴 A PHONE NUMBER ALONE NEVER DECIDES (15 October 2026, docs/outreach-screenshot-match-report.md). One
 * owner can run two trucks on one mobile: Smash and Grab's Facebook page matched Tacoman on the shared
 * number and its email and Instagram were written onto Tacoman. So when the ONLY key that hit a prospect
 * is the phone, the names must agree too (`normalizeVenue`, the name key's own normaliser). If they do not
 * — or the screenshot shows no name — the row is "Needs a look" with `ask: 'phone_only'`, and nothing is
 * written until the admin says which truck it is. A Facebook or website hit is recorded before the phone
 * is looked at (`continue`), so it still decides on its own; a name-and-phone match behaves as before.
 */
export function matchProspect(d: TruckDetails, rows: MatchRow[], country: PhoneCountry = MARKETING_COUNTRY): MatchResult {
  // 🔴 PHASE 2D-2: the caller passes only the prospects whose truck is in `country` (the route filters by
  // discovery_trucks.country), so nothing here can match across countries; phone numbers compare in it.
  const hits: { row: MatchRow; on: MatchKey }[] = []

  for (const r of rows) {
    if (d.facebook_url && sameFacebookPage(d.facebook_url, r.facebook_url)) { hits.push({ row: r, on: 'facebook' }); continue }
    const rWeb = bareDomain(r.website)
    if (d.website && rWeb && d.website === rWeb) { hits.push({ row: r, on: 'website' }); continue }
    const ours = [phoneDigits(d.mobile, country), phoneDigits(d.phone, country)].filter(Boolean) as string[]
    const theirs = [phoneDigits(r.mobile, country), phoneDigits(r.phone, country)].filter(Boolean) as string[]
    if (ours.length && theirs.some(t => ours.includes(t))) { hits.push({ row: r, on: 'phone' }); continue }
    const rEmail = normaliseEmail(r.contact_email)
    if (d.contact_email && rEmail && d.contact_email === rEmail) { hits.push({ row: r, on: 'email' }); continue }
    const dn = normalizeVenue(d.name ?? ''), rn = normalizeVenue(r.name ?? '')
    if (dn && rn && dn === rn) { hits.push({ row: r, on: 'name' }) }
  }

  const distinct = Array.from(new Set(hits.map(h => h.row.prospect_id)))
  if (distinct.length > 1) {
    const rowsFor = distinct.map(id => hits.find(h => h.row.prospect_id === id)!.row)
    const how = distinct.map(id => {
      const h = hits.find(x => x.row.prospect_id === id)!
      return `${h.row.name ?? 'unnamed'} on ${h.on}`
    }).join(', ')
    return { kind: 'needs_a_look', candidates: rowsFor, why: `Two prospects match this screenshot — ${how}` }
  }
  if (hits.length === 1 || distinct.length === 1) {
    const h = hits[0]
    if (h.on === 'phone') {
      const dn = normalizeVenue(d.name ?? ''), rn = normalizeVenue(h.row.name ?? '')
      if (!dn || dn !== rn) {
        return { kind: 'needs_a_look', candidates: [h.row], why: phoneOnlyQuestion(h.row.name, d.name), ask: 'phone_only' }
      }
    }
    return { kind: 'definite', row: h.row, on: h.on, why: `matched on ${KEY_WORDS[h.on]}` }
  }

  // No definite key. A merely SIMILAR name is never applied on its own.
  if (d.name) {
    const key = normalizeVenue(d.name)
    const near = key ? rows.filter(r => {
      const rk = normalizeVenue(r.name ?? '')
      return rk && rk !== key && venuesFuzzyMatch(key, rk)
    }) : []
    if (near.length > 0) {
      const names = near.map(r => `"${r.name ?? 'unnamed'}"`).join(', ')
      return { kind: 'needs_a_look', candidates: near, why: `Name is close to ${names} but nothing else matches` }
    }
  }
  return { kind: 'none', why: 'no match found' }
}

export const KEY_WORDS: Record<MatchKey, string> = {
  facebook: 'Facebook link',
  website: 'website',
  phone: 'phone number',
  email: 'email',
  name: 'name',
}

/* ─────────────────────────────── 6. THE FILL PLAN ─────────────────────────────── */

/** The six columns this path may ever write on a truck. `name` is deliberately absent. */
export const FILLABLE = ['contact_email', 'mobile', 'phone', 'website', 'facebook_url', 'instagram_url'] as const
export type Fillable = (typeof FILLABLE)[number]

export const FIELD_WORDS: Record<Fillable, string> = {
  contact_email: 'email',
  mobile: 'mobile',
  phone: 'phone',
  website: 'website',
  facebook_url: 'Facebook link',
  instagram_url: 'Instagram link',
}

export type FillPlan = {
  /** Columns to write on `discovery_trucks`. Empty object = nothing to do. */
  fills: Partial<Record<Fillable, string>>
  /** Saved values we did NOT overwrite, and what the screenshot said instead. */
  kept: { field: Fillable; saved: string; found: string }[]
  /** The area note for `outreach_prospects.notes`, or null. */
  areaNote: string | null
}

const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === ''

/**
 * 🔴 FILL EMPTY ONLY. NEVER OVERWRITE. The one rule this function exists to enforce, and the harness
 * holds a broken variant of it.
 * ⚠️ "EMPTY" IS BLANK-OR-NULL, NOT FALSY-OR-NULL. 🧪 `lib/outreach-step.ts:220` measured 0 of 231 rows
 * holding a non-null blank `contact_email` — but 0 is a count, not a constraint, and a whitespace-only
 * cell is as empty to a human as a NULL. Treating `'  '` as filled would silently refuse to write the
 * real address forever.
 * ⚠️ A value identical to the saved one is NOT a "kept" conflict — there is nothing to report.
 */
export function planFill(d: TruckDetails, truck: Record<string, unknown>): FillPlan {
  const fills: Partial<Record<Fillable, string>> = {}
  const kept: FillPlan['kept'] = []

  for (const field of FILLABLE) {
    const found = d[field]
    if (!found) continue
    const saved = truck[field]
    if (isBlank(saved)) { fills[field] = found; continue }
    const same = field === 'facebook_url'
      ? sameFacebookPage(String(saved), found)
      : String(saved).trim().toLowerCase() === found.toLowerCase()
    if (!same) kept.push({ field, saved: String(saved).trim(), found })
  }

  return {
    fills,
    kept,
    areaNote: d.area ? `From screenshot: ${d.area}` : null,
  }
}

export function planIsEmpty(p: FillPlan): boolean {
  return Object.keys(p.fills).length === 0 && p.areaNote === null
}

/* ── 🔴 A DIFFERENT SAVED EMAIL OR SOCIAL LINK IS ASKED ABOUT, NEVER REPLACED ON ITS OWN (15 Oct 2026) ──
 * `planFill` still fills EMPTY only and keeps every saved value. For these three columns the kept conflict
 * is now shown to the admin as old → new with a choice; only "Replace" writes, through `planReplace`.
 * Mobile, phone and website stay as they were: kept, and reported in the summary. */
export const CONFIRM_FIELDS: readonly Fillable[] = ['contact_email', 'facebook_url', 'instagram_url']
export type Conflict = FillPlan['kept'][number]

/** The kept conflicts the admin is asked about. */
export function conflictsToConfirm(plan: FillPlan): Conflict[] {
  return plan.kept.filter(k => CONFIRM_FIELDS.includes(k.field))
}

/** "Email: kept@a.com → new@b.com" — the line the row shows and the history repeats. */
export function conflictLine(c: Conflict): string {
  const word = FIELD_WORDS[c.field]
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}: ${c.saved} → ${c.found}`
}

/**
 * What "Replace" may write. 🔴 THE CONFLICT IS RE-DERIVED HERE, NOT TRUSTED FROM THE BROWSER: `fresh` is the
 * re-normalised screenshot and `saved` is the truck as it stands now. A field is replaced only if it is one
 * of CONFIRM_FIELDS, the admin asked for it, it is STILL in conflict, and the saved value is still the one
 * the admin was shown — anything that changed in between is refused, not overwritten.
 */
export function planReplace(
  asked: { field: string; saved: string }[], saved: Record<string, unknown>, fresh: TruckDetails,
): { patch: Partial<Record<Fillable, string>>; changes: Conflict[]; refused: string[] } {
  const current = conflictsToConfirm(planFill(fresh, saved))
  const patch: Partial<Record<Fillable, string>> = {}
  const changes: Conflict[] = []
  const refused: string[] = []
  for (const a of asked) {
    const c = current.find(k => k.field === a.field)
    if (!c) { refused.push(`${a.field}: nothing to replace`); continue }
    if (c.saved.toLowerCase() !== String(a.saved ?? '').trim().toLowerCase()) { refused.push(`${FIELD_WORDS[c.field]} changed since — kept`); continue }
    patch[c.field] = c.found
    changes.push(c)
  }
  return { patch, changes, refused }
}

/** "Replaced email kept@a.com → new@b.com" */
export function replacedSummary(changes: Conflict[]): string {
  return `Replaced ${changes.map(c => `${FIELD_WORDS[c.field]} ${c.saved} → ${c.found}`).join(', ')}`
}

/* ─────────────────────────────── 7. THE HIDDEN NEW TRUCK ─────────────────────────────── */

/**
 * 🔴 THE INSERT FOR A TRUCK THAT MUST NOT BE SEEN, AND WHY IT IS SHAPED LIKE THIS.
 *
 * `show_on_vf` AND `show_on_hg` BOTH FALSE. The anonymous route picks its column by HOST —
 * `const showCol = isHG ? 'show_on_hg' : 'show_on_vf'` (api/discovery/events/route.ts:76-77) — and then
 * requires `t[showCol] === true` (:356-359). Setting only `show_on_vf` would hide the truck on Village
 * Foodie and publish it on HatchGrab.
 *
 * ⚠️ `excluded` IS LEFT ALONE, ON PURPOSE. It would also hide the row, and the outreach list does show
 * excluded trucks (the prospects query carries no filter at all — api/admin/outreach/route.ts:197-199),
 * so it WOULD have worked. It is not used because it already means something else: "this scraped row is
 * the shadow of a truck that became a customer" (lib/self-serve-discovery-link.ts:73). Reusing it here
 * would make `excluded` ambiguous for every reader afterwards, and `isOnVillageFoodieMap`
 * (lib/outreach-step.ts) treats it as the master hide.
 *
 * 🔴 NO `website` AND NO `schedule_url`, EVER, ON A ROW CREATED HERE. The scraper's site list selects
 * `id, name, schedule_url, website, ai_instructions, scraper_strategy` with NO visibility filter
 * (run-scraper.js:912-914) — a hidden row is still scraped. A website on a new row would therefore enrol
 * a truck nobody has looked at into the nightly scrape. It goes into `outreach_prospects.notes` instead
 * and the row summary says so.
 */
export function hiddenTruckInsert(details: TruckDetails, country?: string): Record<string, unknown> {
  const row: Record<string, unknown> = {
    name: details.name,
    show_on_vf: false,
    show_on_hg: false,
  }
  // Phase 2D-2: the chosen country, written explicitly (the column defaults to GB for the UK sources that
  // write without one). Its prospect reads the country through this truck.
  if (country) row.country = country
  if (details.contact_email) row.contact_email = details.contact_email
  if (details.mobile) row.mobile = details.mobile
  if (details.phone) row.phone = details.phone
  if (details.facebook_url) row.facebook_url = details.facebook_url
  if (details.instagram_url) row.instagram_url = details.instagram_url
  return row
}

/**
 * The lines appended to `outreach_prospects.notes` for a newly created truck: the area, and the website
 * that deliberately did NOT go onto the truck row.
 */
export function newTruckNotes(details: TruckDetails): string[] {
  const out: string[] = []
  if (details.area) out.push(`From screenshot: ${details.area}`)
  if (details.website) out.push(`Website from screenshot: ${details.website}`)
  return out
}

/**
 * 🔴 A MIRROR OF THE ANONYMOUS ROUTE'S FILTER, KEPT HERE SO IT CAN BE TESTED.
 * `api/discovery/events/route.ts:356-359` — `!t.excluded && t[showCol] === true`, with showCol chosen by
 * host at :76-77. The harness asserts that `hiddenTruckInsert` fails this on BOTH hosts, and holds a
 * broken variant that omits `show_on_hg` to prove the assertion can fail.
 * ⚠️ `=== true` AND NOT TRUTHINESS, because that is what the route does: an absent column is not visible.
 */
export function appearsInPublicTrucksPayload(row: Record<string, unknown>, host: 'hatchgrab' | 'villagefoodie'): boolean {
  if (row.excluded === true) return false
  const showCol = host === 'hatchgrab' ? 'show_on_hg' : 'show_on_vf'
  return row[showCol] === true
}

/**
 * 🔴 A MIRROR OF THE SCRAPER'S SITE TEST (run-scraper.js:936-941), likewise for testing.
 * A row is a scrape target if it has a schedule_url OR a website, OR ai_instructions longer than 10.
 */
export function isScraperSite(row: Record<string, unknown>): boolean {
  const url = (String(row.schedule_url ?? '').trim() || String(row.website ?? '').trim())
  const instructions = String(row.ai_instructions ?? '')
  return url.length > 0 || instructions.length > 10
}

/* ─────────────────────────────── 8. THE ROW SUMMARY ─────────────────────────────── */

export type Outcome = 'schedule' | 'updated' | 'new_truck' | 'nothing_new' | 'needs_a_look' | 'reading' | 'failed'

export const OUTCOME_LABELS: Record<Outcome, string> = {
  schedule: 'Schedule',
  updated: 'Updated',
  new_truck: 'New truck',
  nothing_new: 'Nothing new',
  needs_a_look: 'Needs a look',
  reading: 'Reading',
  failed: 'Failed',
}

/** "Added email a@b.com, mobile 07400 049108 · matched on website" — the mockup's wording. */
export function updatedSummary(plan: FillPlan, on: MatchKey): string {
  const added = (Object.keys(plan.fills) as Fillable[]).map(f => `${FIELD_WORDS[f]} ${plan.fills[f]}`)
  const parts: string[] = []
  if (added.length) parts.push(`Added ${added.join(', ')}`)
  if (plan.areaNote) parts.push(`area noted`)
  for (const k of plan.kept) {
    parts.push(k.field === 'facebook_url'
      ? 'Facebook link differs from saved — kept saved'
      : `${FIELD_WORDS[k.field]} kept (already had one)`)
  }
  return `${parts.join(' · ')} · ${KEY_WORDS[on] === 'name' ? 'matched on name' : `matched on ${KEY_WORDS[on]}`}`
}

/** "Added to outreach with email and mobile · hidden from the public map · no match found" */
export function newTruckSummary(details: TruckDetails): string {
  const got: string[] = []
  if (details.contact_email) got.push('email')
  if (details.mobile) got.push('mobile')
  if (details.phone) got.push('phone')
  if (details.facebook_url) got.push('Facebook link')
  if (details.instagram_url) got.push('Instagram link')
  const with_ = got.length ? ` with ${got.join(' and ')}` : ''
  const web = details.website ? ` · website kept as a note, not on the truck (it would be scraped)` : ''
  return `Added to outreach${with_} · hidden from the public map${web} · no match found`
}
