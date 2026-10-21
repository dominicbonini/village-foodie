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
// ⚠️ RE-PINNED (events that run past midnight + US formats, 17 October 2026, docs/midnight-and-format-fixes-report.md)
const { midnightEntries, uslEntries, uslTruckListCard } = require('./_lp1d-named.cjs')
// ⚠️ RE-PINNED (US layout fixes, 18 October 2026, docs/us-layout-proposal-report.md) — the transforms for the entries at
// the end of NAMED. us-layout-fix-1-nbsp: lib/time-utils.ts clockOf en-US writes U+00A0 before AM/PM — every "6:30 PM"
// the code wrote (and EventTimeSelect's hour labels, clockOf less ":00": "5 PM") now has a no-break space; a word typed
// by a person is not touched by the code, so a stored "5:00 PM" with an ASCII space would make the view FAIL here.
const USL_CLOCK = /\b(\d{1,2}:\d{2}) (AM|PM)\b/g
const uslNbsp = s => s.replace(USL_CLOCK, '$1\u00a0$2').replace(/(<option value="\d{2}"(?: selected="")?>\d{1,2}) (AM|PM)(<\/option>)/g, '$1\u00a0$2$3')
/** a 12-hour formatTimeRange (fix 1) / DealsTab join (fix 1-manage-join): U+00A0 before the dash of "X – Y" (X, Y clocks). */
const USL_RANGE = /(\d{1,2}:\d{2}\u00a0(?:AM|PM)) – (\d{1,2}:\d{2}\u00a0(?:AM|PM))/g
const uslRangeJoin = s => s.replace(USL_RANGE, '$1\u00a0– $2')
/** us-layout-fix-4-import-heading: a 12-hour truck's import row heading "{date} · {time}" (manageScheduleImport.review.summary)
 *  is three spans — the one line from 640px, date and time as two block lines below it. Only when the heading has a time. */
/** The fixture STATE a capture injects as text (not written by clockOf on this code): scripts/_lp1b-dashboard.cjs's
 *  modal|finishEarly sets finishConfirm.endTime = '9:00 PM' (ASCII) directly, so that one sentence keeps BEFORE's space —
 *  the dashboard's own path (setFinishConfirm → formatTime(ev.end_time, dashTime)) writes the no-break space. */
const USL_FIXTURE_TEXT = { 'smoke-dash/US|modal|finishEarly': ['finish until 9:00 PM'] }
const uslNbspView = (s, id) => {
  const keep = USL_FIXTURE_TEXT[id] || []
  keep.forEach((k, i) => { s = s.split(k).join(`\u0000USL${i}\u0000`) })
  s = uslNbsp(s)
  // the Add / Edit event preview (TruckListCard, BEFORE's markup): its range is a 12-hour formatTimeRange — U+00A0 before the dash
  if (/^smoke-schedule\/US\|tab\|/.test(id)) s = s.replace(/(<span class="flex items-center gap-2 text-\[12px\] font-bold text-slate-500 leading-none mt-0\.5"><span>)([^<]*)(<\/span>)/g, (_, a, r, c) => a + uslRangeJoin(r) + c)
  keep.forEach((k, i) => { s = s.split(`\u0000USL${i}\u0000`).join(k) })
  return s
}
const uslImportHeading = s => s.replace(/(<p class="text-sm font-semibold leading-snug (?:text-amber-600|text-slate-900)">)([^<·]+?) · ([^<]*?\d\u00a0(?:AM|PM)[^<]*)(<\/p>)/g,
  (_, p, date, time, end) => `${p}<span class="max-sm:hidden">${date} · ${time}</span><span class="sm:hidden block">${date}</span><span class="sm:hidden block">${time}</span>${end}`)
/** An entry of Phase 2's table (scripts/_lp2-named.cjs NAMED), REUSED — its `what` and `expect` unchanged, ONE copy of
 *  the transform — scoped to this harness's out-of-scope (smoke) views. Throws if the original entry is gone. */
const reuseLp2 = (id, views) => {
  const e = require('./_lp2-named.cjs').NAMED.find(x => x.id === id)
  if (!e || !e.expect) throw new Error(`scripts/_lp2-named.cjs has no precise entry ${id} to reuse`)
  return { ...e, views, smokeOnly: true, agent: `reused from scripts/_lp2-named.cjs ${id} (17 Oct 2026)` }
}


