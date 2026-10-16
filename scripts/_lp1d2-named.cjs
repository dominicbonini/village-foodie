// scripts/_lp1d2-named.cjs — THE NAMED CODE CHANGES of Language Phase 1d Part 2 (Manage: Payments, Billing, Reports,
// Team, Social posts, WhatsApp, custom domain, account deletion, the shell). A MODULE, read by
// scripts/language-phase-1d2.cjs and scripts/_lp1d2-checks.cjs.
//
// "F" is the AFTER code rendered with the BEFORE words (826471a's pair + the as-moved overlays). Wherever F differs from
// BEFORE, the CODE changed the output — and every such view must be claimed by an entry below (or be named difference 1,
// an API refusal's added `code`/`params`, which scripts/_lp1d2-checks.cjs proves per field):
//   { id, country: 'GB' | 'US' | 'both', what, views: (viewId) => bool, expect?: (beforeValue, viewId) => value }
// • With `expect`, the entry is PRECISE: F must equal expect(BEFORE) byte for byte.
// • Without `expect` (US only), the entry LISTS its views as changed by a named US behaviour; the harness writes each one
//   to scripts/fixtures/language-phase-1d2-us-changed.txt and the US-words check still reads every one.
// SMOKE_SHARED: a named SHARED word change that reaches an OUT-OF-SCOPE view (Part 1's tabs, the dashboard) because the
//   two surfaces read one key: { id, what, views: RegExp, keys: ['ns.key' | 'ns.prefix*'], us?: true }.
// View ids: `<area>/<GB|US>|…` (area = shell, reports, payments, social, poster, wada, api, smoke).
const { mapStrings, mapFields, clock12, applyNamed, pendingCardEntry } = require('./_lp2-named.cjs')
const countryOf = id => (id.split('/').slice(1).join('/').split('|')[0] === 'US' ? 'US' : 'GB')

