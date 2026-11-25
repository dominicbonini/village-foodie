#!/usr/bin/env node
// docs/compare-research-4/build.cjs — compare-research-4 (agents 1–3, docs/compare-research-4/agent-{1,2,3}/raw/*.json) into the importer data file
// data/compare-research-4/competitors.json. A copy of docs/compare-research-3/build.cjs (all its review rules kept); formerly:
// A copy of docs/compare-research-2/build-wave-2.cjs (its review rules kept), plus the neighbouring-market
// rule (Dominic, 25 Nov): a row with "neighbour" (LI from CH, GI from GB) says so in its plans' notes (a copy of docs/compare-research-1/build.cjs), and VALIDATES it with the importer's own
// pure rules (lib/data-import/research.ts researchProblems) plus our own checks. It NEVER connects to the database: the
// stored competitors' full ids come from docs/compare-research-4/stored-ids.json (read once on 25 Nov 2026 with a read-only SELECT).
//
//   node docs/compare-research-4/build.cjs            build + validate (exit 1 on any problem)
//   node docs/compare-research-2/build.cjs --check    validate the existing data file only
//
// 🔴 Prices: the importer writes plans' monthly_minor AS GIVEN (no conversion). The agents record MAJOR units as the page
// shows them; this script converts with the repo's own toMinorUnits (lib/money-format.ts, which knows zero-decimal
// currencies such as JPY), and re-checks every plan: monthly_minor / 10^digits must equal the recorded amount. That is
// the guard against compare-status-1 §1.4's 100× prices.
'use strict'
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const ROOT = path.resolve(__dirname, '../..')
const jiti = require(path.join(ROOT, 'node_modules/jiti'))(__filename, { alias: { '@': ROOT }, interopDefault: true })
const { researchProblems } = jiti(path.join(ROOT, 'lib/data-import/research.ts'))
const { toMinorUnits, minorDigits } = jiti(path.join(ROOT, 'lib/money-format.ts'))
const { saysNotOffered, QUOTE_MAX } = jiti(path.join(ROOT, 'lib/competitor-check/model.ts'))

