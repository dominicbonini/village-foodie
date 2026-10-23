#!/usr/bin/env node
// scripts/pricing-check-build-data.cjs — pricing-check-1 (23 October 2026). Builds the "Import research data" payload.
//   node scripts/pricing-check-build-data.cjs
//
// Reads docs/pricing-research-1/competitors.csv (232 plan rows) and docs/pricing-research-1-report.md, and writes
// data/pricing-research-1/{competitors,plans,benchmarks}.json (committed). The admin "Import research data" button
// (app/api/admin/pricing-check) inserts exactly these files, once. Nothing here touches a database or the network.
//
// ── WHAT IS FIXED WHILE BUILDING (the brief's list) ──────────────────────────────────────────────────────────────
//   • a meal price whose "Numbeo" link goes elsewhere (Ireland → destination.com, Portugal → a Spanish blog):
//     meal_source_ok = false, note "not Numbeo — check";
//   • France is in the report's §3 table twice → one benchmark row (card 1.5% + 25, as france-1's block inserts);
//   • Indonesia's card rate 0% + 0 → card_bps / card_fixed_minor NULL, note "Stripe takes no cards in Indonesia";
//   • every plan whose card rate is not published (the report's ¹) → card_rate_assumed = true;
//   • second_hand (report §12's list) and unclear (Weevi, Zyda, Vev, Yoveletta, Beat The Queue, TuMenúDigital);
//   • the report's "not counted" plans keep that status (hidden / closed / excluded) with the reason in notes;
//   • Hatches Up, Eventifood, EasyEats and RapidOrderz from the manual (§21), source 'manual';
//   • features: only what the CSV states, mapped to the six key features; everything else 'unknown';
//   • planned countries: the report §10.3 proposals, and the card rate from each country's own section.
// The per-plan rules the research calculator applied (order caps, included orders and their overage, who pays a fee)
// are below as RULES, each from the plan's own "included" text in the CSV. What the schema cannot hold is printed
// at the end as NOT MAPPED, and listed in docs/pricing-check-1-report.md.

/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const REPO = path.resolve(__dirname, '..')
const CSV = path.join(REPO, 'docs/pricing-research-1/competitors.csv')
const REPORT = path.join(REPO, 'docs/pricing-research-1-report.md')
const OUT = path.join(REPO, 'data/pricing-research-1')
const CHECKED = '2026-10-23'          // the research date (every CSV row says so)
const RATE_DATE = '2026-10-22'        // the ECB reference rates the report used
const MANUAL_DATE = '2026-10-20'

// ── the currency's minor digits, from the app's own helper (registry first, Intl otherwise: JPY 0) ──
function moneyHelpers() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const out = esbuild.buildSync({
    stdin: { contents: "export { minorDigits } from '@/lib/money-format'", resolveDir: REPO, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': REPO }, logLevel: 'error',
  })
  const m = { exports: {} }; new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require)
  return m.exports
}
const { minorDigits } = moneyHelpers()
const toMinor = (major, cur) => Math.round(Number(major) * 10 ** minorDigits(cur))

// ── a deterministic id, so a rebuild gives the same ids (and plans keep pointing at their competitor) ──
function uuidOf(key) {
  const h = crypto.createHash('sha1').update('pricing-check-1:' + key).digest()
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

// ── CSV (quoted fields, commas and newlines inside quotes) ──
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c; continue }
    if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' }
    else if (c !== '\r') f += c
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row) }
  const [head, ...body] = rows
  return { head, rows: body.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) }
}
const num = v => (v === '' || v === 'None' || v == null ? null : Number(v))
const bool = v => v === 'True' || v === 'true'

// ── the report ──
const report = fs.readFileSync(REPORT, 'utf8')
function sections() {
  const out = {}
  const re = /^### ([A-Z]{2}) · (.+?) \((Deep|Standard|Light)\)$/gm
  const marks = [...report.matchAll(re)]
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : report.indexOf('\n## 10 ·')
    out[m[1]] = { code: m[1], name: m[2], tier: m[3], text: report.slice(m.index, end) }
  })
  return out
}
const SECTIONS = sections()

