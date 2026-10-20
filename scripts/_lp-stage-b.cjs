// scripts/_lp-stage-b.cjs — ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): THE NAMED CHANGES OF STAGE B of the new
// pricing (docs/pricing-pages-report.md), shared by the language-phase harnesses (0, 1c, 1d, 1d2, 1e, 1e-tidy, 2). A MODULE.
//
// Stage B replaced, ON PURPOSE, a handful of marketing / billing views: the landing's #pricing (banner → cards from data →
// cheapest bar → footnote), /features (h1 / lede / callout / THE plan table / footnote; one SEO change — its description),
// /compare's calculator (suggested plan = the cheapest at the volume, the free-months default = the trial's months, the
// allowance sentence and the results from the catalogue), the plans PDF (banner, cards, cheapest bar, the plan table,
// footnote), Manage › Billing's frozen comparison table → <PlanTable> + the pricing footnote, the van modal's body, the
// trial popup's offer line, Billing's "not started" body, the first-load failure line, and the welcome email (a trial line
// when a trial is running). The one plan table and the cards are proven by scripts/pricing-pages.cjs.
//
// HOW THE BYTE-IDENTICAL HARNESSES SEE IT — never "accept every diff":
//   • a REGION a Stage B view replaced is CUT from both BEFORE (+ the harness's earlier named changes) and F, at the same
//     anchors, and EVERYTHING ELSE in the view stays byte-identical; the region in F is then checked for what Stage B put
//     there (markers in order, the catalogue's plan names, the highlighted column), from the migrations' own seed;
//   • a one-line change is a PRECISE transform (exact strings, each must apply — a no-op is a failure).
const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** The plan catalogue the three plan migrations seed (20261024 / 20261025 / 20261026), lib/plans.ts PlanCatalog shape. */
const catalog = () => require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
/** True on a tree with Stage B (the pricing-pages migration and the one plan table). */
const LANDED = require('fs').existsSync(path.join(REPO, 'supabase/migrations/20261026_pricing_pages.sql')) && require('fs').existsSync(path.join(REPO, 'components/pricing/PlanTable.tsx'))
const publicPlans = () => catalog().plans.filter(p => p.active && p.isPublic).sort((a, b) => a.sortOrder - b.sortOrder)
const trialMonths = () => { const t = catalog().plans.find(p => p.active && p.isTrial && p.trialMonths); return t ? t.trialMonths : null }
const highlighted = () => (publicPlans().find(p => p.isHighlighted) || null)
// ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the plan table's two row footnotes (scripts/_lp-pricing-tidy.cjs), checked
// inside Stage B's /features, PDF and Billing regions on a tree with pricing-tidy. Lazy, so a checkpoint copy never needs it.
const PT = () => require('./_lp-pricing-tidy.cjs')
// ⚠️ RE-PINNED (compare-tidy, 20 October 2026): the calculator without the staff question (scripts/_lp-compare-tidy.cjs),
// applied to BEFORE inside calcProof on a tree with compare-tidy. Lazy, like PT.
const CT = () => require('./_lp-compare-tidy.cjs')
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

/** The end (index after the closing tag) of the balanced <tag …>…</tag> that opens at `start`, or -1. */
function closeOf(html, start, tag = 'div') {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g'); re.lastIndex = start; let d = 0
  for (let m; (m = re.exec(html));) { d += m[0] === `</${tag}>` ? -1 : 1; if (d === 0) return m.index + m[0].length }
  return -1
}
const mark = name => `⟦STAGE B: ${name}⟧`
/** Cut each [start, end) a cutter finds (cutters run in order on the string as cut so far) → { rest, regions, missing }. */
function cut(html, cutters) {
  let rest = html; const regions = {}; const missing = []
  for (const [name, find] of cutters) {
    const r = find(rest)
    if (!r) { missing.push(name); continue }
    regions[name] = rest.slice(r[0], r[1]); rest = rest.slice(0, r[0]) + mark(name) + rest.slice(r[1])
  }
  return { rest, regions, missing }
}
/** Every marker found, in this order, in `s` (each after the previous). */
const inOrder = (s, markers) => { let at = 0; for (const m of markers) { const i = s.indexOf(m, at); if (i < 0) return `"${m}" missing or out of order`; at = i + m.length } return null }
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `@${i}: expected …${JSON.stringify(a.slice(Math.max(0, i - 80), i + 100))}\n        got      …${JSON.stringify(b.slice(Math.max(0, i - 80), i + 100))}` }