// ══ ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026, docs/plans-data-model-report.md) ══════════════════════
// Every plan gets every feature (lib/features.ts canAccess is override-only). Helpers and the entries are below; the
// entries sit FIRST in NAMED so a substitution runs before every later transform.
const P1 = require('./_lp1d-named.cjs')
const PLANS_BEFORE_DIR = 'language-phase-1d2-before'
/** Part 2's own views shown for a Starter / tester truck → the Max fixture truck's view in the same state (BEFORE). */
const PLANS_SIBLING_2 = {
  'shell/|shell|plan|starter': 'shell/|shell|tab|reports',          // Social media tab shown (every plan has it)
  'shell/|shell|plan|tester': 'shell/|shell|tab|reports',           // Billing tab shown to the owner on every plan
  'reports/|tab|initialStarter': 'reports/|tab|initial',            // the Reports "Pro feature" upsell is removed
  'social/|posts|create|starter': 'social/|posts|create|ready',     // Social media for every plan
  'social/|posts|designs|starter': 'social/|posts|designs|ready',
  'wada/|settings|starter|auto-replies': 'wada/|settings|notConnected|auto-replies',   // WhatsApp card: no "on Pro and Max"
  'wada/|domain|starter': 'wada/|domain|card|website',              // the custom-domain card for every plan
}
const plansSibling2 = id => { const m = /^([^/]+)\/(GB|US)(\|.*)$/.exec(id); const s = m && PLANS_SIBLING_2[`${m[1]}/${m[3]}`]; return s ? s.replace('/|', `/${m[2]}|`) : null }
/** Starter views with NO Max view in the same state in BEFORE → an AFTER-only twin rendered on the fixture truck. */
const PLANS_TWIN = { 'reports/|tab|range|starter': 'reports/|tab|range|starterAsMax', 'social/|posts|locations|starter': 'social/|posts|locations|starterAsMax' }
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): a "starter" truck resolves to Pay as you go, which has
// schedule_graphics OFF — so Social › Locations for it is NOT its twin any more; plans-a2-payg-social-prompt proves it
// (against the same twin's frame). The twin entry keeps Reports › range (Reports is on for every plan).
const A2_PLAN_SWITCHES = !!(BILL_CAT_A2() && BILL_CAT_A2().features && BILL_CAT_A2().features.length)
function BILL_CAT_A2() { return require('./_plans-catalog-fixture.cjs').seedCatalog(require('path').resolve(__dirname, '..')) }
const plansTwin = id => { const m = /^([^/]+)\/(GB|US)(\|.*)$/.exec(id); if (m && A2_PLAN_SWITCHES && m[1] === 'social') return null; const s = m && PLANS_TWIN[`${m[1]}/${m[3]}`]; return s ? s.replace('/|', `/${m[2]}|`) : null }
const plansTwinRaw = id => { const m = /^([^/]+)\/(GB|US)(\|.*)$/.exec(id); const s = m && PLANS_TWIN[`${m[1]}/${m[3]}`]; return s ? s.replace('/|', `/${m[2]}|`) : null }
// React's attribute escaping and its inverse, for a <x-stub data-p="…"> (scripts/_lp1b-dashboard.cjs's stubs).
const stEsc = x => x.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const stDec = x => x.replace(/&(quot|#x27|lt|gt|amp);/g, (_, e) => ({ quot: '"', '#x27': "'", lt: '<', gt: '>', amp: '&' })[e])
/** Every `name` stub's props through fn(props) → props (key order kept by fn); a stub that does not round-trip is left. */
const stProps = (s, name, fn) => s.replace(new RegExp(`<x-stub data-c="${name}" data-p="([^"]*)"`, 'g'), (whole, raw) => {
  const p = JSON.parse(stDec(raw)); if (stEsc(JSON.stringify(p)) !== raw) return whole
  return `<x-stub data-c="${name}" data-p="${stEsc(JSON.stringify(fn(p)))}"`
})
const renameKey = (o, from, to, value) => Object.fromEntries(Object.entries(o).map(([k, v]) => (k === from ? [to, value(v)] : [k, v])))
const PLANS_SENTENCES_2 = ['Not available on this plan', 'Social media posts are on Pro and Max']

// ── Billing: ONE data-driven plan card (plans-data-model, Stage A). STRUCTURAL (proveWith), because the card is new:
//   • the card names the truck's EFFECTIVE plan, from the seeded catalogue (lib/plans.ts effectivePlan: an unknown key —
//     the fixture's old 'starter' / 'max' — or a past end date resolves to the expiry fallback, Pay as you go);
//   • the comparison table below it (header, fee and feature rows, footnotes — scripts/plans-data-model.cjs's own
//     cut) is BYTE-IDENTICAL to BEFORE's (+ the named changes): exactly, where the highlighted column is still the
//     truck's (trial, pro); with no column highlighted where the old key is gone (starter, max → payg); and where BEFORE
//     showed no table (collapsed — pro, max — or tester's empty tab) it is BEFORE pro|matrix's table (pro) or that table
//     with no column highlighted (the rest);
//   • the "Billing & payments" line names the same plan; the switch modal is data-driven (the catalogue's name, price
//     and description; a URL-encoded mailto) and opens only for a real plan ('max' is none); iOS shows no purchase panel.
const BILL_CAT = require('./_plans-catalog-fixture.cjs').seedCatalog(require('path').resolve(__dirname, '..'))
const BILL_TABLE_START = '<div class="flex items-start justify-between mb-2 sticky top-0 z-30 bg-white pt-2">'
const BILL_NOTES_START = '<div class="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1.5">'
/** The comparison table as scripts/plans-data-model.cjs cuts it (rows balanced from the header, then the footnotes). */
const billTable = html => {
  if (typeof html !== 'string') return null
  const st = html.indexOf(BILL_TABLE_START); if (st < 0) return null
  const n = html.indexOf(BILL_NOTES_START, st); if (n < 0) return null
  let depth = 0, i = n
  const re = /<div\b|<\/div>/g; re.lastIndex = n
  for (let m; (m = re.exec(html));) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) { i = m.index + 6; break } }
  let d = 0, keep = ''
  for (const part of html.slice(st, n).split(/(<div\b[^>]*>|<\/div>)/)) { if (part === '</div>') { if (d === 0) continue; d-- } else if (part.startsWith('<div')) d++; keep += part }
  return keep + '\n' + html.slice(n, i)
}
/** The highlighted ("current plan") column made neutral (scripts/plans-data-model.cjs `neutral`). */
const billNeutral = x => x && x.replace(/text-sm font-semibold text-orange-500">✓/g, 'text-sm font-semibold text-slate-500">✓')
  .replace(/border-b-2 border-orange-500/g, 'border-b-2 border-slate-100').replace(/tracking-widest text-orange-500/g, 'tracking-widest text-slate-400')
  .replace(/whitespace-nowrap text-orange-600/g, 'whitespace-nowrap text-slate-900').replace(/leading-snug text-orange-600/g, 'leading-snug text-slate-600')
/** The fixture's plan key and whether its end date is past (scripts/_lp1d2-shell.cjs BILLING: trial|expired, starter|withTrialDate). */
// `id` in either harness's shape: 'shell/<CC>|billing|<state>' (Part 2) or 'billing/billing|<CC>|<state>' (Phase 1e).
const billKey = id => { const m = /^shell\/(GB|US)\|billing\|(.*)$/.exec(id) || /^billing\/billing\|(GB|US)\|(.*)$/.exec(id); return m ? `${m[1]}|${m[2]}` : null }
const billEffective = id => {
  const m = /^(GB|US)\|([a-z]+)(\|.*)?$/.exec(billKey(id))
  const key = m[2], ended = /^\|(expired|withTrialDate)\b/.test(m[3] || '')
  const fallback = BILL_CAT.plans.find(p => p.isExpiryFallback)
  const assigned = BILL_CAT.plans.find(p => p.key === key && p.active)
  return { cc: m[1], key, plan: !assigned || ended ? fallback : assigned }
}
/** The proof, given how to read BEFORE pro|matrix (+ that harness's named changes) for a country — the table a view
 *  that showed none in BEFORE must now show. */
const makeBillingProof = siblingExpected => function billingProof(exp, f, id) {
  const problems = []
  if (typeof f !== 'string' || typeof exp !== 'string') return { ok: false, problems: [`${id}: not HTML`] }
  const { cc, key, plan } = billEffective(id)
  if (!f.includes(`Current plan</p><p class="text-2xl font-bold text-slate-900 mt-1">${plan.name}</p>`)) problems.push(`the plan card does not name the effective plan "${plan.name}"`)
  const foot = /Pizza Kitchen · ([^<]*) plan</.exec(f)
  if (foot && foot[1] !== plan.name) problems.push(`"Billing & payments" names "${foot[1]}", not "${plan.name}"`)
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the frozen comparison table (and its numbered footnotes) is
  // REPLACED by THE one plan table (components/pricing/PlanTable.tsx — the same as /features) with the truck's effective
  // plan's column highlighted (none for a plan that is no column: a trial, a tester), its amounts under the card's price
  // mask, and the pricing footnote below it (scripts/_lp-stage-b.cjs billingTableProblems). scripts/pricing-pages.cjs
  // proves the table itself. On a tree without Stage B, the frozen table's byte proof as before.
  const STAGE_B = require('./_lp-stage-b.cjs')
  if (STAGE_B.LANDED) problems.push(...STAGE_B.billingTableProblems(f, plan.key, /\|hidePricing$/.test(id)))
  else {
    const tf = billTable(f), te = billTable(exp)
    let want
    if (te) want = ['starter', 'max'].includes(key) ? billNeutral(te) : te
    else {
      const ts = billTable(siblingExpected(cc))
      want = key === 'pro' ? ts : billNeutral(ts)
    }
    if (!tf) problems.push('no comparison table below the plan card')
    else if (tf !== want) problems.push(`the comparison table is not BEFORE's (${te ? (want === te ? 'exact' : 'no column highlighted') : 'BEFORE pro|matrix'}) byte for byte`)
  }
  const modal = f.includes('fixed inset-0 bg-black/50 z-50')
  if (/\|upgradePro$/.test(id)) {
    const pro = BILL_CAT.plans.find(p => p.key === 'pro'), price = BILL_CAT.prices.find(p => p.planKey === 'pro' && p.countryCode === cc)
    const sym = cc === 'US' ? '$' : '£'
    if (!modal || !f.includes(`${sym}${price.monthlyMinor / 100}/month — ${pro.description}`) || !/mailto:[^"]*\?subject=[^"&]*%20Pro%20%E2%80%94%20Pizza%20Kitchen/.test(f)) problems.push('the switch modal is not the catalogue’s Pro (name, price, description, URL-encoded mailto)')
  }
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): a TRIAL plan card states its length from the catalogue
  // (plans.trial_months, manageBilling.plan.trialMonths "A {months}-month free trial."); no other plan's card does.
  if (plan.trialMonths != null || BILL_CAT.plans.some(p => p.trialMonths)) {
    const line = /A \d+-month free trial\./.exec(f)
    const want = plan.isTrial && plan.trialMonths ? `A ${plan.trialMonths}-month free trial.` : null
    if ((line ? line[0] : null) !== want) problems.push(`the plan card's trial length is ${JSON.stringify(line ? line[0] : null)}, not ${JSON.stringify(want)}`)
  }
  // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): "not started" (a trial with no end date) shows its heading alone — the body
  // <p> ("Your free trial hasn’t started yet.", manageBilling.notStarted.body) is deleted. PRECISE (scripts/_lp-pricing-tidy.cjs).
  if (/\|notStarted(\||$)/.test(id) && require('./_lp-pricing-tidy.cjs').LANDED) problems.push(...require('./_lp-pricing-tidy.cjs').notStartedProblems(f))
  if (/\|upgradeMax(\||$)/.test(id) && modal) problems.push('a switch modal opened for "max", which is no plan')
  if (/\|ios$/.test(id) && f.includes('Change your plan')) problems.push('iOS shows a purchase panel')
  return { ok: !problems.length, problems: problems.map(x => `${id}: ${x}`) }
}
const billingProof = makeBillingProof(cc => { const sibId = `shell/${cc}|billing|pro|matrix`; return apply(sibId, P1.plansBefore(PLANS_BEFORE_DIR, sibId)).expected })