// §1: which countries have no country_settings row
const NO_ROW = new Set([...report.matchAll(/^\| ([A-Z]{2}) [^|]+\| (?:Deep|Standard|Light) \| no row \|/gm)].map(m => m[1]))

// §3: France's two rows → one (the brief's fix). Both give €29 / €4,000 / €69 and 1.5% + 25.
const s3 = report.slice(report.indexOf('## 3 ·'), report.indexOf('## 4–9'))
const frRows = [...s3.matchAll(/^\| FR \| no row \| EUR \| [^|]+\| €(\d+) \| €([\d,]+) \| €(\d+) \| [^|]+\| ([\d.]+)% \+ (\d+)/gm)]
if (frRows.length !== 2) throw new Error(`expected France twice in §3, found ${frRows.length}`)
const FR = frRows[0]
if (frRows.some(r => r.slice(1).join() !== FR.slice(1).join())) throw new Error('the two France rows in §3 disagree')

// §10.3: the planned countries' proposals ("R$ 59 / R$ 149 (Pro includes R$ 8.000)")
const s103 = report.slice(report.indexOf('### 10.3'), report.indexOf('### 10.4'))
const PLANNED = {}
for (const m of s103.matchAll(/^\| ([A-Z]{2}) [^|]+\| ([^|]+) \| ([A-Z]{3}) \|/gm)) {
  const nums = [...m[2].matchAll(/\d[\d.,’ ]*/g)].map(x => Number(x[0].replace(/[.,’ ]/g, ''))).filter(n => n > 0)
  if (nums.length < 3) throw new Error(`could not read §10.3 for ${m[1]}: ${m[2]}`)
  PLANNED[m[1]] = { currency: m[3], pro: nums[0], unlimited: nums[1], included: nums[2] }
}
if (Object.keys(PLANNED).length !== 10) throw new Error(`expected 10 planned countries in §10.3, found ${Object.keys(PLANNED).length}`)

// The report's ¹ (card rate not published, Stripe assumed) — read from every per-country scenario table.
const ASSUMED_IN_REPORT = new Set()
for (const s of Object.values(SECTIONS)) for (const m of s.text.matchAll(/^\| ([^|]+?) \| [^|]*¹/gm)) ASSUMED_IN_REPORT.add(`${s.code}|${m[1].trim()}`)

// ── the research calculator's per-plan rules (the report §2 Method), from each plan's "included" text ──
const RULES = [
  { c: 'NL', n: 'Qrder', p: 'Gratis', cap: 50 }, { c: 'NL', n: 'Qrder', p: 'Lite', cap: 150 },
  { c: 'PL', n: 'UpMenu', p: 'Online ordering tier 1', included: 75, overage: 6.70 },
  { c: 'PL', n: 'UpMenu', p: 'Online ordering tier 2', included: 210, overage: 6.70 },
  { c: 'BR', n: 'Goomer', p: 'Grátis', included: 30, overage: 1.39, noFixed: true },
  { c: 'BR', n: 'Anota AI', p: 'Mensal ≤150', cap: 150 }, { c: 'BR', n: 'Anota AI', p: 'Mensal 151', cap: 250 },
  { c: 'BR', n: 'OlaClick', p: 'Advanced', cap: 75 }, { c: 'BR', n: 'OlaClick', p: 'Premium', cap: 400 },
  { c: 'MX', n: 'OlaClick', p: 'Advanced', cap: 75 }, { c: 'MX', n: 'OlaClick', p: 'Premium', cap: 400 },
  { c: 'MX', n: 'Plick', p: 'Starter', included: 100, overage: 1.99, noFixed: true },
  { c: 'MX', n: 'Plick', p: 'Plus', included: 300, overage: 1.99, noFixed: true },
  { c: 'MX', n: 'Plick', p: 'Profesional', included: 600, overage: 1.99, noFixed: true },
  ...['SG', 'HK', 'MY', 'TH', 'ID'].map(c => ({ c, n: 'Take App', p: 'Basic', cap: 50 })),
  ...['RO', 'TH', 'HK', 'PT'].flatMap(c => ['MENU TIGER', 'MenuTiger'].flatMap(n => [
    { c, n, p: 'Free', cap: 75 }, { c, n, p: 'Regular', cap: 500 }, { c, n, p: 'Advanced', cap: 2000 }])),
  // Food Truck Pub bills its per-order fee to the truck outside the US.
  { c: 'CA', n: 'Food Truck Pub', p: '', paidBy: 'vendor' },
  // Truckons' Commandable plan: the customer's service fee covers card costs — the truck pays none.
  { c: 'FR', n: 'Truckons', p: 'Commandable', cardZero: true },
  // VexMenu's fixed R$0.99 is a per-order MINIMUM on its Pix rate, not an extra fee.
  { c: 'BR', n: 'VexMenu', p: '', noFixed: true },
]
const ruleFor = r => Object.assign({}, ...RULES.filter(x => x.c === r.country && r.name.startsWith(x.n) && r.plan.startsWith(x.p)))
const NOT_MAPPED = []