/** A structural proof: both cut at `cutters`; the rest byte-identical; `check(regions of F)` → problems. */
function scoped(name, cutters, check) {
  return (exp, f) => {
    if (typeof exp !== 'string' || typeof f !== 'string') return { ok: false, problems: [`${name}: not HTML`] }
    const E = cut(exp, cutters), F = cut(f, cutters)
    const problems = []
    if (E.missing.length) problems.push(`${name}: BEFORE has no ${E.missing.join(', ')} region (stale anchor)`)
    if (F.missing.length) problems.push(`${name}: F has no ${F.missing.join(', ')} region`)
    if (!problems.length && E.rest !== F.rest) problems.push(`${name}: outside Stage B's regions the view is not byte-identical ${firstDiff(E.rest, F.rest)}`)
    if (!F.missing.length && check) problems.push(...check(F.regions, E.regions).map(p => `${name}: ${p}`))
    return { ok: !problems.length, problems }
  }
}

// ── 1 · the landing's #pricing ───────────────────────────────────────────────────────────────────────────────────
// Kept: the section's own tag, its wrap and the price-head's eyebrow + h2 (byte-identical). Cut: from the h2's end to the
// section's close — BEFORE's lede, banner, plan cards, "Compare all features" and price-foot; F's banner, cards, cheapest
// bar and footnote.
const PRICING_CUT = ['landing #pricing', html => {
  const s = html.indexOf('<section id="pricing"'); if (s < 0) return null
  const e = closeOf(html, s, 'section'); const h2 = html.indexOf('</h2>', s)
  return e < 0 || h2 < 0 || h2 > e ? null : [h2 + 5, e - '</section>'.length]
}]
function pricingCheck(R) {
  const r = R['landing #pricing']; const p = []
  const o = inOrder(r, ['<div class="trial-banner">', '<div class="plans">', '<div class="cheap-bar">', '<p class="price-note">']); if (o) p.push(`F's #pricing: ${o} (banner → cards → cheapest bar → footnote)`)
  if (/<p class="lede">|price-foot|Compare all features/.test(r)) p.push("F's #pricing still carries the old lede / price-foot / “Compare all features”")
  const names = [...r.matchAll(/<div class="plan-name">([^<]*)<\/div>/g)].map(m => m[1])
  const want = publicPlans().map(x => escHtml(x.name))
  if (JSON.stringify(names) !== JSON.stringify(want)) p.push(`F's cards are ${JSON.stringify(names)}, not the catalogue's public plans ${JSON.stringify(want)}`)
  const hl = highlighted(), hero = /<div class="plan hero-plan"><span class="plan-tag">[^<]*<\/span><div class="plan-name">([^<]*)<\/div>/.exec(r)
  if ((hero ? hero[1] : null) !== (hl ? escHtml(hl.name) : null)) p.push(`F's highlighted card is ${JSON.stringify(hero && hero[1])}, not the catalogue's ${JSON.stringify(hl && hl.name)}`)
  const tm = trialMonths()
  if (tm && !r.includes(`Your first ${tm} months are completely free`)) p.push(`F's banner does not offer the trial's ${tm} months`)
  return p
}
const landingPricing = scoped('pricing-b-landing-pricing', [PRICING_CUT], pricingCheck)