// coordinator/raw: merges of the agents' own quotes (no new reads), read last so they replace an agent's plans for that country
const RAWS = ['agent-1', 'agent-2', 'agent-3', 'coordinator'].map(a => path.join(__dirname, a, 'raw'))
const OUT = path.join(ROOT, 'data/compare-research-4/competitors.json')
const { implausibleMonthly } = jiti(path.join(ROOT, 'lib/price-units.ts'))
const STORED = JSON.parse(fs.readFileSync(path.join(__dirname, 'stored-ids.json'), 'utf8'))   // { prefix: { id, name, website, lifecycle } }
const FEATURE_KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/comparison-features/features.json'), 'utf8')).features.map(f => f.key)
const KEYS = ['ahead', 'preorder', 'capacity', 'schedule', 'whatsapp', 'social', 'kds', 'offline', 'walkup', 'vans', 'domain', 'monthly', 'perorder', 'cardfee']
const FOCUS = ['food_truck', 'street_food_markets', 'nearest_local', 'pop_up', 'pos']
const CHECKED_ON = '2026-11-25'
// ── Dominic's standing decisions (compare-fix-1, 24 Nov 2026), applied to this research ─────────────────────────────────────────
// Never counted (a booking tool, not a food-ordering platform): left out of the file entirely.
const EXCLUDED_HOSTS = ['anolla.com']
// STORED competitors the research found failing the ordering rule everywhere → set_lifecycle not_relevant (reason + page from raw).
const NOT_RELEVANT = [/* filled after review — see docs/compare-research-3-report.md */]
// STORED competitors not sold (or not eligible) in a country only → not_sold_in (never shown on that page).
const NOT_SOLD_IN = { /* filled after review */ }
// STORED not-relevant competitors the research found eligible → set_lifecycle active.
const REVIVE = [/* filled after review */]
// A research plan whose name differs from the stored plan it corrects.
const RENAME = { 'afe2f58d|ZA|resto shop': 'Shop' }   // compare-research-4: agent 1's "Resto shop" is the stored plan "Shop"
const CORRECT_EVEN_IF_NOT_RELEVANT = []
// Coordinator review (25 Nov 2026): plans recorded by the agents that must never be published as a stated monthly price — the page
// shows no currency, or the plan is not shown to include online ordering (a till / base plan, or an add-on to a base plan not read).
// They are imported as evidence with `unclear: true` (lib/comparison-publish.ts planVerdict never counts an unclear plan).
// Each: [website host, country ('*' = every country), plan-name pattern, reason].
const UNCLEAR = [
  ['blinkco.io', '*', /./, 'the price is shown only as "$" with no currency code and no country'],
  ['foodics.com', 'SA', /./, 'the KSA pricing page shows the amounts without any currency symbol, and the bundles are not shown to include online ordering'],
  ['nemtakeaway.no', 'NO', /./, 'the price is shown as a bare number with no currency (the agent notes it is invoiced in DKK)'],
  ['sumup.com', 'CO', /./, 'the Colombian page came back in English with mixed $ and £ amounts, so the currency is not certain'],
  ['klikit.io', '*', /^core$/i, 'Core alone has no webshop (online ordering needs the Omni add-on)'],
  ['ichefpos.com', 'TW', /pos/i, 'the base POS plan: online takeaway is a separately priced add-on whose price is not shown'],
  ['esb.id', 'ID', /^basic$/i, 'not shown to include ESB Order'],
  ['fu.do', 'AR', /pos/i, 'the till plan, not the online-ordering module (Tu Delivery)'],
  ['fu.do', 'CO', /^tu delivery/i, 'an add-on to a Fudo base plan whose price was not read, so it is not the whole monthly price'],
  ['inyad.com', 'MA', /pos/i, 'the till licence, not the online-ordering product'],
  ['laddition.com', 'LU', /./, 'a "from" price for the till; the page does not say the Click & Collect module is included'],
  ['sparissimofood.com', 'LI', /./, 'its blog and its home page show different prices, and the Liechtenstein evidence is one restaurant on its subdomain'],
  ['vitrina.cafe', 'LT', /./, 'Lithuania is only named on its main page and the price is borrowed from its Slovak page'],
  ['vitrina.cafe', 'LV', /./, 'Latvia is only named on its main page and the price is borrowed from its Slovak page'],
  ['rent-a-shop.ch', '*', /onlineshop/i, 'the Onlineshop is an add-on module to the till plan, not the whole monthly price'],
  ['fu.do', 'CO', /^plan inicial \(/i, 'the base till plan; online ordering (Tu Delivery) is a separately priced add-on on top of it'],
  ['joinposter.com', 'UA', /^poster site/i, 'the ordering-website add-on on its own, not a whole monthly price (it needs a POS plan)'],
  ['joinposter.kz', 'KZ', /^poster site/i, 'the ordering-website add-on on its own, not a whole monthly price (it needs a POS plan)'],
  ['joinposter.kz', 'KZ', /^mini/i, 'a POS plan; the ordering website is a separately priced add-on'],
  ['zunapro.com', 'TR', /ba[sş]lang[ıi][cç]/i, 'not confirmed that the entry package includes "Paket sipariş & gel-al"'],
]
// A vendor whose page prices only ONE country ("Prices for Kuwait"): its plans are written for that country only; elsewhere it keeps
// its entry and evidence, with no plan (so a Kuwaiti price never lands on another country, nor corrects a stored one there).
const PLANS_ONLY_IN = { 'zyda.com': ['KW'] }
// wave 2: a vendor whose presence in most countries rests only on a generic phrase ("Restaurantes en América Latina") — rows kept only
// where its own site names the country; the others go to the reviewer's not_relevant list (the evidence stays in the raw files).
const PRESENCE_ONLY_IN = { 'olaclick.com': ['EC'] }
// compare-research-3 review: rows an agent marked eligible WITHOUT the required quotes — listed as unreadable (evidence incomplete), never imported.
// compare-research-3b (Dominic, 25 Nov): a competitor found NOT RELEVANT on review (by website host) — its eligible rows become reviewer notes
// and the file carries a set_lifecycle not_relevant row for it (its id is the build's own stable id for that host).
const REVIEW_NOT_RELEVANT = [['aporederbot.duckdns.org', 'not a confirmed live product: its only site is a dynamic-DNS (duckdns.org) address — the compare-research-3b standard for Resto-SaaS (compare-research-4, 25 Nov)', 'https://aporederbot.duckdns.org/'],
  ['resto-saas-production-a095.up.railway.app', 'not a confirmed live product: its prices are only on a hosting-platform "production" subdomain and its own domain resto-saas.mu does not resolve (compare-research-3b, 25 Nov)', 'https://resto-saas-production-a095.up.railway.app/']]
// compare-research-3b (Dominic, 25 Nov): Poster's monthly-BILLING prices. A plan named "Starter + Poster Site add-on" is the Starter POS
// plan PLUS the ordering-site add-on, both as printed on the page (the agent recorded Starter alone): [host, country, plan, total, quote, note].
const PLAN_TOTAL = [
  ['joinposter.com', 'UA', 'Starter + Poster Site add-on', 1360, '540 ₴600 ₴/міс. · Вартість — 760 ₴/міс.', 'Starter 600 ₴ + Poster Site 760 ₴ a month, billed monthly (Starter 540 ₴ a month if billed yearly)'],
  ['joinposter.kz', 'KZ', 'Starter + Poster Site add-on', 21000, '8 640 ₸9 600 ₸/мес. · Стоимость — 11 400 ₸/мес.', 'Starter 9 600 ₸ + Poster Site 11 400 ₸ a month, billed monthly (Starter 8 640 ₸ a month if billed yearly)'],
]
const INCOMPLETE = [['tossplace.com', 'KR', 'its own site does not state the pickup-order fee in force today (compare-research-4 agent 2, raw/KR-toss.json); the stored KR plan is marked unclear by migration 20261133'],
  ['joinposter.kz', 'KZ', 'no order-ahead or food-truck quote recorded; its KZ price sits under an unlabelled yearly toggle'],
  ['delivety.com', 'UA', 'no order-ahead quote recorded; its pricing page shows no prices']]
// Display names for NEW competitors (the agents' product labels kept in the evidence, not in the name shown on the page).
const DISPLAY_NAME = { 'fu.do': 'Fudo', 'blinkco.io': 'Blink', 'zunapro.com': 'Zunapro', 'tossplace.com': 'Toss Place', 'iletmen.com.tr': 'İletmen',
  'foodics.com': 'Foodics', 'esb.id': 'ESB Order', 'sistemaquevende.pt': 'Sistema Que Vende',
  'gestiondo.com.do': 'Gestióndo', 'restaurant-saas-monorepo.pages.dev': 'Sabbor', 'ezywebpro.com': 'Ezy Cart', 'pedifacil.com.py': 'PedíFácil',
  'quicklyservices.com': 'RestroGreen', 'posmasters.lk': 'POS Masters', 'linkin1.com': 'Linkin1' }
const unclearOf = (website, cc, planName, planUrl) => UNCLEAR.find(([h, c, re]) => [website, planUrl].some(u => (host(u) ?? '').endsWith(h)) && (c === '*' || c === cc) && re.test(String(planName ?? '')))
const STORED_PLANS = JSON.parse(fs.readFileSync(path.join(__dirname, 'stored-plans.json'), 'utf8'))   // current plans, read once on 25 Nov 2026 (read-only SELECT)
const storedPlan = new Map(STORED_PLANS.map(x => [`${x.c}|${x.cc}|${String(x.n).trim().toLowerCase()}`, x]))

const uuid = (seed) => { const h = crypto.createHash('sha1').update(`compare-research-4:${seed}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}` }
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return null } }
const norm = (s) => String(s ?? '').trim().toLowerCase()
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

