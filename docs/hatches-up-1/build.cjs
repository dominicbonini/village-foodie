#!/usr/bin/env node
// docs/hatches-up-1/build.cjs — hatches-up-1 (26 Nov 2026; docs/hatches-up-1-report.md): compare-square-1 step 4 finished with the
// URL Dominic sent (https://hatchesup.co.uk/vendors/). Hatches Up's plan and quoted answers from its own two pages, read once each,
// one request at a time: /vendors/ and /pricing/. Writes data/hatches-up-1/competitors.json and VALIDATES it with the importer's own
// rules (researchProblems), the one-plan-name rule against the stored plan and the 100× guard. It never connects to the database.
//   node docs/hatches-up-1/build.cjs            build + validate (exit 1 on any problem)
//   node docs/hatches-up-1/build.cjs --check    validate the existing data file only
// The importer fills the empty website and replaces the bare "unknown" answers. Migration 20261146 sets check_urls, points the GB
// entry at the new plan and supersedes the old unsourced one (the importer does neither). Card rates go only in the price (bundled,
// the ONLINE rate) and the cardfee answer; nothing about tills or card readers at the hatch is written as a feature.
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
const OUT = path.join(ROOT, 'data/hatches-up-1/competitors.json')
const FEATURE_KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/comparison-features/features.json'), 'utf8')).features.map(f => f.key)
const CHECKED_ON = '2026-11-26'
const uuid = s => { const h = crypto.createHash('sha1').update(`hatches-up-1:${s}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}` }
const HU = 'fbbf6c37-2dd0-5f11-9e68-a0be5d563629'
// The stored current plan (read-only SELECT, 26 Nov): "Online ordering" GB £0, bundled 4.5% + 20p, from the manual, no source.
const STORED_PLANS = [{ cc: 'GB', n: 'Online ordering', id: 'eec3fac5-8dfd-54a6-9b5b-473a9fdeea67' }]
const V = 'https://hatchesup.co.uk/vendors/', PR = 'https://hatchesup.co.uk/pricing/'
const FAQ = 'You only pay card processing when you take payments: 1.5% + 10p in person, and 4.5% + 20p for online orders.'

const PLAN_NAME = 'Unlock orders & payments'
const plan = {
  id: uuid(`plan:${HU}:GB:${PLAN_NAME}`), competitor_id: HU, country_code: 'GB', plan_name: PLAN_NAME, currency: 'GBP', price_hidden: false,
  monthly_minor: toMinorUnits(0, 'GBP'), monthly_major: 0, yearly_only: false, setup_minor: 0, truck_fee_bps: 0, truck_fee_fixed_minor: 0,
  customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'bundled', card_bps: 450, card_fixed_minor: toMinorUnits(0.20, 'GBP'),
  card_rate_assumed: false, order_cap: null, included_orders: null, overage_fixed_minor: null, vat: 'unknown', status: 'counted', unclear: false,
  second_hand: false, source: 'research', source_url: PR, checked_on: CHECKED_ON, verified_at: null, verified_by: null,
  notes: ('hatches-up-1, 26 Nov 2026, its own /pricing/ and /vendors/ pages: two tiers — "Street Food Discovery" "£0" (the discovery app and map, '
    + 'no ordering) and "Unlock orders & payments" ("Accept in-person PoS and online pre-orders and payments."), its price not shown as a figure. '
    + 'Terms: "No minimum term or monthly payment, and no set-up costs."; FAQ: "' + FAQ + '" Stored as £0 a month with the online rate '
    + '(4.5% + 20p) as its bundled card fee; in person 1.5% + 10p. No per-order commission stated. VAT not stated; the payment processor not named.').slice(0, 1000),
}

const A = (key, value, quote, source_url, note) => ({ key, value, quote, source_url, ...(note ? { note } : {}) })
const answers = [
  A('preorder', 'yes', 'Accept online orders in advance & get money in the bank before service even starts.', V, 'collection slots: «Capacity management with collection slots» (the Unlock orders & payments tier)'),
  A('capacity', 'yes', 'Capacity management with collection slots', V),
  A('payattruck', 'yes', 'Take walk-up orders and payments with our PoS, accept online pre-orders, or let customers order ahead and pay when they collect.', V, 'customers can order ahead and pay when they collect'),
  A('schedule', 'yes', 'Multi-pitch & location calendar', V),
  A('discovery', 'yes', 'Inclusion in the discovery app & map', V, 'the free Street Food Discovery tier'),
  A('private', 'partial', 'Private & public event management', V, 'events; requests to book the truck not stated'),
  A('stock', 'partial', 'Stock management', V, 'named in the paid tier; sold-out and per-event limits not described'),
  A('reports', 'yes', 'Financial reporting', V, 'also «Data analytics»'),
  A('domain', 'partial', 'Customisable webpage with logo & photos', V, 'own page on hatchesup.app; own web address not stated'),
  A('monthly', 'yes', 'Free to join. No monthly fee, no set-up costs, no tie-ins.', V, '£0 a month'),
  A('setup', 'no', 'No minimum term or monthly payment, and no set-up costs.', PR, 'no set-up costs'),
  A('term', 'no', 'No minimum term or monthly payment, and no set-up costs.', PR, 'no minimum term'),
  // perorder: left as it is — the FAQ implies no fee beyond card processing, but no line says one is not charged (rule 35.ao-7).
  A('cardfee', 'yes', FAQ, V, 'included: 1.5% + 10p in person, 4.5% + 20p online; the processor is not named'),
]

function build() {
  const competitors = [{ id: HU, name: 'Hatches Up', website: 'https://hatchesup.co.uk', focus: 'food_truck', check_urls: [V, PR], answers }]
  return { $comment: 'hatches-up-1 (26 Nov 2026): Hatches Up from its own /vendors/ and /pricing/ pages, read one request at a time (docs/hatches-up-1-report.md; built by docs/hatches-up-1/build.cjs). check_urls, the GB entry\'s plan and the old plan\'s supersede are migration 20261146.', id: 'hatches-up-1', checked_on: CHECKED_ON, competitors, plans: [plan], entries: [] }
}

function validate(file) {
  const problems = researchProblems(file, { featureKeys: FEATURE_KEYS })
  for (const p of file.plans) {
    if (STORED_PLANS.some(s => s.cc === p.country_code && s.n.toLowerCase() === p.plan_name.toLowerCase())) problems.push(`${p.plan_name} (${p.country_code}): already a stored plan of that name`)
    if (!Number.isInteger(p.monthly_minor)) problems.push(`${p.plan_name}: monthly_minor is not a whole number`)
    if (p.monthly_minor / 10 ** minorDigits(p.currency) !== p.monthly_major) problems.push(`${p.plan_name}: monthly_minor ${p.monthly_minor} ≠ ${p.monthly_major} ${p.currency}`)
    if (implausibleMonthly(p.monthly_minor / 10 ** minorDigits(p.currency), p.currency)) problems.push(`${p.plan_name}: over the 100× ceiling`)
    if (p.truck_fee_bps) problems.push(`${p.plan_name}: the card rate must not be a per-order fee`)
  }
  for (const c of file.competitors) for (const a of c.answers ?? []) {
    if (!a.source_url.startsWith('https://hatchesup.co.uk/')) problems.push(`${a.key}: not from its own site`)
    if (/\b(card reader|terminal|till)\b/i.test(`${a.note ?? ''}`)) problems.push(`${a.key}: a till / card-reader note`)
  }
  return problems
}

const checkOnly = process.argv.includes('--check')
const file = checkOnly ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : build()
const problems = validate(file)
if (!checkOnly) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n') }
console.log(`competitors ${file.competitors.length}, plans ${file.plans.length}, answers ${file.competitors[0].answers.length}, plan id ${file.plans[0].id}`)
if (problems.length) { console.log(`🔴 ${problems.length} problem(s):\n- ` + problems.join('\n- ')); process.exit(1) }
console.log('✓ researchProblems, the one-name rule and the 100× guard pass — nothing written to any database')