// ── 2 · /features ──────────────────────────────────────────────────────────────────────────────────────────────────
// Kept: the head, the nav, the footer (byte-identical). Cut: the page body between </nav> and <footer.
const FEATURES_CUT = ['/features body', html => { const n = html.indexOf('</nav>'); const f = html.indexOf('<footer', n); return n < 0 || f < 0 ? null : [n + 6, f] }]
/** The one plan table's column names and the highlighted column (null = none), from its header row. */
function planTableHead(html) {
  const i = html.indexOf('<div class="pt pt-card"'); if (i < 0) return null
  const e = closeOf(html, i); const t = html.slice(i, e)
  const head = [...t.matchAll(/<div class="pt-col( pt-hl)?" role="columnheader"><span class="pt-col-name">([^<]*)<\/span>/g)]
  return { html: t, end: e, names: head.map(m => m[2]), hl: (head.find(m => m[1]) || [])[2] ?? null, count: (html.match(/<div class="pt pt-card"/g) || []).length }
}
function featuresCheck(R) {
  const r = R['/features body']; const p = []
  const o = inOrder(r, ['<h1>', '<p class="lede">', '<div class="pt pt-card"', '<p class="price-note">']); if (o) p.push(`F's /features: ${o} (h1 → lede → plan table → footnote)`)
  const t = planTableHead(r)
  if (!t || t.count !== 1) p.push(`F's /features has ${t ? t.count : 0} plan tables, not 1`)
  else {
    const want = publicPlans().map(x => escHtml(x.name)), hl = highlighted()
    if (JSON.stringify(t.names) !== JSON.stringify(want)) p.push(`the plan table's columns are ${JSON.stringify(t.names)}, not ${JSON.stringify(want)}`)
    if (t.hl !== (hl ? escHtml(hl.name) : null)) p.push(`the plan table highlights ${JSON.stringify(t.hl)}, not the catalogue's ${JSON.stringify(hl && hl.name)}`)
  }
  if (/<p class="eyebrow">Compare<\/p>|<h2>Every feature, side by side\.<\/h2>/.test(r)) p.push("F's /features still carries the old heading")
  if (PT().LANDED) p.push(...PT().tableNotesProblems(r, 'features'))   // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): rows ¹ ², footnotes 1, 2
  return p
}
const featuresPage = scoped('pricing-b-features-page', [FEATURES_CUT], featuresCheck)
/** THE ONE SEO change (Stage B): /features's description. Titles, canonicals, hreflang, robots, og:url unchanged. */
const FEATURES_DESCRIPTION = {
  before: 'Every HatchGrab feature on every plan, side by side — Starter, Pro and Max, with fees and allowances. Your first month includes everything.',
  // the plan list joined as the locale joins a list (Intl.ListFormat: en-GB "A, B and C", en-US "A, B, and C")
  after: (locale = 'en-GB') => `Every HatchGrab feature on every plan, side by side — ${new Intl.ListFormat(locale, { type: 'conjunction' }).format(publicPlans().map(x => x.name))}, with fees and allowances. Your first ${trialMonths()} months include everything.`,
}
/** Every string equal to BEFORE's description → Stage B's (in metadata objects: description, openGraph / twitter description). */
function featuresDescription(v, locale = 'en-GB') {
  let hit = 0
  const walk = x => (typeof x === 'string' ? (x === FEATURES_DESCRIPTION.before ? (hit++, FEATURES_DESCRIPTION.after(locale)) : x) : Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x)
  const out = walk(v)
  if (!hit) throw new Error('pricing-b-features-description: BEFORE carries no old /features description (stale)')
  return out
}

