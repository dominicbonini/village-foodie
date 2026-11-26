#!/usr/bin/env node
// docs/compare-square-1/build.cjs — compare-square-1 (Dominic, 26 Nov 2026; docs/compare-square-1-report.md): Square in every country
// its own country selector lists (US CA GB IE AU JP FR ES), from its own country pages read once each on 26 Nov (Square Online
// /online-store/plans for the plans and the online rate, /pricing for the in-person rate), and What The Truck's plan from its own
// pricing page. Writes data/compare-square-1/competitors.json and VALIDATES it with the importer's own rules (researchProblems), the
// database's unique rules (one plan name per competitor and country; each competitor once) and the 100× guard. It never connects to
// the database: the stored ids and plan names come from docs/compare-square-1/stored.json (a read-only SELECT on 26 Nov).
//   node docs/compare-square-1/build.cjs            build + validate (exit 1 on any problem)
//   node docs/compare-square-1/build.cjs --check    validate the existing data file only
// Card rates (Dominic): Square's processing rates go only in the price (card_mode 'bundled', card_bps / card_fixed_minor = the ONLINE
// rate) and the cardfee answer (per country, written by migration 20261145) — never as a per-order fee. Nothing about card readers or
// tills at the hatch is written as a feature.
'use strict'
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const ROOT = path.resolve(__dirname, '../..')
const jiti = require(path.join(ROOT, 'node_modules/jiti'))(__filename, { alias: { '@': ROOT }, interopDefault: true })
const { researchProblems } = jiti(path.join(ROOT, 'lib/data-import/research.ts'))
const { toMinorUnits, minorDigits } = jiti(path.join(ROOT, 'lib/money-format.ts'))
const { implausibleMonthly } = jiti(path.join(ROOT, 'lib/price-units.ts'))
const OUT = path.join(ROOT, 'data/compare-square-1/competitors.json')
const STORED = JSON.parse(fs.readFileSync(path.join(__dirname, 'stored.json'), 'utf8'))
const FEATURE_KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/comparison-features/features.json'), 'utf8')).features.map(f => f.key)
const CHECKED_ON = '2026-11-26'
const uuid = s => { const h = crypto.createHash('sha1').update(`compare-square-1:${s}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}` }
const SQ = STORED.competitors['9acae7b6'], WTT = STORED.competitors['3f0b6c2e']
const P = (cl) => `https://squareup.com/${cl}/online-store/plans`

// One row per country, from its own pages: [cc, currency, locale path, free name, free quote, plus name, plus major, plus quote, yearly, vat,
//   online bps, online fixed (major), online quote]
const SQUARE = [
  ['US', 'USD', 'us/en', 'Square Free', '$0/mo. | per location', 'Square Plus', 49, '$49/mo. | per location', false, 'unknown', 330, 0.30, 'Online | 3.3% + 30¢',
    "the US page sells Square's own plans (Square Free / Square Plus, per location, with POS); Plus 'Try free for 30 days', its billing period not stated"],
  ['CA', 'CAD', 'ca/en', 'Free', '$0 | No monthly fees', 'Plus', 36, '$36 | /mo | billed annually', true, 'unknown', 280, 0.30, '2.8% + $0.30 | per transaction', null],
  ['GB', 'GBP', 'gb/en', 'Free', '£0 | No monthly fees', 'Plus', 20, '£20 | /mo | billed annually', true, 'unknown', 140, 0.25, '1.4% + 25p | per UK card', null],
  ['IE', 'EUR', 'ie/en', 'Free', '€0 | No monthly fees', 'Plus', 25, '€25 | /mo | billed annually', true, 'excl', 140, 0.25, '1.4% + 25c + VAT | per EU + EEA card', null],
  ['AU', 'AUD', 'au/en', 'Free', '$0 | No monthly fees', null, null, null, true, 'unknown', 220, 0, '2.2% | per transaction',
    'AU keeps its stored Square Online Plus ($40, compare-research-1); today\'s page shows Plus at $36 billed annually'],
  ['JP', 'JPY', 'jp/ja', 'フリー', '¥0 | 月額固定費なし', 'プラス', 3780, '¥3,375/月 | 年に1回のご一括払い、又は毎月のお支払い（￥3,780）', false, 'unknown', 360, 0, '決済手数料3.6%',
    'the monthly-billing price ¥3,780 is stored (¥3,375 a month billed yearly)'],
  ['FR', 'EUR', 'fr/fr', 'Gratuit', '0 € | Pas de frais mensuels', 'Plus', 25, '25 €/mois HT | facturé annuellement', true, 'excl', 140, 0.25, '1,4 % + 0,25 € | par carte UE + EEE', null],
  ['ES', 'EUR', 'es/es', 'Gratuito', '0 € | Sin cuotas mensuales', 'Plus', 25, '25 € + IVA al mes | (se cobra anualmente)', true, 'excl', 140, 0.25, '1,4 % + 0,25 € | por tarjeta emitida en la UE y el EEE', null],
]

function plan(cid, cc, name, cur, major, o) {
  const minor = toMinorUnits(major, cur)
  return { id: uuid(`plan:${cid}:${cc}:${name}`), competitor_id: cid, country_code: cc, plan_name: name, currency: cur, price_hidden: false, monthly_minor: minor,
    monthly_major: major, yearly_only: !!o.yearly, setup_minor: 0, truck_fee_bps: o.truckBps ?? 0, truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0,
    card_mode: o.cardMode, card_bps: o.cardBps ?? null, card_fixed_minor: o.cardFixed ?? null, card_rate_assumed: false, order_cap: null, included_orders: null,
    overage_fixed_minor: null, vat: o.vat, status: 'counted', unclear: false, second_hand: false, source: 'research', source_url: o.url, checked_on: CHECKED_ON,
    verified_at: null, verified_by: null, notes: o.notes.slice(0, 1000) }
}

function build() {
  const plans = [], entries = [], problems = []
  for (const [cc, cur, cl, fName, fQuote, pName, pMajor, pQuote, yearly, vat, bps, fixed, rateQuote, extra] of SQUARE) {
    const card = { cardMode: 'bundled', cardBps: bps, cardFixed: toMinorUnits(fixed, cur) }
    const free = plan(SQ, cc, fName, cur, 0, { ...card, vat, url: P(cl), notes: `compare-square-1, 26 Nov 2026: "${fQuote}" — Square Online's free plan; Square's own processing rate online "${rateQuote}" (stored as its bundled card fee)${extra ? ` — ${extra}` : ''}.` })
    plans.push(free)
    if (pName) plans.push(plan(SQ, cc, pName, cur, pMajor, { ...card, vat, yearly, url: P(cl), notes: `compare-square-1, 26 Nov 2026: "${pQuote}"${yearly ? ' — only a price billed annually is shown, stored as the monthly figure with yearly_only (the yearly-only rule, §91)' : ''}; online "${rateQuote}"${extra ? ` — ${extra}` : ''}.` }))
    const stored = STORED.entries.find(e => e.c === '9acae7b6' && e.cc === cc)
    if (!stored) entries.push({ id: uuid(`entry:${cc}:${SQ}`), country_code: cc, competitor_id: SQ, primary_plan_id: free.id, choose_when: null, sort_order: 50, verified_at: null, verified_by: null })
  }
  // What The Truck (GB) — its own pricing page: £0 a month; online 3.95% + VAT for new accounts (3.25–3.95% tiers); in person 1.25% for new
  // accounts (0.80–1.25%); card fees included on its own payment provider.
  plans.push(plan(WTT, 'GB', 'What The Truck', 'GBP', 0, { truckBps: 395, cardMode: 'bundled', vat: 'excl', url: 'https://whatthetruck.ai/pricing',
    notes: 'compare-square-1, 26 Nov 2026: "Monthly fee | £0.00" — no monthly fee; a fee on each payment by yearly sales: online (pre-orders) 3.95% for new accounts ("With proof of turnover. Until then: | 3.95%*"; tiers 3.95 / 3.75 / 3.50 / 3.25%), "*Online rates are shown before VAT on the platform fee. The platform fee for online ordering is subject to VAT at 20%."; in person (at the hatch) 1.25% for new accounts (tiers 1.25 / 0.95 / 0.85 / 0.80%). Card fees included on its own payment provider: "100% of every sale paid with a UK personal card is yours, with nothing deducted" (first month); "The offer for free in-person card rates for the first month is subject to the use of our card terminal and payment provider."; terms §6: provider fees "are set by them".' }))
  const competitors = [
    { id: SQ, name: 'Square', website: 'https://squareup.com', focus: 'pos', check_urls: ['https://squareup.com/gb/en/solutions/food-truck', 'https://squareup.com/gb/en/online-store/plans', 'https://squareup.com/us/en/online-store/plans'],
      answers: [
        { key: 'preorder', value: 'partial', quote: 'Better control your inventory processes and give customers more convenience by letting them order items in advance for a specific date and time in the future.', source_url: P('gb/en'), note: 'Preorders: the Plus plan, not the Free plan (GB page; the US page: "Let customers preorder retail items for a specific date and time.")' },
        { key: 'domain', value: 'partial', quote: 'Connect your site to a custom domain that you already own.', source_url: P('gb/en'), note: 'Plus and Premium, not the Free plan' },
        { key: 'notify', value: 'partial', quote: 'Send order status updates to customers via text messages to coordinate pickup and delivery orders.', source_url: P('gb/en'), note: 'Plus and Premium, not the Free plan' },
        { key: 'delivery', value: 'yes', quote: 'Offer click and collect, global shipping and delivery by your own staff.', source_url: P('gb/en') },
        { key: 'paymethods', value: 'yes', quote: 'Accept Google Pay, Apple Pay, Clearpay and Square Pay for faster checkout.', source_url: P('gb/en'), note: 'GB page; the wallets offered differ by country' },
      ] },
    { id: WTT, name: 'What The Truck', website: 'https://whatthetruck.ai', focus: 'food_truck' },
  ]
  return { file: { $comment: 'compare-square-1 (26 Nov 2026): Square (its own country pages) and What The Truck (its own pricing page), read one request at a time (docs/compare-square-1-report.md; built by docs/compare-square-1/build.cjs). Per-country answers, the food-truck class and the website fixes are migration 20261145.', id: 'compare-square-1', checked_on: CHECKED_ON, competitors, plans, entries }, problems }
}

function validate(file) {
  const problems = researchProblems(file, { featureKeys: FEATURE_KEYS })
  const ids = new Set(), names = new Set()
  for (const c of file.competitors) { if (ids.has(c.id) || names.has(c.name.toLowerCase())) problems.push(`${c.name}: twice in the file`); ids.add(c.id); names.add(c.name.toLowerCase()) }
  const key = new Set()
  for (const p of file.plans) {
    const k = `${p.competitor_id}|${p.country_code}|${p.plan_name.toLowerCase()}`
    if (key.has(k)) problems.push(`${p.plan_name} (${p.country_code}): twice in the file`); key.add(k)
    if (STORED.plans.some(s => STORED.competitors[s.c] === p.competitor_id && s.cc === p.country_code && s.n.toLowerCase() === p.plan_name.toLowerCase())) problems.push(`${p.plan_name} (${p.country_code}): already a stored plan of that name`)
    if (!Number.isInteger(p.monthly_minor)) problems.push(`${p.plan_name}: monthly_minor is not a whole number`)
    if (p.monthly_minor / 10 ** minorDigits(p.currency) !== p.monthly_major) problems.push(`${p.plan_name} (${p.country_code}): monthly_minor ${p.monthly_minor} ≠ ${p.monthly_major} ${p.currency}`)
    if (implausibleMonthly(p.monthly_minor / 10 ** minorDigits(p.currency), p.currency)) problems.push(`${p.plan_name} (${p.country_code}): over the 100× ceiling`)
    if (p.competitor_id === SQ && p.truck_fee_bps) problems.push(`${p.plan_name} (${p.country_code}): Square's rate must not be a per-order fee`)
  }
  for (const e of file.entries) if (STORED.entries.some(s => STORED.competitors[s.c] === e.competitor_id && s.cc === e.country_code)) problems.push(`entry ${e.country_code}: already stored`)
  return problems
}

const checkOnly = process.argv.includes('--check')
let file, problems = []
if (checkOnly) file = JSON.parse(fs.readFileSync(OUT, 'utf8'))
else { const b = build(); file = b.file; problems = b.problems }
problems.push(...validate(file))
if (!checkOnly) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n') }
console.log(`competitors ${file.competitors.length}, plans ${file.plans.length}, entries ${file.entries.length}`)
if (problems.length) { console.log(`🔴 ${problems.length} problem(s):\n- ` + problems.join('\n- ')); process.exit(1) }
console.log('✓ researchProblems, the unique rules and the 100× guard pass — nothing written to any database')