function build() {
  const problems = []
  // every agent's raw files, as "agent-N/raw/XX.json" (sorted, so a rebuild reproduces the same file)
  const files = RAWS.flatMap(dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => path.join(path.basename(path.dirname(dir)), 'raw', f)) : [])
  const RAW = __dirname
  const vendors = new Map()   // key → merged vendor
  const hostKey = new Map(), nameKey = new Map()
  const notRelevant = [], unreadable = []
  // compare-fix-2: a PREPASS over every raw file — the website host and the name of each row that names a stored competitor — so a
  // row WITHOUT a stored id (e.g. "Owner" in CA, "MENU TIGER" in GR) is merged into that stored competitor wherever it comes in the
  // files (the compare-research-1 import failed on exactly these two: a new-id row seen first was not merged with the stored row).
  const storedByHost = new Map(), storedByName = new Map(), ambiguous = new Set()
  const learn = (map, k, pfx) => { if (!k) return; if (map.has(k) && map.get(k) !== pfx) ambiguous.add(k); else map.set(k, pfx) }
  for (const f of files) {
    let raw; try { raw = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')) } catch { continue }
    for (const v of raw.vendors ?? []) if (v.stored_id_prefix && STORED[v.stored_id_prefix]) { learn(storedByHost, host(v.website), v.stored_id_prefix); learn(storedByName, norm(v.name), v.stored_id_prefix) }
  }
  for (const k of ambiguous) { storedByHost.delete(k); storedByName.delete(k); problems.push(`two stored competitors share "${k}" — not used to merge`) }
  // wave 2: the agents' stored-list predates the wave-1 import, so a vendor wave 1 ADDED (Pedix, Fudo, …) comes without a stored id —
  // every stored competitor's website host is learnt too (where no raw row named it and only one stored competitor has that host).
  const hostCount = new Map()
  for (const v of Object.values(STORED)) { const k = host(v.website); if (k) hostCount.set(k, (hostCount.get(k) ?? 0) + 1) }
  for (const [pfx, v] of Object.entries(STORED)) { const k = host(v.website); if (k && hostCount.get(k) === 1 && !storedByHost.has(k)) storedByHost.set(k, pfx) }
  const mergedIntoStored = []
  for (const f of files) {
    let raw
    try { raw = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')) } catch (e) { problems.push(`${f}: not valid JSON — ${e.message}`); continue }
    const countries = Array.isArray(raw.countries) ? raw.countries : [raw.country]
    for (const v of raw.vendors ?? []) {
      const cc = String(v.country ?? countries[0] ?? '').toUpperCase()
      if (!/^[A-Z]{2}$/.test(cc)) { problems.push(`${f} · ${v.name}: no country`); continue }
      if (EXCLUDED_HOSTS.some(x => (host(v.website) ?? '').endsWith(x))) { notRelevant.push({ country: cc, name: v.name, website: v.website, stored: v.stored_id_prefix ?? null, reason: `left out (Dominic, 24 Nov): a booking tool, not a food-ordering platform. ${v.reason ?? ''}`.trim() }); continue }
      if (v.verdict === 'not_relevant') { notRelevant.push({ country: cc, name: v.name, website: v.website, stored: v.stored_id_prefix ?? null, reason: v.reason, url: v.eligibility?.order_url ?? v.eligibility?.food_url ?? (v.check_urls ?? [])[0] ?? v.website, plans: v.plans ?? [] }); continue }
      if (v.verdict !== 'eligible') { unreadable.push({ country: cc, name: v.name, website: v.website, stored: v.stored_id_prefix ?? null, reason: v.reason }); continue }
      const h = host(v.website)
      const inc = INCOMPLETE.find(([x, c]) => (h ?? '').endsWith(x) && c === cc)
      if (inc) { unreadable.push({ country: cc, name: v.name, website: v.website, stored: v.stored_id_prefix ?? null, reason: `left out on review: ${inc[2]}` }); continue }
      const rnr = REVIEW_NOT_RELEVANT.find(([x]) => (h ?? '') === x)
      if (rnr) { notRelevant.push({ country: cc, name: v.name, website: v.website, stored: null, reason: rnr[1], url: rnr[2], reviewHost: h }); continue }
      const pres = Object.entries(PRESENCE_ONLY_IN).find(([x]) => (h ?? '').endsWith(x))
      if (pres && !pres[1].includes(cc)) { notRelevant.push({ country: cc, name: v.name, website: v.website, stored: v.stored_id_prefix ?? null, reason: `left out on review: its presence here rests only on "Restaurantes en América Latina" (own site names ${pres[1].join(', ')} only). ${v.reason ?? ''}`.trim() }); continue }
      // compare-fix-2: no stored id on this row, but a stored competitor has its website host (or its name) → that competitor
      const pfx = v.stored_id_prefix ?? storedByHost.get(h) ?? storedByName.get(norm(v.name)) ?? null
      if (pfx && !v.stored_id_prefix) mergedIntoStored.push(`${cc} · ${v.name} (${v.website}) → stored ${pfx}`)
      const stored = pfx ? STORED[pfx] : null
      if (v.stored_id_prefix && !stored) problems.push(`${f} · ${v.name}: stored_id_prefix ${v.stored_id_prefix} is not in stored-ids.json`)
      // one competitor per vendor: a stored id wins; otherwise the same website host (or name) as a vendor already merged
      const key = stored ? stored.id : (hostKey.get(h) ?? nameKey.get(norm(v.name)) ?? h ?? norm(v.name))
      if (h && !hostKey.has(h)) hostKey.set(h, key)
      if (!nameKey.has(norm(v.name))) nameKey.set(norm(v.name), key)
      const m = vendors.get(key) ?? { key, stored, prefix: pfx, name: stored?.name ?? DISPLAY_NAME[h] ?? v.name, website: v.website, focus: v.focus, countries: new Map(), answers: new Map(), check_urls: new Set(), evidence: [] }
      // compare-fix-2: a vendor first seen through a row WITHOUT the stored id takes its name and website from the first row that has it
      if (!vendors.has(key)) m.namedByStored = !!v.stored_id_prefix
      else if (v.stored_id_prefix && !m.namedByStored) { m.name = stored?.name ?? v.name; m.website = v.website; m.namedByStored = true }
      if (!FOCUS.includes(v.focus)) problems.push(`${f} · ${v.name}: focus "${v.focus}"`)
      if (v.focus === 'food_truck' && !(v.eligibility?.food_quote && v.eligibility?.order_quote)) problems.push(`${f} · ${v.name}: a food_truck tool needs food_quote and order_quote`)
      if (v.focus !== 'food_truck' && !v.eligibility?.order_quote) problems.push(`${f} · ${v.name}: needs an order_quote`)
      for (const q of ['food_quote', 'order_quote', 'country_quote']) if (v.eligibility?.[q] && String(v.eligibility[q]).length > QUOTE_MAX) problems.push(`${f} · ${v.name}: ${q} longer than ${QUOTE_MAX}`)
      m.evidence.push({ country: cc, ...v.eligibility, reason: v.reason, ...(v.neighbour ? { neighbour: v.neighbour } : {}) })
      if (v.neighbour) { m.neighbours = m.neighbours ?? new Map(); m.neighbours.set(cc, String(v.neighbour).toUpperCase()) }
      const only = Object.entries(PLANS_ONLY_IN).find(([x]) => (h ?? '').endsWith(x))
      const totals = (v.plans ?? []).map(p => { const t = PLAN_TOTAL.find(([x, c, n]) => (h ?? '').endsWith(x) && c === cc && n === p.plan_name); return t ? { ...p, price_major: t[3], quote: t[4], note: t[5] } : p })
      m.countries.set(cc, only && !only[1].includes(cc) ? [] : totals)
      for (const u of v.check_urls ?? []) if (m.check_urls.size < 10) m.check_urls.add(u)
      for (const a of v.answers ?? []) {
        if (!KEYS.includes(a.key)) continue                 // only the 14 key differentiators
        const prev = m.answers.get(a.key)
        const rank = (x) => (x ? ({ yes: 4, partial: 3, no: 2, not_mentioned: 1, unknown: 0 })[x.value] ?? 0 : -1)
        if (rank(a) > rank(prev)) m.answers.set(a.key, a)
      }
      vendors.set(key, m)
    }
  }

  // Dominic's preference order (24 Nov): restaurant (nearest_local) and till (pos) tools count only where a country has fewer
  // than 2 eligible food-truck tools WITH A PRICE. Where it has 2+, the others are left out of this file for that country
  // (listed under "not_needed"; nothing stored about them changes).
  const ftPriced = new Map()
  for (const m of vendors.values()) for (const [cc, ps] of m.countries) {
    if (['food_truck', 'street_food_markets', 'pop_up'].includes(m.focus) && ps.some(p => typeof p.price_major === 'number')) ftPriced.set(cc, (ftPriced.get(cc) ?? 0) + 1)
  }
  const notNeeded = []
  for (const m of vendors.values()) {
    if (!['nearest_local', 'pos'].includes(m.focus)) continue
    // compare-fix-1: informational only — the publish step (lib/comparison-publish.ts evaluateCountry) applies the preference itself,
    // so every eligible vendor is imported (its plan corrections too).
    for (const cc of [...m.countries.keys()]) if ((ftPriced.get(cc) ?? 0) >= 2) notNeeded.push({ country: cc, name: m.name, focus: m.focus })
  }
  const competitors = [], plans = [], entries = []
  for (const m of vendors.values()) {
    if (!m.countries.size) continue
    const id = m.stored ? m.stored.id : uuid(`competitor:${m.key}`)
    const answers = []
    for (const k of KEYS) {
      const a = m.answers.get(k)
      if (!a) { answers.push({ key: k, value: 'not_mentioned' }); continue }
      const row = { key: k, value: a.value }
      if (['yes', 'partial', 'no'].includes(a.value)) { row.quote = clip(a.quote, QUOTE_MAX); row.source_url = a.url ?? a.source_url }
      if (a.value === 'unknown') row.note = clip(a.note || 'the page could not be read', 300)
      else if (a.note) row.note = clip(a.note, 300)
      if (a.value === 'no' && !saysNotOffered(row.quote ?? '', null)) { row.value = 'not_mentioned'; delete row.quote; delete row.source_url; row.note = clip(`was "no" without a negative quote — recorded as not mentioned${a.note ? `; ${a.note}` : ''}`, 300) }
      answers.push(row)
    }
    // compare-fix-1: the eligibility evidence reaches the database as an answer — where neither `ahead` nor `preorder` already says
    // yes / partly with a quote, the research's order-ahead quote becomes `ahead` partly ("online ordering ahead of collection").
    const quotedAhead = answers.some(a => ['ahead', 'preorder'].includes(a.key) && ['yes', 'partial'].includes(a.value) && a.quote)
    const ev = m.evidence.find(e => e.order_quote && e.order_url)
    if (!quotedAhead && ev) {
      const i = answers.findIndex(a => a.key === 'ahead')
      answers[i] = { key: 'ahead', value: 'partial', quote: clip(ev.order_quote, QUOTE_MAX), source_url: ev.order_url, note: 'online ordering ahead of collection (the eligibility evidence); a chosen time is not stated' }
    }
    const cs = [...m.countries.keys()].sort()
    const row = {
      id, name: m.name, website: m.website, focus: m.focus, lifecycle: 'active', payment_providers: null,
      features_checked_on: CHECKED_ON, features_verified_at: null,
      notes: `compare-research-4 (25 Nov 2026): read on its own website; eligible — online ordering ahead (quotes in "evidence"). Countries: ${cs.join(', ')}.`,
      check_urls: [...m.check_urls].slice(0, 10), request_check: true, answers, set_focus: true,
    }
    if (m.prefix && REVIVE.includes(m.prefix)) row.set_lifecycle = { value: 'active', reason: `eligible: ${clip(ev?.order_quote ?? m.evidence[0]?.reason ?? '', 240)}`, source_url: ev?.order_url ?? m.website }
    if (m.prefix && NOT_SOLD_IN[m.prefix]) row.not_sold_in = notSoldInRows(m.prefix)
    competitors.push(row)
    for (const cc of cs) {
      const ps = m.countries.get(cc)
      let primary = null, cheapest = Infinity
      for (let p of ps.slice(0, 4)) {
        const hidden = p.price_major === null || p.price_major === undefined
        const period = p.period ?? 'month'
        // A plan priced per day is estimated per month (× 365 / 12) and marked UNCLEAR, so it is never published as a stated
        // price; a multi-year prepay is a payment option of another plan — kept in the evidence, not written as a plan.
        if (!hidden && /^\d+\s*years?$/.test(String(period)) && period !== '1 year') continue
        // A one-off price with no subscription: no monthly fee, the amount is the set-up fee.
        if (!hidden && period === 'one_off') { p = { ...p, setup_major: p.price_major, price_major: 0, period: 'month', note: `one-off price ${p.price_major} ${p.currency}, no subscription${p.note ? `; ${p.note}` : ''}` } }
        if (!hidden && !['month', 'year', 'day', 'week'].includes(p.period ?? 'month')) { problems.push(`${m.name} · ${p.plan_name}: period "${period}" is not month, year, week, day or one_off`); continue }
        const yearly = (p.period ?? 'month') === 'year'
        // per day / per week: an estimate per month (× 365 / 12, × 52 / 12), marked unclear — never published as a stated price
        const perDay = ['day', 'week'].includes(p.period ?? 'month')
        const review = hidden ? null : unclearOf(m.website, cc, p.plan_name, p.url)
        const perUnit = (p.period ?? 'month') === 'week' ? 52 : 365
        const monthlyMajor = hidden ? null : (yearly ? p.price_major / 12 : perDay ? Math.round((p.price_major * perUnit / 12) * 100) / 100 : p.price_major)
        const cur = String(p.currency ?? '').toUpperCase()
        const minor = hidden ? null : toMinorUnits(monthlyMajor, cur)
        // the 100× guard: the stored value read back must be the page's amount
        if (!hidden && Math.abs(minor / 10 ** minorDigits(cur) - monthlyMajor) > 0.01) problems.push(`${m.name} · ${p.plan_name}: ${minor} does not read back as ${monthlyMajor} ${cur}`)
        // the 100× check: a monthly price above its currency's plausible ceiling (lib/price-units.ts) is refused here, not stored hidden
        if (!hidden && implausibleMonthly(monthlyMajor, cur)) problems.push(`${m.name} · ${cc} · ${p.plan_name}: ${monthlyMajor} ${cur} a month is above the plausible ceiling (a unit slip?)`)
        // compare-fix-1: a research plan that matches a STORED current plan (by name, or RENAME) with a different price or currency
        // corrects it: the stored one is superseded, this one inserted (lib/data-import/research.ts "correct").
        let planName = clip(p.plan_name, 120), correct = false
        if (m.prefix && !hidden) {
          const k = `${m.prefix}|${cc}|${norm(p.plan_name)}`
          const named = RENAME[k] ?? null
          const sp = storedPlan.get(named ? `${m.prefix}|${cc}|${named.toLowerCase()}` : k)
          if (sp) { planName = sp.n; correct = sp.m !== minor || sp.cur !== cur }
        }
        const pid = uuid(`plan:${id}:${cc}:${norm(planName)}${correct ? ':corrected' : ''}`)
        const feePct = typeof p.per_order_pct === 'number' ? Math.round(p.per_order_pct * 100) : 0
        const feeFixed = typeof p.per_order_fixed_major === 'number' ? toMinorUnits(p.per_order_fixed_major, cur) : 0
        plans.push({
          id: pid, competitor_id: id, country_code: cc, plan_name: planName, currency: cur,
          price_hidden: hidden, monthly_minor: minor, ...(hidden ? {} : { monthly_major: monthlyMajor }), yearly_only: yearly, ...(correct ? { correct: true } : {}), setup_minor: typeof p.setup_major === 'number' ? toMinorUnits(p.setup_major, cur) : 0,
          truck_fee_bps: feePct, truck_fee_fixed_minor: feeFixed, customer_fee_bps: 0, customer_fee_fixed_minor: 0,
          card_mode: 'unknown', card_bps: null, card_fixed_minor: null, card_rate_assumed: false,
          order_cap: null, included_orders: null, overage_fixed_minor: null,
          vat: ['incl', 'excl'].includes(p.vat) ? p.vat : 'unknown', status: hidden ? 'hidden' : 'counted', unclear: perDay || !!review, second_hand: false,
          source: 'research', source_url: p.url ?? null, checked_on: CHECKED_ON, verified_at: null, verified_by: null,
          notes: clip(`compare-research-4, read 25 Nov 2026${m.neighbours?.get(cc) ? ` — serves ${cc} from ${m.neighbours.get(cc)} (neighbouring-market rule, Dominic 25 Nov)` : ''}: "${p.quote ?? ''}"${yearly ? ' (yearly price ÷ 12)' : ''}${perDay ? ` (priced per ${p.period}: ${p.price_major} ${cur} a ${p.period} × ${perUnit} ÷ 12 — an estimate, so marked unclear)` : ''}${p.note ? ` — ${p.note}` : ''}`, 1000),
        })
        if (!hidden && !perDay && !review && monthlyMajor < cheapest && cur) { cheapest = monthlyMajor; primary = pid }
      }
      entries.push({ id: uuid(`entry:${cc}:${id}`), country_code: cc, competitor_id: id, primary_plan_id: primary, choose_when: null, sort_order: 50, verified_at: null, verified_by: null })
    }
  }
  // compare-fix-1: STORED competitors marked not relevant (NOT_RELEVANT) or not sold in a country, that are not already a row above —
  // a row carrying only the instruction, its reason and its page (and, for CORRECT_EVEN_IF_NOT_RELEVANT, the corrected plans).
  for (const [x, reason, url] of REVIEW_NOT_RELEVANT) {
    const ev = notRelevant.find(r => r.reviewHost === x)
    if (ev) competitors.push({ id: uuid(`competitor:${x}`), name: ev.name, request_check: false, set_lifecycle: { value: 'not_relevant', reason: clip(reason, 280), source_url: url } })
  }
  const have = new Set(competitors.map(c => c.id))
  const nrBy = (pre) => notRelevant.filter(x => x.stored === pre)
  for (const pre of [...new Set([...NOT_RELEVANT, ...Object.keys(NOT_SOLD_IN)])]) {
    const st = STORED[pre]
    if (!st) { problems.push(`stored competitor ${pre} is not in stored-ids.json`); continue }
    if (have.has(st.id)) {
      if (NOT_RELEVANT.includes(pre)) problems.push(`${pre}: marked not relevant but eligible elsewhere in the research — check`)
      continue
    }
    const ev = nrBy(pre)[0]
    const row = { id: st.id, name: ev?.name ?? pre, request_check: false }
    if (NOT_RELEVANT.includes(pre)) {
      if (!ev) { problems.push(`${pre}: no not-relevant evidence in raw/*.json`); continue }
      row.set_lifecycle = { value: 'not_relevant', reason: clip(ev.reason, 280), source_url: ev.url ?? ev.website }
    }
    if (NOT_SOLD_IN[pre]) row.not_sold_in = notSoldInRows(pre)
    competitors.push(row)
    if (CORRECT_EVEN_IF_NOT_RELEVANT.includes(pre)) for (const x of nrBy(pre)) for (const p of x.plans ?? []) {
      if (typeof p.price_major !== 'number') continue
      const cur = String(p.currency).toUpperCase(), minor = toMinorUnits(p.price_major, cur)
      const sp = storedPlan.get(`${pre}|${x.country}|${norm(p.plan_name)}`)
      if (!sp || (sp.m === minor && sp.cur === cur)) continue
      plans.push({ id: uuid(`plan:${st.id}:${x.country}:${norm(sp.n)}:corrected`), competitor_id: st.id, country_code: x.country, plan_name: sp.n, currency: cur,
        price_hidden: false, monthly_minor: minor, monthly_major: p.price_major, yearly_only: false, correct: true, setup_minor: 0, truck_fee_bps: 0, truck_fee_fixed_minor: 0,
        customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null, card_fixed_minor: null, card_rate_assumed: false, order_cap: null,
        included_orders: null, overage_fixed_minor: null, vat: ['incl', 'excl'].includes(p.vat) ? p.vat : 'unknown', status: 'counted', unclear: false, second_hand: false,
        source: 'research', source_url: p.url ?? null, checked_on: CHECKED_ON, verified_at: null, verified_by: null,
        notes: clip(`compare-research-2, read 25 Nov 2026 (corrects the stored ${sp.m} ${sp.cur}, a unit slip): "${p.quote ?? ''}"`, 1000) })
    }
  }
  function notSoldInRows(pre) {
    return NOT_SOLD_IN[pre].map(cc => {
      const ev = notRelevant.find(x => x.stored === pre && x.country === cc)
      if (!ev) problems.push(`${pre} ${cc}: no evidence in raw/*.json for "not sold in"`)
      return { country: cc, reason: clip(ev?.reason ?? '', 280), source_url: ev?.url ?? ev?.website ?? '' }
    })
  }
  const file = {
    $comment: 'compare-research-4 (25 Nov 2026): competitors read on their OWN websites by three Claude Code agents, one request at a time each (docs/compare-research-4-report.md; built by docs/compare-research-4/build.cjs). Imported automatically, once per version of this file, by the first step of the nightly competitor check (lib/data-import/). Every row source research, UNVERIFIED (35.an-1). Each answer carries the vendor’s verbatim quote and its page (35.an-4); "no" only with a quote saying it is not offered, silence is not_mentioned (35.ao-7). monthly_minor is MINOR units, converted from the page’s amount with lib/money-format.ts toMinorUnits (the 100× guard). request_check sets check_requested_at. "evidence" and "not_relevant" are for the reviewer; the import does not read them (the importer cannot mark a competitor not relevant).',
    id: 'compare-research-4', checked_on: CHECKED_ON, competitors, plans, entries,
    evidence: [...vendors.values()].map(m => ({ name: m.name, evidence: m.evidence })),
    not_relevant: notRelevant, unreadable, not_needed: notNeeded,
  }
  return { file, problems, mergedIntoStored }
}

function validate(file) {
  const problems = researchProblems(file, { featureKeys: FEATURE_KEYS })
  for (const p of file.plans) if (p.status === 'counted' && !(Number.isInteger(p.monthly_minor))) problems.push(`${p.plan_name}: monthly_minor is not a whole number`)
  // the 100× check on the file itself (also in --check): every priced plan read back in major units must be under its currency's ceiling
  for (const p of file.plans) if (typeof p.monthly_minor === 'number' && implausibleMonthly(p.monthly_minor / 10 ** minorDigits(p.currency), p.currency)) problems.push(`${p.plan_name} (${p.country_code}): ${p.monthly_minor} ${p.currency} is above the plausible ceiling (100×?)`)
  return problems
}

const checkOnly = process.argv.includes('--check')
let file, problems = []
if (checkOnly) file = JSON.parse(fs.readFileSync(OUT, 'utf8'))
else { const b = build(); file = b.file; problems = b.problems; for (const x of b.mergedIntoStored) console.log(`merged into a stored competitor (same website or name): ${x}`) }
problems.push(...validate(file))
if (!checkOnly) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n') }
console.log(`not needed (2+ priced food-truck tools in the country): ${file.not_needed?.length ?? 0}`)
console.log(`instructions: ${file.competitors.filter(c => c.set_lifecycle?.value === 'not_relevant').length} not relevant, ${file.competitors.filter(c => c.set_lifecycle?.value === 'active').length} back to active, ${file.competitors.reduce((n, c) => n + (c.not_sold_in?.length ?? 0), 0)} not sold in, ${file.plans.filter(p => p.correct).length} plans corrected`)
console.log(`competitors ${file.competitors.length}, plans ${file.plans.length} (${file.plans.filter(p => p.status === 'counted').length} priced), entries ${file.entries.length}, not relevant ${file.not_relevant?.length ?? 0}, unreadable ${file.unreadable?.length ?? 0}`)
if (problems.length) { console.log(`🔴 ${problems.length} problem(s):\n- ` + problems.join('\n- ')); process.exit(1) }
console.log('✓ the importer’s own validation (researchProblems) and the 100× guard pass — nothing written to any database')
