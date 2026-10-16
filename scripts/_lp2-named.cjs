// scripts/_lp2-named.cjs — THE NAMED CODE CHANGES of Language Phase 2 (docs/language-phase-2-report.md). A MODULE,
// read by scripts/language-phase-2.cjs.
//
// "F" is the AFTER code rendered with the BEFORE words (HG_MESSAGES_FROZEN). Wherever F differs from BEFORE, the
// CODE changed the output — and every such view must be claimed by exactly the entries below:
//   { id, part, country: 'GB' | 'US' | 'both', what, views: (viewId) => bool, expect?: (beforeValue, viewId) => value }
// • With `expect`, the entry is PRECISE: F must equal expect(BEFORE) byte for byte — the named change is proven to be
//   the only difference in its view. A view it claims whose BEFORE the transform leaves alone must not change.
// • Without `expect` (US only, by the brief), the entry LISTS its views as changed by Part 2; the harness writes each
//   one to scripts/fixtures/language-phase-2-us-changed.txt and the US-words check still reads every one.
// An entry that claims no view that changed is reported (stale or not landed yet), and a view two entries claim
// takes the first. View ids: `1a/<section>/<key>`, `1b/<area>/<key>`, `1c/<area>/<key>`, `2/extra/<key>`.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const longDate = (y, m, d, cc) => (cc === 'US' ? `${MONTHS[m - 1]} ${d}, ${y}` : `${d} ${MONTHS[m - 1]} ${y}`)
/** The US clock after Part 2: "4:30 PM", "12:00 AM" — always minutes, a space, capitals (lib/time-utils.ts clockOf, en-US). */
const clock12 = (hh, mm) => { const h = Number(hh); const s = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 || 12; return `${h12}:${String(mm).padStart(2, '0')} ${s}` }
const isTicketView = id => /^1b\/printing\/(ticket|test|preview)\|US\|/.test(id)
const countryOf = id => (id.split('/').slice(2).join('/').split('|').includes('US') ? 'US' : 'GB')

/** Every string in a captured value through `fn` — including strings that are JSON (a response body), re-serialised
 *  exactly as JSON.stringify writes them (which is how the routes and the captures wrote them). */
function mapStrings(v, fn) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) {
      try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(mapStrings(p, fn)) } catch { /* not JSON */ }
    }
    return fn(v)
  }
  if (Array.isArray(v)) return v.map(x => mapStrings(x, fn))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)]))
  return v
}
/** The same, for strings under the given object keys only (e.g. only an email's `html`). */
function mapFields(v, fields, fn) {
  if (typeof v === 'string' && (v[0] === '{' || v[0] === '[')) {
    try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(mapFields(p, fields, fn)) } catch { /* not JSON */ }
    return v
  }
  if (Array.isArray(v)) return v.map(x => mapFields(x, fields, fn))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fields.includes(k) && typeof x === 'string' ? fn(x) : mapFields(x, fields, fn)]))
  return v
}
const GB_LONG = /\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/g