// ══ ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026) ══════════════════════════════════════════════
// Plans switch features (public.plan_features; NO ROW = ON). The seed switches whatsapp_replies, schedule_graphics and
// instagram_messenger_replies OFF for Pay as you go — the plan an unknown key ("starter") resolves to. Where the PLAN is
// why, Manage shows the ONE upgrade prompt (components/PlanPrompt.tsx), naming the first public plan with the feature.
/** The prompt's exact HTML for `feature` in country `cc`, every word and number from the seed and the A2 message. */
const A2_SENTENCE = { schedule_graphics: 'Social media posts are included on', whatsapp_replies: 'WhatsApp auto-replies are included on' }
function a2Prompt(feature, cc) {
  const cat = BILL_CAT_A2()
  const off = new Set(cat.features.filter(f => f.feature === feature && f.enabled === false).map(f => f.planKey))
  const up = cat.plans.filter(p => p.active && p.isPublic && !off.has(p.key)).sort((a, b) => a.sortOrder - b.sortOrder)[0]
  const price = cat.prices.find(r => r.planKey === up.key && r.countryCode === cc)
  const amt = price.monthlyMinor % 100 === 0 ? String(price.monthlyMinor / 100) : (price.monthlyMinor / 100).toFixed(2)
  const sym = cc === 'US' ? '$' : '£'
  return `<div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-4"><div><div class="text-sm font-medium text-slate-700">${A2_SENTENCE[feature]} ${up.name}.</div><div class="text-xs text-slate-400 mt-0.5">${up.name} · ${sym}${amt}/mo · ${up.description}</div></div><a href="?tab=billing" class="text-xs font-medium text-teal-600 hover:text-teal-700 whitespace-nowrap">Upgrade →</a></div>`
}
/** The balanced <div …>…</div> starting at `start` (the index of its "<div"), or null. */
function a2DivAt(html, start) {
  const re = /<div\b|<\/div>/g; re.lastIndex = start; let d = 0
  for (let m; (m = re.exec(html));) { d += m[0] === '</div>' ? -1 : 1; if (d === 0) return html.slice(start, m.index + 6) }
  return null
}
const a2Head = html => { const i = typeof html === 'string' ? html.indexOf('<div class="min-w-0" data-tab-head="true">') : -1; return i < 0 ? null : a2DivAt(html, i) }
const a2Titles = html => (html.match(/<p class="text-\[17px\] font-bold leading-tight text-slate-900">[^<]*<\/p>/g) || [])
/** Social › a tab for a Pay-as-you-go truck: STRUCTURAL (the tab is the old frame with every working body replaced by the prompt). */
function a2SocialProof(exp, f, id, all) {
  const problems = []
  const cc = /^social\/(GB|US)\|/.exec(id)[1]
  const twin = plansTwinRaw(id)
  const ref = twin ? all && all[twin] : exp
  if (typeof f !== 'string' || typeof ref !== 'string') return { ok: false, problems: [`${id}: no HTML to compare (reference ${twin || 'BEFORE sibling'})`] }
  const P = a2Prompt('schedule_graphics', cc)
  const n = f.split(P).length - 1
  const rest = f.split(P).join('')
  if (n < 1) problems.push('no upgrade prompt naming the first public plan with social media posts (seed: Pro), with its price and description')
  if (rest.includes('rounded-lg border border-slate-200 bg-slate-50 px-4 py-3')) problems.push('a prompt that is not the exact catalogue prompt')
  if (a2Head(f) === null || a2Head(f) !== a2Head(ref)) problems.push(`the tab head differs from ${twin ? 'the twin' : 'BEFORE’s sibling'} (${twin || 'plans-every-plan-every-feature-2'})`)
  const tf = a2Titles(f), tr = a2Titles(ref)
  let j = 0; for (const x of tr) if (x === tf[j]) j++
  if (j !== tf.length) problems.push(`the card titles ${JSON.stringify(tf)} are not, in order, the reference’s ${JSON.stringify(tr)}`)
  const working = rest.replace(/<button type="button" data-loc-back="true"[^>]*>[^<]*<\/button>/g, '').match(/<(img|input|select|textarea|canvas|button|link)\b/g)
  if (working) problems.push(`working content is still rendered for a plan without social media posts: ${[...new Set(working)].join(', ')}`)
  return { ok: !problems.length, problems: problems.map(x => `${id}: ${x}`) }
}
/** Every object field `plan: "max"` → "unlimited", at any depth, inside JSON-encoded strings too (each re-encoded as it was). */
function a2PlanMaxToUnlimited(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(a2PlanMaxToUnlimited(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(a2PlanMaxToUnlimited)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'plan' && x === 'max' ? 'unlimited' : a2PlanMaxToUnlimited(x)]))
  return v
}
/** The WhatsApp channel card in Settings › auto-replies, as the sibling (BEFORE) rendered it. */
const A2_WA_CARD = '<div class="rounded-xl border border-slate-200 p-3"><div class="flex flex-wrap items-start justify-between gap-2"><div class="min-w-0"><p class="text-sm font-bold text-slate-800">WhatsApp</p>'