const PLAN_NAME = { trial: 'Trial', starter: 'Starter', pro: 'Pro', max: 'Max' }
const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 'YYYY-MM-DD' → the GB short date "Tue 13 Oct" (lib/time-utils's English short-month rule: "Sep", never "Sept"). */
const gbShort = ymd => { const [y, m, d] = ymd.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return `${DAY3[w]} ${d} ${MON3[m - 1]}` }
/** The custom-domain words as F renders them (826471a's words + as-moved), text → key under customDomain. */
let CD = null
/** text → every customDomain key with that F text (two providers can share a sentence). */
const cdKeysOf = text => {
  if (!CD) {
    const W = require('./_lp1d2-words.cjs')
    CD = new Map()
    for (const [k, v] of W.LP2.leaves(W.catalogues('F')['en-GB'].customDomain || {})) { if (!CD.has(v)) CD.set(v, []); CD.get(v).push(k) }
  }
  return CD.get(text) || []
}
const providerOf = k => (/^providers\.([^.]+)\./.exec(k) || [])[1]
/** A provider object's steps / caveat words → the message keys the answer now carries. */
function preflightKeys(bodyText) {
  let o; try { o = JSON.parse(bodyText) } catch { return bodyText }
  const walk = x => {
    if (Array.isArray(x)) return x.map(walk)
    if (!x || typeof x !== 'object') return x
    // The provider these steps belong to: the one whose keys carry the most of its sentences (a shared sentence such as
    // "Put the first value below in “Name”." then resolves to THIS provider's key).
    const texts = [...(Array.isArray(x.steps) ? x.steps : []), ...(typeof x.caveat === 'string' ? [x.caveat] : [])]
    const votes = {}
    for (const t of texts) for (const p of new Set(cdKeysOf(t).map(providerOf).filter(Boolean))) votes[p] = (votes[p] || 0) + 1
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0]
    const keyOf = t => { const ks = cdKeysOf(t); return ks.find(k => providerOf(k) === best) ?? ks[0] }
    const out = {}
    for (const [k, v] of Object.entries(x)) {
      if (k === 'steps' && Array.isArray(v) && v.every(s => typeof s === 'string')) out[k] = v.map(s => keyOf(s) ?? s)
      else if (k === 'caveat' && typeof v === 'string') out[k] = keyOf(v) ?? v
      else out[k] = walk(v)
    }
    return out
  }
  return JSON.stringify(walk(o))
}
const NAMED = [
  // ── SHELL ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d2-billing-plan-header', country: 'both', agent: 'SHELL',
    what: 'Billing › the plan comparison’s column headers: the DOM text is the plan’s NAME from PLAN_META ("Trial", "Starter", "Pro", "Max") instead of the raw plan id ("trial", "starter", …). The header is CSS `uppercase`, so what a person sees is unchanged ("STARTER").',
    views: id => /^shell\/(GB|US)\|billing\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/(uppercase tracking-widest text-[a-z0-9-]+">)(trial|starter|pro|max)(<\/p>)/g, (m, a, p, c) => a + PLAN_NAME[p] + c)) },
  // ── PAYMENTS ──────────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d2-taking-cash-help-shared', country: 'GB', agent: 'PAYMENTS',
    what: 'Payments › "Taking payment" › the truck-level cash row’s help now reads the ONE sentence Settings already uses (manageSettings.vans.takesCashHelp), so Part 1’s named typography fix on that key shows here too: "Cash" and "Card" → “Cash” and “Card”.',
    views: id => /^payments\/GB\|taking\|cashRow\|/.test(id),
    expect: b => mapStrings(b, s => s.replace('Splits the payment button into &quot;Cash&quot; and &quot;Card&quot;', 'Splits the payment button into “Cash” and “Card”')) },
  // ── SOCIAL-A ──────────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d2-social-sept-sep', country: 'GB', agent: 'SOCIAL-A',
    what: 'Social posts › every short date (SocialPosts shortDate → formatYmdShortMonth): September is "Sep", never Intl’s en-GB "Sept" — "Sat 26 Sept" → "Sat 26 Sep" (Phase 2’s P2-sept-sep rule; September only).',
    views: id => /^social\/GB\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/\bSept\b/g, 'Sep').replace(/\bSEPT\b/g, 'SEP')) },
  // ── SOCIAL-B ──────────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d2-weeklypost-event-date', country: 'GB', agent: 'SOCIAL-B',
    what: 'Weekly post › the event list under the post: a raw ISO date reached the screen ("2026-10-14", "2026-10-14 · cancelled"); it is the truck’s short date now (shortDate(e.date, country)): "Wed 14 Oct", "Wed 14 Oct · cancelled".',
    views: id => /^social\/GB\|weekly\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/(<span class="text-xs text-slate-400 block">)(\d{4}-\d{2}-\d{2})/g, (m, a, d) => a + gbShort(d))) },
  // ── WADA (custom domain) ──────────────────────────────────────────────────────────────────────────────────
  { id: '1d2-domain-preflight-step-keys', country: 'both', agent: 'WADA',
    what: 'app/api/manage `domain_preflight` SUCCESS body — a WIRE-FORMAT change (rule 7: servers send codes, screens supply words): the provider’s `steps[]` and `caveat` carry the customDomain message KEYS ("providers.cloudflare.open", …) instead of the English sentences; CustomDomainSetup words them with t(key) in the truck’s locale. Proven precisely: each key’s F words (826471a + as-moved) ARE the sentence BEFORE sent; the GB screen (wada area, record/provider steps) is byte-identical.',
    views: id => /^api\/(GB|US)\|manage\|preflight\.(ok|limiterDown)$/.test(id),
    expect: b => (b && typeof b === 'object' && typeof b.body === 'string' ? { ...b, body: preflightKeys(b.body) } : b) },
  // ── US BEHAVIOUR (LISTED: each view is in scripts/fixtures/language-phase-1d2-us-changed.txt; the US-words check
  //    reads every one) ─────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d2-us-reports-van-label', country: 'US', agent: 'REPORTS',
    what: 'Reports › the scope chip is vanFilterLabel(…, the truck’s locale): "All vans" → "All trucks" for a US truck.',
    views: id => /^reports\/US\|tab\|vans\|/.test(id) },
  { id: '1d2-us-taking-shared-words', country: 'US', agent: 'PAYMENTS',
    what: 'Payments › "Taking payment" reads the dashboard’s own completion words (completionSettings.*, moved from dashboard.settings.*) and Settings’ takesCashHelp — keys that already had US words at 826471a ("Mark paid & picked up", "Picked up", "at the window", "sales … cash register").',
    views: id => /^payments\/US\|(taking|page)\|/.test(id) },
  { id: '1d2-us-week-start', country: 'US', agent: 'SOCIAL-B',
    what: 'Social posts › the week follows the country’s week start: WeeklyPost’s week label is weekLabel(start, country) ("w/c Sunday, October 11th"), and the design editor’s "Days run Monday to Sunday" is built from weekdayName on the truck’s week ("Days run Sunday to Saturday").',
    views: id => /^social\/US\|(weekly|editor)\|/.test(id) },
  { id: '1d2-us-whatsapp-dates', country: 'US', agent: 'WADA',
    what: 'Settings › Auto-replies: the reply-limit reset date and Meta’s price dates go through time-utils on the truck’s clock (formatResetDate / formatLongDate): "resets 1 November" → "resets November 1", "From 1 October 2026 … Correct at 16 September 2026" → "From October 1, 2026 … Correct at September 16, 2026".',
    views: id => /^wada\/US\|settings\|/.test(id) },
  // ── ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md) ─────────────────────
  //    OUT OF SCOPE (smoke): Part 1's Schedule tab views render the pending card of e2 ("Market Square", an unconfirmed
  //    scraper event), whose layout and DOM order changed on purpose. STRUCTURAL, proven in the smoke section by
  //    scripts/_lp2-named.cjs pendingCardProof (rest of the view byte-identical with the card cut out of both; the
  //    card's words BEFORE's apart from the named ones). Claims a view only when its BEFORE has a pending card; A === F
  //    is still required of every one of them, unchanged.
  pendingCardEntry(id => /^smoke-schedule\/(GB|US)\|tab\|/.test(id)),
]

const SMOKE_SHARED = [
  { id: '1d2-smoke-trial-note', keys: ['managePayments.trialNote'], us: true,
    views: /^smoke-copy\/(GB|US)\|settingsCopy\|CONNECTING_STRIPE_NOT_A_COMMITMENT$/,
    what: 'lib/settings-copy.ts CONNECTING_STRIPE_NOT_A_COMMITMENT was deleted (PAYMENTS); Part 1’s copy view reads its words from managePayments.trialNote, whose named GB fix (straight \' → ’) shows there in A.' },
]

// ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): through Phase 2's applyNamed,
// so the structural `pending-card-layout` entry (`prove`) is understood; every other view gets what the old loop gave.
function apply(id, before) {
  return applyNamed(NAMED, countryOf(id) === 'US', id, before)
}

module.exports = { NAMED, SMOKE_SHARED, apply, countryOf, mapStrings, mapFields, clock12 }