// Not counted (report §2), with the reason.
function statusOf(r) {
  if (bool(r.price_hidden)) return ['hidden', 'Price hidden ("contact sales").']
  if (r.name.startsWith('GloriaFood')) return ['closed', 'Closed to new sign-ups; shuts 30 Apr 2027.']
  if (r.country === 'AE' && r.name.startsWith('Spot')) return ['excluded', 'Its free 2022 launch app has vanished from its current site (unverified).']
  if (r.country === 'NL' && r.name.startsWith('FoodTruck POS') && r.plan.startsWith('Founder')) return ['excluded', 'Founder price for the first 50 customers only.']
  if (num(r.monthly_price_local) === null && num(r.annual_price_local_per_month) === null) return ['hidden', 'No price given.']
  return ['counted', null]
}
const SECOND_HAND = [['Simpliza'], ['Anota AI'], ['funfo', 'Pro'], ['どこでも注文くん'], ['Truckster'], ['Cheerfy'], ['VGather'], ['MOBI']]
const UNCLEAR = ['Weevi', 'Zyda', 'Vev', 'Yoveletta', 'Beat The Queue', 'TuMenúDigital']

// One competitor per tool, whatever the CSV's spelling.
const CANON = { 'MENU TIGER (global)': 'MENU TIGER', 'MenuTiger': 'MENU TIGER', 'GloriaFood (Oracle)': 'GloriaFood' }
const canon = n => CANON[n] ?? n
const FOCUS = { 'food-truck': 'food_truck', 'street-food/markets': 'street_food_markets', 'pop-up': 'pop_up', 'nearest-local': 'nearest_local' }
const FEATURE_MAP = { feature_online_preorder_collection_times: 'pre_orders', feature_whatsapp: 'whatsapp', feature_custom_domain: 'own_domain' }
const UNMAPPED_FEATURES = ['feature_pay_at_truck', 'feature_kds', 'feature_printed_tickets', 'feature_schedule_map', 'feature_menu_photo_import', 'feature_allergens', 'feature_multi_truck']
const PROVIDERS = ['Stripe', 'Square', 'SumUp', 'PayPal', 'Mercado Pago', 'Viva', 'Paytrail', 'AIB Merchant Services', 'Mollie', 'Adyen', 'Tap', 'Payrexx', 'Dojo', 'Worldpay', 'Zettle', 'Razorpay', 'NETOPIA', 'Pagar.me', 'PagSeguro']