const plansEntries2 = () => [
  { id: 'plans-billing-plan-card', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): Manage › Billing is ONE data-driven plan card for every plan (the effective plan’s name, price, promo, included amount, description and ended note; the trial box; "Change your plan" with the other public plans; a data-driven switch modal) above the FROZEN comparison table (lib/legacy-pricing-display.ts). STRUCTURAL (billingProof): the card names the effective plan; the table is BEFORE’s byte for byte (exact for trial / pro; no column highlighted for the gone starter / max keys; BEFORE pro|matrix’s where BEFORE showed none); the modal is the catalogue’s; iOS has no purchase panel. scripts/plans-data-model.cjs proves the same table claims on its own captures.',
    views: id => /^shell\/(GB|US)\|billing\|(trial|starter|pro|max|tester)(\||$)/.test(id),
    proveWith: billingProof },
  // Part 1's views, re-rendered here as smoke: Part 1's own entries (one copy), over this harness's BEFORE.
  ...P1.plansEntries({ prefix: 'smoke-', beforeDir: PLANS_BEFORE_DIR, smokeOnly: true }),
  { id: 'plans-every-plan-every-feature-2', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): no plan gates a feature. A Starter / tester truck sees exactly what the Max fixture truck saw in the same state: the shell (Social media tab; Billing tab for the owner on every plan), Reports (no "Pro feature" upsell), Social media posts, the WhatsApp card (no "on Pro and Max") and the custom-domain card. PRECISE: F = BEFORE of that sibling view (+ the later named changes).',
    views: id => plansSibling2(id) != null,
    expect: (b, id) => P1.plansBefore(PLANS_BEFORE_DIR, plansSibling2(id)) },
  { id: 'plans-starter-twin', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): Reports › range (event filter) and Social › Locations (a place selected) for a Starter truck — BEFORE has no Max view in these states, so each capture renders an AFTER-only TWIN, the same state on the fixture truck (`…|starterAsMax`). STRUCTURAL: the Starter view must equal its twin byte for byte (the plan changes nothing).',
    views: id => plansTwin(id) != null,
    proveWith: (exp, f, id, all) => {
      const tw = plansTwin(id)
      if (!all || !(tw in all)) return { ok: false, problems: [`the twin ${tw} is not in this capture`] }
      return JSON.stringify(all[tw]) === JSON.stringify(f) ? { ok: true, problems: [] } : { ok: false, problems: [`${id} differs from its twin ${tw}`] }
    } },
  { id: 'plans-payments-on-trial-prop', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): Manage hands PaymentsTab `onTrial` (the effective plan’s isTrial) where it handed `plan`: the stub’s prop "plan":"max" → "onTrial":false, in the same place. PRECISE.',
    views: id => /^shell\/(GB|US)\|/.test(id),
    expect: b => mapStrings(b, x => stProps(x, 'PaymentsTab', p => ('plan' in p ? renameKey(p, 'plan', 'onTrial', v => v === 'trial') : p))) },
  // The dashboard's PrintingSettings props — Phase 2's precise entry (scripts/_lp2-named.cjs), REUSED on the smoke-dash views.
  reuseLp2('plans-printing-settings-props', id => /^smoke-dash\/(GB|US)\|/.test(id)),
  { id: 'plans-weekly-post-copy-gone', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): lib/copy/weeklyPost.ts (WEEKLY_POST_PLAN_REFUSAL, `weeklyPost.planRefusal`) is DELETED — the gate is override-only and refuses with errorsManage.feature_switched_off. The copy view records the export’s absence (scripts/_lp1d2-poster.cjs ADAPT). PRECISE.',
    views: id => /^poster\/(GB|US)\|copy\|weeklyPost\|W$/.test(id),
    expect: b => (b && typeof b === 'object' && typeof b.WEEKLY_POST_PLAN_REFUSAL === 'string' ? { ...b, WEEKLY_POST_PLAN_REFUSAL: '[removed in Stage A: lib/copy/weeklyPost.ts and weeklyPost.planRefusal]' } : b) },
  { id: 'plans-refusal-switched-off-2', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the plan refusals of Part 2’s routes ("Not available on this plan" — embed, domain provisioning; "Social media posts are on Pro and Max" — the weekly post, a place’s usual type) are gone; the fixtures switch the feature off by OVERRIDE (embed_schedule / schedule_graphics) and the route refuses with feature_switched_off: body → {"error":"This feature is switched off for your truck.","code":"feature_switched_off","params":{}}. Status and every write byte-identical. PRECISE.',
    views: id => /^api\/(GB|US)\|(manage\|(embed|provision|usualType)\.notOnPlan|weeklyPost\|plan\.(load|font_confirm)|weeklyPostGET\|plan)$/.test(id),
    expect: P1.plansRefusal(PLANS_SENTENCES_2) },
  { id: 'plans-manage-get-catalogue-2', country: 'both', agent: 'plans-data-model Stage A (19 Oct 2026)',
    what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): GET /api/manage answers the plan catalogue (`plans`, right after `countrySettings`) — the same change Part 1 names (plans-manage-get-catalogue). PRECISE.',
    views: id => /^api\/(GB|US)\|manageGET\|/.test(id),
    expect: P1.plansGetCatalogue },
  // ── ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026) ──
  { id: 'plans-a2-fixture-plan-unlimited', country: 'both', agent: 'plan-features-config Stage A2 (20 Oct 2026)',
    what: '⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the API fixture truck (scripts/_lp1d2-api.cjs) is on `unlimited`, the plan Stage A mapped "max" to — "max" now resolves to Pay as you go WITH its switches (social media posts off → every weekly-post call refused). The truck row the routes answer records "plan":"max" → "plan":"unlimited" (at any JSON nesting). PRECISE: that one value.',
    views: id => A2_PLAN_SWITCHES && /^api\/(GB|US)\|/.test(id),
    expect: b => a2PlanMaxToUnlimited(b) },
  { id: 'plans-a2-payments-features-prop', country: 'both', agent: 'plan-features-config Stage A2 (20 Oct 2026)',
    what: '⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): Manage hands PaymentsTab a `features` prop (the truck’s FeatureAccessView — Pay at Hatch’s plan prompt reads it), right after `onTrial`. The view is three functions, which the stub’s JSON drops: it records as {}. PRECISE.',
    views: id => A2_PLAN_SWITCHES && /^shell\/(GB|US)\|/.test(id),
    expect: b => mapStrings(b, x => stProps(x, 'PaymentsTab', p => ('onTrial' in p && !('features' in p) ? Object.fromEntries(Object.entries(p).flatMap(([k, v]) => (k === 'onTrial' ? [[k, v], ['features', {}]] : [[k, v]]))) : p))) },
  { id: 'plans-a2-payg-social-prompt', country: 'both', agent: 'plan-features-config Stage A2 (20 Oct 2026)',
    what: '⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): Social media for a "starter" truck (→ Pay as you go, schedule_graphics OFF) — the tab still shows (the plan, not an override, is why) with its head and card frames, and every working body is the ONE upgrade prompt ("Social media posts are included on Pro." + Pro’s seeded price and description + "Upgrade →" to Billing). STRUCTURAL (a2SocialProof): the exact catalogue prompt at least once; the tab head byte-identical to BEFORE’s sibling (create, designs) or the AFTER twin (locations); the card titles a subsequence of the reference’s; no image, input, button or preload left but the phone’s "All locations" back button.',
    views: id => A2_PLAN_SWITCHES && /^social\/(GB|US)\|posts\|(create|designs|locations)\|starter$/.test(id),
    proveWith: a2SocialProof },
  { id: 'plans-a2-payg-whatsapp-prompt', country: 'both', agent: 'plan-features-config Stage A2 (20 Oct 2026)',
    what: '⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): Settings › auto-replies for a "starter" truck (→ Pay as you go, whatsapp_replies OFF): the WhatsApp card keeps its title and shows the ONE upgrade prompt ("WhatsApp auto-replies are included on Pro." + Pro’s seeded price and description) in place of its subtitle and live controls. PRECISE: in BEFORE’s sibling (notConnected), that one card replaced by <title row><div class="mt-2">PROMPT</div>; every other byte unchanged.',
    views: id => A2_PLAN_SWITCHES && /^wada\/(GB|US)\|settings\|starter\|auto-replies$/.test(id),
    expect: (b, id) => mapStrings(b, x => {
      const i = x.indexOf(A2_WA_CARD); if (i < 0) return x
      const card = a2DivAt(x, i); if (!card) return x
      const cc = /^wada\/(GB|US)\|/.exec(id)[1]
      return x.replace(card, `<div class="rounded-xl border border-slate-200 p-3"><div class="flex flex-wrap items-start justify-between gap-2"><p class="text-sm font-bold text-slate-800">WhatsApp</p></div><div class="mt-2">${a2Prompt('whatsapp_replies', cc)}</div></div>`)
    }) },
  // ── ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026, docs/pricing-pages-report.md; scripts/_lp-stage-b.cjs) ──
  { id: 'address-formats-1-country-key-2', country: 'both', agent: 'address-formats-1 (21 Oct 2026)',
    what: '⚠️ RE-PINNED (address-formats-1, 21 October 2026): GET /api/manage’s `countrySettings.addressFormat` is the address FORMAT KEY ("postcode" → "gb", "zip_state" → "us") — the same change Part 1 names (address-formats-1-country-key). PRECISE.',
    views: id => /^api\/(GB|US)\|manageGET\|/.test(id),
    expect: b => require('./_lp-address-formats-1.cjs').countrySettingsAddressKey(b) },
  { id: 'pricing-b-country-settings-fields-2', country: 'both', agent: 'pricing-pages Stage B (20 Oct 2026)',
    what: '⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): GET /api/manage’s `countrySettings` no longer carries the six plan-price fields (lib/country-settings.ts stopped selecting them) — the same change Part 1 names (pricing-b-country-settings-fields). PRECISE.',
    views: id => /^api\/(GB|US)\|manageGET\|/.test(id),
    expect: b => require('./_lp-stage-b.cjs').countrySettingsFieldsGone(b) },
  { id: 'pricing-b-catalogue-ignored-features-2', country: 'both', agent: 'pricing-pages Stage B (20 Oct 2026)',
    what: '⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the catalogue GET /api/manage answers ends with `ignoredFeatures` ([] on the seed) — the same change Part 1 names (pricing-b-catalogue-ignored-features). PRECISE.',
    views: id => /^api\/(GB|US)\|manageGET\|/.test(id),
    expect: b => require('./_lp-stage-b.cjs').catalogueIgnoredFeatures(b) },
  { id: 'pricing-b-first-load-line', country: 'both', agent: 'pricing-pages Stage B (20 Oct 2026)',
    what: '⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the first-load failure line — "Invalid or expired token" for an auth refusal, the reason otherwise (manageShell.loadFailedReason) — is centred with a side gutter for the longer sentence: its <p> gains `text-center px-4`. Same words here (no load ran). PRECISE.',
    views: id => /^shell\/(GB|US)\|shell\|invalidToken$/.test(id),
    expect: b => mapStrings(b, require('./_lp-stage-b.cjs').INVALID_TOKEN_P) },
  // (A not-ok load answer with no `error` still toasts "Failed to load", as before Stage B — no named change for the
  // handler|load views; the coordinator's fix of 20 October 2026 removed the "HTTP <status>" message.)
]