// ── 3 · /compare's calculator ─────────────────────────────────────────────────────────────────────────────────────
// Kept: every step, its question, inputs and labels, the footer notes (byte-identical). Cut: the suggested-plan card's
// body (eyebrow → the card's end: the plan, its sentence, the "Use … instead" buttons), step 4's allowance sentence, the
// months-free input's value, and the results (`#cost-results`). The free-months default is the trial's months: where
// BEFORE showed the old default (1) F must show plans.trial_months.
const CALC_EYEBROW = /<p class="text-xs font-bold uppercase tracking-wider text-slate-400">(We suggest|Your choice)<\/p>/
const CALC_CUTS = [
  ['suggested plan', html => { const m = CALC_EYEBROW.exec(html); if (!m) return null; const nx = html.indexOf('<div class="rounded-2xl border bg-white', m.index); return nx < 0 ? null : [m.index, nx] }],
  ['allowance sentence', html => { const r = html.indexOf('aria-label="Monthly online order value per truck"'); if (r < 0) return null; const s = html.indexOf('<p class="mt-3 text-sm leading-relaxed text-slate-600">', r); const nx = html.indexOf('<div class="rounded-2xl border bg-white', r); return s < 0 || (nx >= 0 && s > nx) ? null : [s, html.indexOf('</p>', s) + 4] }],
  ['months-free value', html => { const m = /aria-label="Months free" value="[^"]*"/.exec(html); return m ? [m.index, m.index + m[0].length] : null }],
  ['results', html => { const s = html.indexOf('<div id="cost-results"'); return s < 0 ? null : [s, closeOf(html, s)] }],
]
/** The cutters that apply to a view: the suggested plan and the results only where BEFORE has them. */
function calcProof(exp, f) {
  if (typeof exp !== 'string' || typeof f !== 'string') return { ok: false, problems: ['pricing-b-compare-calc: not HTML'] }
  // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): on a tree without the staff question, BEFORE (+ the harness's named
  // changes) first takes compare-tidy's PRECISE calculator transform (scripts/_lp-compare-tidy.cjs calc: the staff card
  // removed, the suggested-plan panel moved into the orders card after the "£X included…" line, ungated on question 1,
  // renumbered) — then Stage B's cuts and checks below, unchanged. Lazy, so a checkpoint copy never needs it.
  if (CT().CALC_LANDED) { try { exp = CT().calc(exp) } catch (e) { return { ok: false, problems: [`pricing-b-compare-calc: ${e.message}`] } } }
  // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): with the months-free question gone (scripts/_lp-compare-tidy.cjs
  // FREE_LANDED — calc() above removed its card from BEFORE), the months-free value is cut only where BEFORE (so
  // transformed) still has it, i.e. never on this tree: F must have no such input (the rest is byte-identical). The months
  // are the data's (plans.trial_months) or the page's `?free=N`, inside the results, which this proof cuts.
  const freeGone = CT().CALC_LANDED && CT().FREE_LANDED
  const cuts = CALC_CUTS.filter(([n, find]) => (n === 'months-free value' && !freeGone) || find(exp) != null)
  const check = (R, ER) => {
    const p = []
    if (freeGone) { if (/aria-label="Months free"/.test(f)) p.push('F still shows the months-free input (compare-tidy-2 removed it)') }
    else {
      const fv = /value="([^"]*)"/.exec(R['months-free value'] || '')[1], ev = /value="([^"]*)"/.exec(ER['months-free value'] || '')[1]
      const want = ev === '1' && trialMonths() ? String(trialMonths()) : ev
      if (fv !== want) p.push(`months free is ${JSON.stringify(fv)}, not ${JSON.stringify(want)} (BEFORE ${JSON.stringify(ev)}; the default is the trial's months)`)
    }
    if (R['suggested plan']) {
      const name = /<p class="mt-1 text-2xl font-black"[^>]*>([^<]*)<\/p>/.exec(R['suggested plan'])
      if (!name || !publicPlans().some(x => escHtml(x.name) === name[1])) p.push(`the suggested plan ${JSON.stringify(name && name[1])} is not one of the catalogue's public plans`)
    }
    return p
  }
  return scoped('pricing-b-compare-calc', cuts, check)(exp, f)
}

// ── 4 · the plans PDF ──────────────────────────────────────────────────────────────────────────────────────────────
// Kept: the doctype, head and the @page line; the doc head (logo, title, generated date); the closing paragraph (byte-
// identical). Cut: the stylesheet after @page (new card / banner / table rules), and the content between the doc head and
// the closing paragraph. F's content: banner → cards → cheapest bar → the plan table → footnote.
const PDF_CUTS = [
  ['stylesheet', html => { const a = html.indexOf('@page'); const s = html.indexOf('\n', a); const e = html.indexOf('</style>', s); return a < 0 || e < 0 ? null : [s, e] }],
  ['content', html => { const d = html.indexOf('<div class="doc-head">'); if (d < 0) return null; const e = closeOf(html, d); const c = html.indexOf('<p>Figures are the published plan terms', e); return c < 0 ? null : [e, c] }],
]
function pdfCheck(R) {
  const r = R.content; const p = []
  const o = inOrder(r, ['<div class="banner">', '<div class="cards">', '<table>', '<div class="fn">']); if (o) p.push(`F's PDF: ${o} (banner → cards → table → footnote)`)
  if (!/class="cheap"/.test(r)) p.push("F's PDF has no cheapest bar")
  const names = [...r.matchAll(/<div class="c-name">([^<]*)<\/div>/g)].map(m => m[1]), want = publicPlans().map(x => escHtml(x.name))
  if (JSON.stringify(names) !== JSON.stringify(want)) p.push(`the PDF's cards are ${JSON.stringify(names)}, not ${JSON.stringify(want)}`)
  if (PT().LANDED) p.push(...PT().tableNotesProblems(r, 'pdf'))   // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): rows ¹ ², footnotes 1, 2
  return p
}
const plansPdf = scoped('pricing-b-plans-pdf', PDF_CUTS, pdfCheck)

// ── 5 · Manage › Billing: the one plan table + the pricing footnote (makeBillingProof, scripts/_lp1d2-named.cjs) ──────
/** F's Billing table check: one PlanTable, the public plans as columns, the effective plan's column highlighted (none for a
 *  plan that is not a column — a trial, a tester), amounts masked under hidePricing, the pricing footnote right after it. */
function billingTableProblems(f, effectiveKey, masked) {
  const p = []
  const t = planTableHead(f)
  if (!t || t.count !== 1) return [`Billing shows ${t ? t.count : 0} plan tables (components/pricing/PlanTable.tsx), not 1`]
  const pub = publicPlans(), want = pub.map(x => escHtml(x.name)), hl = pub.find(x => x.key === effectiveKey)
  if (JSON.stringify(t.names) !== JSON.stringify(want)) p.push(`the plan table's columns are ${JSON.stringify(t.names)}, not ${JSON.stringify(want)}`)
  if (t.hl !== (hl ? escHtml(hl.name) : null)) p.push(`the plan table highlights ${JSON.stringify(t.hl)}, not the effective plan's column ${JSON.stringify(hl ? hl.name : null)}`)
  // A zero amount ("£0 / month", a 0% fee) is no commercial information and is never masked (PlanTable zeroOr) — any OTHER
  // amount must be.
  if (masked && /[£$](?:[1-9]|0[.,]\d*[1-9])/.test(t.html)) p.push('a non-zero amount shows in the plan table although prices are hidden')
  if (!masked && !/[£$]\d/.test(t.html)) p.push('no amount shows in the plan table')
  if (!f.slice(t.end).startsWith('<p class="text-xs text-slate-500 mt-3 px-1">* ')) p.push('the pricing footnote does not follow the plan table')
  if (f.includes('<div class="flex items-start justify-between mb-2 sticky top-0 z-30 bg-white pt-2">')) p.push('the frozen comparison table is still rendered')
  if (PT().LANDED) p.push(...PT().tableNotesProblems(f, 'billing'))   // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): rows ¹ ², footnotes 1, 2
  return p
}

// ── 6 · the welcome email and verify-signup (lib/email-signup.ts, app/api/auth/verify-signup/route.ts) ──────────────
// No running trial in these fixtures (no trial_expires_at) → no trial line, the HTML byte-identical. The route hands the
// email `trialMonths` (null here), last.
/** Every [`sendOperatorWelcomeEmail`, args] call recorded (at any depth, inside JSON strings too) gains `trialMonths: null`, last. */
function welcomeTrialArg(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(welcomeTrialArg(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) {
    if (v.length === 2 && v[0] === 'sendOperatorWelcomeEmail' && v[1] && typeof v[1] === 'object' && !('trialMonths' in v[1])) return [v[0], { ...v[1], trialMonths: null }]
    return v.map(welcomeTrialArg)
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, welcomeTrialArg(x)]))
  return v
}