function main() {
  const { head, rows } = parseCsv(fs.readFileSync(CSV, 'utf8'))
  if (rows.length !== 232) throw new Error(`expected 232 CSV rows, found ${rows.length}`)

  // ── competitors ──
  const comps = new Map()
  for (const r of rows) {
    const name = canon(r.name)
    const key = name.toLowerCase().trim()
    const c = comps.get(key) ?? { name, urls: [], focus: [], feats: {}, detail: {}, providers: new Set(), countries: new Set() }
    c.urls.push(r.url); c.focus.push(FOCUS[r.focus] ?? null); c.countries.add(r.country)
    for (const [col, k] of Object.entries(FEATURE_MAP)) {
      const v = (r[col] || '').trim(); if (!v || v === 'unknown') continue
      const word = v.split(/[\s(]/)[0].toLowerCase()
      if (word === 'unknown') continue
      // yes / no as stated; a paid add-on or a feature on a higher plan ("Automatizar+") is offered → yes, noted.
      // Anything else ("link": a WhatsApp link, not auto-replies) is not a yes or a no → left unknown, noted.
      const mapped = word === 'yes' || word === 'no' ? word : word === 'add-on' || /\+$/.test(word) ? 'yes' : null
      ;(c.detail[k] ??= new Set()).add(`${r.plan || r.name}: ${v}`)
      if (mapped) (c.feats[k] ??= []).push(mapped)
    }
    for (const p of PROVIDERS) if (new RegExp(`\\b${p.replace('.', '\\.')}\\b`).test(r.card_note)) c.providers.add(p)
    comps.set(key, c)
  }
  const competitors = []
  const compId = new Map()
  for (const [key, c] of comps) {
    const focusCounts = c.focus.reduce((a, f) => ((a[f] = (a[f] || 0) + 1), a), {})
    const focus = Object.entries(focusCounts).sort((a, b) => b[1] - a[1])[0][0]
    if (Object.keys(focusCounts).length > 1) NOT_MAPPED.push(`${c.name}: rows disagree on focus (${Object.keys(focusCounts).join(' / ')}) — kept the most common, ${focus}`)
    const notes = []
    const feat = {}
    for (const k of ['pre_orders', 'whatsapp', 'social_posts', 'own_domain', 'ios_app', 'android_app']) {
      const s = c.feats[k]
      // The tool has it when any of its plans does (as our own row says "Pro & Unlimited"); no only when every stated plan says no.
      feat[k] = !s ? 'unknown' : s.includes('yes') ? 'yes' : 'no'
      if (s && s.includes('yes') && s.includes('no')) notes.push(`${k}: not on every plan.`)
      if (c.detail[k]) {
        const d = [...c.detail[k]].filter(x => !/: (yes|no)$/.test(x))
        if (d.length) notes.push(`${k} — ${d.slice(0, 4).join('; ')}${d.length > 4 ? '; …' : ''}.`)
        if (!s) NOT_MAPPED.push(`${c.name}: ${k} stated only as "${[...c.detail[k]].map(x => x.split(': ').slice(1).join(': ')).join(' / ')}" — not a yes or a no, left unknown`)
      }
    }
    const urlCounts = c.urls.reduce((a, u) => { try { const o = new URL(u.split(' ')[0]).origin; a[o] = (a[o] || 0) + 1 } catch { /* not a URL */ } return a }, {})
    const website = Object.entries(urlCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const id = uuidOf('competitor:' + key)
    compId.set(key, id)
    competitors.push({
      id, name: c.name, website, focus: focus === 'null' ? null : focus,
      payment_providers: c.providers.size ? [...c.providers].join(', ') : null,
      ...feat,
      features_checked_on: Object.keys(c.feats).length ? CHECKED : null,
      features_verified_at: null,
      notes: notes.join(' ') || null,
    })
  }

  // ── plans ──
  const plans = []
  for (const r of rows) {
    const ru = ruleFor(r)
    const cur = (r.currency || '').split(' ')[0]
    const [status, why] = statusOf(r)
    const m = num(r.monthly_price_local), a = num(r.annual_price_local_per_month)
    const paidBy = ru.paidBy || r.fee_paid_by || 'vendor'
    const share = { vendor: 1, 'n/a': 1, unknown: 1, '': 1, split: 0.5, customer: 0 }[paidBy] ?? 1
    const pctBps = Math.round((num(r.pct_fee_per_order) ?? 0) * 100)
    const fixMinor = ru.noFixed ? 0 : toMinor(num(r.fixed_fee_per_order_local) ?? 0, cur)
    const notes = [why, r.notes].filter(Boolean)
    let cardMode = r.card_processing === 'bundled' || r.card_processing === 'separate' ? r.card_processing : 'unknown'
    let cardBps = num(r.card_pct) === null ? null : Math.round(num(r.card_pct) * 100)
    let cardFixed = num(r.card_fixed_local) === null ? null : toMinor(num(r.card_fixed_local), cur)
    if (ru.cardZero) { cardMode = 'bundled'; cardBps = 0; cardFixed = 0; notes.push('The customer’s service fee covers card costs, so the truck pays none (research).') }
    if (cardBps !== null && cardFixed === null) {
      if (r.name.startsWith('Choice')) { cardFixed = toMinor(0.10 * (RATES[cur] ?? 1) / RATES.EUR, cur); notes.push('Card fixed part €0.10, from Choice’s global price list.') }
      else cardFixed = 0
    }
    const assumed = cardBps === null && status === 'counted'
    // Cross-check against the report's ¹ marks where the report shows the plan.
    const label = `${r.name} — ${r.plan}`.trim()
    if (ASSUMED_IN_REPORT.has(`${r.country}|${label}`) && !assumed) NOT_MAPPED.push(`${r.country} ${label}: ¹ in the report but a card rate in the CSV`)
    if (ru.cap === undefined && /orders?\/month|pedidos/.test(r.included_orders_or_volume) && /\d/.test(r.included_orders_or_volume) && !ru.included && status === 'counted' && !/unlimited/i.test(r.included_orders_or_volume))
      NOT_MAPPED.push(`${r.country} ${label}: "${r.included_orders_or_volume}" — not a cap the research applied`)
    if (r.name.startsWith('Bestelltheke')) NOT_MAPPED.push(`DE Bestelltheke — Start: 5% per order capped at €399 a month — the cap is not modelled (the tab counts the full 5%)`)
    if (r.name.startsWith('Cheerfy')) NOT_MAPPED.push(`ES Cheerfy Shop: 2.5% of sales, minimum €29 and maximum €299 a month — stored as 2.5% with no monthly fee; the minimum and maximum are not modelled`)
    if (r.name.startsWith('VexMenu')) NOT_MAPPED.push(`BR VexMenu — ${r.plan}: R$0.99 minimum per order on its Pix rate — not modelled${cardBps === null ? '; no rate stated, so our card rate is assumed' : ''}`)
    const second = SECOND_HAND.some(([n, p]) => r.name.startsWith(n) && (!p || r.plan.startsWith(p)))
    const unclear = UNCLEAR.some(n => r.name.startsWith(n))
    const isCheerfy = r.name.startsWith('Cheerfy')
    plans.push({
      id: uuidOf(`plan:${r.country}:${r.name}:${r.plan}`),
      competitor_id: compId.get(canon(r.name).toLowerCase().trim()),
      country_code: r.country, plan_name: r.plan || r.name, currency: cur,
      price_hidden: bool(r.price_hidden),
      monthly_minor: isCheerfy ? 0 : m !== null ? toMinor(m, cur) : a !== null ? toMinor(a, cur) : null,
      yearly_only: m === null && a !== null,
      setup_minor: toMinor(num(r.setup_fee_local) ?? 0, cur),
      truck_fee_bps: Math.round(pctBps * share), truck_fee_fixed_minor: Math.round(fixMinor * share),
      customer_fee_bps: Math.round(pctBps * (1 - share)), customer_fee_fixed_minor: Math.round(fixMinor * (1 - share)),
      card_mode: cardMode, card_bps: cardBps, card_fixed_minor: cardFixed, card_rate_assumed: assumed,
      order_cap: ru.cap ?? null, included_orders: ru.included ?? null,
      overage_fixed_minor: ru.overage !== undefined ? toMinor(ru.overage, cur) : null,
      vat: r.vat === 'incl' || r.vat === 'excl' ? r.vat : 'unknown',
      status, unclear, second_hand: second,
      source: 'research', source_url: (r.url || '').split(' ')[0] || null, checked_on: r.checked || CHECKED,
      notes: notes.join(' ') || null,
    })
  }

  // ── from the manual (§21) when missing from the CSV ──
  const MANUAL_NOTE = 'From the manual (§21), not re-checked.'
  const manual = [
    { name: 'Hatches Up', focus: 'food_truck', country: 'GB', currency: 'GBP', plans: [
      { plan_name: 'Online ordering', monthly_minor: 0, card_mode: 'bundled', card_bps: 450, card_fixed_minor: 20, notes: '4.5% + 20p per online order, card processing included; 1.5% + 10p in person.' }] },
    { name: 'Eventifood', focus: null, country: 'GB', currency: 'GBP', plans: [
      ...[1, 2, 3].map(p => ({ plan_name: `${p}% per order`, monthly_minor: 0, truck_fee_bps: p * 100, unclear: true })),
      ...[3000, 6000, 7500].map(v => ({ plan_name: `£${v / 100} a month`, monthly_minor: v, unclear: true }))],
      note: 'Software only, own processor: "1/2/3% or £30/£60/£75 a month" — which % goes with which plan is not recorded.' },
    { name: 'EasyEats', focus: null, country: 'US', currency: 'USD', plans: [
      { plan_name: '0.95% of card sales', monthly_minor: 0, truck_fee_bps: 95 },
      { plan_name: '$90 a month, billed yearly', monthly_minor: 9000, yearly_only: true }], note: 'Own partner processors; rate not recorded.' },
    { name: 'RapidOrderz', focus: null, country: 'US', currency: 'USD', plans: [
      { plan_name: 'Monthly', monthly_minor: 5900, second_hand: true }], note: '"$59, unverified" in the manual.' },
  ]
  for (const t of manual) {
    const key = t.name.toLowerCase()
    if (comps.has(key)) continue
    const id = uuidOf('competitor:' + key)
    competitors.push({ id, name: t.name, website: null, focus: t.focus, payment_providers: null,
      pre_orders: 'unknown', whatsapp: 'unknown', social_posts: 'unknown', own_domain: 'unknown', ios_app: 'unknown', android_app: 'unknown',
      features_checked_on: null, features_verified_at: null, notes: [MANUAL_NOTE, t.note].filter(Boolean).join(' ') })
    if (t.focus === null) NOT_MAPPED.push(`${t.name}: the manual does not say who it is built for — focus left empty, so "Food-truck tools only" leaves it out`)
    for (const p of t.plans) {
      plans.push({
        id: uuidOf(`plan:${t.country}:${t.name}:${p.plan_name}`), competitor_id: id, country_code: t.country, plan_name: p.plan_name,
        currency: t.currency, price_hidden: false, monthly_minor: p.monthly_minor, yearly_only: p.yearly_only ?? false, setup_minor: 0,
        truck_fee_bps: p.truck_fee_bps ?? 0, truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0,
        card_mode: p.card_mode ?? 'separate', card_bps: p.card_bps ?? null, card_fixed_minor: p.card_fixed_minor ?? null,
        card_rate_assumed: p.card_bps === undefined, order_cap: null, included_orders: null, overage_fixed_minor: null,
        vat: 'unknown', status: 'counted', unclear: p.unclear ?? false, second_hand: p.second_hand ?? false,
        source: 'manual', source_url: null, checked_on: MANUAL_DATE, notes: [MANUAL_NOTE, p.notes].filter(Boolean).join(' '),
      })
    }
  }

  // ── benchmarks ──
  const benchmarks = []
  for (const s of Object.values(SECTIONS)) {
    const meal = s.text.match(/\*\*Meal price:\*\* .+? — Numbeo "Meal, Inexpensive Restaurant" \(\[source\]\((.*?)\)\), checked [^.]+\. Order value 1\.3× = ([A-Z]{3}) ([\d,]+\.\d+)\./)
    if (!meal) throw new Error(`no meal line for ${s.code}`)
    const cur = meal[2]
    const mealMajor = Number(meal[3].replace(/,/g, '')) / 1.3
    const rate = cur === 'EUR' ? 1 : Number((s.text.match(/1 EUR = ([\d.]+) ([A-Z]{3}) \(ECB/) || [])[1])
    if (!rate) throw new Error(`no exchange rate for ${s.code}`)
    const url = meal[1]
    let host = ''; try { host = new URL(url).hostname } catch { /* not a URL */ }
    const numbeoOk = /(^|\.)numbeo\.com$/.test(host)
    const notes = []
    if (!numbeoOk) notes.push(`not Numbeo — check (the report says Numbeo, but its link goes to ${host || 'nowhere'}).`)
    let cardBps = null, cardFixed = null, pro = null, incl = null, unl = null
    if (NO_ROW.has(s.code)) {
      if (s.code === 'FR') { cardBps = Math.round(Number(FR[4]) * 100); cardFixed = Number(FR[5]); pro = toMinor(FR[1], 'EUR'); incl = toMinor(FR[2].replace(/,/g, ''), 'EUR'); unl = toMinor(FR[3], 'EUR')
        notes.push('No country_settings row yet: prices and card rate as france-1’s block B would insert them (report §3).') }
      else {
        const c = s.text.match(/Stripe's local standard rate ([\d.]+)% \+ ([\d.]+)\./)
        if (!c) throw new Error(`no card rate for planned ${s.code}`)
        if (Number(c[1]) === 0 && Number(c[2]) === 0) notes.push('Stripe takes no cards in Indonesia (only bank-transfer virtual accounts).')
        else { cardBps = Math.round(Number(c[1]) * 100); cardFixed = toMinor(c[2], cur) }
        const p = PLANNED[s.code]; if (!p || p.currency !== cur) throw new Error(`no §10.3 proposal for ${s.code}`)
        pro = toMinor(p.pro, cur); incl = toMinor(p.included, cur); unl = toMinor(p.unlimited, cur)
      }
    }
    benchmarks.push({
      id: uuidOf('benchmark:' + s.code), country_code: s.code, currency: cur,
      meal_minor: toMinor(Math.round(mealMajor * 10 ** minorDigits(cur)) / 10 ** minorDigits(cur), cur),
      meal_source_label: numbeoOk ? 'Numbeo "Meal, Inexpensive Restaurant"' : 'Cited as Numbeo — not Numbeo, check',
      meal_source_url: url, meal_source_ok: numbeoOk, order_multiplier: 1.3, eur_rate: rate, eur_rate_date: RATE_DATE,
      card_bps: cardBps, card_fixed_minor: cardFixed,
      planned_pro_minor: pro, planned_pro_included_minor: incl, planned_unlimited_minor: unl,
      // The manual (V11.54, §36): the Android app is on Google Play in the United Kingdom only. Where iOS is sold is not recorded.
      ios_app_available: null, android_app_available: s.code === 'GB',
      notes: notes.join(' ') || null, checked_on: CHECKED,
    })
  }
  if (benchmarks.length !== 46) throw new Error(`expected 46 countries, found ${benchmarks.length}`)

  for (const f of UNMAPPED_FEATURES) {
    const stated = rows.filter(r => r[f] && r[f] !== 'unknown').length
    NOT_MAPPED.push(`CSV column ${f}: stated on ${stated} rows — not one of the six key features, so not imported (it stays in the CSV)`)
  }

  fs.mkdirSync(OUT, { recursive: true })
  const write = (n, v) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(v, null, 1) + '\n')
  write('competitors.json', competitors); write('plans.json', plans); write('benchmarks.json', benchmarks)
  console.log(`CSV: ${rows.length} rows × ${head.length} columns`)
  console.log(`wrote ${competitors.length} competitors, ${plans.length} plans (${plans.filter(p => p.status === 'counted').length} counted), ${benchmarks.length} benchmarks → data/pricing-research-1/`)
  console.log('NOT MAPPED:'); for (const n of [...new Set(NOT_MAPPED)]) console.log('  - ' + n)
}

// ECB reference rates of 22 Oct 2026, as the report's §2 lists them (units per EUR) — for Choice's €0.10 only.
const RATES = { EUR: 1 }
for (const m of report.matchAll(/1 EUR = ([\d.]+) ([A-Z]{3}) \(ECB/g)) RATES[m[2]] = Number(m[1])

main()