const NAMED = [
  // ⚠️ RE-PINNED (plans-data-model, Stage A): FIRST, so a substitution runs before every later transform.
  ...plansEntries2(),
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
  // ⚠️ RE-PINNED (Language Phase 1e): two Phase 1e US-only code changes reach Part 2's views. GB is untouched (proven:
  // every GB view still equals BEFORE). Each is a precise transform; scripts/language-phase-1e.cjs proves them too.
  { id: '1e-us-billing-footnote-dates', country: 'US', agent: 'FEATURES (Language Phase 1e)',
    what: 'Billing › plan comparison footnote 4 (lib/plan-features.ts footnotes(s)): the WhatsApp dates go through formatLongDate on the country’s settings — for a US truck "From 1 October 2026 … Correct at 16 September 2026" → "From October 1, 2026 … Correct at September 16, 2026" (the same rule Part 2 named for Settings › Auto-replies, 1d2-us-whatsapp-dates).',
    views: id => /^shell\/US\|billing\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/From 1 October 2026/g, 'From October 1, 2026').replace(/Correct at 16 September 2026/g, 'Correct at September 16, 2026')) },
  // ── ⚠️ RE-PINNED (events that run past midnight, 17 October 2026, docs/midnight-and-format-fixes-report.md) ───────
  //    OUT OF SCOPE (smoke): Part 1's Schedule views — the end select's options (notSameAs), the "Ends the next day"
  //    hint and the import review's layout. The SAME three precise transforms Part 1 names (scripts/_lp1d-named.cjs
  //    midnightEntries), here on GB AND US (826471a already had the US 12-hour pickers, so a US view is byte-proven
  //    too: the transform writes the US hour labels "12 AM" … "11 PM").
  ...midnightEntries(/^smoke-schedule\/(GB|US)\|/).map(e => ({ ...e, smokeOnly: true })),
  // ⚠️ RE-PINNED (events that run past midnight + US formats, 17 October 2026, docs/midnight-and-format-fixes-report.md):
  // OUT OF SCOPE (smoke) — four intended changes Phase 2's table already names precisely for the 1b dashboard / Phase 2
  // card views. REUSED, not copied (reuseLp2): the same `expect`, scoped here to smoke-schedule / smoke-dash.
  //   midnight-card-time-nbsp-US       TruckListCard's 12-hour range keeps "5:00 PM" whole with a no-break space — the
  //                                    Add / Edit event form's card preview (US smoke-schedule tab views).
  //   midnight-dayloadstrip-event-prop the dashboard hands DayLoadStrip event={activeEvent}: its stub's props gain `event`
  //                                    after `eventDate` (the stub module scripts/_lp1b-dashboard.cjs is not edited).
  //   midnight-finish-modal-time-prop  EventFinishTimeModal gets time={dashTime}: its stub's props gain `time` after `busy`.
  //   midnight-completed-slot-US       the Completed list's slot on the truck's clock: US "🕐 18:30" → "🕐 6:30 PM".
  reuseLp2('midnight-card-time-nbsp-US', id => /^smoke-schedule\/US\|/.test(id)),
  reuseLp2('midnight-dayloadstrip-event-prop', id => /^smoke-dash\/(GB|US)\|/.test(id)),
  reuseLp2('midnight-finish-modal-time-prop', id => /^smoke-dash\/(GB|US)\|/.test(id)),
  reuseLp2('midnight-completed-slot-US', id => /^smoke-dash\/US\|/.test(id)),
  { id: '1e-us-app-store-link', country: 'US', agent: 'CHROME + lead (Language Phase 1e)',
    what: 'Settings › the App Store badge (components/StoreBadges countryCode={truck?.country}, lib/app-badges appStoreUrlFor): a US truck gets the LOCALE-FREE listing https://apps.apple.com/app/id6803543106 instead of the UK storefront’s https://apps.apple.com/gb/app/hatchgrab/id6803543106. GB keeps the UK link byte-identical.',
    views: id => /^smoke-settings\/US\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/https:\/\/apps\.apple\.com\/gb\/app\/hatchgrab\/id6803543106/g, 'https://apps.apple.com/app/id6803543106')) },
  // ── ⚠️ RE-PINNED (US layout fixes, 18 October 2026, docs/us-layout-proposal-report.md) ─────────────────────────────
  //    PRECISE on GB and US. The Manage edits reach Part 1's Schedule / Settings views (smoke — the same transforms Part 1
  //    names, scripts/_lp1d-named.cjs uslEntries), and the 12-hour no-break space reaches every US view with a time.
  { id: 'us-layout-fix-1-nbsp', country: 'US', agent: 'US layout fixes (18 Oct 2026)',
    what: '⚠️ RE-PINNED (18 October 2026): lib/time-utils.ts — an en-US clockOf writes U+00A0 before AM/PM ("6:30 PM"; EventTimeSelect’s hour labels "5 PM" with it), a 12-hour formatTimeRange U+00A0 before the dash. PRECISE: every "H:MM AM|PM" in a US view gains the no-break space (the shell’s stale notice, Reports’ order times and BOTH CSVs’ time columns, the dashboard header and Completed slots, Settings’ examples, the paste example, the menu read-back, the hour pickers’ "5 PM"); the Add / Edit preview card’s range also gains it before the dash (formatTimeRange); 24-hour (GB) byte-identical — no GB view is claimed. One sentence is fixture STATE, not code output, and keeps its ASCII space (USL_FIXTURE_TEXT: the finish-early modal’s injected endTime).',
    views: id => countryOf(id) === 'US',
    expect: (b, id) => mapStrings(b, x => uslNbspView(x, id)) },
  { id: 'us-layout-fix-1-manage-join', country: 'US', agent: 'US layout fixes (18 Oct 2026)', smokeOnly: true,
    what: '⚠️ RE-PINNED (18 October 2026): app/manage/[token]/page.tsx DealsTab — a deal’s slot range on a 12-hour truck joins with U+00A0 + "– " ("11:30 AM – 2:00 PM"). PRECISE: the deals views’ "X – Y" (both clocks) gain the no-break space before the dash.',
    views: id => /^smoke-menu\/US\|deals\|/.test(id),
    expect: b => mapStrings(b, uslRangeJoin) },
  ...uslEntries(/^smoke-schedule\/(GB|US)\|/, /^smoke-settings\/(GB|US)\|[^|]+\|page$/).map(e => ({ ...e, smokeOnly: true })),
  { id: 'us-layout-fix-4-import-heading', country: 'US', agent: 'US layout fixes (18 Oct 2026)', smokeOnly: true,
    what: '⚠️ RE-PINNED (18 October 2026): Manage › Import review, 12-hour trucks only — the row heading "{date} · {time}" is `<span class="max-sm:hidden">` (the one line, from 640px) + two `sm:hidden block` spans (date, time). PRECISE (uslImportHeading); 24-hour unchanged (no GB view claimed).',
    views: id => /^smoke-schedule\/US\|tab\|import\|/.test(id),
    expect: b => mapStrings(b, uslImportHeading) },
  // ── ⚠️ RE-PINNED (US dress rehearsal fixes, 19 October 2026, docs/us-dress-rehearsal-fixes-report.md) ─────────────────
  { id: 'us-rehearsal-fix-event-state', country: 'US', agent: 'US dress rehearsal fixes (19 Oct 2026)', smokeOnly: true,
    what: '⚠️ RE-PINNED (19 October 2026): the Add / Edit event form, US (zip_state) style only — a State box ("State", "e.g. NJ", empty on every fixture event) beside the ZIP code, the two in `grid grid-cols-[5.5rem_1fr] gap-2`. PRECISE: the ZIP code field is wrapped with the State field before it; GB (postcode style) unchanged — no GB view claimed.',
    views: id => /^smoke-schedule\/US\|tab\|/.test(id),
    expect: b => mapStrings(b, x => x.replace(/<div><label class="block text-xs font-bold text-slate-600 mb-1">ZIP code<\/label><input type="text" placeholder="e\.g\. 78701" class="([^"]*)" value="[^"]*"\/><\/div>/g,
      (zip, cls) => `<div class="grid grid-cols-[5.5rem_1fr] gap-2"><div><label class="block text-xs font-bold text-slate-600 mb-1">State</label><input type="text" placeholder="e.g. NJ" class="${cls}" value=""/></div>${zip}</div>`)) },
  // ── ⚠️ RE-PINNED (US polish batch, 19 October 2026, docs/us-polish-batch-report.md) ────────────────────────────────
  { id: 'us-polish-thousands-separators', country: 'both', agent: 'US polish batch (19 Oct 2026)',
    what: 'lib/money-format.ts groups every displayed amount ≥ 1,000 ("£1,234.56", "$1,234.56"); a printed ticket keeps its line width (scripts/_us-polish-grouping.cjs). PRECISE. The Reports CSVs are excluded — they keep raw figures.',
    views: id => !/csv/i.test(id),
    expect: b => mapStrings(b, require('./_us-polish-grouping.cjs').groupString) },
  // ── ⚠️ RE-PINNED (seo-fixes S7, 20 October 2026, docs/seo-fixes-report.md) ─────────────────────────────────────────
  //    OUT OF SCOPE (smoke): components/StoreBadges.tsx — both badge <img>s gain loading="lazy", so React no longer emits
  //    their two image preload links. Manage › Settings shows the badges (GB and US). PRECISE, one copy
  //    (scripts/_lp-seo-fixes.cjs badgesLazy, also named by Part 1 and Phase 1e).
  { id: 'seo-s7-badges-lazy', country: 'both', agent: 'seo-fixes (20 Oct 2026)', smokeOnly: true,
    what: '⚠️ RE-PINNED (seo-fixes S7, 20 October 2026): Manage › Settings — the App Store / Google Play badges load lazily: loading="lazy" on both <img>s (after height), their two <link rel="preload" as="image"> gone. PRECISE, GB and US.',
    views: id => /^smoke-settings\/(GB|US)\|[^|]+\|page$/.test(id),
    expect: b => mapStrings(b, require('./_lp-seo-fixes.cjs').badgesLazy) },
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

module.exports = { makeBillingProof, billTable, billNeutral, NAMED, SMOKE_SHARED, apply, countryOf, mapStrings, mapFields, clock12 }