// ── 7 · CountrySettings without the plan-price fields (lib/country-settings.ts no longer selects them) ──────────────
// GET /api/manage hands Manage `countrySettings`: Stage B dropped starterMonthlyMinor / proMonthlyMinor / maxMonthlyMinor /
// proAllowanceMinor / maxAllowanceMinor / platformFeePct from the type and the loader (the columns stay in the database;
// prices are plan_prices). PRECISE: exactly those keys leave every country-settings object (one with `countryCode` and
// `allergenSet`), at any depth — inside JSON strings too, each re-encoded as it was; nothing else moves.
const RETIRED_CS_FIELDS = ['starterMonthlyMinor', 'proMonthlyMinor', 'maxMonthlyMinor', 'proAllowanceMinor', 'maxAllowanceMinor', 'platformFeePct']
function countrySettingsFieldsGone(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(countrySettingsFieldsGone(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(countrySettingsFieldsGone)
  if (!v || typeof v !== 'object') return v
  const isCs = 'countryCode' in v && 'allergenSet' in v
  return Object.fromEntries(Object.entries(v).filter(([k]) => !(isCs && RETIRED_CS_FIELDS.includes(k))).map(([k, x]) => [k, countrySettingsFieldsGone(x)]))
}

// ── 8 · the plan catalogue's `ignoredFeatures` (lib/plans.ts splitUnknownFeatures) ──────────────────────────────────
// The loader moves a plan_features row naming no code feature to `ignoredFeatures` (Admin's warning): GET /api/manage's
// `plans` ends with it — [] on the seed, which names only real features. PRECISE: that one key, last, on a captured
// response body ({ status, body: "<json>" }) whose `plans` lacks it.
function catalogueIgnoredFeatures(b) {
  if (!b || typeof b !== 'object' || typeof b.body !== 'string') return b
  let body; try { body = JSON.parse(b.body) } catch { return b }
  if (!body || !body.plans || typeof body.plans !== 'object' || 'ignoredFeatures' in body.plans || JSON.stringify(body) !== b.body) return b
  return { ...b, body: JSON.stringify({ ...body, plans: { ...body.plans, ignoredFeatures: [] } }) }
}

// ── 9 · Manage's first load (app/manage/[token]/page.tsx load()) ───────────────────────────────────────────────────
// Stage B: "Invalid or expired token" only for an auth refusal; any other first-load failure shows its reason
// (manageShell.loadFailedReason) — the line's <p> gained `text-center px-4` for the longer sentence. PRECISE.
const INVALID_TOKEN_P = s => s.split('<p class="text-red-500 font-bold">Invalid or expired token</p>').join('<p class="text-red-500 font-bold text-center px-4">Invalid or expired token</p>')

module.exports = { RETIRED_CS_FIELDS, countrySettingsFieldsGone, catalogueIgnoredFeatures, INVALID_TOKEN_P, LANDED, catalog, publicPlans, trialMonths, highlighted, closeOf, cut, scoped, inOrder,
  landingPricing, featuresPage, FEATURES_DESCRIPTION, featuresDescription, calcProof, plansPdf, planTableHead, billingTableProblems,
  welcomeTrialArg }