const NAMED = [
  // ── PART 2 · DATES ──────────────────────────────────────────────────────────────────────────────────────
  { id: 'P2-deletion-email-date', part: 'Part 2 (dates)', country: 'both',
    what: 'The account-deletion OWNERS’ email writes its date as a long date in the owner’s truck’s style ("2026-11-08" → GB "8 November 2026", US "November 8, 2026"); an owner with NO truck gets the default locale (GB).',
    views: id => /^1c\/api\/(GB|US)\|deletion\|post\|ok(NoTrucks)?$/.test(id),
    // Only the OWNERS' email ("…scheduled for deletion on <strong>…"); the [ACTION] admin email keeps ISO ("Due: <strong>…").
    expect: (b, id) => mapFields(b, ['html'], s => s.replace(/scheduled for deletion on <strong>(\d{4})-(\d{2})-(\d{2})<\/strong>/g, (_, y, m, d) =>
      `scheduled for deletion on <strong>${longDate(+y, +m, +d, /NoTrucks$/.test(id) ? 'GB' : countryOf(id))}</strong>`)) },
  { id: 'P2-save-email-date-US', part: 'Part 2 (dates)', country: 'US',
    what: 'The demo save-email email and its response write the deletion date in the US order ("23 October 2026" → "October 23, 2026"). GB unchanged.',
    views: id => /^1c\/api\/US\|save-email\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(GB_LONG, (_, d, mon, y) => `${mon} ${d}, ${y}`)) },
  { id: 'P2-dashboard-off-since', part: 'Part 2 (dates)', country: 'both',
    what: 'The dashboard’s "Off since …" line shows a long date in the truck’s style, not the raw ISO date ("2026-10-08" → GB "8 October 2026", US "October 8, 2026").',
    views: id => /^1b\/dashboard\/(GB|US)\|/.test(id),
    expect: (b, id) => mapStrings(b, s => s.replace(/Off since (\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => `Off since ${longDate(+y, +m, +d, countryOf(id))}`)) },
  { id: 'P2-sept-sep', part: 'Part 2 (dates)', country: 'GB',
    what: 'A short month is "Sep", never Intl’s en-GB "Sept" (TruckListCard, the inbound-schedule email, Manage’s schedule cards and Reports picker) — formatYmdShortMonth. Upper-cased on the schedule card: "SEPT" → "SEP".',
    views: id => /^(1a|1b|1c|2)\/[^/]+\/(GB\|)?/.test(id) && countryOf(id) === 'GB',
    expect: b => mapStrings(b, s => s.replace(/\bSept\b/g, 'Sep').replace(/\bSEPT\b/g, 'SEP')) },

  // ── PART 2 · US BEHAVIOUR ─────────────────────────────────────────────────────────────────────────────────
  { id: 'P2-preorder-US', part: 'Part 2 (pre-order labels)', country: 'US',
    what: 'US pre-order labels use the truck’s clock and date order: "Pre-order by 16:30, Sat 10 Oct" → "Pre-order by 4:30 PM, Sat, Oct 10"; "Pre-orders open Sat 10 Oct" → "Pre-orders open Sat, Oct 10".',
    views: id => /^2\/extra\/US\|preorder/.test(id),
    expect: b => mapStrings(b, s => s
      .replace(/^Pre-order by (\d{2}):(\d{2})/, (_, h, m) => `Pre-order by ${clock12(h, m)}`)
      .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (_, wd, d, mo) => `${wd}, ${mo} ${d}`)) },
  { id: 'P2-us-clock', part: 'Part 2 (dates)', country: 'US',
    what: 'The US 12-hour clock is "6:30 PM" / "6:00 PM" / "12:00 AM" — always minutes, a space, capitals (en-US) — where it was "6:30pm" / "6pm". GB untouched.',
    views: id => !isTicketView(id),
    expect: b => mapStrings(b, s => s.replace(/\b(\d{1,2})(?::(\d{2}))?(am|pm)\b/g, (_, h, m, ap) => `${h}:${m || '00'} ${ap.toUpperCase()}`)) },
  { id: 'P2-us-clock-tickets', part: 'Part 2 (dates)', country: 'US',
    what: 'The same US clock on the printed ticket, its test ticket and its on-screen preview. LISTED: a longer time changes the header row\'s padding and wrapping, so the bytes are proven by the ticket-fit check instead of a transform.',
    views: id => isTicketView(id) },
  // ⚠️ NOT A CODE CHANGE IN F: "Truck 1" for a new US truck's first van is a WORD (provisionContent.firstVanName in
  // en-US); with the frozen words F stores "Van 1" exactly as BEFORE. It is in A, listed in the US changes.
  { id: 'P2-demo-US', part: 'Part 2 (provisioning)', country: 'US',
    what: 'A demo asked for in the US is built in the US (provisionDemo `country`): its currency, zone and allergens, its sample menu and its first van in US words. 460ba55 ignored the country and built the GB demo. LISTED — the whole set of rows changes.',
    views: id => /^2\/extra\/US\|rows\|demo\|/.test(id) },

  // ── PART 3 · WRONG-ENGLISH FIXES THAT NEEDED A CODE CHANGE ────────────────────────────────────────────────
  { id: 'P3-buzzer-removed', part: 'Part 3 (buzzer null)', country: 'both',
    what: 'A queued buzzer removal with no number shows `buzzer.removed` ("Buzzer removed") instead of `removedNumber` with an empty number ("Buzzer  removed", two spaces). The other buzzer messages take a has/had flag instead of printing "null" — with the frozen words that is invisible.',
    views: id => /^1b\/(dashboard|kds)\//.test(id),
    expect: b => mapStrings(b, s => s.replace(/Buzzer {2}removed/g, 'Buzzer removed')) },
  // ── LANGUAGE PHASE 1d PART 1 (Manage: Menu, Schedule, Settings — scripts/language-phase-1d.cjs) ─────────────────
  // Re-pins: the 1d code changes that reach a Phase 1a/1b/1c/2 view. The words are frozen (scripts/_lp2-frozen.cjs
  // applies 1d's as-moved overlay too), so only CODE changes show here, each precise.
  { id: '1d-setup-trade-area-codes', part: 'Language Phase 1d (API agent: lib/trade-area.ts codes)', country: 'both',
    what: 'Signup’s trade-area refusals (/api/setup create_truck: country missing / unknown / off, zone, town missing / too long) gain "code" and "params", LAST — named difference 1, with the `tradeArea` codes; `error` and every other field unchanged. (language-phase-1d proves each code’s words are the error, in its copy area.)',
    views: id => /^1c\/api\/(GB|US)\|setup\|(countryMissing|countryUnknown|countryOff|zoneBad|townMissing|townLong)$/.test(id),
    expect: (b, id) => {
      const country = /\/GB\|/.test(id) ? 'United Kingdom' : 'United States'
      const [code, params] = { countryMissing: ['country_missing', {}], countryUnknown: ['country_missing', {}], countryOff: ['country_off', { country }], zoneBad: ['zone_unknown', { country }], townMissing: ['town_missing', {}], townLong: ['town_too_long', {}] }[id.split('|').pop()]
      if (!b || typeof b !== 'object' || typeof b.body !== 'string') return b
      return { ...b, body: b.body.replace(/\}$/, `,"code":${JSON.stringify(code)},"params":${JSON.stringify(params)}}`) }
    } },
  { id: '1d-setup-step-fixture', part: 'Language Phase 1d (fixture re-pin)', country: 'both',
    what: 'FIXTURE, not product: the setup step’s "every error" view handed the step three invented sentences; the step takes trade-area REFUSALS now, so the fixture passes three real ones and the step shows their words ("Choose a country." → "Choose the country your truck is based in.", "Bad zone." → the zone sentence, "Add your town." → "Tell us the town or city you’re based in.").',
    views: id => /^1c\/setup\/(GB|US)\|step\|allErrors$/.test(id),
    expect: b => mapStrings(b, s => s.replace('>Choose a country.<', '>Choose the country your truck is based in.<')
      .replace('>Bad zone.<', '>That time zone isn&#x27;t one we offer in United States. Choose one from the list.<')
      .replace('>Add your town.<', '>Tell us the town or city you’re based in.<')) },
  { id: '1d-us-address-style', part: 'Language Phase 1d (SCHED-A: US address style)', country: 'US',
    what: 'Manage › Schedule’s event card for a US truck (address_format zip_state) says "ZIP code" where it said "postcode" ("Add a postcode with Edit to put it on the map." → "Add a ZIP code with …").',
    views: id => /^2\/extra\/US\|manage\|schedule\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/Add a postcode with/g, 'Add a ZIP code with')) },
  // ⚠️ NOT AN ENTRY, BECAUSE NO VIEW CHANGES: lib/printing/ticket.ts `padBetween` no longer adds a separating space
  // when there is no left label (Part 2, dates agent). It differs only for a right-aligned value at least as long as
  // the whole line (an absurd 43-character phone at 58 mm); every GB ticket this harness prints (1b printing, ~250 at
  // 58 and 80 mm, including the long-name and long-id hand cases) is byte-identical in F, which is the proof.
  // ⚠️ NOT AN ENTRY EITHER: P3-buzzer-removed claims no view today — no 1b fixture reaches the queued no-number
  // removal path. Its transform stays so a fixture that reaches it is proven, not merely allowed.
]

/** The named entries that apply to a view, and what they make of its BEFORE value: { listed: true, entries } when an
 *  entry only LISTS the view; else { expected, touched: [ids of entries whose transform changed something] }. Used by
 *  language-phase-2 and by the 1a / 1b / 1c harnesses (which compare BEFORE + the named changes with their AFTER). */
function apply(id, before) {
  const us = countryOf(id) === 'US'
  const entries = NAMED.filter(e => (e.country === 'both' || (e.country === 'US') === us) && e.views(id))
  if (entries.some(e => !e.expect)) return { entries, listed: true, touched: entries.filter(e => !e.expect).map(e => e.id) }
  let v = before; const touched = []
  for (const e of entries) { const w = e.expect(v, id); if (JSON.stringify(w) !== JSON.stringify(v)) touched.push(e.id); v = w }
  return { entries, listed: false, expected: v, touched }
}

module.exports = { NAMED, apply, mapStrings, mapFields, longDate, clock12, countryOf }
